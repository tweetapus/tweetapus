import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getTimelinePosts = db.query(`
  SELECT posts.* FROM posts 
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
  WHERE posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getFollowingTimelinePosts = db.query(`
  SELECT posts.* FROM posts 
  JOIN follows ON posts.user_id = follows.following_id
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
  WHERE follows.follower_id = ? AND posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

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
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const getTopReply = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.reply_to = ?
  ORDER BY posts.like_count DESC
  LIMIT 1
`);

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
		},
		poll: getPollDataForTweet(quotedTweet.id, userId),
		attachments: getTweetAttachments(quotedTweet.id),
	};
};

const getTopReplyData = (tweetId, userId) => {
	const topReply = getTopReply.get(tweetId);
	if (!topReply) return null;

	return {
		...topReply,
		author: {
			username: topReply.username,
			name: topReply.name,
			avatar: topReply.avatar,
			verified: topReply.verified || false,
		},
		poll: getPollDataForTweet(topReply.id, userId),
		quoted_tweet: getQuotedTweetData(topReply.quote_tweet_id, userId),
		attachments: getTweetAttachments(topReply.id),
	};
};

export default new Elysia({ prefix: "/timeline" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 30,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get("/", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };
		let user;

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };
		} catch (e) {
			console.error(e);
			return { error: "Authentication failed" };
		}

		const posts = getTimelinePosts.all(user.id);

		const userIds = [...new Set(posts.map((post) => post.user_id))];

		const placeholders = userIds.map(() => "?").join(",");
		const getUsersQuery = db.query(
			`SELECT * FROM users WHERE id IN (${placeholders})`,
		);

		const users = getUsersQuery.all(...userIds);

		const userMap = {};
		users.forEach((user) => {
			userMap[user.id] = user;
		});

		const postIds = posts.map((post) => post.id);
		const likePlaceholders = postIds.map(() => "?").join(",");
		const getUserLikesQuery = db.query(
			`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userLikes = getUserLikesQuery.all(user.id, ...postIds);
		const userLikedPosts = new Set(userLikes.map((like) => like.post_id));

		const getUserRetweetsQuery = db.query(
			`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userRetweets = getUserRetweetsQuery.all(user.id, ...postIds);
		const userRetweetedPosts = new Set(
			userRetweets.map((retweet) => retweet.post_id),
		);

		const getUserBookmarksQuery = db.query(
			`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userBookmarks = getUserBookmarksQuery.all(user.id, ...postIds);
		const userBookmarkedPosts = new Set(
			userBookmarks.map((bookmark) => bookmark.post_id),
		);

		const timeline = posts
			.map((post) => {
				const topReply = getTopReplyData(post.id, user.id);
				const shouldShowTopReply =
					topReply &&
					post.like_count > 0 &&
					topReply.like_count / post.like_count >= 0.8;

				if (topReply) {
					topReply.liked_by_user = userLikedPosts.has(topReply.id);
					topReply.retweeted_by_user = userRetweetedPosts.has(topReply.id);
					topReply.bookmarked_by_user = userBookmarkedPosts.has(topReply.id);
				}

				const author = userMap[post.user_id];
				if (!author) return;

				return {
					...post,
					author,
					liked_by_user: userLikedPosts.has(post.id),
					retweeted_by_user: userRetweetedPosts.has(post.id),
					bookmarked_by_user: userBookmarkedPosts.has(post.id),
					poll: getPollDataForTweet(post.id, user.id),
					quoted_tweet: getQuotedTweetData(post.quote_tweet_id, user.id),
					top_reply: shouldShowTopReply ? topReply : null,
					attachments: getTweetAttachments(post.id),
				};
			})
			.filter(Boolean); // Remove null entries

		return { timeline };
	})
	.get("/following", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };
		let user;

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };
		} catch (e) {
			console.error(e);
			return { error: "Authentication failed" };
		}

		const posts = getFollowingTimelinePosts.all(user.id, user.id);

		if (posts.length === 0) {
			return { timeline: [] };
		}

		const userIds = [...new Set(posts.map((post) => post.user_id))];

		const placeholders = userIds.map(() => "?").join(",");
		const getUsersQuery = db.query(
			`SELECT * FROM users WHERE id IN (${placeholders})`,
		);

		const users = getUsersQuery.all(...userIds);

		const userMap = {};
		users.forEach((user) => {
			userMap[user.id] = user;
		});

		const postIds = posts.map((post) => post.id);
		const likePlaceholders = postIds.map(() => "?").join(",");
		const getUserLikesQuery = db.query(
			`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userLikes = getUserLikesQuery.all(user.id, ...postIds);
		const userLikedPosts = new Set(userLikes.map((like) => like.post_id));

		const getUserRetweetsQuery = db.query(
			`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userRetweets = getUserRetweetsQuery.all(user.id, ...postIds);
		const userRetweetedPosts = new Set(
			userRetweets.map((retweet) => retweet.post_id),
		);

		const getUserBookmarksQuery = db.query(
			`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userBookmarks = getUserBookmarksQuery.all(user.id, ...postIds);
		const userBookmarkedPosts = new Set(
			userBookmarks.map((bookmark) => bookmark.post_id),
		);

		const timeline = posts
			.map((post) => {
				const topReply = getTopReplyData(post.id, user.id);
				const shouldShowTopReply =
					topReply &&
					post.like_count > 0 &&
					topReply.like_count / post.like_count >= 0.8;

				if (topReply) {
					topReply.liked_by_user = userLikedPosts.has(topReply.id);
					topReply.retweeted_by_user = userRetweetedPosts.has(topReply.id);
					topReply.bookmarked_by_user = userBookmarkedPosts.has(topReply.id);
				}

				const author = userMap[post.user_id];
				if (!author) return;

				return {
					...post,
					author,
					liked_by_user: userLikedPosts.has(post.id),
					retweeted_by_user: userRetweetedPosts.has(post.id),
					bookmarked_by_user: userBookmarkedPosts.has(post.id),
					poll: getPollDataForTweet(post.id, user.id),
					quoted_tweet: getQuotedTweetData(post.quote_tweet_id, user.id),
					top_reply: shouldShowTopReply ? topReply : null,
					attachments: getTweetAttachments(post.id),
				};
			})
			.filter(Boolean); // Remove null entries

		return { timeline };
	});
