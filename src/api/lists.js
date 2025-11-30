import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import db from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.prepare(
	`SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE LOWER(username) = LOWER(?)`,
);

const getUserById = db.prepare(
	`SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE id = ?`,
);

const getListById = db.prepare(`SELECT * FROM lists WHERE id = ?`);

const getListsByUser = db.prepare(`
	SELECT lists.*, 
		(SELECT COUNT(*) FROM list_followers WHERE list_id = lists.id) as follower_count
	FROM lists 
	WHERE user_id = ? 
	ORDER BY created_at DESC
`);

const getListsFollowedByUser = db.prepare(`
	SELECT lists.*, 
		users.username as owner_username, users.name as owner_name, users.avatar as owner_avatar,
		(SELECT COUNT(*) FROM list_followers WHERE list_id = lists.id) as follower_count
	FROM list_followers
	JOIN lists ON list_followers.list_id = lists.id
	JOIN users ON lists.user_id = users.id
	WHERE list_followers.user_id = ?
	ORDER BY list_followers.followed_at DESC
`);

const getListsContainingUser = db.prepare(`
	SELECT lists.*, 
		users.username as owner_username, users.name as owner_name, users.avatar as owner_avatar
	FROM list_members
	JOIN lists ON list_members.list_id = lists.id
	JOIN users ON lists.user_id = users.id
	WHERE list_members.user_id = ? AND (lists.is_private = 0 OR lists.user_id = ?)
	ORDER BY list_members.added_at DESC
`);

const getListMembers = db.prepare(`
	SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.bio
	FROM list_members
	JOIN users ON list_members.user_id = users.id
	WHERE list_members.list_id = ? AND users.suspended = 0
	ORDER BY list_members.added_at DESC
	LIMIT 50
`);

const getListFollowers = db.prepare(`
	SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
	FROM list_followers
	JOIN users ON list_followers.user_id = users.id
	WHERE list_followers.list_id = ? AND users.suspended = 0
	ORDER BY list_followers.followed_at DESC
	LIMIT 50
`);

const isListMember = db.prepare(`
	SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?
`);

const isListFollower = db.prepare(`
	SELECT 1 FROM list_followers WHERE list_id = ? AND user_id = ?
`);

const createList = db.prepare(`
	INSERT INTO lists (id, user_id, name, description, is_private) VALUES (?, ?, ?, ?, ?)
`);

const updateList = db.prepare(`
	UPDATE lists SET name = ?, description = ?, is_private = ?, updated_at = datetime('now', 'utc') WHERE id = ?
`);

const deleteList = db.prepare(`DELETE FROM lists WHERE id = ?`);

const addListMember = db.prepare(`
	INSERT INTO list_members (id, list_id, user_id) VALUES (?, ?, ?)
`);

const removeListMember = db.prepare(`
	DELETE FROM list_members WHERE list_id = ? AND user_id = ?
`);

const incrementMemberCount = db.prepare(`
	UPDATE lists SET member_count = member_count + 1 WHERE id = ?
`);

const decrementMemberCount = db.prepare(`
	UPDATE lists SET member_count = CASE WHEN member_count > 0 THEN member_count - 1 ELSE 0 END WHERE id = ?
`);

const followList = db.prepare(`
	INSERT INTO list_followers (id, list_id, user_id) VALUES (?, ?, ?)
`);

const unfollowList = db.prepare(`
	DELETE FROM list_followers WHERE list_id = ? AND user_id = ?
`);

const getListTweets = db.prepare(`
	SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag
	FROM posts
	JOIN users ON posts.user_id = users.id
	JOIN list_members ON posts.user_id = list_members.user_id
	WHERE list_members.list_id = ? AND posts.reply_to IS NULL AND users.suspended = 0
	ORDER BY posts.created_at DESC
	LIMIT ?
`);

const getListTweetsBefore = db.prepare(`
	SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag
	FROM posts
	JOIN users ON posts.user_id = users.id
	JOIN list_members ON posts.user_id = list_members.user_id
	WHERE list_members.list_id = ? AND posts.reply_to IS NULL AND users.suspended = 0 AND posts.id < ?
	ORDER BY posts.created_at DESC
	LIMIT ?
`);

const getAttachmentsByPostId = db.prepare(
	`SELECT * FROM attachments WHERE post_id = ?`,
);
const getPollByPostId = db.prepare(`SELECT * FROM polls WHERE post_id = ?`);
const getPollOptions = db.prepare(
	`SELECT * FROM poll_options WHERE poll_id = ? ORDER BY option_order ASC`,
);
const getUserPollVote = db.prepare(
	`SELECT option_id FROM poll_votes WHERE user_id = ? AND poll_id = ?`,
);
const getTotalPollVotes = db.prepare(
	`SELECT SUM(vote_count) as total FROM poll_options WHERE poll_id = ?`,
);

const getPollDataForTweet = (tweetId, userId) => {
	const poll = getPollByPostId.get(tweetId);
	if (!poll) return null;
	const options = getPollOptions.all(poll.id);
	const totalVotes = getTotalPollVotes.get(poll.id)?.total || 0;
	const userVote = userId ? getUserPollVote.get(userId, poll.id) : null;
	const isExpired = new Date() > new Date(poll.expires_at);
	return {
		...poll,
		options: options.map((opt) => ({
			...opt,
			percentage:
				totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0,
		})),
		totalVotes,
		userVote: userVote?.option_id || null,
		isExpired,
	};
};

