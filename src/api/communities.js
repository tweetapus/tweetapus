import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import db from "./../db.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
	"SELECT id, username, admin FROM users WHERE LOWER(username) = LOWER(?)",
);

const getCommunity = db.prepare("SELECT * FROM communities WHERE id = ?");
const getCommunityByName = db.prepare(
	"SELECT * FROM communities WHERE name = ?",
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
	"UPDATE communities SET icon = ? WHERE id = ?",
);
const updateCommunityBanner = db.prepare(
	"UPDATE communities SET banner = ? WHERE id = ?",
);
const updateCommunityAccessMode = db.prepare(
	"UPDATE communities SET access_mode = ? WHERE id = ?",
);
const deleteCommunity = db.prepare("DELETE FROM communities WHERE id = ?");
const incrementMemberCount = db.prepare(
	"UPDATE communities SET member_count = member_count + 1 WHERE id = ?",
);
const decrementMemberCount = db.prepare(
	"UPDATE communities SET member_count = member_count - 1 WHERE id = ?",
);

const getMember = db.prepare(
	"SELECT * FROM community_members WHERE community_id = ? AND user_id = ?",
);
const addMember = db.prepare(`
  INSERT INTO community_members (id, community_id, user_id, role)
  VALUES (?, ?, ?, ?)
`);
const removeMember = db.prepare(
	"DELETE FROM community_members WHERE community_id = ? AND user_id = ?",
);
const updateMemberRole = db.prepare(
	"UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?",
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
	"SELECT * FROM community_join_requests WHERE community_id = ? AND user_id = ?",
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
	"SELECT * FROM communities ORDER BY created_at DESC LIMIT ? OFFSET ?",
);
const getCommunityMembers = db.prepare(`
  SELECT cm.*, u.username, u.name, u.avatar, u.verified, u.gold, u.gray, u.avatar_radius, u.checkmark_outline, u.avatar_outline, u.selected_community_tag
  FROM community_members cm
  JOIN users u ON cm.user_id = u.id
  WHERE cm.community_id = ? AND cm.banned = FALSE AND u.suspended = FALSE AND u.shadowbanned = FALSE
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
  WHERE jr.community_id = ? AND jr.status = 'pending' AND u.suspended = FALSE AND u.shadowbanned = FALSE
  ORDER BY jr.created_at ASC
  LIMIT ? OFFSET ?
`);
const getUserCommunities = db.prepare(`
  SELECT c.*, cm.role
  FROM communities c
  JOIN community_members cm ON c.id = cm.community_id
  JOIN users u ON cm.user_id = u.id
  WHERE cm.user_id = ? AND cm.banned = FALSE AND u.suspended = FALSE AND u.shadowbanned = FALSE
  ORDER BY cm.joined_at DESC
  LIMIT ? OFFSET ?
`);

