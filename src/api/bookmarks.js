import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.prepare(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);
const getTweetById = db.prepare("SELECT * FROM posts WHERE id = ?");

const checkBookmarkExists = db.prepare(`
  SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?
`);

const addBookmark = db.prepare(`
  INSERT INTO bookmarks (id, user_id, post_id) VALUES (?, ?, ?)
`);

const removeBookmark = db.prepare(`
  DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?
`);

const getBookmarkedTweets = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with, b.created_at as bookmarked_at
  FROM bookmarks b
  JOIN posts ON b.post_id = posts.id
  JOIN users ON posts.user_id = users.id
  WHERE b.user_id = ?
  ORDER BY b.created_at DESC
  LIMIT ?
`);

const getPollByPostId = db.prepare(`
  SELECT * FROM polls WHERE post_id = ?
`);

const getPollOptions = db.prepare(`
  SELECT * FROM poll_options WHERE poll_id = ? ORDER BY option_order ASC
`);

const getUserPollVote = db.prepare(`
  SELECT option_id FROM poll_votes WHERE user_id = ? AND poll_id = ?
`);

const getTotalPollVotes = db.prepare(`
  SELECT SUM(vote_count) as total FROM poll_options WHERE poll_id = ?
`);

const getPollVoters = db.prepare(`
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getAttachmentsByPostId = db.prepare(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const getQuotedTweet = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const isSuspendedQuery = db.prepare(
	"SELECT 1 FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'suspend' AND (expires_at IS NULL OR expires_at > datetime('now'))",
);
const getUserSuspendedFlag = db.prepare(
	"SELECT suspended FROM users WHERE id = ?",
);
const getUserRestrictedFlag = db.prepare(
	"SELECT restricted FROM users WHERE id = ?",
);
const isUserSuspendedById = (userId) => {
	const s = isSuspendedQuery.get(userId);
	if (s) return true;
	const f = getUserSuspendedFlag.get(userId);
	return !!f?.suspended;
};
const isRestrictedQuery = db.prepare(
	"SELECT 1 FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))",
);
const isUserRestrictedById = (userId) => {
	const res = isRestrictedQuery.get(userId);
	const f = getUserRestrictedFlag.get(userId);
	return !!res || !!f?.restricted;
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

const getCardByPostId = db.prepare(`
  SELECT * FROM interactive_cards WHERE post_id = ?
`);

const getCardOptions = db.prepare(`
  SELECT * FROM interactive_card_options WHERE card_id = ? ORDER BY option_order ASC
`);

const getCardDataForTweet = (tweetId) => {
	const card = getCardByPostId.get(tweetId);
	if (!card) return null;

	const options = getCardOptions.all(card.id);
	return {
		...card,
		options,
	};
};

const getQuotedTweetData = (quoteTweetId, userId) => {
	if (!quoteTweetId) return null;

	const quotedTweet = getQuotedTweet.get(quoteTweetId);
	if (!quotedTweet) return null;

	const author = {
		username: quotedTweet.username,
		name: quotedTweet.name,
		avatar: quotedTweet.avatar,
		verified: quotedTweet.verified || false,
		gold: quotedTweet.gold || false,
		avatar_radius: quotedTweet.avatar_radius || null,
		affiliate: quotedTweet.affiliate || false,
		affiliate_with: quotedTweet.affiliate_with || null,
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

	const isSuspended = isUserSuspendedById(quotedTweet.user_id);
	if (isSuspended) {
		return {
			id: quotedTweet.id,
			unavailable_reason: "suspended",
			created_at: quotedTweet.created_at,
		};
	}

	return {
		...quotedTweet,
		author,
		poll: getPollDataForTweet(quotedTweet.id, userId),
		attachments: getTweetAttachments(quotedTweet.id),
		interactive_card: getCardDataForTweet(quotedTweet.id),
	};
};

export default new Elysia({ prefix: "/bookmarks", tags: ["Bookmarks"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post(
		"/add",
		async ({ jwt, headers, body }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				if (isUserRestrictedById(user.id))
					return { error: "Action not allowed: account is restricted" };

				const { postId } = body;
				if (!postId) return { error: "Post ID is required" };

				const tweet = getTweetById.get(postId);
				if (!tweet) return { error: "Tweet not found" };

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
		},
		{
			detail: {
				description: "Bookmarks a tweet",
			},
			body: t.Object({
				postId: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				error: t.Optional(t.String()),
				bookmarked: true,
			}),
		},
	)
	.post(
		"/remove",
		async ({ jwt, headers, body }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				if (isUserRestrictedById(user.id))
					return { error: "Action not allowed: account is restricted" };

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
		},
		{
			detail: {
				description: "Unbookmarks a tweet",
			},
			body: t.Object({
				postId: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				error: t.Optional(t.String()),
				bookmarked: false,
			}),
		},
	)
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
				parseInt(limit, 10),
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

			const processedBookmarks = bookmarkedTweets.map((tweet) => {
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
					liked_by_user: likedPosts.has(tweet.id),
					retweeted_by_user: retweetedPosts.has(tweet.id),
					bookmarked_by_user: bookmarkedPosts.has(tweet.id),
					poll: getPollDataForTweet(tweet.id, user.id),
					quoted_tweet: getQuotedTweetData(tweet.quote_tweet_id, user.id),
					attachments: getTweetAttachments(tweet.id),
					interactive_card: getCardDataForTweet(tweet.id),
				};
			});

			return {
				success: true,
				bookmarks: processedBookmarks,
			};
		} catch (error) {
			console.error("Get bookmarks error:", error);
			return { error: "Failed to get bookmarks" };
		}
	}, {
		detail: {
			description: "Gets a user's bookmarks",
		},
		params: t.Object({
			limit: t.Optional(t.Number()),
		}),
		response: t.Object({
			success: t.Boolean(),
			error: t.Optional(t.String()),
			bookmarks: t.Array(
				t.Object(),
			),
		}),
	});