export default new Elysia({ prefix: "/lists", tags: ["Lists"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.get("/", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const ownedLists = getListsByUser.all(user.id);
		const followedLists = getListsFollowedByUser.all(user.id);

		return { ownedLists, followedLists };
	})
	.get("/user/:username", async ({ params, jwt, headers }) => {
		const { username } = params;
		const targetUser = getUserByUsername.get(username);
		if (!targetUser) return { error: "User not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		const lists = getListsByUser.all(targetUser.id);
		const visibleLists = lists.filter(
			(list) => !list.is_private || list.user_id === currentUserId,
		);
		return { lists: visibleLists };
	})
	.get("/containing/:username", async ({ params, jwt, headers }) => {
		const { username } = params;
		const targetUser = getUserByUsername.get(username);
		if (!targetUser) return { error: "User not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		const lists = getListsContainingUser.all(
			targetUser.id,
			currentUserId || "",
		);
		return { lists };
	})
	.post("/", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { name, description, isPrivate } = body;
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return { error: "List name is required" };
		}
		if (name.length > 25) {
			return { error: "List name must be 25 characters or less" };
		}
		if (description && description.length > 100) {
			return { error: "Description must be 100 characters or less" };
		}

		const id = Bun.randomUUIDv7();
		createList.run(
			id,
			user.id,
			name.trim(),
			description?.trim() || null,
			isPrivate ? 1 : 0,
		);

		return {
			success: true,
			list: {
				id,
				name: name.trim(),
				description: description?.trim() || null,
				is_private: !!isPrivate,
				member_count: 0,
			},
		};
	})
	.get("/:id", async ({ params, jwt, headers }) => {
		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		if (list.is_private && list.user_id !== currentUserId) {
			return { error: "This list is private" };
		}

		const owner = getUserById.get(list.user_id);
		const members = getListMembers.all(id);
		const followerCount =
			db
				.query(`SELECT COUNT(*) as count FROM list_followers WHERE list_id = ?`)
				.get(id)?.count || 0;
		const isFollowing = currentUserId
			? !!isListFollower.get(id, currentUserId)
			: false;
		const isOwner = list.user_id === currentUserId;

		return {
			list: {
				...list,
				owner,
				follower_count: followerCount,
			},
			members,
			isFollowing,
			isOwner,
		};
	})
	.patch("/:id", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };
		if (list.user_id !== user.id) return { error: "Unauthorized" };

		const { name, description, isPrivate } = body;
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return { error: "List name is required" };
		}
		if (name.length > 25) {
			return { error: "List name must be 25 characters or less" };
		}
		if (description && description.length > 100) {
			return { error: "Description must be 100 characters or less" };
		}

		updateList.run(
			name.trim(),
			description?.trim() || null,
			isPrivate ? 1 : 0,
			id,
		);
		return { success: true };
	})
	.delete("/:id", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };
		if (list.user_id !== user.id) return { error: "Unauthorized" };

		deleteList.run(id);
		return { success: true };
	})
	.get("/:id/tweets", async ({ params, jwt, headers, query }) => {
		const { id } = params;
		const { limit = 20, before } = query;

		const list = getListById.get(id);
		if (!list) return { error: "List not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		if (list.is_private && list.user_id !== currentUserId) {
			return { error: "This list is private" };
		}

		const tweets = before
			? getListTweetsBefore.all(id, before, parseInt(limit, 10))
			: getListTweets.all(id, parseInt(limit, 10));

		const enrichedTweets = tweets.map((tweet) => ({
			...tweet,
			author: {
				username: tweet.username,
				name: tweet.name,
				avatar: tweet.avatar,
				verified: tweet.verified,
				gold: tweet.gold,
				avatar_radius: tweet.avatar_radius,
				affiliate: tweet.affiliate,
				affiliate_with: tweet.affiliate_with,
			},
			attachments: getAttachmentsByPostId.all(tweet.id),
			poll: getPollDataForTweet(tweet.id, currentUserId),
		}));

		return {
			tweets: enrichedTweets,
			hasMore: tweets.length === parseInt(limit, 10),
		};
	})
	.post("/:id/members", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };
		if (list.user_id !== user.id) return { error: "Unauthorized" };

		const { userId } = body;
		const targetUser = getUserById.get(userId);
		if (!targetUser) return { error: "User not found" };

		if (isListMember.get(id, userId)) {
			return { error: "User is already in this list" };
		}

		const memberId = Bun.randomUUIDv7();
		addListMember.run(memberId, id, userId);
		incrementMemberCount.run(id);

		return { success: true };
	})
	.delete("/:id/members/:userId", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id, userId } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };
		if (list.user_id !== user.id) return { error: "Unauthorized" };

		removeListMember.run(id, userId);
		decrementMemberCount.run(id);

		return { success: true };
	})
	.post("/:id/follow", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };

		if (list.is_private && list.user_id !== user.id) {
			return { error: "Cannot follow a private list" };
		}

		if (isListFollower.get(id, user.id)) {
			return { error: "Already following this list" };
		}

		const followId = Bun.randomUUIDv7();
		followList.run(followId, id, user.id);

		return { success: true };
	})
	.delete("/:id/follow", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { id } = params;
		unfollowList.run(id, user.id);

		return { success: true };
	})
	.get("/:id/members", async ({ params, jwt, headers }) => {
		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		if (list.is_private && list.user_id !== currentUserId) {
			return { error: "This list is private" };
		}

		const members = getListMembers.all(id);
		return { members };
	})
	.get("/:id/followers", async ({ params, jwt, headers }) => {
		const { id } = params;
		const list = getListById.get(id);
		if (!list) return { error: "List not found" };

		let currentUserId = null;
		const authorization = headers.authorization;
		if (authorization) {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				const currentUser = getUserByUsername.get(payload.username);
				if (currentUser) currentUserId = currentUser.id;
			}
		}

		if (list.is_private && list.user_id !== currentUserId) {
			return { error: "This list is private" };
		}

		const followers = getListFollowers.all(id);
		return { followers };
	});
