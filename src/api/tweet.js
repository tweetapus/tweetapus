import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");
const getTweetById = db.query(`
  SELECT posts.*, users.username, users.name, users.verified 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.id = ?
`);

const getTweetWithThread = db.query(`
  WITH RECURSIVE thread_posts AS (
    SELECT posts.*, users.username, users.name, users.verified, 0 as level
    FROM posts 
    JOIN users ON posts.user_id = users.id 
    WHERE posts.id = ?
    
    UNION ALL
    
    SELECT p.*, u.username, u.name, u.verified, tp.level + 1
    FROM posts p
    JOIN users u ON p.user_id = u.id
    JOIN thread_posts tp ON p.reply_to = tp.id
    WHERE tp.level < 10
  )
  SELECT * FROM thread_posts ORDER BY level ASC, created_at ASC
`);

const getTweetReplies = db.query(`
  SELECT posts.*, users.username, users.name, users.verified 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.reply_to = ? 
  ORDER BY posts.created_at ASC
`);

const createTweet = db.query(`
  INSERT INTO posts (id, user_id, content, reply_to, source) 
  VALUES (?, ?, ?, ?, ?)
	RETURNING *
`);

const updatePostCounts = db.query(`
  UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?
`);

const updateProfilePostCount = db.query(`
  UPDATE users SET post_count = post_count + 1 WHERE id = ?
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
			duration: 15_000,
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

			const { text, content, reply_to } = body;
			const tweetContent = text || content;

			if (!tweetContent || tweetContent.trim().length === 0) {
				return { error: "Tweet content is required" };
			}

			if (tweetContent.length > 400) {
				return { error: "Tweet content must be 400 characters or less" };
			}

			const tweetId = Bun.randomUUIDv7();

			const tweet = createTweet.get(
				tweetId,
				user.id,
				tweetContent.trim(),
				reply_to || null,
				body.source || null,
			);

			if (reply_to) {
				updatePostCounts.run(reply_to);
			}

			updateProfilePostCount.run(user.id);

			return {
				success: true,
				tweet: {
					...tweet,
					author: user,
				},
			};
		} catch (error) {
			console.error("Tweet creation error:", error);
			return { error: "Failed to create tweet" };
		}
	})
	.get("/:id", async ({ params, jwt, headers }) => {
		try {
			const { id } = params;

			const tweet = getTweetById.get(id);
			if (!tweet) {
				return { error: "Tweet not found" };
			}

			const threadPosts = getTweetWithThread.all(id);
			const replies = getTweetReplies.all(id);

			// Add user interaction status if authenticated
			let currentUser = null;
			const authorization = headers.authorization;
			if (authorization) {
				try {
					const payload = await jwt.verify(
						authorization.replace("Bearer ", ""),
					);
					if (payload) {
						currentUser = getUserByUsername.get(payload.username);
					}
				} catch {
					// Invalid token, continue as unauthenticated
				}
			}

			if (currentUser) {
				// Add like and retweet status for main post and thread posts
				const allPostIds = [
					tweet.id,
					...threadPosts.map((p) => p.id),
					...replies.map((r) => r.id),
				];
				const placeholders = allPostIds.map(() => "?").join(",");

				const getUserLikesQuery = db.query(
					`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`,
				);
				const getUserRetweetsQuery = db.query(
					`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${placeholders})`,
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

				// Add status to main tweet
				tweet.liked_by_user = likedPosts.has(tweet.id);
				tweet.retweeted_by_user = retweetedPosts.has(tweet.id);

				// Add status to thread posts
				threadPosts.forEach((post) => {
					post.liked_by_user = likedPosts.has(post.id);
					post.retweeted_by_user = retweetedPosts.has(post.id);
				});

				// Add status to replies
				replies.forEach((reply) => {
					reply.liked_by_user = likedPosts.has(reply.id);
					reply.retweeted_by_user = retweetedPosts.has(reply.id);
				});
			}

			return {
				post: tweet,
				threadPosts,
				replies,
			};
		} catch (error) {
			console.error("Tweet fetch error:", error);
			return { error: "Failed to fetch tweet" };
		}
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
				return { success: true, retweeted: true };
			}
		} catch (error) {
			console.error("Retweet toggle error:", error);
			return { error: "Failed to toggle retweet" };
		}
	});