export default new Elysia({ tags: ["Communities"] })
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
				access_mode === "locked" ? "locked" : "open",
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
	.get(
		"/communities/:id",
		async ({ params, user, set }) => {
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
		},
		{
			detail: {
				description: "Creates a new community",
			},
			body: t.Object({
				name: t.String(),
				description: t.Optional(t.String()),
				rules: t.Optional(t.String()),
				icon: t.Optional(t.String()),
				banner: t.Optional(t.String()),
				owner_user_id: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				error: t.Optional(t.String()),
				community: t.Object(),
			}),
		},
	)
	.get(
		"/communities",
		async ({ query }) => {
			const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
			const offset = parseInt(query.offset, 10) || 0;

			const communities = getCommunities.all(limit, offset);
			return { communities };
		},
		{
			detail: {
				description: "Gets a list of communities",
			},
		},
	)
	.get(
		"/communities/user/me",
		async ({ user, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const communities = getUserCommunities.all(user.userId, 100, 0);
			return { communities };
		},
		{
			detail: {
				description: "Gets the current user's communities",
			},
		},
	)
	.get(
		"/communities/:id",
		async ({ params, user, set }) => {
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
		},
		{
			detail: {
				description: "Gets a community",
			},
			params: t.Object({
				id: t.String(),
			}),
		},
	) //
	.patch(
		"/communities/:id",
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
				params.id,
			);

			if (access_mode && (access_mode === "open" || access_mode === "locked")) {
				db.query("UPDATE communities SET access_mode = ? WHERE id = ?").run(
					access_mode,
					params.id,
				);
			}

			const updated = getCommunity.get(params.id);
			return { success: true, community: updated };
		},
		{
			detail: {
				description: "Updates a community",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				name: t.String(),
				description: t.Optional(t.String()),
				rules: t.Optional(t.String()),
				access_mode: t.Optional(t.String()),
			}),
		},
	)
	.delete(
		"/communities/:id",
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

			const canDelete = user.admin || community.owner_id === user.userId;
			if (!canDelete) {
				set.status = 403;
				return {
					error: "Only the community owner or admin can delete the community",
				};
			}

			deleteCommunity.run(params.id);
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a community",
			},
			params: t.Object({
				id: t.String(),
			}),
		},
	)
	.post(
		"/communities/:id/join",
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
						"SELECT user_id FROM community_members WHERE community_id = ? AND role = 'owner'",
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
						user.name || user.username,
					);
				}

				return { success: true, status: "pending" };
			}

			const memberId = Bun.randomUUIDv7();
			addMember.run(memberId, params.id, user.userId, "member");
			incrementMemberCount.run(params.id);

			return { success: true, status: "joined" };
		},
		{
			detail: {
				description: "Joins or sends a join request to a community",
			},
			params: t.Object({
				id: t.String(),
			}),
		},
	)
	.post(
		"/communities/:id/leave",
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
		},
		{
			detail: {
				description: "Leaves a community",
			},
			params: t.Object({
				id: t.String(),
			}),
		},
	)
	.get(
		"/communities/:id/members",
		async ({ params, query, set }) => {
			const community = getCommunity.get(params.id);
			if (!community) {
				set.status = 404;
				return { error: "Community not found" };
			}

			const limit = Math.min(parseInt(query.limit, 19) || 20, 100);
			const offset = parseInt(query.offset, 10) || 0;

			const members = getCommunityMembers.all(params.id, limit, offset);
			return { members };
		},
		{
			detail: {
				description: "Gets a list of community members",
			},
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
			}),
		},
	)
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

			if (requesterMember.role === "owner" && role === "admin") {
				updateMemberRole.run(role, params.id, params.userId);

				await addNotification(
					params.userId,
					"community_role_change",
					`You are now an ${role} in ${community.name}`,
					params.id,
					user.userId,
					user.username,
					user.name || user.username,
				);

				return { success: true };
			}

			if (requesterMember.role === "mod") {
				updateMemberRole.run(role, params.id, params.userId);

				await addNotification(
					params.userId,
					"community_role_change",
					`You are now a ${role} in ${community.name}`,
					params.id,
					user.userId,
					user.username,
					user.name || user.username,
				);

				return { success: true };
			}

			set.status = 403;
			return { error: "You don't have permission to change this user's role" };
		},
		{
			detail: {
				description: "Changes a community member's role",
			},
			params: t.Object({
				id: t.String(),
				userId: t.String(),
			}),
			body: t.Object({
				role: t.String(),
			}),
		},
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
				params.userId,
			);

			await addNotification(
				params.userId,
				"community_ban",
				`You have been banned from ${community.name}`,
				params.id,
				user.userId,
				user.username,
				user.name || user.username,
			);

			return { success: true };
		},
		{
			detail: {
				description: "Bans a community member",
			},
			params: t.Object({
				id: t.String(),
				userId: t.String(),
			}),
		},
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
				user.name || user.username,
			);

			return { success: true };
		},
		{
			detail: {
				description: "Unbans a community member",
			},
			params: t.Object({
				id: t.String(),
				userId: t.String(),
			}),
		},
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
		},
		{
			detail: {
				description: "Updates a community's access mode",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				access_mode: t.String(),
			}),
		},
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

			const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
			const offset = parseInt(query.offset, 10) || 0;

			const requests = getPendingJoinRequests.all(params.id, limit, offset);
			return { requests };
		},
		{
			detail: {
				description: "Gets a list of pending join requests",
			},
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
			}),
		},
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
				user.name || user.username,
			);

			return { success: true };
		},
		{
			detail: {
				description: "Approves a join request to a community",
			},
			params: t.Object({
				id: t.String(),
				requestId: t.String(),
			}),
		},
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
				user.name || user.username,
			);

			return { success: true };
		},
		{
			detail: {
				description: "Rejects a join request to a community",
			},
			params: t.Object({
				id: t.String(),
				requestId: t.String(),
			}),
		},
	)
	.get(
		"/users/:userId/communities",
		async ({ params, query }) => {
			const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
			const offset = parseInt(query.offset, 10) || 0;

			const communities = getUserCommunities.all(params.userId, limit, offset);
			return { communities };
		},
		{
			detail: {
				description: "Gets a list of communities a user is a member of",
			},
			params: t.Object({
				userId: t.String(),
			}),
			query: t.Object({
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/communities/:id/icon",
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
		},
		{
			detail: {
				description: "Updates a community's icon",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				icon: t.String(),
			}),
		},
	)
	.post(
		"/communities/:id/banner",
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
		},
		{
			detail: {
				description: "Updates a community's banner",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				banner: t.String(),
			}),
		},
	)
	.get(
		"/communities/:id/tweets",
		async ({ user, params, query, set }) => {
			const community = getCommunity.get(params.id);
			if (!community) {
				set.status = 404;
				return { error: "Community not found" };
			}

			const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
			const offset = parseInt(query.offset, 10) || 0;

			const tweets = db
				.query(
					`
      SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with
      FROM posts
      JOIN users ON posts.user_id = users.id
	WHERE posts.community_id = ? AND posts.reply_to IS NULL AND users.suspended = 0 AND users.shadowbanned = 0
      ORDER BY posts.created_at DESC
      LIMIT ? OFFSET ?
    `,
				)
				.all(params.id, limit, offset);

			const enrichedTweets = tweets.map((tweet) => {
				const attachments = db
					.query("SELECT * FROM attachments WHERE post_id = ?")
					.all(tweet.id);

				const author = {
					username: tweet.username,
					name: tweet.name,
					avatar: tweet.avatar,
					verified: tweet.verified || false,
					gold: tweet.gold || false,
					avatar_radius: tweet.avatar_radius || null,
					affiliate: tweet.affiliate || false,
					affiliate_with: tweet.affiliate_with || null,
				};

				if (author.affiliate && author.affiliate_with) {
					const affiliateProfile = db
						.query(
							"SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE id = ?",
						)
						.get(author.affiliate_with);
					if (affiliateProfile) {
						author.affiliate_with_profile = affiliateProfile;
					}
				}

				return {
					...tweet,
					author,
					attachments: attachments || [],
					liked_by_user: user
						? !!db
								.query("SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?")
								.get(user.userId, tweet.id)
						: false,
					retweeted_by_user: user
						? !!db
								.query(
									"SELECT 1 FROM retweets WHERE user_id = ? AND post_id = ?",
								)
								.get(user.userId, tweet.id)
						: false,
					bookmarked_by_user: user
						? !!db
								.query(
									"SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?",
								)
								.get(user.userId, tweet.id)
						: false,
				};
			});

			return { tweets: enrichedTweets };
		},
		{
			detail: {
				description: "Gets a list of tweets in a community",
			},
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
			}),
		},
	)
	.patch(
		"/communities/:id/tag",
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

			const member = getMember.get(params.id, user.userId);
			const canEdit =
				user.admin ||
				(member && (member.role === "owner" || member.role === "admin"));

			if (!canEdit) {
				set.status = 403;
				return { error: "You don't have permission to edit this community" };
			}

			const { tag_enabled, tag_emoji, tag_text } = body;

			// Validate tag_text length (max 4 characters)
			if (tag_text && tag_text.length > 4) {
				set.status = 400;
				return { error: "Tag text must be 4 characters or less" };
			}

			// Validate emoji (basic check - should be a single emoji)
			if (tag_emoji && tag_emoji.length > 10) {
				set.status = 400;
				return { error: "Tag emoji is invalid" };
			}

			try {
				db.query(
					"UPDATE communities SET tag_enabled = ?, tag_emoji = ?, tag_text = ?, updated_at = datetime('now', 'utc') WHERE id = ?",
				).run(
					tag_enabled ? 1 : 0,
					tag_emoji || null,
					tag_text || null,
					params.id,
				);

				const updated = getCommunity.get(params.id);
				return { success: true, community: updated };
			} catch (error) {
				console.error("Failed to update community tag:", error);
				set.status = 500;
				return { error: "Failed to update community tag" };
			}
		},
		{
			detail: {
				description: "Updates a community's tag settings",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				tag_enabled: t.Boolean(),
				tag_emoji: t.Optional(t.String()),
				tag_text: t.Optional(t.String()),
			}),
		},
	);
