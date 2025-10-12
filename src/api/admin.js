import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import db from "../db.js";

const logModerationAction = (
	moderatorId,
	action,
	targetType,
	targetId,
	details = null,
) => {
	const logId = Bun.randomUUIDv7();
	db.query(
		`
    INSERT INTO moderation_logs (id, moderator_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
	).run(
		logId,
		moderatorId,
		action,
		targetType,
		targetId,
		details ? JSON.stringify(details) : null,
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
		"SELECT COUNT(*) as count FROM users WHERE username LIKE ? OR name LIKE ?",
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
		"SELECT COUNT(*) as count FROM posts WHERE content LIKE ?",
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
		"SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 15",
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
		"UPDATE suspensions SET status = ? WHERE user_id = ? AND status = 'active'",
	),

	// Admin operations
	updateUserVerified: db.query("UPDATE users SET verified = ? WHERE id = ?"),
	updateUserGold: db.query("UPDATE users SET gold = ? WHERE id = ?"),
	updateUserAvatarSquare: db.query(
		"UPDATE users SET avatar_square = ? WHERE id = ?",
	),
	deleteUser: db.query("DELETE FROM users WHERE id = ?"),
	deletePost: db.query("DELETE FROM posts WHERE id = ?"),

	// Suspensions list
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
		"SELECT COUNT(*) as count FROM suspensions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))",
	),

	// New queries for editing functionality
	getPostById: db.query("SELECT * FROM posts WHERE id = ?"),
	updatePost: db.query(
		"UPDATE posts SET content = ?, like_count = ?, retweet_count = ?, reply_count = ? WHERE id = ?",
	),
	createPostAsUser: db.query(
		"INSERT INTO posts (id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))",
	),
	updateUser: db.query(
		"UPDATE users SET username = ?, name = ?, bio = ?, verified = ?, admin = ?, gold = ?, avatar_square = ? WHERE id = ?",
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
		"SELECT COUNT(*) as count FROM conversations",
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
		"SELECT COUNT(*) as count FROM moderation_logs",
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
		jwt({ name: "jwt", secret: process.env.JWT_SECRET || "your-secret-key" }),
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
			offset,
		);
		const totalCount = adminQueries.getUsersCount.get(
			searchPattern,
			searchPattern,
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
			const {
				username,
				name,
				bio,
				verified,
				gold,
				avatar_square,
				admin: isAdmin,
			} = body;
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
			const finalAvatarSquare = avatar_square ? 1 : 0;

			db.query(
				`INSERT INTO users (id, username, name, bio, verified, admin, gold, avatar_square) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				username.trim(),
				name || null,
				bio || null,
				finalVerified,
				isAdmin ? 1 : 0,
				finalGold,
				finalAvatarSquare,
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
				avatar_square: t.Optional(t.Boolean()),
				admin: t.Optional(t.Boolean()),
			}),
		},
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
				{ username: targetUser?.username, verified },
			);
			return { success: true };
		},
		{
			body: t.Object({
				verified: t.Boolean(),
			}),
		},
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
				{ username: targetUser?.username, gold },
			);
			return { success: true };
		},
		{
			body: t.Object({
				gold: t.Boolean(),
			}),
		},
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
				notes,
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
		},
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
			offset,
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
			const maxLength = postOwner && postOwner.verified ? 5500 : 400;
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

			adminQueries.updatePost.run(
				body.content,
				body.likes,
				body.retweets,
				body.replies,
				params.id,
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
			}),
		},
	)

	.post(
		"/tweets",
		async ({ body, user }) => {
			const postId = Bun.randomUUIDv7();
			const targetUser = adminQueries.findUserById.get(body.userId);
			if (!targetUser) return { error: "User not found" };

			const maxLength = targetUser.verified ? 5500 : 400;
			if (!body.content || body.content.trim().length === 0) {
				return { error: "Content is required" };
			}
			if (body.content.length > maxLength) {
				return { error: `Content must be ${maxLength} characters or less` };
			}

			adminQueries.createPostAsUser.run(
				postId,
				body.userId,
				body.content.trim(),
			);

			logModerationAction(user.id, "create_post_as_user", "post", postId, {
				targetUser: targetUser.username,
				content: body.content.substring(0, 100),
			});

			return { success: true, id: postId };
		},
		{
			body: t.Object({
				userId: t.String(),
				content: t.String(),
			}),
		},
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
			if (
				body.avatar_square !== undefined &&
				body.avatar_square !== user.avatar_square
			)
				changes.avatar_square = {
					old: user.avatar_square,
					new: body.avatar_square,
				};
			if (body.admin !== undefined && body.admin !== user.admin)
				changes.admin = { old: user.admin, new: body.admin };

			// Enforce exclusivity: if gold being set true, unset verified; if verified set true, unset gold
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

			const newAvatarSquare =
				body.avatar_square !== undefined
					? body.avatar_square
						? 1
						: 0
					: user.avatar_square
						? 1
						: 0;

			adminQueries.updateUser.run(
				body.username || user.username,
				body.name !== undefined ? body.name : user.name,
				body.bio !== undefined ? body.bio : user.bio,
				newVerified,
				body.admin !== undefined ? body.admin : user.admin,
				newGold,
				newAvatarSquare,
				params.id,
			);

			logModerationAction(
				moderator.id,
				"edit_user_profile",
				"user",
				params.id,
				{ username: user.username, changes },
			);

			return { success: true };
		},
		{
			body: t.Object({
				username: t.Optional(t.String()),
				name: t.Optional(t.String()),
				bio: t.Optional(t.String()),
				verified: t.Optional(t.Boolean()),
				admin: t.Optional(t.Boolean()),
			}),
		},
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
			Math.max(1, Number.parseInt(query.limit || "20")),
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
			Math.max(1, Number.parseInt(query.limit || "20")),
		);
		const offset = (page - 1) * limit;

		const conversations = adminQueries.searchConversationsByUser.all(
			`%${username}%`,
			limit,
			offset,
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
			Math.max(1, Number.parseInt(query.limit || "20")),
		);
		const offset = (page - 1) * limit;

		const messages = adminQueries.getConversationMessages.all(
			params.id,
			limit,
			offset,
		);
		const totalCount = adminQueries.getConversationMessagesCount.get(
			params.id,
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
			{ conversation: conversation.participants },
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
			offset,
		);
		const logsWithDetails = logs.map((log) => ({
			...log,
			details: log.details ? JSON.parse(log.details) : null,
		}));
		return { logs: logsWithDetails };
	});
