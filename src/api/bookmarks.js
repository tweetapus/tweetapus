import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");
const getTweetById = db.query("SELECT * FROM posts WHERE id = ?");

const checkBookmarkExists = db.query(`
  SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?
`);

const addBookmark = db.query(`
  INSERT INTO bookmarks (id, user_id, post_id) VALUES (?, ?, ?)
`);

const removeBookmark = db.query(`
  DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?
`);

const getBookmarkedTweets = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, b.created_at as bookmarked_at
  FROM bookmarks b
  JOIN posts ON b.post_id = posts.id
  JOIN users ON posts.user_id = users.id
  WHERE b.user_id = ?
  ORDER BY b.created_at DESC
  LIMIT ?
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

const isSuspendedQuery = db.query(
	"SELECT 1 FROM suspensions WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))"
);
const getUserSuspendedFlag = db.query("SELECT suspended FROM users WHERE id = ?");
const isUserSuspendedById = (userId) => {
	const s = isSuspendedQuery.get(userId);
	if (s) return true;
	const f = getUserSuspendedFlag.get(userId);
	return !!f?.suspended;
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

export default new Elysia({ prefix: "/bookmarks" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/add", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { postId } = body;
			if (!postId) return { error: "Post ID is required" };

			const tweet = getTweetById.get(postId);
			if (!tweet) return { error: "Tweet not found" };

			// block bookmarking tweets whose author is suspended
			if (isUserSuspendedById(tweet.user_id)) {
				return { error: "Tweet not found" };
			}

			const existingBookmark = checkBookmarkExists.get(user.id, postId);
			if (existingBookmark) {
				return { error: "Tweet is already bookmarked" };
			}

			const bookmarkId = Bun.randomUUIDv7();
			addBookmark.run(bookmarkId, user.id, postId);

			return { success: true, bookmarked: true };
		} catch (error) {
			console.error("Add bookmark error:", error);
			return { error: "Failed to add bookmark" };
		}
	})
	.post("/remove", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { postId } = body;
			if (!postId) return { error: "Post ID is required" };

			const existingBookmark = checkBookmarkExists.get(user.id, postId);
			if (!existingBookmark) {
				return { error: "Tweet is not bookmarked" };
			}

			removeBookmark.run(user.id, postId);

			return { success: true, bookmarked: false };
		} catch (error) {
			console.error("Remove bookmark error:", error);
			return { error: "Failed to remove bookmark" };
		}
	})
	.get("/", async ({ jwt, headers, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { limit = 20 } = query;
			const bookmarkedTweets = getBookmarkedTweets.all(
				user.id,
				parseInt(limit),
			);

			const postIds = bookmarkedTweets.map((tweet) => tweet.id);
			if (postIds.length === 0) {
				return { success: true, bookmarks: [] };
			}

			const likePlaceholders = postIds.map(() => "?").join(",");
			const getUserLikesQuery = db.query(
				`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
			);
			const getUserRetweetsQuery = db.query(
				`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
			);
			const getUserBookmarksQuery = db.query(
				`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
			);

			const userLikes = getUserLikesQuery.all(user.id, ...postIds);
			const userRetweets = getUserRetweetsQuery.all(user.id, ...postIds);
			const userBookmarks = getUserBookmarksQuery.all(user.id, ...postIds);

			const likedPosts = new Set(userLikes.map((like) => like.post_id));
			const retweetedPosts = new Set(
				userRetweets.map((retweet) => retweet.post_id),
			);
			const bookmarkedPosts = new Set(
				userBookmarks.map((bookmark) => bookmark.post_id),
			);

			const processedBookmarks = bookmarkedTweets.map((tweet) => ({
				...tweet,
				author: {
					username: tweet.username,
					name: tweet.name,
					avatar: tweet.avatar,
					verified: tweet.verified || false,
				},
				liked_by_user: likedPosts.has(tweet.id),
				retweeted_by_user: retweetedPosts.has(tweet.id),
				bookmarked_by_user: bookmarkedPosts.has(tweet.id),
				poll: getPollDataForTweet(tweet.id, user.id),
				quoted_tweet: getQuotedTweetData(tweet.quote_tweet_id, user.id),
				attachments: getTweetAttachments(tweet.id),
			}));

			return {
				success: true,
				bookmarks: processedBookmarks,
			};
		} catch (error) {
			console.error("Get bookmarks error:", error);
			return { error: "Failed to get bookmarks" };
		}
	})
	.get("/check/:postId", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { postId } = params;
			const isBookmarked = checkBookmarkExists.get(user.id, postId);

			return {
				success: true,
				bookmarked: !!isBookmarked,
			};
		} catch (error) {
			console.error("Check bookmark status error:", error);
			return { error: "Failed to check bookmark status" };
		}
	});
