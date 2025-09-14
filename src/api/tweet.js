import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");
const getTweetById = db.query(`
  SELECT *
  FROM posts 
  WHERE posts.id = ?
`);

const getTweetWithThread = db.query(`
  WITH RECURSIVE thread_posts AS (
    SELECT *, 0 AS level
    FROM posts
    WHERE id = ?

    UNION ALL

    SELECT p.*, tp.level + 1
    FROM posts p
    JOIN thread_posts tp ON tp.reply_to = p.id
    WHERE tp.level < 10
)
SELECT *
FROM thread_posts
ORDER BY level DESC, created_at ASC;
`);

const getTweetReplies = db.query(`
  SELECT *
  FROM posts
  WHERE reply_to = ?
  ORDER BY created_at ASC
`);

const createTweet = db.query(`
	INSERT INTO posts (id, user_id, content, reply_to, source, poll_id, quote_tweet_id) 
  VALUES (?, ?, ?, ?, ?, ?, ?)
	RETURNING *
`);

const saveAttachment = db.query(`
  INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const updateQuoteCount = db.query(`
  UPDATE posts SET quote_count = quote_count + ? WHERE id = ?
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const createPoll = db.query(`
  INSERT INTO polls (id, post_id, expires_at)
  VALUES (?, ?, ?)
  RETURNING *
`);

const createPollOption = db.query(`
  INSERT INTO poll_options (id, poll_id, option_text, option_order)
  VALUES (?, ?, ?, ?)
  RETURNING *
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

const castPollVote = db.query(`
  INSERT OR REPLACE INTO poll_votes (id, user_id, poll_id, option_id)
  VALUES (?, ?, ?, ?)
`);

const updateOptionVoteCount = db.query(`
  UPDATE poll_options SET vote_count = vote_count + ? WHERE id = ?
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

const updatePostCounts = db.query(`
  UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?
`);

const checkLikeExists = db.query(`
  SELECT id FROM likes WHERE user_id = ? AND post_id = ?
`);

const addLike = db.query(`
  INSERT INTO likes (id, user_id, post_id) VALUES (?, ?, ?)
`);

const removeLike = db.query(`
  DELETE FROM likes WHERE user_id = ? AND post_id = ?
`);

const updateLikeCount = db.query(`
  UPDATE posts SET like_count = like_count + ? WHERE id = ?
`);

const checkRetweetExists = db.query(`
  SELECT id FROM retweets WHERE user_id = ? AND post_id = ?
`);

const addRetweet = db.query(`
  INSERT INTO retweets (id, user_id, post_id) VALUES (?, ?, ?)
`);

const removeRetweet = db.query(`
  DELETE FROM retweets WHERE user_id = ? AND post_id = ?
`);

const updateRetweetCount = db.query(`
  UPDATE posts SET retweet_count = retweet_count + ? WHERE id = ?
`);

export default new Elysia({ prefix: "/tweets" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { content, reply_to, source, poll, quote_tweet_id, files } = body;
			const tweetContent = content;

			if (!tweetContent || tweetContent.trim().length === 0) {
				return { error: "Tweet content is required" };
			}

			if (tweetContent.length > 400) {
				return { error: "Tweet content must be 400 characters or less" };
			}

			if (
				poll &&
				(!poll.options || poll.options.length < 2 || poll.options.length > 4)
			) {
				return { error: "Poll must have between 2 and 4 options" };
			}

			if (
				poll?.options?.some((option) => !option.trim() || option.length > 100)
			) {
				return { error: "Poll options must be 1-100 characters long" };
			}

			if (
				poll &&
				(!poll.duration || poll.duration < 5 || poll.duration > 10080)
			) {
				return { error: "Poll duration must be between 5 minutes and 7 days" };
			}

			const tweetId = Bun.randomUUIDv7();
			let pollId = null;

			if (poll) {
				pollId = Bun.randomUUIDv7();
				const expiresAt = new Date(
					Date.now() + poll.duration * 60 * 1000,
				).toISOString();

				createPoll.run(pollId, tweetId, expiresAt);

				poll.options.forEach((option, index) => {
					const optionId = Bun.randomUUIDv7();
					createPollOption.run(optionId, pollId, option.trim(), index);
				});
			}

			const tweet = createTweet.get(
				tweetId,
				user.id,
				tweetContent.trim(),
				reply_to || null,
				source || null,
				pollId,
				quote_tweet_id || null,
			);
			if (reply_to) {
				updatePostCounts.run(reply_to);
				const originalTweet = getTweetById.get(reply_to);
				if (originalTweet && originalTweet.user_id !== user.id) {
					addNotification(
						originalTweet.user_id,
						"reply",
						`${user.name || user.username} replied to your tweet`,
						tweetId,
					);
				}
			}
			if (quote_tweet_id) {
				updateQuoteCount.run(1, quote_tweet_id);
				const quotedTweet = getTweetById.get(quote_tweet_id);
				if (quotedTweet && quotedTweet.user_id !== user.id) {
					addNotification(
						quotedTweet.user_id,
						"quote",
						`${user.name || user.username} quoted your tweet`,
						tweetId,
					);
				}
			}

			// Handle file attachments if provided
			const attachments = [];
			if (files && Array.isArray(files)) {
				files.forEach((file) => {
					const attachmentId = Bun.randomUUIDv7();
					const attachment = saveAttachment.get(
						attachmentId,
						tweetId,
						file.hash,
						file.name,
						file.type,
						file.size,
						file.url,
					);
					attachments.push(attachment);
				});
			}

			return {
				success: true,
				tweet: {
					...tweet,
					author: user,
					liked_by_user: false,
					retweeted_by_user: false,
					poll: getPollDataForTweet(tweet.id, user.id),
					attachments: attachments,
				},
			};
		} catch (error) {
			console.error("Tweet creation error:", error);
			return { error: "Failed to create tweet" };
		}
	})
	.get("/:id", async ({ params, jwt, headers }) => {
		const { id } = params;

		const tweet = getTweetById.get(id);
		if (!tweet) {
			return { error: "Tweet not found" };
		}

		const threadPosts = getTweetWithThread.all(id);
		const replies = getTweetReplies.all(id);

		let currentUser;
		const authorization = headers.authorization;
		if (!authorization) return { error: "Unauthorized" };

		try {
			currentUser = getUserByUsername.get(
				(await jwt.verify(authorization.replace("Bearer ", ""))).username,
			);
		} catch {
			return { error: "Invalid token" };
		}

		const allPostIds = [
			...threadPosts.map((p) => p.id),
			...replies.map((r) => r.id),
		];
		const postPlaceholders = allPostIds.map(() => "?").join(",");

		const getUserLikesQuery = db.query(
			`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postPlaceholders})`,
		);
		const getUserRetweetsQuery = db.query(
			`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${postPlaceholders})`,
		);

		const userLikes = getUserLikesQuery.all(currentUser.id, ...allPostIds);
		const userRetweets = getUserRetweetsQuery.all(
			currentUser.id,
			...allPostIds,
		);

		const likedPosts = new Set(userLikes.map((like) => like.post_id));
		const retweetedPosts = new Set(
			userRetweets.map((retweet) => retweet.post_id),
		);

		tweet.liked_by_user = likedPosts.has(tweet.id);
		tweet.retweeted_by_user = retweetedPosts.has(tweet.id);

		const allUserIds = [
			...new Set([
				tweet.user_id,
				...threadPosts.map((p) => p.user_id),
				...replies.map((r) => r.user_id),
			]),
		];

		const userPlaceholders = allUserIds.map(() => "?").join(",");
		const getUsersQuery = db.query(
			`SELECT * FROM users WHERE id IN (${userPlaceholders})`,
		);
		const users = getUsersQuery.all(...allUserIds);

		const userMap = new Map(users.map((user) => [user.id, user]));

		const processedThreadPosts = threadPosts.map((post) => ({
			...post,
			liked_by_user: likedPosts.has(post.id),
			retweeted_by_user: retweetedPosts.has(post.id),
			author: userMap.get(post.user_id),
			poll: getPollDataForTweet(post.id, currentUser.id),
			quoted_tweet: getQuotedTweetData(post.quote_tweet_id, currentUser.id),
			attachments: getTweetAttachments(post.id),
		}));

		const processedReplies = replies.map((reply) => ({
			...reply,
			liked_by_user: likedPosts.has(reply.id),
			retweeted_by_user: retweetedPosts.has(reply.id),
			author: userMap.get(reply.user_id),
			poll: getPollDataForTweet(reply.id, currentUser.id),
			quoted_tweet: getQuotedTweetData(reply.quote_tweet_id, currentUser.id),
			attachments: getTweetAttachments(reply.id),
		}));

		return {
			tweet: {
				...tweet,
				author: userMap.get(tweet.user_id),
				poll: getPollDataForTweet(tweet.id, currentUser.id),
				quoted_tweet: getQuotedTweetData(tweet.quote_tweet_id, currentUser.id),
				attachments: getTweetAttachments(tweet.id),
			},
			threadPosts: processedThreadPosts,
			replies: processedReplies,
		};
	})
	.post("/:id/like", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const existingLike = checkLikeExists.get(user.id, id);

			if (existingLike) {
				removeLike.run(user.id, id);
				updateLikeCount.run(-1, id);
				return { success: true, liked: false };
			} else {
				const likeId = Bun.randomUUIDv7();
				addLike.run(likeId, user.id, id);
				updateLikeCount.run(1, id);

				const tweet = getTweetById.get(id);
				if (tweet && tweet.user_id !== user.id) {
					addNotification(
						tweet.user_id,
						"like",
						`${user.name || user.username} liked your tweet`,
						id,
					);
				}

				return { success: true, liked: true };
			}
		} catch (error) {
			console.error("Like toggle error:", error);
			return { error: "Failed to toggle like" };
		}
	})
	.post("/:id/retweet", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			const existingRetweet = checkRetweetExists.get(user.id, id);

			if (existingRetweet) {
				removeRetweet.run(user.id, id);
				updateRetweetCount.run(-1, id);
				return { success: true, retweeted: false };
			} else {
				const retweetId = Bun.randomUUIDv7();
				addRetweet.run(retweetId, user.id, id);
				updateRetweetCount.run(1, id);

				if (tweet.user_id !== user.id) {
					addNotification(
						tweet.user_id,
						"retweet",
						`${user.name || user.username} retweeted your tweet`,
						id,
					);
				}

				return { success: true, retweeted: true };
			}
		} catch (error) {
			console.error("Retweet toggle error:", error);
			return { error: "Failed to toggle retweet" };
		}
	})
	.post("/:id/poll/vote", async ({ jwt, headers, params, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id: tweetId } = params;
			const { optionId } = body;

			if (!optionId) {
				return { error: "Option ID is required" };
			}

			const poll = getPollByPostId.get(tweetId);
			if (!poll) {
				return { error: "Poll not found" };
			}

			if (new Date() > new Date(poll.expires_at)) {
				return { error: "Poll has expired" };
			}

			const existingVote = getUserPollVote.get(user.id, poll.id);
			const voteId = Bun.randomUUIDv7();

			if (existingVote?.option_id) {
				updateOptionVoteCount.run(-1, existingVote.option_id);
			}

			castPollVote.run(voteId, user.id, poll.id, optionId);
			updateOptionVoteCount.run(1, optionId);

			const options = getPollOptions.all(poll.id);
			const totalVotes = getTotalPollVotes.get(poll.id)?.total || 0;
			const voters = getPollVoters.all(poll.id);

			return {
				success: true,
				poll: {
					...poll,
					options: options.map((option) => ({
						...option,
						percentage:
							totalVotes > 0
								? Math.round((option.vote_count / totalVotes) * 100)
								: 0,
					})),
					totalVotes,
					userVote: optionId,
					voters,
				},
			};
		} catch (error) {
			console.error("Poll vote error:", error);
			return { error: "Failed to vote on poll" };
		}
	});
