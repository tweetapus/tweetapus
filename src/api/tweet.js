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
  INSERT INTO posts (id, user_id, content, reply_to) 
  VALUES (?, ?, ?, ?)
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

			if (tweetContent.length > 280) {
				return { error: "Tweet content must be 280 characters or less" };
			}

			const tweetId = Bun.randomUUIDv7();

			createTweet.run(tweetId, user.id, tweetContent.trim(), reply_to || null);

			if (reply_to) {
				updatePostCounts.run(reply_to);
			}

			updateProfilePostCount.run(user.id);

			return {
				success: true,
				tweet: {
					id: tweetId,
					content: tweetContent.trim(),
					user_id: user.id,
					username: user.username,
					reply_to: reply_to || null,
					created_at: new Date().toISOString(),
				},
			};
		} catch (error) {
			console.error("Tweet creation error:", error);
			return { error: "Failed to create tweet" };
		}
	})
	.get("/:id", async ({ params }) => {
		try {
			const { id } = params;

			const tweet = getTweetById.get(id);
			if (!tweet) {
				return { error: "Tweet not found" };
			}

			const threadPosts = getTweetWithThread.all(id);
			const replies = getTweetReplies.all(id);

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
	});
	