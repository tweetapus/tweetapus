import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);

const getTrendingHashtags = db.query(`
  SELECT * FROM hashtags
  ORDER BY tweet_count DESC
  LIMIT ?
`);

const getHashtagByName = db.query(`
  SELECT * FROM hashtags WHERE name = ?
`);

const getPostsByHashtag = db.query(`
  SELECT posts.* FROM posts
  JOIN post_hashtags ON posts.id = post_hashtags.post_id
  JOIN hashtags ON post_hashtags.hashtag_id = hashtags.id
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
  WHERE hashtags.name = ? AND blocks.id IS NULL AND users.suspended = 0 AND (users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)
  ORDER BY posts.created_at DESC
  LIMIT 50
`);

export default new Elysia({ prefix: "/hashtags" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get("/trending", async ({ query }) => {
		const limit = parseInt(query.limit || "10");
		const hashtags = getTrendingHashtags.all(Math.min(limit, 50));
		return { success: true, hashtags };
	})
	.get("/:name", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const hashtagName = params.name.toLowerCase().replace(/^#/, "");
			const hashtag = getHashtagByName.get(hashtagName);

			if (!hashtag) {
				return { error: "Hashtag not found" };
			}

			const posts = getPostsByHashtag.all(
				user.id,
				hashtagName,
				user.id,
				user.admin ? 1 : 0,
			);

			const userIds = [...new Set(posts.map((post) => post.user_id))];
			const placeholders = userIds.map(() => "?").join(",");
			const getUsersQuery = db.query(
				`SELECT * FROM users WHERE id IN (${placeholders})`,
			);
			const users = getUsersQuery.all(...userIds);
			const userMap = {};
			users.forEach((u) => {
				userMap[u.id] = u;
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

			const tweets = posts.map((post) => ({
				...post,
				author: userMap[post.user_id],
				liked_by_user: userLikedPosts.has(post.id),
				retweeted_by_user: userRetweetedPosts.has(post.id),
				bookmarked_by_user: userBookmarkedPosts.has(post.id),
				attachments: db
					.query("SELECT * FROM attachments WHERE post_id = ?")
					.all(post.id),
			}));

			return { success: true, hashtag, tweets };
		} catch (error) {
			console.error("Get hashtag posts error:", error);
			return { error: "Failed to get hashtag posts" };
		}
	});

export const extractAndSaveHashtags = (content, postId) => {
	const hashtagRegex = /#(\w+)/g;
	const hashtags = new Set();
	const matches = content.match(hashtagRegex);

	if (matches) {
		for (const match of matches) {
			hashtags.add(match.slice(1).toLowerCase());
		}
	}

	for (const hashtagName of hashtags) {
		try {
			let hashtag = db
				.query("SELECT * FROM hashtags WHERE name = ?")
				.get(hashtagName);

			if (!hashtag) {
				const hashtagId = Bun.randomUUIDv7();
				db.query(
					"INSERT INTO hashtags (id, name, tweet_count) VALUES (?, ?, 1)",
				).run(hashtagId, hashtagName);
				hashtag = { id: hashtagId, name: hashtagName };
			} else {
				db.query(
					"UPDATE hashtags SET tweet_count = tweet_count + 1 WHERE id = ?",
				).run(hashtag.id);
			}

			const postHashtagId = Bun.randomUUIDv7();
			db.query(
				"INSERT OR IGNORE INTO post_hashtags (id, post_id, hashtag_id) VALUES (?, ?, ?)",
			).run(postHashtagId, postId, hashtag.id);
		} catch (error) {
			console.error(`Failed to save hashtag ${hashtagName}:`, error);
		}
	}
};
