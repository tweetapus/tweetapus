import { jwt } from "@elysiajs/jwt";
import { Elysia, file } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getFollowers = db.query(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.bio
  FROM follows
  JOIN users ON follows.follower_id = users.id
  WHERE follows.following_id = ? AND users.suspended = 0
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getFollowing = db.query(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.bio
  FROM follows
  JOIN users ON follows.following_id = users.id
  WHERE follows.follower_id = ? AND users.suspended = 0
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

const updateProfile = db.query(`
  UPDATE users
  SET name = ?, bio = ?, location = ?, website = ?, pronouns = ?, avatar_radius = ?
  WHERE id = ?
`);

const updateThemeAccent = db.query(`
	UPDATE users
	SET theme = ?, accent_color = ?
	WHERE id = ?
`);

const updateLabels = db.query(`
  UPDATE users
  SET label_type = ?, label_automated = ?
  WHERE id = ?
`);

const updateBanner = db.query(`
  UPDATE users
  SET banner = ?
  WHERE id = ?
`);

const updateAvatar = db.query(`
  UPDATE users
  SET avatar = ?
  WHERE id = ?
`);

const updateUsername = db.query(`
  UPDATE users
  SET username = ?
  WHERE id = ?
`);

const deleteUser = db.query(`
  DELETE FROM users WHERE id = ?
`);

const updatePassword = db.query(`
  UPDATE users
  SET password_hash = ?
  WHERE id = ?
`);

const getUserReplies = db.query(`
  SELECT posts.*, users.username, users.name, users.verified, users.gold 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NOT NULL
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getUserPosts = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NULL AND users.suspended = 0
  ORDER BY posts.pinned DESC, posts.created_at DESC
`);

const getUserRetweets = db.query(`
  SELECT 
    original_posts.*,
    original_users.username, original_users.name, original_users.avatar, original_users.verified, original_users.gold,
    retweets.created_at as retweet_created_at,
    retweets.post_id as original_post_id
  FROM retweets
  JOIN posts original_posts ON retweets.post_id = original_posts.id
  JOIN users original_users ON original_posts.user_id = original_users.id
  WHERE retweets.user_id = ?
  ORDER BY retweets.created_at DESC
`);

const getFollowStatus = db.query(`
  SELECT id FROM follows WHERE follower_id = ? AND following_id = ?
`);

const addFollow = db.query(`
  INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)
`);

const removeFollow = db.query(`
	DELETE FROM follows WHERE follower_id = ? AND following_id = ?
`);

const getFollowRequest = db.query(`
  SELECT * FROM follow_requests WHERE requester_id = ? AND target_id = ?
`);

const createFollowRequest = db.query(`
  INSERT INTO follow_requests (id, requester_id, target_id) VALUES (?, ?, ?)
`);

const approveFollowRequest = db.query(`
  UPDATE follow_requests 
  SET status = 'approved', responded_at = datetime('now', 'utc')
  WHERE id = ?
`);

const denyFollowRequest = db.query(`
  UPDATE follow_requests 
  SET status = 'denied', responded_at = datetime('now', 'utc')
  WHERE id = ?
`);

const deleteFollowRequest = db.query(`
  DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?
`);

const getPendingFollowRequests = db.query(`
  SELECT fr.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius, u.bio
  FROM follow_requests fr
  JOIN users u ON fr.requester_id = u.id
  WHERE fr.target_id = ? AND fr.status = 'pending'
  ORDER BY fr.created_at DESC
`);

const getFollowCounts = db.query(`
	SELECT 
		((SELECT COUNT(*) FROM follows WHERE follower_id = ?) + (SELECT COUNT(*) FROM ghost_follows WHERE follower_type = 'following' AND target_id = ?)) AS following_count,
		((SELECT COUNT(*) FROM follows WHERE following_id = ?) + (SELECT COUNT(*) FROM ghost_follows WHERE follower_type = 'follower' AND target_id = ?)) AS follower_count,
		(SELECT COUNT(*) FROM posts WHERE user_id = ? AND reply_to IS NULL) AS post_count
`);

const getPollByPostId = db.query(`
  SELECT * FROM polls WHERE post_id = ?
`);

const getPollOptions = db.query(`
  SELECT * FROM poll_options WHERE poll_id = ? ORDER BY option_order ASC
`);

const getUserPollVote = db.query(`
  SELECT option_id FROM poll_votes WHERE user_id = ? AND poll_id = ?
`);

const getTotalPollVotes = db.query(`
  SELECT SUM(vote_count) as total FROM poll_options WHERE poll_id = ?
`);

const getPollVoters = db.query(`
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);
const isSuspendedQuery = db.query(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const getTweetAttachments = (tweetId) => {
  return getAttachmentsByPostId.all(tweetId);
};

const getQuotedTweetData = (quoteTweetId, userId) => {
  if (!quoteTweetId) return null;

  const quotedTweet = getQuotedTweet.get(quoteTweetId);
  if (!quotedTweet) return null;

  return {
    ...quotedTweet,
    author: {
      username: quotedTweet.username,
      name: quotedTweet.name,
      avatar: quotedTweet.avatar,
      verified: quotedTweet.verified || false,
      gold: quotedTweet.gold || false,
      avatar_radius: quotedTweet.avatar_radius || null,
    },
    poll: getPollDataForTweet(quotedTweet.id, userId),
    attachments: getTweetAttachments(quotedTweet.id),
  };
};

const getPollDataForTweet = (tweetId, userId) => {
  const poll = getPollByPostId.get(tweetId);
  if (!poll) return null;

  const options = getPollOptions.all(poll.id);
  const totalVotes = getTotalPollVotes.get(poll.id)?.total || 0;
  const userVote = userId ? getUserPollVote.get(userId, poll.id) : null;
  const isExpired = new Date() > new Date(poll.expires_at);
  const voters = getPollVoters.all(poll.id);

  return {
    ...poll,
    options: options.map((option) => ({
      ...option,
      percentage:
        totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0,
    })),
    totalVotes,
    userVote: userVote?.option_id || null,
    isExpired,
    voters,
  };
};

const getPollDataForPost = getPollDataForTweet;
const getQuotedPostData = getQuotedTweetData;
const getPostAttachments = getTweetAttachments;

export default new Elysia({ prefix: "/profile" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 10_000,
      max: 50,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .get("/:username", async ({ params, jwt, headers }) => {
    try {
      const { username } = params;

      const user = getUserByUsername.get(username);
      if (!user) {
        return { error: "User not found" };
      }

      // Gather follow/post counts early so we can surface minimal profile
      // information even when an account is suspended.
      const counts = getFollowCounts.get(
        user.id,
        user.id,
        user.id,
        user.id,
        user.id
      );

      const isSuspended = isSuspendedQuery.get(user.id);
      if (isSuspended) {
        // Return an error but include minimal public profile fields so the
        // frontend can render the display name / avatar for suspended users.
        const minimalProfile = {
          username: user.username,
          name: user.name,
          avatar: user.avatar || null,
          banner: user.banner || null,
          created_at: user.created_at || null,
          following_count: counts?.following_count || 0,
          follower_count: counts?.follower_count || 0,
          post_count: counts?.post_count || 0,
        };

        return { error: "User is suspended", profile: minimalProfile };
      }

      const userPosts = getUserPosts.all(user.id);
      const userRetweets = getUserRetweets.all(user.id);
      const replies = getUserReplies.all(user.id);

      const profile = {
        ...user,
        following_count: counts.following_count,
        follower_count: counts.follower_count,
        post_count: counts.post_count,
      };

      let isFollowing = false;
      let followsMe = false;
      let isOwnProfile = false;
      let currentUserId = null;
      let followRequestStatus = null;

      const authorization = headers.authorization;
      if (authorization) {
        try {
          const payload = await jwt.verify(
            authorization.replace("Bearer ", "")
          );
          if (payload) {
            const currentUser = getUserByUsername.get(payload.username);
            if (currentUser) {
              currentUserId = currentUser.id;
              isOwnProfile = currentUser.id === user.id;
              if (!isOwnProfile) {
                const followStatus = getFollowStatus.get(
                  currentUser.id,
                  user.id
                );
                isFollowing = !!followStatus;

                const followsBackStatus = getFollowStatus.get(
                  user.id,
                  currentUser.id
                );
                followsMe = !!followsBackStatus;

                // Check for pending follow request
                if (!isFollowing) {
                  const followRequest = getFollowRequest.get(
                    currentUser.id,
                    user.id
                  );
                  followRequestStatus = followRequest?.status || null;
                }
              }
            }
          }
        } catch {
          // Invalid token, continue as unauthenticated
        }
      }

      // If the viewer is authenticated and not the profile owner, check whether
      // the profile owner has blocked the viewer. This is used by the frontend
      // to show a banner and disable interactions.
      let blockedByProfile = false;
      if (currentUserId && !isOwnProfile) {
        const blockedRow = db
          .query("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
          .get(user.id, currentUserId);
        blockedByProfile = !!blockedRow;
      }

      profile.blockedByProfile = blockedByProfile;

      // Combine and sort by creation time
      const allContent = [
        ...userPosts.map((post) => ({
          ...post,
          content_type: "post",
          sort_date: new Date(post.created_at),
          author: {
            username: post.username,
            name: post.name,
            avatar: post.avatar,
            verified: post.verified || false,
          },
        })),
        ...userRetweets.map((retweet) => ({
          ...retweet,
          content_type: "retweet",
          sort_date: new Date(retweet.retweet_created_at),
          retweet_created_at: retweet.retweet_created_at,
          author: {
            username: retweet.username,
            name: retweet.name,
            avatar: retweet.avatar,
            verified: retweet.verified || false,
          },
        })),
      ]
        .sort((a, b) => b.sort_date - a.sort_date)
        .slice(0, 20);

      // If account is private and viewer is not following and not owner, hide posts
      let posts = [];
      let processedReplies = [];

      if (user.private && !isFollowing && !isOwnProfile) {
        posts = [];
        processedReplies = [];
      } else {
        posts = allContent.map((post) => ({
          ...post,
          poll: getPollDataForPost(post.id, currentUserId),
          quoted_tweet: getQuotedPostData(post.quote_tweet_id, currentUserId),
          attachments: getPostAttachments(post.id),
          liked_by_user: false, // Will be set below
          retweeted_by_user: false, // Will be set below
        }));

        processedReplies = replies.map((reply) => ({
          ...reply,
          author: {
            username: reply.username,
            name: reply.name,
            avatar: reply.avatar || null,
            verified: reply.verified || false,
          },
          poll: getPollDataForPost(reply.id, currentUserId),
          quoted_tweet: getQuotedPostData(reply.quote_tweet_id, currentUserId),
          attachments: getPostAttachments(reply.id),
          liked_by_user: false,
          retweeted_by_user: false,
        }));
      }

      // Get likes and retweets for current user
      if (
        currentUserId &&
        allContent.length > 0 &&
        (!user.private || isFollowing || isOwnProfile)
      ) {
        try {
          const postIds = allContent.map((p) => p.id);
          // Use dynamic query based on actual number of posts
          const likesQuery = db.query(`
						SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds
              .map(() => "?")
              .join(",")})
					`);
          const retweetsQuery = db.query(`
						SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${postIds
              .map(() => "?")
              .join(",")})
					`);

          const likedPosts = likesQuery.all(currentUserId, ...postIds);
          const retweetedPosts = retweetsQuery.all(currentUserId, ...postIds);

          const likedPostsSet = new Set(likedPosts.map((like) => like.post_id));
          const retweetedPostsSet = new Set(
            retweetedPosts.map((retweet) => retweet.post_id)
          );

          posts.forEach((post) => {
            post.liked_by_user = likedPostsSet.has(post.id);
            post.retweeted_by_user = retweetedPostsSet.has(post.id);
          });
        } catch (e) {
          // If likes/retweets query fails, continue without them
          console.warn("Failed to fetch likes/retweets:", e);
        }
      }

      return {
        profile,
        posts,
        replies: processedReplies,
        isFollowing,
        followsMe,
        isOwnProfile,
        followRequestStatus,
      };
    } catch (error) {
      console.error("Profile fetch error:", error);
      return { error: "Failed to fetch profile" };
    }
  })
  .get("/:username/replies", async ({ params }) => {
    try {
      const { username } = params;

      const user = getUserByUsername.get(username);
      if (!user) {
        return { error: "User not found" };
      }

      const replies = getUserReplies.all(user.id);

      return {
        replies,
      };
    } catch (error) {
      console.error("Replies fetch error:", error);
      return { error: "Failed to fetch replies" };
    }
  })
  .put("/:username", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only edit your own profile" };
      }

      const { name, bio, location, website, pronouns } = body;

      const { theme, accent_color } = body;

      const { label_type, label_automated } = body;

      let radiusToStore = currentUser.avatar_radius;
      if (body.avatar_radius !== undefined) {
        if (!currentUser.gold) {
          return {
            error: "Only gold accounts can customize avatar corner radius",
          };
        }
        const parsed = parseInt(body.avatar_radius, 10);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 1000) {
          return { error: "Invalid avatar radius" };
        }
        radiusToStore = parsed;
      }

      if (name && name.length > 50) {
        return { error: "Display name must be 50 characters or less" };
      }

      if (bio && bio.length > 160) {
        return { error: "Bio must be 160 characters or less" };
      }

      if (location && location.length > 30) {
        return { error: "Location must be 30 characters or less" };
      }

      if (website && website.length > 100) {
        return { error: "Website must be 100 characters or less" };
      }

      if (pronouns && pronouns.length > 30) {
        return { error: "Pronouns must be 30 characters or less" };
      }

      if (label_type !== undefined) {
        const validLabels = ["parody", "fan", "commentary", null];
        if (!validLabels.includes(label_type)) {
          return {
            error:
              "Invalid label type. Must be parody, fan, commentary, or none",
          };
        }
      }

      const labelTypeToStore =
        label_type !== undefined ? label_type : currentUser.label_type;
      const labelAutomatedToStore =
        label_automated !== undefined
          ? !!label_automated
          : currentUser.label_automated || false;

      updateProfile.run(
        name || currentUser.name,
        bio !== undefined ? bio : currentUser.bio,
        location !== undefined ? location : currentUser.location,
        website !== undefined ? website : currentUser.website,
        pronouns !== undefined ? pronouns : currentUser.pronouns,
        radiusToStore,
        currentUser.id
      );
      if (theme !== undefined || accent_color !== undefined) {
        updateThemeAccent.run(
          theme !== undefined ? theme : currentUser.theme,
          accent_color !== undefined ? accent_color : currentUser.accent_color,
          currentUser.id
        );
      }

      if (label_type !== undefined || label_automated !== undefined) {
        updateLabels.run(
          labelTypeToStore,
          labelAutomatedToStore,
          currentUser.id
        );
      }

      const updatedUser = getUserByUsername.get(currentUser.username);
      return { success: true, profile: updatedUser };
    } catch (error) {
      console.error("Profile update error:", error);
      return { error: "Failed to update profile" };
    }
  })
  .post("/:username/follow", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    const payload = await jwt.verify(authorization.replace("Bearer ", ""));
    if (!payload) return { error: "Invalid token" };

    const currentUser = getUserByUsername.get(payload.username);
    if (!currentUser) return { error: "User not found" };

    const { username } = params;
    const targetUser = getUserByUsername.get(username);
    if (!targetUser) return { error: "User not found" };

    if (currentUser.id === targetUser.id) {
      return { error: "You cannot follow yourself" };
    }

    const blocked = db
      .query(
        "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)"
      )
      .get(currentUser.id, targetUser.id, targetUser.id, currentUser.id);
    if (blocked) {
      return { error: "Cannot follow this user" };
    }

    const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
    if (existingFollow) {
      return { error: "Already following this user" };
    }

    const existingRequest = getFollowRequest.get(currentUser.id, targetUser.id);
    if (existingRequest) {
      if (existingRequest.status === "pending") {
        return { error: "Follow request already sent" };
      }
      if (existingRequest.status === "denied") {
        // Allow re-requesting after denial
        deleteFollowRequest.run(currentUser.id, targetUser.id);
      }
    }

    // If target account is private, create follow request
    if (targetUser.private) {
      const requestId = Bun.randomUUIDv7();
      createFollowRequest.run(requestId, currentUser.id, targetUser.id);

      addNotification(
        targetUser.id,
        "follow_request",
        `@${currentUser.username} requested to follow you`,
        currentUser.username
      );

      return { success: true, requestSent: true };
    } else {
      // Public account - follow immediately
      const followId = Bun.randomUUIDv7();
      addFollow.run(followId, currentUser.id, targetUser.id);

      addNotification(
        targetUser.id,
        "follow",
        `@${currentUser.username} started following you`,
        currentUser.username
      );

      return { success: true, requestSent: false };
    }
  })
  .delete("/:username/follow", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      const targetUser = getUserByUsername.get(username);
      if (!targetUser) return { error: "User not found" };

      const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
      const existingRequest = getFollowRequest.get(
        currentUser.id,
        targetUser.id
      );

      if (existingFollow) {
        removeFollow.run(currentUser.id, targetUser.id);
        return { success: true, action: "unfollowed" };
      } else if (existingRequest && existingRequest.status === "pending") {
        deleteFollowRequest.run(currentUser.id, targetUser.id);
        return { success: true, action: "request_cancelled" };
      } else {
        return { error: "Not following this user and no pending request" };
      }
    } catch (error) {
      console.error("Unfollow error:", error);
      return { error: "Failed to unfollow user" };
    }
  })
  .post("/:username/avatar", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only update your own avatar" };
      }

      const { avatar } = body;
      if (!avatar || !avatar.stream) {
        return { error: "Avatar file is required" };
      }

      // Get file extension based on MIME type first
      // By default only WebP is allowed. GIF uploads are allowed only for gold accounts.
      const allowedTypes = {
        "image/webp": ".webp",
      };

      if (currentUser.gold) {
        // Allow GIF uploads for gold users (so animated avatars are possible)
        allowedTypes["image/gif"] = ".gif";
      }

      const fileExtension = allowedTypes[avatar.type];
      if (!fileExtension) {
        return {
          error: currentUser.gold
            ? "Invalid file type. Only WebP images (and GIF for Gold accounts) are allowed for avatars."
            : "Invalid file type. Only WebP images are allowed for avatars.",
        };
      }

      if (avatar.size > 5 * 1024 * 1024) {
        return {
          error: "File too large. Please upload an image smaller than 5MB.",
        };
      }

      const uploadsDir = "./.data/uploads";

      // Calculate secure hash for filename
      const arrayBuffer = await avatar.arrayBuffer();

      // Detect animated WebP (contains 'ANIM' chunk) and only allow it for gold users
      if (avatar.type === "image/webp") {
        try {
          const bytes = new Uint8Array(arrayBuffer);
          let hasANIM = false;
          for (let i = 0; i < bytes.length - 3; i++) {
            if (
              bytes[i] === 0x41 &&
              bytes[i + 1] === 0x4e &&
              bytes[i + 2] === 0x49 &&
              bytes[i + 3] === 0x4d
            ) {
              hasANIM = true;
              break;
            }
          }

          if (hasANIM && !currentUser.gold) {
            return {
              error:
                "Animated WebP avatars are allowed for Gold accounts only.",
            };
          }
        } catch {}
      }

      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(arrayBuffer);
      const fileHash = hasher.digest("hex");

      const fileName = `${fileHash}${fileExtension}`;
      const filePath = `${uploadsDir}/${fileName}`;

      await Bun.write(filePath, arrayBuffer);

      const avatarUrl = `/api/uploads/${fileName}`;
      updateAvatar.run(avatarUrl, currentUser.id);

      const updatedUser = getUserByUsername.get(currentUser.username);
      return { success: true, avatar: updatedUser.avatar };
    } catch (error) {
      console.error("Avatar upload error:", error);
      return { error: "Failed to upload avatar" };
    }
  })
  .delete("/:username/avatar", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only update your own avatar" };
      }

      // Remove avatar from database
      updateAvatar.run(null, currentUser.id);

      return { success: true };
    } catch (error) {
      console.error("Avatar removal error:", error);
      return { error: "Failed to remove avatar" };
    }
  })
  .post("/:username/banner", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only update your own banner" };
      }

      const { banner } = body;
      if (!banner || !banner.stream) {
        return { error: "Banner file is required" };
      }

      // Get file extension based on MIME type first
      const allowedTypes = {
        "image/webp": ".webp",
      };

      const fileExtension = allowedTypes[banner.type];
      if (!fileExtension) {
        return {
          error: "Invalid file type. Only WebP images are allowed for banners.",
        };
      }

      if (banner.size > 10 * 1024 * 1024) {
        return {
          error: "File too large. Please upload an image smaller than 10MB.",
        };
      }

      const uploadsDir = "./.data/uploads";

      // Calculate secure hash for filename
      const arrayBuffer = await banner.arrayBuffer();
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(arrayBuffer);
      const fileHash = hasher.digest("hex");

      const fileName = `${fileHash}${fileExtension}`;
      const filePath = `${uploadsDir}/${fileName}`;

      await Bun.write(filePath, arrayBuffer);

      const bannerUrl = `/api/uploads/${fileName}`;
      updateBanner.run(bannerUrl, currentUser.id);

      const updatedUser = getUserByUsername.get(currentUser.username);
      return { success: true, banner: updatedUser.banner };
    } catch (error) {
      console.error("Banner upload error:", error);
      return { error: "Failed to upload banner" };
    }
  })
  .delete("/:username/banner", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only update your own banner" };
      }

      // Remove banner from database
      updateBanner.run(null, currentUser.id);

      return { success: true };
    } catch (error) {
      console.error("Banner removal error:", error);
      return { error: "Failed to remove banner" };
    }
  })
  .get("/:username/followers", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const { username } = params;
      const user = getUserByUsername.get(username);
      if (!user) return { error: "User not found" };

      const followers = getFollowers.all(user.id);
      return { followers };
    } catch (error) {
      console.error("Get followers error:", error);
      return { error: "Failed to get followers" };
    }
  })
  .get("/:username/following", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const { username } = params;
      const user = getUserByUsername.get(username);
      if (!user) return { error: "User not found" };

      const following = getFollowing.all(user.id);
      return { following };
    } catch (error) {
      console.error("Get following error:", error);
      return { error: "Failed to get following" };
    }
  })
  .patch("/:username/username", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only change your own username" };
      }

      const { newUsername } = body;
      if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
        return { error: "Username must be between 3 and 20 characters" };
      }

      if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
        return {
          error: "Username can only contain letters, numbers, and underscores",
        };
      }

      const existingUser = getUserByUsername.get(newUsername);
      if (existingUser && existingUser.id !== currentUser.id) {
        return { error: "Username is already taken" };
      }

      updateUsername.run(newUsername, currentUser.id);

      const newToken = await jwt.sign({
        username: newUsername,
        userId: currentUser.id,
      });

      return { success: true, username: newUsername, token: newToken };
    } catch (error) {
      console.error("Update username error:", error);
      return { error: "Failed to update username" };
    }
  })
  .patch("/:username/password", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only change your own password" };
      }

      const { currentPassword, newPassword } = body;

      if (!newPassword || newPassword.length < 8) {
        return { error: "New password must be at least 8 characters long" };
      }

      if (currentUser.password_hash) {
        if (!currentPassword) {
          return { error: "Current password is required" };
        }

        const isValid = await Bun.password.verify(
          currentPassword,
          currentUser.password_hash
        );
        if (!isValid) {
          return { error: "Current password is incorrect" };
        }
      }

      const passwordHash = await Bun.password.hash(newPassword);
      updatePassword.run(passwordHash, currentUser.id);

      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      console.error("Update password error:", error);
      return { error: "Failed to update password" };
    }
  })
  .delete("/:username", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only delete your own account" };
      }

      const { confirmationText } = body;
      if (confirmationText !== "DELETE MY ACCOUNT") {
        return { error: "Please type 'DELETE MY ACCOUNT' to confirm" };
      }

      deleteUser.run(currentUser.id);

      return { success: true, message: "Account deleted successfully" };
    } catch (error) {
      console.error("Delete account error:", error);
      return { error: "Failed to delete account" };
    }
  })
  .post("/:username/password", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only add a password to your own account" };
      }

      const { password } = body;
      if (!password || password.length < 6) {
        return { error: "Password must be at least 6 characters long" };
      }

      const passwordHash = await Bun.password.hash(password);
      updatePassword.run(passwordHash, currentUser.id);

      return { success: true, message: "Password added successfully" };
    } catch (error) {
      console.error("Add password error:", error);
      return { error: "Failed to add password" };
    }
  })
  .get("/follow-requests", async ({ jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const requests = getPendingFollowRequests.all(currentUser.id);
      return { requests };
    } catch (error) {
      console.error("Get follow requests error:", error);
      return { error: "Failed to get follow requests" };
    }
  })
  .post(
    "/follow-requests/:requestId/approve",
    async ({ params, jwt, headers }) => {
      const authorization = headers.authorization;
      if (!authorization) return { error: "Authentication required" };

      try {
        const payload = await jwt.verify(authorization.replace("Bearer ", ""));
        if (!payload) return { error: "Invalid token" };

        const currentUser = getUserByUsername.get(payload.username);
        if (!currentUser) return { error: "User not found" };

        const { requestId } = params;
        const request = db
          .query("SELECT * FROM follow_requests WHERE id = ?")
          .get(requestId);

        if (!request) return { error: "Follow request not found" };
        if (request.target_id !== currentUser.id)
          return { error: "Unauthorized" };
        if (request.status !== "pending")
          return { error: "Request already processed" };

        // Approve request and create follow relationship
        approveFollowRequest.run(requestId);
        const followId = Bun.randomUUIDv7();
        addFollow.run(followId, request.requester_id, currentUser.id);

        // Notify the requester
        const requester = db
          .query("SELECT * FROM users WHERE id = ?")
          .get(request.requester_id);
        if (requester) {
          addNotification(
            requester.id,
            "follow_approved",
            `@${currentUser.username} approved your follow request`,
            currentUser.username
          );
        }

        return { success: true };
      } catch (error) {
        console.error("Approve follow request error:", error);
        return { error: "Failed to approve follow request" };
      }
    }
  )
  .post(
    "/follow-requests/:requestId/deny",
    async ({ params, jwt, headers }) => {
      const authorization = headers.authorization;
      if (!authorization) return { error: "Authentication required" };

      try {
        const payload = await jwt.verify(authorization.replace("Bearer ", ""));
        if (!payload) return { error: "Invalid token" };

        const currentUser = getUserByUsername.get(payload.username);
        if (!currentUser) return { error: "User not found" };

        const { requestId } = params;
        const request = db
          .query("SELECT * FROM follow_requests WHERE id = ?")
          .get(requestId);

        if (!request) return { error: "Follow request not found" };
        if (request.target_id !== currentUser.id)
          return { error: "Unauthorized" };
        if (request.status !== "pending")
          return { error: "Request already processed" };

        denyFollowRequest.run(requestId);

        return { success: true };
      } catch (error) {
        console.error("Deny follow request error:", error);
        return { error: "Failed to deny follow request" };
      }
    }
  )
  .patch("/:username/privacy", async ({ params, jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username } = params;
      if (currentUser.username !== username) {
        return { error: "You can only change your own privacy settings" };
      }

      const { private: isPrivate } = body;
      if (typeof isPrivate !== "boolean") {
        return { error: "Private setting must be a boolean value" };
      }

      db.query("UPDATE users SET private = ? WHERE id = ?").run(
        isPrivate,
        currentUser.id
      );

      return { success: true, private: isPrivate };
    } catch (error) {
      console.error("Update privacy error:", error);
      return { error: "Failed to update privacy settings" };
    }
  })
  .post("/pin/:tweetId", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { tweetId } = params;

      // Check if tweet exists and belongs to user
      const tweet = db
        .query("SELECT * FROM posts WHERE id = ? AND user_id = ?")
        .get(tweetId, currentUser.id);
      if (!tweet) {
        return { error: "Tweet not found or doesn't belong to you" };
      }

      // Check if user already has a pinned tweet
      const existingPinned = db
        .query("SELECT * FROM posts WHERE user_id = ? AND pinned = 1")
        .get(currentUser.id);
      if (existingPinned) {
        // Unpin the existing tweet
        db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(
          existingPinned.id
        );
      }

      // Pin the new tweet
      db.query("UPDATE posts SET pinned = 1 WHERE id = ?").run(tweetId);

      return { success: true };
    } catch (error) {
      console.error("Pin tweet error:", error);
      return { error: "Failed to pin tweet" };
    }
  })
  .delete("/pin/:tweetId", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { tweetId } = params;

      // Unpin the tweet
      db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(tweetId);

      return { success: true };
    } catch (error) {
      console.error("Unpin tweet error:", error);
      return { error: "Failed to unpin tweet" };
    }
  })
  .post("/:username/pin/:tweetId", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username, tweetId } = params;
      if (currentUser.username !== username) {
        return { error: "You can only pin your own tweets" };
      }

      // Check if tweet exists and belongs to user
      const tweet = db
        .query("SELECT * FROM posts WHERE id = ? AND user_id = ?")
        .get(tweetId, currentUser.id);
      if (!tweet) {
        return { error: "Tweet not found or doesn't belong to you" };
      }

      // Check if user already has a pinned tweet
      const existingPinned = db
        .query("SELECT * FROM posts WHERE user_id = ? AND pinned = 1")
        .get(currentUser.id);
      if (existingPinned) {
        // Unpin the existing tweet
        db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(
          existingPinned.id
        );
      }

      // Pin the new tweet
      db.query("UPDATE posts SET pinned = 1 WHERE id = ?").run(tweetId);

      return { success: true };
    } catch (error) {
      console.error("Pin tweet error:", error);
      return { error: "Failed to pin tweet" };
    }
  })
  .delete("/:username/pin/:tweetId", async ({ params, jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { username, tweetId } = params;
      if (currentUser.username !== username) {
        return { error: "You can only unpin your own tweets" };
      }

      // Unpin the tweet
      db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(tweetId);

      return { success: true };
    } catch (error) {
      console.error("Unpin tweet error:", error);
      return { error: "Failed to unpin tweet" };
    }
  })
  .post("/settings/c-algorithm", async ({ jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const currentUser = getUserByUsername.get(payload.username);
      if (!currentUser) return { error: "User not found" };

      const { enabled } = body;

      db.query("UPDATE users SET use_c_algorithm = ? WHERE id = ?").run(
        enabled ? 1 : 0,
        currentUser.id
      );

      return { success: true };
    } catch (error) {
      console.error("Update C algorithm setting error:", error);
      return { error: "Failed to update setting" };
    }
  });

export const avatarRoutes = new Elysia({ prefix: "/avatars" }).get(
  "/:filename",
  ({ params }) => {
    const { filename } = params;

    // Legacy avatar route - redirect to uploads (allow webp and gif)
    if (!/^[a-f0-9]{64}\.(webp|gif)$/i.test(filename)) {
      return new Response("Invalid filename", { status: 400 });
    }

    const filePath = `./.data/uploads/${filename}`;
    return file(filePath);
  }
);
