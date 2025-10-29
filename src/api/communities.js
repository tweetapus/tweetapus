import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import db from "./../db.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

const getCommunity = db.prepare("SELECT * FROM communities WHERE id = ?");
const getCommunityByName = db.prepare(
  "SELECT * FROM communities WHERE name = ?"
);
const createCommunity = db.prepare(`
  INSERT INTO communities (id, name, description, rules, owner_id, access_mode)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateCommunity = db.prepare(`
  UPDATE communities
  SET name = ?, description = ?, rules = ?, updated_at = datetime('now', 'utc')
  WHERE id = ?
`);
const updateCommunityIcon = db.prepare(
  "UPDATE communities SET icon = ? WHERE id = ?"
);
const updateCommunityBanner = db.prepare(
  "UPDATE communities SET banner = ? WHERE id = ?"
);
const updateCommunityAccessMode = db.prepare(
  "UPDATE communities SET access_mode = ? WHERE id = ?"
);
const deleteCommunity = db.prepare("DELETE FROM communities WHERE id = ?");
const incrementMemberCount = db.prepare(
  "UPDATE communities SET member_count = member_count + 1 WHERE id = ?"
);
const decrementMemberCount = db.prepare(
  "UPDATE communities SET member_count = member_count - 1 WHERE id = ?"
);

const getMember = db.prepare(
  "SELECT * FROM community_members WHERE community_id = ? AND user_id = ?"
);
const addMember = db.prepare(`
  INSERT INTO community_members (id, community_id, user_id, role)
  VALUES (?, ?, ?, ?)
`);
const removeMember = db.prepare(
  "DELETE FROM community_members WHERE community_id = ? AND user_id = ?"
);
const updateMemberRole = db.prepare(
  "UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?"
);
const banMember = db.prepare(`
  UPDATE community_members
  SET banned = TRUE, banned_at = datetime('now', 'utc'), banned_by = ?, ban_reason = ?
  WHERE community_id = ? AND user_id = ?
`);
const unbanMember = db.prepare(`
  UPDATE community_members
  SET banned = FALSE, banned_at = NULL, banned_by = NULL, ban_reason = NULL
  WHERE community_id = ? AND user_id = ?
`);

const getJoinRequest = db.prepare(
  "SELECT * FROM community_join_requests WHERE community_id = ? AND user_id = ?"
);
const createJoinRequest = db.prepare(`
  INSERT INTO community_join_requests (id, community_id, user_id, status)
  VALUES (?, ?, ?, 'pending')
`);
const updateJoinRequest = db.prepare(`
  UPDATE community_join_requests
  SET status = ?, responded_at = datetime('now', 'utc'), responded_by = ?
  WHERE id = ?
`);

const getCommunities = db.prepare(
  "SELECT * FROM communities ORDER BY created_at DESC LIMIT ? OFFSET ?"
);
const getCommunityMembers = db.prepare(`
  SELECT cm.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius
  FROM community_members cm
  JOIN users u ON cm.user_id = u.id
  WHERE cm.community_id = ? AND cm.banned = FALSE
  ORDER BY 
    CASE cm.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'mod' THEN 3
      ELSE 4
    END,
    cm.joined_at DESC
  LIMIT ? OFFSET ?
`);
const getPendingJoinRequests = db.prepare(`
  SELECT jr.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius
  FROM community_join_requests jr
  JOIN users u ON jr.user_id = u.id
  WHERE jr.community_id = ? AND jr.status = 'pending'
  ORDER BY jr.created_at ASC
  LIMIT ? OFFSET ?
`);
const getUserCommunities = db.prepare(`
  SELECT c.*, cm.role
  FROM communities c
  JOIN community_members cm ON c.id = cm.community_id
  WHERE cm.user_id = ? AND cm.banned = FALSE
  ORDER BY cm.joined_at DESC
  LIMIT ? OFFSET ?
`);

export default new Elysia()
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .derive(async ({ jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { user: null };
    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { user: null };
      return { user: payload };
    } catch {
      return { user: null };
    }
  })
  .post("/communities", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { name, description, rules, access_mode, owner_username } = body;

    if (!name || name.trim().length === 0) {
      set.status = 400;
      return { error: "Community name is required" };
    }

    if (name.length > 50) {
      set.status = 400;
      return { error: "Community name must be 50 characters or less" };
    }

    const existing = getCommunityByName.get(name.trim());
    if (existing) {
      set.status = 400;
      return { error: "A community with this name already exists" };
    }

    const communityId = Bun.randomUUIDv7();

    let ownerId = user.userId;

    if (owner_username && user.admin) {
      const ownerUser = getUserByUsername.get(owner_username);
      if (!ownerUser) {
        set.status = 400;
        return { error: "Owner user not found" };
      }
      ownerId = ownerUser.id;
    } else if (owner_username === null && user.admin) {
      ownerId = null;
    }

    try {
      createCommunity.run(
        communityId,
        name.trim(),
        description?.trim() || null,
        rules?.trim() || null,
        ownerId,
        access_mode === "locked" ? "locked" : "open"
      );

      if (ownerId) {
        const memberId = Bun.randomUUIDv7();
        addMember.run(memberId, communityId, ownerId, "owner");
        incrementMemberCount.run(communityId);
      }

      const community = getCommunity.get(communityId);
      return { success: true, community };
    } catch {
      set.status = 500;
      return { error: "Failed to create community" };
    }
  })
  .get("/communities", async ({ query }) => {
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const offset = parseInt(query.offset) || 0;

    const communities = getCommunities.all(limit, offset);
    return { communities };
  })
  .get("/communities/:id", async ({ params, user, set }) => {
    const community = getCommunity.get(params.id);

    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    let member = null;
    let joinRequest = null;

    if (user) {
      member = getMember.get(params.id, user.userId);
      if (!member) {
        joinRequest = getJoinRequest.get(params.id, user.userId);
      }
    }

    return {
      community,
      member,
      joinRequest: joinRequest?.status === "pending" ? joinRequest : null,
    };
  })
  .patch("/communities/:id", async ({ user, params, body, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const member = getMember.get(params.id, user.userId);
    const canEdit =
      user.admin ||
      (member && (member.role === "owner" || member.role === "admin"));

    if (!canEdit) {
      set.status = 403;
      return { error: "You don't have permission to edit this community" };
    }

    const { name, description, rules, access_mode } = body;

    if (name && name.trim().length === 0) {
      set.status = 400;
      return { error: "Community name cannot be empty" };
    }

    if (name && name.length > 50) {
      set.status = 400;
      return { error: "Community name must be 50 characters or less" };
    }

    if (name && name !== community.name) {
      const existing = getCommunityByName.get(name.trim());
      if (existing) {
        set.status = 400;
        return { error: "A community with this name already exists" };
      }
    }

    updateCommunity.run(
      name?.trim() || community.name,
      description?.trim() || community.description,
      rules?.trim() || community.rules,
      params.id
    );

    if (access_mode && (access_mode === "open" || access_mode === "locked")) {
      db.query("UPDATE communities SET access_mode = ? WHERE id = ?").run(
        access_mode,
        params.id
      );
    }

    const updated = getCommunity.get(params.id);
    return { success: true, community: updated };
  })
  .delete("/communities/:id", async ({ user, params, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const canDelete = user.admin || community.owner_id === user.userId;
    if (!canDelete) {
      set.status = 403;
      return {
        error: "Only the community owner or admin can delete the community",
      };
    }

    deleteCommunity.run(params.id);
    return { success: true };
  })
  .post("/communities/:id/join", async ({ user, params, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const existingMember = getMember.get(params.id, user.userId);
    if (existingMember) {
      if (existingMember.banned) {
        set.status = 403;
        return { error: "You are banned from this community" };
      }
      set.status = 400;
      return { error: "You are already a member of this community" };
    }

    if (community.access_mode === "locked") {
      const existingRequest = getJoinRequest.get(params.id, user.userId);
      if (existingRequest) {
        if (existingRequest.status === "pending") {
          set.status = 400;
          return { error: "You already have a pending join request" };
        } else if (existingRequest.status === "rejected") {
          set.status = 403;
          return { error: "Your join request was rejected" };
        }
      }

      const requestId = Bun.randomUUIDv7();
      createJoinRequest.run(requestId, params.id, user.userId);

      const ownerMember = db
        .prepare(
          "SELECT user_id FROM community_members WHERE community_id = ? AND role = 'owner'"
        )
        .get(params.id);
      if (ownerMember) {
        await addNotification(
          ownerMember.user_id,
          "community_join_request",
          `${user.username} requested to join ${community.name}`,
          params.id,
          user.userId,
          user.username,
          user.name || user.username
        );
      }

      return { success: true, status: "pending" };
    }

    const memberId = Bun.randomUUIDv7();
    addMember.run(memberId, params.id, user.userId, "member");
    incrementMemberCount.run(params.id);

    return { success: true, status: "joined" };
  })
  .post("/communities/:id/leave", async ({ user, params, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const member = getMember.get(params.id, user.userId);
    if (!member) {
      set.status = 400;
      return { error: "You are not a member of this community" };
    }

    if (member.role === "owner") {
      set.status = 403;
      return {
        error:
          "The community owner cannot leave. Transfer ownership or delete the community instead.",
      };
    }

    removeMember.run(params.id, user.userId);
    decrementMemberCount.run(params.id);

    return { success: true };
  })
  .get("/communities/:id/members", async ({ params, query, set }) => {
    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const offset = parseInt(query.offset) || 0;

    const members = getCommunityMembers.all(params.id, limit, offset);
    return { members };
  })
  .post(
    "/communities/:id/members/:userId/role",
    async ({ user, params, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const requesterMember = getMember.get(params.id, user.userId);
      if (!requesterMember) {
        set.status = 403;
        return { error: "You are not a member of this community" };
      }

      const targetMember = getMember.get(params.id, params.userId);
      if (!targetMember) {
        set.status = 404;
        return { error: "User is not a member of this community" };
      }

      const { role } = body;

      if (!["member", "mod", "admin"].includes(role)) {
        set.status = 400;
        return { error: "Invalid role" };
      }

      if (requesterMember.role === "owner") {
        updateMemberRole.run(role, params.id, params.userId);

        await addNotification(
          params.userId,
          "community_role_change",
          `You are now a ${role} in ${community.name}`,
          params.id,
          user.userId,
          user.username,
          user.name || user.username
        );

        return { success: true };
      }

      if (requesterMember.role === "admin" && role === "mod") {
        updateMemberRole.run(role, params.id, params.userId);

        await addNotification(
          params.userId,
          "community_role_change",
          `You are now a ${role} in ${community.name}`,
          params.id,
          user.userId,
          user.username,
          user.name || user.username
        );

        return { success: true };
      }

      set.status = 403;
      return { error: "You don't have permission to change this user's role" };
    }
  )
  .post(
    "/communities/:id/members/:userId/ban",
    async ({ user, params, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const requesterMember = getMember.get(params.id, user.userId);
      if (
        !requesterMember ||
        !["owner", "admin", "mod"].includes(requesterMember.role)
      ) {
        set.status = 403;
        return { error: "You don't have permission to ban users" };
      }

      const targetMember = getMember.get(params.id, params.userId);
      if (!targetMember) {
        set.status = 404;
        return { error: "User is not a member of this community" };
      }

      if (targetMember.role === "owner") {
        set.status = 403;
        return { error: "Cannot ban the community owner" };
      }

      if (targetMember.role === "admin" && requesterMember.role !== "owner") {
        set.status = 403;
        return { error: "Only the owner can ban admins" };
      }

      if (targetMember.role === "mod" && requesterMember.role === "mod") {
        set.status = 403;
        return { error: "Mods cannot ban other mods" };
      }

      const { reason } = body;
      banMember.run(
        user.userId,
        reason || "No reason provided",
        params.id,
        params.userId
      );

      await addNotification(
        params.userId,
        "community_ban",
        `You have been banned from ${community.name}`,
        params.id,
        user.userId,
        user.username,
        user.name || user.username
      );

      return { success: true };
    }
  )
  .post(
    "/communities/:id/members/:userId/unban",
    async ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const requesterMember = getMember.get(params.id, user.userId);
      if (
        !requesterMember ||
        !["owner", "admin", "mod"].includes(requesterMember.role)
      ) {
        set.status = 403;
        return { error: "You don't have permission to unban users" };
      }

      const targetMember = getMember.get(params.id, params.userId);
      if (!targetMember || !targetMember.banned) {
        set.status = 400;
        return { error: "User is not banned" };
      }

      unbanMember.run(params.id, params.userId);

      await addNotification(
        params.userId,
        "community_unban",
        `You have been unbanned from ${community.name}`,
        params.id,
        user.userId,
        user.username,
        user.name || user.username
      );

      return { success: true };
    }
  )
  .patch(
    "/communities/:id/access-mode",
    async ({ user, params, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      if (community.owner_id !== user.userId) {
        set.status = 403;
        return { error: "Only the community owner can change the access mode" };
      }

      const { access_mode } = body;

      if (!["open", "locked"].includes(access_mode)) {
        set.status = 400;
        return { error: "Invalid access mode. Must be 'open' or 'locked'" };
      }

      updateCommunityAccessMode.run(access_mode, params.id);

      return { success: true, access_mode };
    }
  )
  .get(
    "/communities/:id/join-requests",
    async ({ user, params, query, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const member = getMember.get(params.id, user.userId);
      if (!member || !["owner", "admin"].includes(member.role)) {
        set.status = 403;
        return { error: "You don't have permission to view join requests" };
      }

      const limit = Math.min(parseInt(query.limit) || 20, 100);
      const offset = parseInt(query.offset) || 0;

      const requests = getPendingJoinRequests.all(params.id, limit, offset);
      return { requests };
    }
  )
  .post(
    "/communities/:id/join-requests/:requestId/approve",
    async ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const member = getMember.get(params.id, user.userId);
      if (!member || !["owner", "admin"].includes(member.role)) {
        set.status = 403;
        return { error: "You don't have permission to approve join requests" };
      }

      const request = db
        .prepare("SELECT * FROM community_join_requests WHERE id = ?")
        .get(params.requestId);
      if (!request || request.community_id !== params.id) {
        set.status = 404;
        return { error: "Join request not found" };
      }

      if (request.status !== "pending") {
        set.status = 400;
        return { error: "This request has already been processed" };
      }

      const memberId = Bun.randomUUIDv7();
      addMember.run(memberId, params.id, request.user_id, "member");
      incrementMemberCount.run(params.id);

      updateJoinRequest.run("approved", user.userId, params.requestId);

      await addNotification(
        request.user_id,
        "community_join_approved",
        `Your request to join ${community.name} was approved`,
        params.id,
        user.userId,
        user.username,
        user.name || user.username
      );

      return { success: true };
    }
  )
  .post(
    "/communities/:id/join-requests/:requestId/reject",
    async ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const community = getCommunity.get(params.id);
      if (!community) {
        set.status = 404;
        return { error: "Community not found" };
      }

      const member = getMember.get(params.id, user.userId);
      if (!member || !["owner", "admin"].includes(member.role)) {
        set.status = 403;
        return { error: "You don't have permission to reject join requests" };
      }

      const request = db
        .prepare("SELECT * FROM community_join_requests WHERE id = ?")
        .get(params.requestId);
      if (!request || request.community_id !== params.id) {
        set.status = 404;
        return { error: "Join request not found" };
      }

      if (request.status !== "pending") {
        set.status = 400;
        return { error: "This request has already been processed" };
      }

      updateJoinRequest.run("rejected", user.userId, params.requestId);

      await addNotification(
        request.user_id,
        "community_join_rejected",
        `Your request to join ${community.name} was rejected`,
        params.id,
        user.userId,
        user.username,
        user.name || user.username
      );

      return { success: true };
    }
  )
  .get("/users/:userId/communities", async ({ params, query }) => {
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const offset = parseInt(query.offset) || 0;

    const communities = getUserCommunities.all(params.userId, limit, offset);
    return { communities };
  })
  .post("/communities/:id/icon", async ({ user, params, body, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const member = getMember.get(params.id, user.userId);
    if (!member || !["owner", "admin"].includes(member.role)) {
      set.status = 403;
      return {
        error: "You don't have permission to update the community icon",
      };
    }

    const { icon } = body;
    updateCommunityIcon.run(icon, params.id);

    return { success: true };
  })
  .post("/communities/:id/banner", async ({ user, params, body, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const member = getMember.get(params.id, user.userId);
    if (!member || !["owner", "admin"].includes(member.role)) {
      set.status = 403;
      return {
        error: "You don't have permission to update the community banner",
      };
    }

    const { banner } = body;
    updateCommunityBanner.run(banner, params.id);

    return { success: true };
  })
  .get("/communities/:id/tweets", async ({ user, params, query, set }) => {
    const community = getCommunity.get(params.id);
    if (!community) {
      set.status = 404;
      return { error: "Community not found" };
    }

    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const offset = parseInt(query.offset) || 0;

    const tweets = db
      .query(
        `
      SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.community_id = ? AND posts.reply_to IS NULL
      ORDER BY posts.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(params.id, limit, offset);

    const enrichedTweets = tweets.map((tweet) => {
      const attachments = db
        .query("SELECT * FROM attachments WHERE post_id = ?")
        .all(tweet.id);

      return {
        ...tweet,
        author: {
          username: tweet.username,
          name: tweet.name,
          avatar: tweet.avatar,
          verified: tweet.verified || false,
          gold: tweet.gold || false,
          avatar_radius: tweet.avatar_radius || null,
        },
        attachments: attachments || [],
        liked_by_user: user
          ? !!db
              .query("SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?")
              .get(user.userId, tweet.id)
          : false,
        retweeted_by_user: user
          ? !!db
              .query("SELECT 1 FROM retweets WHERE user_id = ? AND post_id = ?")
              .get(user.userId, tweet.id)
          : false,
        bookmarked_by_user: user
          ? !!db
              .query(
                "SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?"
              )
              .get(user.userId, tweet.id)
          : false,
      };
    });

    return { tweets: enrichedTweets };
  });
