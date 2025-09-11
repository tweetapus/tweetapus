import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getTimelinePosts = db.query(`
SELECT *
FROM posts
WHERE posts.reply_to IS NULL
ORDER BY posts.created_at DESC
LIMIT 20;`);

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

export default new Elysia({ prefix: "/timeline" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 15_000,
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

		const posts = getTimelinePosts.all();

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
		const userRetweetedPosts = new Set(userRetweets.map((retweet) => retweet.post_id));

		const timeline = posts.map((post) => ({
			...post,
			author: userMap[post.user_id],
			liked_by_user: userLikedPosts.has(post.id),
			retweeted_by_user: userRetweetedPosts.has(post.id),
		}));

		return { timeline };
	});
