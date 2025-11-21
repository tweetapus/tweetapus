import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const getPublicTweets = db.query(`
  SELECT posts.* FROM posts 
  JOIN users ON posts.user_id = users.id
  WHERE posts.reply_to IS NULL 
  AND posts.pinned = 0 
  AND users.suspended = 0 
  AND posts.community_only = FALSE 
  AND users.shadowbanned = 0
  AND users.private = 0
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

const getPublicTweetsBefore = db.query(`
  SELECT posts.* FROM posts 
  JOIN users ON posts.user_id = users.id
  WHERE posts.reply_to IS NULL 
  AND posts.pinned = 0 
  AND users.suspended = 0 
  AND posts.community_only = FALSE 
  AND users.shadowbanned = 0
  AND users.private = 0
  AND (posts.created_at < ? OR (posts.created_at = ? AND posts.id < ?))
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

const getPostCreatedAt = db.query(`SELECT created_at FROM posts WHERE id = ?`);

const getPostsAuthor = db.query(
	`SELECT id, username, name, avatar, verified, gold, avatar_radius, affiliate, affiliate_with, selected_community_tag FROM users WHERE id = ?`,
);

const getAttachments = db.query(`SELECT * FROM attachments WHERE post_id = ?`);

export default new Elysia({ prefix: "/public-tweets", tags: ["Public"] })
	.use(
		rateLimit({
			duration: 60_000,
			max: 60,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get("/", async ({ query }) => {
		const beforeId = query.before;
		const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 40);

		let posts = [];

		if (beforeId) {
			const cursor = getPostCreatedAt.get(beforeId);
			if (!cursor) {
				posts = [];
			} else {
				posts = getPublicTweetsBefore.all(
					cursor.created_at,
					cursor.created_at,
					beforeId,
					limit,
				);
			}
		} else {
			posts = getPublicTweets.all(limit);
		}

		if (!posts || posts.length === 0) {
			return { posts: [], total: 0 };
		}

		const userIds = [...new Set(posts.map((post) => post.user_id))];
		const attachmentIds = posts.map((post) => post.id);

		const users = {};
		for (const userId of userIds) {
			const user = getPostsAuthor.get(userId);
			if (user) {
				if (user.selected_community_tag) {
					const community = db
						.query(
							"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
						)
						.get(user.selected_community_tag);
					if (community?.tag_enabled) {
						user.community_tag = {
							community_id: community.id,
							community_name: community.name,
							emoji: community.tag_emoji,
							text: community.tag_text,
						};
					}
				}
				users[userId] = user;
			}
		}

		const attachments = {};
		for (const postId of attachmentIds) {
			const postAttachments = getAttachments.all(postId);
			if (postAttachments && postAttachments.length > 0) {
				attachments[postId] = postAttachments;
			}
		}

		const enrichedPosts = posts.map((post) => {
			const author = users[post.user_id];
			return {
				...post,
				author: author || {
					id: post.user_id,
					username: "unknown",
					name: "Unknown User",
				},
				attachments: attachments[post.id] || [],
			};
		});

		return {
			posts: enrichedPosts,
			total: enrichedPosts.length,
		};
	});
