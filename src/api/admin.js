import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import db from "../db.js";

const logModerationAction = (
  moderatorId,
  action,
  targetType,
  targetId,
  details = null
) => {
  const logId = Bun.randomUUIDv7();
  db.query(
    `
    INSERT INTO moderation_logs (id, moderator_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    logId,
    moderatorId,
    action,
    targetType,
    targetId,
    details ? JSON.stringify(details) : null
  );
};

const adminQueries = {
  // User queries
  findUserById: db.query("SELECT * FROM users WHERE id = ?"),
  findUserByUsername: db.query("SELECT * FROM users WHERE username = ?"),
  getUsersWithCounts: db.query(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as actual_post_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as actual_follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as actual_following_count
    FROM users u
    WHERE u.username LIKE ? OR u.name LIKE ?
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getUsersCount: db.query(
    "SELECT COUNT(*) as count FROM users WHERE username LIKE ? OR name LIKE ?"
  ),

  getPostsWithUsers: db.query(`
    SELECT p.*, u.username, u.name, u.avatar, u.verified, u.gold
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.content LIKE ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getPostsCount: db.query(
    "SELECT COUNT(*) as count FROM posts WHERE content LIKE ?"
  ),

  getUserStats: db.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) as suspended,
      SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN gold = 1 THEN 1 ELSE 0 END) as gold
    FROM users
  `),
  getPostStats: db.query("SELECT COUNT(*) as total FROM posts"),
  getSuspensionStats: db.query(`
    SELECT 
      COUNT(*) as active
    FROM suspensions s
    WHERE s.status = 'active'
  `),

  // Recent activity
  getRecentUsers: db.query(
    "SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 15"
  ),
  getRecentSuspensions: db.query(`
    SELECT u.username, s.created_at
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    ORDER BY s.created_at DESC
    LIMIT 15
  `),

  getUserWithDetails: db.query(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as actual_post_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as actual_follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as actual_following_count,
           (SELECT COUNT(*) FROM ghost_follows WHERE target_id = u.id AND follower_type = 'follower') as ghost_follower_count,
           (SELECT COUNT(*) FROM ghost_follows WHERE target_id = u.id AND follower_type = 'following') as ghost_following_count,
           (SELECT COUNT(DISTINCT l.id) FROM likes l WHERE u.id = l.user_id) as likes_given,
           (SELECT COUNT(DISTINCT r.id) FROM retweets r WHERE u.id = r.user_id) as retweets_given,
           (SELECT COUNT(DISTINCT pk.cred_id) FROM passkeys pk WHERE u.id = pk.internal_user_id) as passkey_count
    FROM users u
    LEFT JOIN posts p ON u.id = p.user_id
    LEFT JOIN follows f1 ON u.id = f1.following_id
    LEFT JOIN follows f2 ON u.id = f2.follower_id
    LEFT JOIN likes l ON u.id = l.user_id
    LEFT JOIN retweets r ON u.id = r.user_id
    LEFT JOIN passkeys pk ON u.id = pk.internal_user_id
    WHERE u.id = ?
    GROUP BY u.id
  `),
  getUserRecentPosts: db.query(`
    SELECT * FROM posts 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `),
  getUserSuspensions: db.query(`
    SELECT s.*, u.username as suspended_by_username
    FROM suspensions s
    JOIN users u ON s.suspended_by = u.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `),

  // Suspension operations
  createSuspension: db.query(`
    INSERT INTO suspensions (id, user_id, suspended_by, reason, severity, expires_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateUserSuspended: db.query("UPDATE users SET suspended = ? WHERE id = ?"),
  updateSuspensionStatus: db.query(
    "UPDATE suspensions SET status = ? WHERE user_id = ? AND status = 'active'"
  ),

  updateUserVerified: db.query("UPDATE users SET verified = ? WHERE id = ?"),
  updateUserGold: db.query("UPDATE users SET gold = ? WHERE id = ?"),
  deleteUser: db.query("DELETE FROM users WHERE id = ?"),
  deletePost: db.query("DELETE FROM posts WHERE id = ?"),

  getSuspensionsWithUsers: db.query(`
    SELECT s.*, u.username, u.name, u.avatar,
           suspended_by_user.username as suspended_by_username
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    JOIN users suspended_by_user ON s.suspended_by = suspended_by_user.id
    WHERE s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getSuspensionsCount: db.query(
    "SELECT COUNT(*) as count FROM suspensions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ),

  // New queries for editing functionality
  getPostById: db.query("SELECT * FROM posts WHERE id = ?"),
  updatePost: db.query(
    "UPDATE posts SET content = ?, like_count = ?, retweet_count = ?, reply_count = ?, view_count = ?, created_at = ? WHERE id = ?"
  ),
  // now supports optional reply_to so admin can create replies on behalf of users
  createPostAsUser: db.query(
    "INSERT INTO posts (id, user_id, content, reply_to, created_at) VALUES (?, ?, ?, ?, ?)"
  ),
  updateUser: db.query(
    "UPDATE users SET username = ?, name = ?, bio = ?, verified = ?, admin = ?, gold = ?, follower_count = ?, following_count = ?, character_limit = ?, created_at = ? WHERE id = ?"
  ),

  // DM Management queries
  getAllConversations: db.query(`
		SELECT c.id, c.created_at,
			   COUNT(DISTINCT cp.user_id) as participant_count,
			   COUNT(DISTINCT dm.id) as message_count,
			   MAX(dm.created_at) as last_message_at
		FROM conversations c
		LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
		LEFT JOIN dm_messages dm ON c.id = dm.conversation_id
		GROUP BY c.id
		ORDER BY last_message_at DESC NULLS LAST
		LIMIT ? OFFSET ?
	`),
  getConversationsCount: db.query(
    "SELECT COUNT(*) as count FROM conversations"
  ),

  getConversationDetails: db.query(`
		SELECT c.id, c.created_at,
			   GROUP_CONCAT(u.username, ', ') as participants,
			   GROUP_CONCAT(u.name, ', ') as participant_names
		FROM conversations c
		JOIN conversation_participants cp ON c.id = cp.conversation_id
		JOIN users u ON cp.user_id = u.id
		WHERE c.id = ?
		GROUP BY c.id
	`),

  getConversationMessages: db.query(`
		SELECT dm.id, dm.content, dm.created_at, u.username, u.name, u.avatar
		FROM dm_messages dm
		JOIN users u ON dm.sender_id = u.id
		WHERE dm.conversation_id = ?
		ORDER BY dm.created_at DESC
		LIMIT ? OFFSET ?
	`),

  getConversationMessagesCount: db.query(`
		SELECT COUNT(*) as count FROM dm_messages WHERE conversation_id = ?
	`),

  getMessageAttachments: db.query(`
		SELECT file_name as filename, file_hash FROM dm_attachments WHERE message_id = ?
	`),

  searchConversationsByUser: db.query(`
		SELECT c.id, c.created_at,
			   COUNT(DISTINCT cp.user_id) as participant_count,
			   COUNT(DISTINCT dm.id) as message_count,
			   MAX(dm.created_at) as last_message_at,
			   GROUP_CONCAT(DISTINCT u.username) as participants
		FROM conversations c
		JOIN conversation_participants cp ON c.id = cp.conversation_id
		JOIN users u ON cp.user_id = u.id
		LEFT JOIN dm_messages dm ON c.id = dm.conversation_id
		WHERE u.username LIKE ?
		GROUP BY c.id
		ORDER BY last_message_at DESC NULLS LAST
		LIMIT ? OFFSET ?
	`),

  deleteConversation: db.query("DELETE FROM conversations WHERE id = ?"),
  deleteMessage: db.query("DELETE FROM dm_messages WHERE id = ?"),

  getModerationLogs: db.query(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    ORDER BY ml.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getModerationLogsCount: db.query(
    "SELECT COUNT(*) as count FROM moderation_logs"
  ),
  getModerationLogsByTarget: db.query(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    WHERE ml.target_id = ?
    ORDER BY ml.created_at DESC
    LIMIT 50
  `),
  getModerationLogsByModerator: db.query(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    WHERE ml.moderator_id = ?
    ORDER BY ml.created_at DESC
    LIMIT ? OFFSET ?
  `),
};

const requireAdmin = async ({ headers, jwt, set }) => {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) {
    set.status = 401;
    return {
      user: {},
    };
  }

  const payload = await jwt.verify(token);
  if (!payload) {
    set.status = 401;
    return {
      user: {},
    };
  }

  const userId = payload.userId;
  const user = adminQueries.findUserById.get(userId);

  return {
    user,
  };
};

export default new Elysia({ prefix: "/admin" })
  .use(
    jwt({ name: "jwt", secret: process.env.JWT_SECRET || "your-secret-key" })
  )
  .derive(requireAdmin)
  .guard({
    beforeHandle: async ({ user, set }) => {
      if (!user || user.suspended || !user.admin) {
        set.status = 403;
        return { error: "Admin access required" };
      }
    },
  })

  .get("/stats", async () => {
    const userStats = adminQueries.getUserStats.get();
    const postStats = adminQueries.getPostStats.get();
    const suspensionStats = adminQueries.getSuspensionStats.get();

    const recentUsers = adminQueries.getRecentUsers.all();
    const recentSuspensions = adminQueries.getRecentSuspensions.all();

    return {
      stats: {
        users: userStats,
        posts: postStats,
        suspensions: suspensionStats,
      },
      recentActivity: {
        users: recentUsers,
        suspensions: recentSuspensions,
      },
    };
  })

  // User management
  .get("/users", async ({ query }) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const search = query.search || "";
    const offset = (page - 1) * limit;

    const searchPattern = `%${search}%`;
    const users = adminQueries.getUsersWithCounts.all(
      searchPattern,
      searchPattern,
      limit,
      offset
    );
    const totalCount = adminQueries.getUsersCount.get(
      searchPattern,
      searchPattern
    );

    return {
      users,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit),
      },
    };
  })

  .post(
    "/users",
    async ({ body, user: moderator }) => {
      const { username, name, bio, verified, gold, admin: isAdmin } = body;
      if (!username || !username.trim()) {
        return { error: "Username is required" };
      }

      const existing = adminQueries.findUserByUsername.get(username.trim());
      if (existing) {
        return { error: "Username already taken" };
      }

      const id = Bun.randomUUIDv7();

      // Enforce exclusivity: gold cannot coexist with verified
      const finalVerified = gold ? 0 : verified ? 1 : 0;
      const finalGold = gold ? 1 : 0;

      db.query(
        `INSERT INTO users (id, username, name, bio, verified, admin, gold, character_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        username.trim(),
        name || null,
        bio || null,
        finalVerified,
        isAdmin ? 1 : 0,
        finalGold,
        null
      );

      logModerationAction(moderator.id, "create_user", "user", id, {
        username: username.trim(),
      });

      return { success: true, id };
    },
    {
      body: t.Object({
        username: t.String(),
        name: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        verified: t.Optional(t.Boolean()),
        gold: t.Optional(t.Boolean()),
        admin: t.Optional(t.Boolean()),
      }),
    }
  )

  .get("/users/:id", async ({ params }) => {
    const user = adminQueries.getUserWithDetails.get(params.id);
    if (!user) {
      return { error: "User not found" };
    }

    const recentPosts = adminQueries.getUserRecentPosts.all(params.id);
    const suspensions = adminQueries.getUserSuspensions.all(params.id);

    return {
      user,
      recentPosts,
      suspensions,
    };
  })

  .patch(
    "/users/:id/verify",
    async ({ params, body, user }) => {
      const { verified } = body;
      const targetUser = adminQueries.findUserById.get(params.id);
      // If setting verified=true, unset gold
      if (verified) {
        adminQueries.updateUserGold.run(0, params.id);
      }
      adminQueries.updateUserVerified.run(verified ? 1 : 0, params.id);
      logModerationAction(
        user.id,
        verified ? "verify_user" : "unverify_user",
        "user",
        params.id,
        { username: targetUser?.username, verified }
      );
      return { success: true };
    },
    {
      body: t.Object({
        verified: t.Boolean(),
      }),
    }
  )

  .patch(
    "/users/:id/gold",
    async ({ params, body, user }) => {
      const { gold } = body;
      const targetUser = adminQueries.findUserById.get(params.id);
      // If granting gold, remove verified
      if (gold) {
        adminQueries.updateUserVerified.run(0, params.id);
      }
      adminQueries.updateUserGold.run(gold ? 1 : 0, params.id);
      logModerationAction(
        user.id,
        gold ? "grant_gold" : "revoke_gold",
        "user",
        params.id,
        { username: targetUser?.username, gold }
      );
      return { success: true };
    },
    {
      body: t.Object({
        gold: t.Boolean(),
      }),
    }
  )

  .post(
    "/users/:id/suspend",
    async ({ params, body, user }) => {
      const { reason, severity, duration, notes } = body;
      const suspensionId = Bun.randomUUIDv7();
      const targetUser = adminQueries.findUserById.get(params.id);

      const expiresAt = duration
        ? new Date(Date.now() + duration * 60 * 1000).toISOString()
        : null;

      adminQueries.createSuspension.run(
        suspensionId,
        params.id,
        user.id,
        reason,
        severity,
        expiresAt,
        notes
      );

      adminQueries.updateUserSuspended.run(true, params.id);

      logModerationAction(user.id, "suspend_user", "user", params.id, {
        username: targetUser?.username,
        reason,
        severity,
        duration,
        notes,
      });

      return { success: true };
    },
    {
      body: t.Object({
        reason: t.String(),
        severity: t.Number(),
        duration: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
    }
  )

  .post("/users/:id/unsuspend", async ({ params, user }) => {
    const targetUser = adminQueries.findUserById.get(params.id);
    adminQueries.updateUserSuspended.run(false, params.id);
    adminQueries.updateSuspensionStatus.run("lifted", params.id);
    logModerationAction(user.id, "unsuspend_user", "user", params.id, {
      username: targetUser?.username,
    });
    return { success: true };
  })

  .delete("/users/:id", async ({ params, user }) => {
    const targetUser = adminQueries.findUserById.get(params.id);
    logModerationAction(user.id, "delete_user", "user", params.id, {
      username: targetUser?.username,
    });
    adminQueries.deleteUser.run(params.id);
    return { success: true };
  })

  // Clone a user's profile (admin only)
  .post(
    "/users/:id/clone",
    async ({ params, body, user: moderator }) => {
      // Accept either internal id or username in the URL segment.
      let sourceUser = adminQueries.findUserById.get(params.id);
      if (!sourceUser) {
        // try username lookup when an id lookup fails
        sourceUser = adminQueries.findUserByUsername.get(params.id);
      }

      if (!sourceUser) return { error: "Source user not found" };

      const username = body.username?.trim();
      const name = body.name !== undefined ? body.name : sourceUser.name;
      const cloneRelations =
        body.cloneRelations === undefined ? true : !!body.cloneRelations;
      const cloneGhosts =
        body.cloneGhosts === undefined ? true : !!body.cloneGhosts;
      const cloneTweets =
        body.cloneTweets === undefined ? true : !!body.cloneTweets;
      const cloneReplies =
        body.cloneReplies === undefined ? true : !!body.cloneReplies;
      const cloneRetweets =
        body.cloneRetweets === undefined ? true : !!body.cloneRetweets;
      const cloneReactions =
        body.cloneReactions === undefined ? true : !!body.cloneReactions;
      const cloneCommunities =
        body.cloneCommunities === undefined ? true : !!body.cloneCommunities;
      const cloneMedia =
        body.cloneMedia === undefined ? false : !!body.cloneMedia;

      if (!username) return { error: "Username is required" };

      const existing = adminQueries.findUserByUsername.get(username);
      if (existing) return { error: "Username already taken" };

      const newId = Bun.randomUUIDv7();

      try {
        db.transaction(() => {
          // Create the new user - copy public profile fields but do not grant admin rights
          db.query(
            `INSERT INTO users (id, username, name, bio, avatar, verified, admin, gold, character_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newId,
            username,
            name || null,
            sourceUser.bio || null,
            sourceUser.avatar || null,
            sourceUser.verified ? 1 : 0,
            0, // admin = false for cloned accounts
            sourceUser.gold ? 1 : 0,
            sourceUser.character_limit || null,
            new Date().toISOString()
          );

          // Clone real followers (people who follow the source) -> they should follow the new user
          if (cloneRelations) {
            const followers = db
              .query("SELECT follower_id FROM follows WHERE following_id = ?")
              .all(sourceUser.id);

            for (const f of followers) {
              if (!f || !f.follower_id) continue;
              // avoid self-follow and duplicates
              if (f.follower_id === newId) continue;
              const exists = db
                .query(
                  "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
                )
                .get(f.follower_id, newId);
              if (!exists) {
                db.query(
                  "INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)"
                ).run(Bun.randomUUIDv7(), f.follower_id, newId);
              }
            }

            // Clone followings (accounts the source follows) -> new user follows same accounts
            const following = db
              .query("SELECT following_id FROM follows WHERE follower_id = ?")
              .all(sourceUser.id);

            for (const f of following) {
              if (!f || !f.following_id) continue;
              if (f.following_id === newId) continue;
              const exists = db
                .query(
                  "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
                )
                .get(newId, f.following_id);
              if (!exists) {
                db.query(
                  "INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)"
                ).run(Bun.randomUUIDv7(), newId, f.following_id);
              }
            }
          }

          // Clone ghost follows (both follower and following types)
          if (cloneGhosts) {
            const ghosts = db
              .query(
                "SELECT follower_type FROM ghost_follows WHERE target_id = ?"
              )
              .all(sourceUser.id);

            for (const g of ghosts) {
              if (!g || !g.follower_type) continue;
              db.query(
                "INSERT INTO ghost_follows (id, follower_type, target_id) VALUES (?, ?, ?)"
              ).run(Bun.randomUUIDv7(), g.follower_type, newId);
            }
          }

          // Clone tweets (posts) - preserve replies/quotes mapping when requested
          if (cloneTweets) {
            const posts = db
              .query(
                "SELECT id, content, reply_to, quote_tweet_id, created_at, community_id, pinned FROM posts WHERE user_id = ? ORDER BY created_at ASC"
              )
              .all(sourceUser.id);

            // map original post id -> new post id
            const postIdMap = new Map();
            const clonedPosts = [];

            // First pass: create posts without reply_to/quote filled (we'll map them in second pass)
            for (const p of posts) {
              const newPostId = Bun.randomUUIDv7();
              const communityIdToUse = cloneCommunities ? p.community_id : null;

              db.query(
                "INSERT INTO posts (id, user_id, content, reply_to, quote_tweet_id, community_id, created_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
              ).run(
                newPostId,
                newId,
                p.content,
                null,
                null,
                communityIdToUse,
                p.created_at || new Date().toISOString(),
                p.pinned ? 1 : 0
              );

              postIdMap.set(p.id, newPostId);
              clonedPosts.push({
                origId: p.id,
                newId: newPostId,
                reply_to: p.reply_to,
                quote_tweet_id: p.quote_tweet_id,
                created_at: p.created_at,
                pinned: p.pinned,
                community_id: p.community_id,
              });
            }

            // Second pass: update reply_to and quote_tweet_id on cloned posts and adjust counts
            for (const cp of clonedPosts) {
              // Preserve replies on cloned posts. If the parent post was cloned,
              // map to the new post id. If the parent was not cloned, keep the
              // original `reply_to` id so the cloned post remains a reply
              // (avoids converting replies into top-level tweets).
              let mappedReplyTo = null;
              if (cloneReplies && cp.reply_to) {
                mappedReplyTo = postIdMap.has(cp.reply_to)
                  ? postIdMap.get(cp.reply_to)
                  : cp.reply_to;
              }

              let mappedQuoteId = null;
              if (cp.quote_tweet_id) {
                mappedQuoteId = postIdMap.has(cp.quote_tweet_id)
                  ? postIdMap.get(cp.quote_tweet_id)
                  : cp.quote_tweet_id;
              }

              db.query(
                "UPDATE posts SET reply_to = ?, quote_tweet_id = ? WHERE id = ?"
              ).run(mappedReplyTo, mappedQuoteId, cp.newId);

              // If we set a reply_to, increment the reply_count on the parent
              if (mappedReplyTo) {
                db.query(
                  "UPDATE posts SET reply_count = COALESCE(reply_count,0) + 1 WHERE id = ?"
                ).run(mappedReplyTo);
              }

              // If we set a quote_tweet_id, increment quote_count on target
              if (mappedQuoteId) {
                db.query(
                  "UPDATE posts SET quote_count = COALESCE(quote_count,0) + 1 WHERE id = ?"
                ).run(mappedQuoteId);
              }
            }

            // Clone attachments/media for each post when requested
            if (cloneMedia) {
              const getAttachments = db.query(
                "SELECT id, file_hash, file_name, file_type, file_size, file_url, is_spoiler, created_at FROM attachments WHERE post_id = ?"
              );

              for (const cp of clonedPosts) {
                try {
                  const atts = getAttachments.all(cp.origId);
                  for (const a of atts) {
                    const newAttId = Bun.randomUUIDv7();
                    db.query(
                      `INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url, is_spoiler, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    ).run(
                      newAttId,
                      cp.newId,
                      a.file_hash,
                      a.file_name,
                      a.file_type,
                      a.file_size,
                      a.file_url,
                      a.is_spoiler ? 1 : 0,
                      a.created_at || new Date().toISOString()
                    );
                  }
                } catch (e) {
                  // don't abort entire clone on attachment copy failure; just continue
                  console.error(
                    "Failed to clone attachments for post",
                    cp.origId,
                    e
                  );
                }
              }
            }

            // Clone retweets made by the source user (new user retweets same posts)
            if (cloneRetweets) {
              const sourceRetweets = db
                .query(
                  "SELECT post_id, created_at FROM retweets WHERE user_id = ?"
                )
                .all(sourceUser.id);

              for (const r of sourceRetweets) {
                const targetPostId = postIdMap.has(r.post_id)
                  ? postIdMap.get(r.post_id)
                  : r.post_id;
                const exists = db
                  .query(
                    "SELECT 1 FROM retweets WHERE user_id = ? AND post_id = ?"
                  )
                  .get(newId, targetPostId);
                if (!exists) {
                  db.query(
                    "INSERT INTO retweets (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)"
                  ).run(
                    Bun.randomUUIDv7(),
                    newId,
                    targetPostId,
                    r.created_at || new Date().toISOString()
                  );
                  db.query(
                    "UPDATE posts SET retweet_count = COALESCE(retweet_count,0) + 1 WHERE id = ?"
                  ).run(targetPostId);
                }
              }
            }

            // Clone likes/reactions performed by the source user
            if (cloneReactions) {
              const sourceLikes = db
                .query(
                  "SELECT post_id, created_at FROM likes WHERE user_id = ?"
                )
                .all(sourceUser.id);
              for (const l of sourceLikes) {
                const targetPostId = postIdMap.has(l.post_id)
                  ? postIdMap.get(l.post_id)
                  : l.post_id;
                const exists = db
                  .query(
                    "SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?"
                  )
                  .get(newId, targetPostId);
                if (!exists) {
                  db.query(
                    "INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)"
                  ).run(
                    Bun.randomUUIDv7(),
                    newId,
                    targetPostId,
                    l.created_at || new Date().toISOString()
                  );
                  db.query(
                    "UPDATE posts SET like_count = COALESCE(like_count,0) + 1 WHERE id = ?"
                  ).run(targetPostId);
                }
              }

              // post_reactions (emoji reactions)
              const sourceReacts = db
                .query(
                  "SELECT post_id, emoji, created_at FROM post_reactions WHERE user_id = ?"
                )
                .all(sourceUser.id);
              for (const r of sourceReacts) {
                const targetPostId = postIdMap.has(r.post_id)
                  ? postIdMap.get(r.post_id)
                  : r.post_id;
                const exists = db
                  .query(
                    "SELECT 1 FROM post_reactions WHERE user_id = ? AND post_id = ? AND emoji = ?"
                  )
                  .get(newId, targetPostId, r.emoji);
                if (!exists) {
                  db.query(
                    "INSERT INTO post_reactions (id, post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)"
                  ).run(
                    Bun.randomUUIDv7(),
                    targetPostId,
                    newId,
                    r.emoji,
                    r.created_at || new Date().toISOString()
                  );
                }
              }
            }

            // Clone community memberships (if requested)
            if (cloneCommunities) {
              const memberships = db
                .query(
                  "SELECT community_id, role, joined_at FROM community_members WHERE user_id = ?"
                )
                .all(sourceUser.id);
              for (const m of memberships) {
                const exists = db
                  .query(
                    "SELECT 1 FROM community_members WHERE user_id = ? AND community_id = ?"
                  )
                  .get(newId, m.community_id);
                if (!exists) {
                  db.query(
                    "INSERT INTO community_members (id, community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)"
                  ).run(
                    Bun.randomUUIDv7(),
                    m.community_id,
                    newId,
                    m.role || "member",
                    m.joined_at || new Date().toISOString()
                  );
                  db.query(
                    "UPDATE communities SET member_count = COALESCE(member_count,0) + 1 WHERE id = ?"
                  ).run(m.community_id);
                }
              }
            }
          }
        })();

        logModerationAction(moderator.id, "clone_user", "user", newId, {
          source: sourceUser.username,
          username,
          options: {
            cloneRelations,
            cloneGhosts,
            cloneTweets,
            cloneReplies,
            cloneRetweets,
            cloneReactions,
            cloneCommunities,
            cloneMedia,
          },
        });

        return { success: true, id: newId, username };
      } catch (e) {
        console.error("Failed to clone user:", e);
        return { error: "Failed to clone user" };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        name: t.Optional(t.String()),
        cloneRelations: t.Optional(t.Boolean()),
        cloneGhosts: t.Optional(t.Boolean()),
        cloneTweets: t.Optional(t.Boolean()),
        cloneReplies: t.Optional(t.Boolean()),
        cloneRetweets: t.Optional(t.Boolean()),
        cloneReactions: t.Optional(t.Boolean()),
        cloneCommunities: t.Optional(t.Boolean()),
        cloneMedia: t.Optional(t.Boolean()),
      }),
    }
  )

  // Post management
  .get("/posts", async ({ query }) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const search = query.search || "";
    const offset = (page - 1) * limit;

    const searchPattern = `%${search}%`;
    const posts = adminQueries.getPostsWithUsers.all(
      searchPattern,
      limit,
      offset
    );
    const totalCount = adminQueries.getPostsCount.get(searchPattern);

    return {
      posts,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit),
      },
    };
  })

  .delete("/posts/:id", async ({ params, user }) => {
    const post = adminQueries.getPostById.get(params.id);
    const postAuthor = post
      ? adminQueries.findUserById.get(post.user_id)
      : null;
    db.transaction(() => {
      db.query("DELETE FROM likes WHERE post_id = ?").run(params.id);
      db.query("DELETE FROM posts WHERE reply_to = ?").run(params.id);
      db.query("DELETE FROM retweets WHERE post_id = ?").run(params.id);
      adminQueries.deletePost.run(params.id);
    })();
    logModerationAction(user.id, "delete_post", "post", params.id, {
      author: postAuthor?.username,
      content: post?.content?.substring(0, 100),
    });
    return { success: true };
  })

  .get("/suspensions", async ({ query }) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const offset = (page - 1) * limit;

    const suspensions = adminQueries.getSuspensionsWithUsers.all(limit, offset);
    const totalCount = adminQueries.getSuspensionsCount.get();

    return {
      suspensions,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit),
      },
    };
  })

  .get("/posts/:id", async ({ params }) => {
    const post = adminQueries.getPostById.get(params.id);
    if (!post) {
      return { error: "Post not found" };
    }
    return post;
  })

  .patch(
    "/posts/:id",
    async ({ params, body, user }) => {
      const post = adminQueries.getPostById.get(params.id);
      if (!post) {
        return { error: "Post not found" };
      }
      const postOwner = adminQueries.findUserById.get(post.user_id);
      const maxLength = postOwner?.gold
        ? 16500
        : postOwner?.verified
        ? 5500
        : 400;
      if (body.content && body.content.length > maxLength) {
        return { error: `Content must be ${maxLength} characters or less` };
      }

      const changes = {};
      if (body.content !== post.content)
        changes.content = {
          old: post.content?.substring(0, 100),
          new: body.content?.substring(0, 100),
        };
      if (body.likes !== undefined && body.likes !== post.like_count)
        changes.likes = { old: post.like_count, new: body.likes };
      if (body.retweets !== undefined && body.retweets !== post.retweet_count)
        changes.retweets = { old: post.retweet_count, new: body.retweets };
      if (body.replies !== undefined && body.replies !== post.reply_count)
        changes.replies = { old: post.reply_count, new: body.replies };
      if (body.views !== undefined && body.views !== post.view_count)
        changes.views = { old: post.view_count, new: body.views };

      // support editing created_at
      let newCreatedAt = post.created_at;
      if (body.created_at !== undefined) {
        try {
          const parsed = new Date(body.created_at);
          if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
          newCreatedAt = parsed.toISOString();
          if (newCreatedAt !== post.created_at) {
            changes.created_at = { old: post.created_at, new: newCreatedAt };
          }
        } catch (_err) {
          return { error: "Invalid created_at value" };
        }
      }

      adminQueries.updatePost.run(
        body.content,
        body.likes,
        body.retweets,
        body.replies,
        body.views,
        newCreatedAt,
        params.id
      );

      logModerationAction(user.id, "edit_post", "post", params.id, {
        author: postOwner?.username,
        changes,
      });

      return { success: true };
    },
    {
      body: t.Object({
        content: t.String(),
        likes: t.Optional(t.Number()),
        retweets: t.Optional(t.Number()),
        replies: t.Optional(t.Number()),
        views: t.Optional(t.Number()),
        created_at: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/tweets",
    async ({ body, user }) => {
      const postId = Bun.randomUUIDv7();
      const targetUser = adminQueries.findUserById.get(body.userId);
      if (!targetUser) return { error: "User not found" };

      // allow admins to bypass character limits with noCharLimit flag
      const noCharLimit = !!body.noCharLimit;

      const maxLength = targetUser.gold
        ? 16500
        : targetUser.verified
        ? 5500
        : 400;

      if (!body.content || body.content.trim().length === 0) {
        return { error: "Content is required" };
      }

      if (!noCharLimit && body.content.length > maxLength) {
        return { error: `Content must be ${maxLength} characters or less` };
      }

      // support optional replyTo so admin can post replies as the user
      const replyTo = body.replyTo || null;

      // support optional created_at when creating posts
      let createdAtForInsert = new Date().toISOString();
      if (body.created_at) {
        try {
          const parsed = new Date(body.created_at);
          if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
          createdAtForInsert = parsed.toISOString();
        } catch (_err) {
          return { error: "Invalid created_at value" };
        }
      }

      adminQueries.createPostAsUser.run(
        postId,
        body.userId,
        body.content.trim(),
        replyTo,
        createdAtForInsert
      );

      logModerationAction(user.id, "create_post_as_user", "post", postId, {
        targetUser: targetUser.username,
        content: body.content.substring(0, 100),
        replyTo,
        noCharLimit,
      });

      // if it's a reply, increment reply count for the parent
      if (replyTo) {
        try {
          db.query(
            "UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?"
          ).run(replyTo);
        } catch (e) {
          // ignore failures silently but log
          console.error("Failed to update parent reply count:", e);
        }
      }

      return { success: true, id: postId };
    },
    {
      body: t.Object({
        userId: t.String(),
        content: t.String(),
        replyTo: t.Optional(t.String()),
        noCharLimit: t.Optional(t.Boolean()),
        created_at: t.Optional(t.String()),
      }),
    }
  )

  // User profile management
  .patch(
    "/users/:id",
    async ({ params, body, user: moderator }) => {
      const user = adminQueries.findUserById.get(params.id);
      if (!user) {
        return { error: "User not found" };
      }

      if (body.username && body.username !== user.username) {
        const existingUser = adminQueries.findUserByUsername.get(body.username);
        if (existingUser && existingUser.id !== params.id) {
          return { error: "Username already taken" };
        }
      }

      const changes = {};
      if (body.username && body.username !== user.username)
        changes.username = { old: user.username, new: body.username };
      if (body.name !== undefined && body.name !== user.name)
        changes.name = { old: user.name, new: body.name };
      if (body.bio !== undefined && body.bio !== user.bio)
        changes.bio = {
          old: user.bio?.substring(0, 50),
          new: body.bio?.substring(0, 50),
        };
      if (body.verified !== undefined && body.verified !== user.verified)
        changes.verified = { old: user.verified, new: body.verified };
      if (body.gold !== undefined && body.gold !== user.gold)
        changes.gold = { old: user.gold, new: body.gold };
      if (body.admin !== undefined && body.admin !== user.admin)
        changes.admin = { old: user.admin, new: body.admin };

      if (body.ghost_followers !== undefined) {
        const currentGhostFollowers = db
          .query(
            "SELECT COUNT(*) as count FROM ghost_follows WHERE follower_type = 'follower' AND target_id = ?"
          )
          .get(params.id).count;

        if (body.ghost_followers !== currentGhostFollowers) {
          const diff = body.ghost_followers - currentGhostFollowers;

          if (diff > 0) {
            for (let i = 0; i < diff; i++) {
              const ghostId = Bun.randomUUIDv7();
              db.query(
                "INSERT INTO ghost_follows (id, follower_type, target_id) VALUES (?, 'follower', ?)"
              ).run(ghostId, params.id);
            }
          } else if (diff < 0) {
            const toRemove = Math.abs(diff);
            const ghostFollowers = db
              .query(
                "SELECT id FROM ghost_follows WHERE follower_type = 'follower' AND target_id = ? LIMIT ?"
              )
              .all(params.id, toRemove);
            for (const ghost of ghostFollowers) {
              db.query("DELETE FROM ghost_follows WHERE id = ?").run(ghost.id);
            }
          }

          changes.ghost_followers = {
            old: currentGhostFollowers,
            new: body.ghost_followers,
          };
        }
      }

      if (body.ghost_following !== undefined) {
        const currentGhostFollowing = db
          .query(
            "SELECT COUNT(*) as count FROM ghost_follows WHERE follower_type = 'following' AND target_id = ?"
          )
          .get(params.id).count;

        if (body.ghost_following !== currentGhostFollowing) {
          const diff = body.ghost_following - currentGhostFollowing;

          if (diff > 0) {
            for (let i = 0; i < diff; i++) {
              const ghostId = Bun.randomUUIDv7();
              db.query(
                "INSERT INTO ghost_follows (id, follower_type, target_id) VALUES (?, 'following', ?)"
              ).run(ghostId, params.id);
            }
          } else if (diff < 0) {
            const toRemove = Math.abs(diff);
            const ghostFollowing = db
              .query(
                "SELECT id FROM ghost_follows WHERE follower_type = 'following' AND target_id = ? LIMIT ?"
              )
              .all(params.id, toRemove);
            for (const ghost of ghostFollowing) {
              db.query("DELETE FROM ghost_follows WHERE id = ?").run(ghost.id);
            }
          }

          changes.ghost_following = {
            old: currentGhostFollowing,
            new: body.ghost_following,
          };
        }
      }

      if (
        body.character_limit !== undefined &&
        body.character_limit !== user.character_limit
      )
        changes.character_limit = {
          old: user.character_limit,
          new: body.character_limit,
        };

      if (
        body.force_follow_usernames &&
        Array.isArray(body.force_follow_usernames)
      ) {
        const followedUsers = [];
        const pendingUsers = [];
        const failedUsers = [];

        for (const username of body.force_follow_usernames) {
          const targetUser = db
            .query("SELECT id FROM users WHERE username = ?")
            .get(username);

          if (!targetUser) {
            const forcedId = Bun.randomUUIDv7();
            db.query(
              "INSERT INTO forced_follows (id, follower_id, following_id) VALUES (?, ?, ?)"
            ).run(forcedId, params.id, username);
            pendingUsers.push(username);
            continue;
          }

          if (targetUser.id === params.id) {
            failedUsers.push(`${username} (cannot follow self)`);
            continue;
          }

          const blocked = db
            .query(
              "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)"
            )
            .get(params.id, targetUser.id, targetUser.id, params.id);

          if (blocked) {
            failedUsers.push(`${username} (blocked)`);
            continue;
          }

          const existing = db
            .query(
              "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
            )
            .get(targetUser.id, params.id);

          if (!existing) {
            const followId = Bun.randomUUIDv7();
            db.query(
              "INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)"
            ).run(followId, targetUser.id, params.id);
            followedUsers.push(username);
          }
        }

        if (followedUsers.length > 0 || pendingUsers.length > 0) {
          changes.forced_follows = {
            added: followedUsers.length > 0 ? followedUsers : undefined,
            pending: pendingUsers.length > 0 ? pendingUsers : undefined,
            failed: failedUsers.length > 0 ? failedUsers : undefined,
          };
        }
      }

      let newVerified =
        body.verified !== undefined
          ? body.verified
            ? 1
            : 0
          : user.verified
          ? 1
          : 0;
      let newGold =
        body.gold !== undefined ? (body.gold ? 1 : 0) : user.gold ? 1 : 0;
      if (newGold) newVerified = 0;
      if (newVerified) newGold = 0;

      // support optional created_at editing
      let newUserCreatedAt = user.created_at;
      if (body.created_at !== undefined) {
        try {
          const parsed = new Date(body.created_at);
          if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
          newUserCreatedAt = parsed.toISOString();
          if (newUserCreatedAt !== user.created_at) {
            changes.created_at = {
              old: user.created_at,
              new: newUserCreatedAt,
            };
          }
        } catch (_err) {
          return { error: "Invalid created_at value" };
        }
      }

      db.query(
        "UPDATE users SET username = ?, name = ?, bio = ?, verified = ?, admin = ?, gold = ?, character_limit = ?, created_at = ? WHERE id = ?"
      ).run(
        body.username || user.username,
        body.name !== undefined ? body.name : user.name,
        body.bio !== undefined ? body.bio : user.bio,
        newVerified,
        body.admin !== undefined ? body.admin : user.admin,
        newGold,
        body.character_limit !== undefined
          ? body.character_limit
          : user.character_limit,
        newUserCreatedAt,
        params.id
      );

      logModerationAction(
        moderator.id,
        "edit_user_profile",
        "user",
        params.id,
        { username: user.username, changes }
      );

      return { success: true };
    },
    {
      body: t.Object({
        username: t.Optional(t.String()),
        name: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        verified: t.Optional(t.Boolean()),
        gold: t.Optional(t.Boolean()),
        admin: t.Optional(t.Boolean()),
        ghost_followers: t.Optional(t.Number()),
        ghost_following: t.Optional(t.Number()),
        character_limit: t.Optional(t.Union([t.Number(), t.Null()])),
        created_at: t.Optional(t.String()),
        force_follow_usernames: t.Optional(t.Array(t.String())),
      }),
    }
  )

  .post("/impersonate/:id", async ({ params, jwt }) => {
    const targetUser = adminQueries.findUserById.get(params.id);
    if (!targetUser) {
      return { error: "User not found" };
    }

    if (targetUser.admin) {
      return { error: "Cannot impersonate admin users" };
    }

    const impersonationToken = await jwt.sign({
      userId: targetUser.id,
      username: targetUser.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    });

    return {
      success: true,
      token: impersonationToken,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        name: targetUser.name,
      },
      copyLink: `${
        process.env.BASE_URL || "http://localhost:3000"
      }/account/?impersonate=${encodeURIComponent(impersonationToken)}`,
    };
  })

  .get("/dms", async ({ query }) => {
    const page = Math.max(1, Number.parseInt(query.page || "1"));
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(query.limit || "20"))
    );
    const offset = (page - 1) * limit;

    const conversations = adminQueries.getAllConversations.all(limit, offset);
    const totalCount = adminQueries.getConversationsCount.get().count;

    return {
      conversations,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    };
  })

  .get("/dms/search", async ({ query }) => {
    const username = query.username;
    if (!username) {
      return { error: "Username parameter required" };
    }

    const page = Math.max(1, Number.parseInt(query.page || "1"));
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(query.limit || "20"))
    );
    const offset = (page - 1) * limit;

    const conversations = adminQueries.searchConversationsByUser.all(
      `%${username}%`,
      limit,
      offset
    );

    return { conversations };
  })

  .get("/dms/:id", async ({ params }) => {
    const conversation = adminQueries.getConversationDetails.get(params.id);
    if (!conversation) {
      return { error: "Conversation not found" };
    }

    return { conversation };
  })

  .get("/dms/:id/messages", async ({ params, query }) => {
    const conversation = adminQueries.getConversationDetails.get(params.id);
    if (!conversation) {
      return { error: "Conversation not found" };
    }

    const page = Math.max(1, Number.parseInt(query.page || "1"));
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(query.limit || "20"))
    );
    const offset = (page - 1) * limit;

    const messages = adminQueries.getConversationMessages.all(
      params.id,
      limit,
      offset
    );
    const totalCount = adminQueries.getConversationMessagesCount.get(
      params.id
    ).count;

    // Get attachments for each message
    for (const message of messages) {
      message.attachments = adminQueries.getMessageAttachments.all(message.id);
    }

    return {
      conversation,
      messages,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    };
  })

  .delete("/dms/:id", async ({ params, user }) => {
    const conversation = adminQueries.getConversationDetails.get(params.id);
    if (!conversation) {
      return { error: "Conversation not found" };
    }

    adminQueries.deleteConversation.run(params.id);
    logModerationAction(
      user.id,
      "delete_conversation",
      "conversation",
      params.id,
      { conversation: conversation.participants }
    );
    return { success: true };
  })

  .delete("/dms/messages/:id", async ({ params, user }) => {
    adminQueries.deleteMessage.run(params.id);
    logModerationAction(user.id, "delete_message", "message", params.id, {});
    return { success: true };
  })

  .get("/moderation-logs", async ({ query }) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const offset = (page - 1) * limit;

    const logs = adminQueries.getModerationLogs.all(limit, offset);
    const totalCount = adminQueries.getModerationLogsCount.get();

    const logsWithDetails = logs.map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    }));

    return {
      logs: logsWithDetails,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit),
      },
    };
  })

  .get("/moderation-logs/target/:id", async ({ params }) => {
    const logs = adminQueries.getModerationLogsByTarget.all(params.id);
    const logsWithDetails = logs.map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    }));
    return { logs: logsWithDetails };
  })

  .get("/moderation-logs/moderator/:id", async ({ params, query }) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const offset = (page - 1) * limit;

    const logs = adminQueries.getModerationLogsByModerator.all(
      params.id,
      limit,
      offset
    );
    const logsWithDetails = logs.map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    }));
    return { logs: logsWithDetails };
  });
