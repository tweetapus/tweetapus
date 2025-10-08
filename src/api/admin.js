import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import db from "../db.js";

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

	// Post queries
	getPostsWithUsers: db.query(`
    SELECT p.*, u.username, u.name, u.avatar, u.verified
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.content LIKE ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getPostsCount: db.query(
		"SELECT COUNT(*) as count FROM posts WHERE content LIKE ?",
	),

	// Stats queries
	getUserStats: db.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) as suspended,
      SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified
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
		"SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 5",
	),
	getRecentSuspensions: db.query(`
    SELECT u.username, s.created_at
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 5
  `),

	// User details
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
	deleteUser: db.query("DELETE FROM users WHERE id = ?"),
	deletePost: db.query("DELETE FROM posts WHERE id = ?"),

	// Suspensions list
	getSuspensionsWithUsers: db.query(`
    SELECT s.*, u.username, u.name, u.avatar,
           suspended_by_user.username as suspended_by_username
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    JOIN users suspended_by_user ON s.suspended_by = suspended_by_user.id
    WHERE s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getSuspensionsCount: db.query(
		"SELECT COUNT(*) as count FROM suspensions WHERE status = 'active'",
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
		"UPDATE users SET username = ?, name = ?, bio = ?, verified = ?, admin = ? WHERE id = ?",
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
};

const requireAdmin = async ({ headers, jwt, set }) => { // stuck cursor true, Opua YT
	const token = headers.authorization?.replace("Bearer ", "");
	if (!token) {
		set.status = 401;
		return { error: "No token provided" };
	}

	try {
		const payload = await jwt.verify(token);
		if (!payload) {
			set.status = 401;
			return { error: "Invalid token" };
		}

		const userId = payload.userId;
		const user = adminQueries.findUserById.get(userId);

		if (!user?.admin) {
			set.status = 403;
			return { error: "Admin access required" };
		}

		return {
			user,
			originalUser: user // stuck cursor
		};
	} catch (_error) {
		set.status = 401;
		return { error: "Invalid token" };
	}
};

const isSuspended = async ({ user, set }) => {
	if (user.suspended) {
		set.status = 403;
		return { error: "User is suspended" };
	}
};

export default new Elysia({ prefix: "/admin" })
	.use(
		jwt({ name: "jwt", secret: process.env.JWT_SECRET || "your-secret-key" }),
	)
	.derive(requireAdmin)
	.guard({ before: [isSuspended] })

	// Dashboard stats
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
		async ({ params, body }) => {
			const { verified } = body;
			adminQueries.updateUserVerified.run(verified, params.id);
			return { success: true };
		},
		{
			body: t.Object({
				verified: t.Boolean(),
			}),
		},
	)

	.post(
		"/users/:id/suspend",
		async ({ params, body, user }) => {
			const { reason, severity, duration, notes } = body;
			const suspensionId = Bun.randomUUIDv7();

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

	.post("/users/:id/unsuspend", async ({ params }) => {
		adminQueries.updateUserSuspended.run(false, params.id);
		adminQueries.updateSuspensionStatus.run("lifted", params.id);
		return { success: true };
	})

	.delete("/users/:id", async ({ params }) => {
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

	.delete("/posts/:id", async ({ params }) => {
		db.transaction(() => {
			db.query("DELETE FROM likes WHERE post_id = ?").run(params.id);
			db.query("DELETE FROM posts WHERE reply_to = ?").run(params.id);
			db.query("DELETE FROM retweets WHERE post_id = ?").run(params.id);
			adminQueries.deletePost.run(params.id);
		})();
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
		async ({ params, body }) => {
			const post = adminQueries.getPostById.get(params.id);
			if (!post) {
				return { error: "Post not found" };
			}

			adminQueries.updatePost.run(
				body.content,
				body.likes,
				body.retweets,
				body.replies,
				params.id,
			);
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
		async ({ body }) => {
			const postId = Bun.randomUUIDv7();
			adminQueries.createPostAsUser.run(postId, body.userId, body.content);
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
		async ({ params, body }) => {
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

			adminQueries.updateUser.run(
				body.username || user.username,
				body.name !== undefined ? body.name : user.name,
				body.bio !== undefined ? body.bio : user.bio,
				body.verified !== undefined ? body.verified : user.verified,
				body.admin !== undefined ? body.admin : user.admin,
				params.id,
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

	// Impersonation
	.post("/impersonate/:id", async ({ params, jwt, user }) => {
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
			originalUserId: user.id,
			impersonation: true,
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
			copyLink: `${process.env.BASE_URL || "http://localhost:3000"}/account/?impersonate=${encodeURIComponent(impersonationToken)}`,
		};
	})

	.post("/stop-impersonation", async ({ headers, jwt }) => {
		const token = headers.authorization?.replace("Bearer ", "");
		const payload = await jwt.verify(token);

		if (!payload?.impersonation) {
			return { error: "Not currently impersonating" };
		}

		const originalUser = adminQueries.findUserById.get(payload.originalUserId);
		if (!originalUser) {
			return { error: "Original user not found" };
		}

		const newToken = await jwt.sign({
			userId: originalUser.id,
			username: originalUser.username,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
		});

		return {
			success: true,
			token: newToken,
		};
	})

	// DM Management endpoints
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

	.delete("/dms/:id", async ({ params }) => {
		const conversation = adminQueries.getConversationDetails.get(params.id);
		if (!conversation) {
			return { error: "Conversation not found" };
		}

		adminQueries.deleteConversation.run(params.id);
		return { success: true };
	})

	.delete("/dms/messages/:id", async ({ params }) => {
		adminQueries.deleteMessage.run(params.id);
		return { success: true };
	});
