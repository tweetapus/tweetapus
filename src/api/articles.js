import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.prepare(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const listArticles = db.prepare(`
  SELECT p.* FROM posts p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN suspensions s ON u.id = s.user_id AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
  WHERE p.is_article = TRUE AND p.reply_to IS NULL AND u.suspended = 0 AND u.shadowbanned = 0 AND s.user_id IS NULL
  ORDER BY p.created_at DESC
  LIMIT 10
`);
const listArticlesBefore = db.prepare(`
  SELECT p.* FROM posts p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN suspensions s ON u.id = s.user_id AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
  WHERE p.is_article = TRUE AND p.reply_to IS NULL AND p.created_at < ? AND u.suspended = 0 AND u.shadowbanned = 0 AND s.user_id IS NULL
  ORDER BY p.created_at DESC
  LIMIT 10
`);
const getArticleById = db.prepare(
	"SELECT * FROM posts WHERE id = ? AND is_article = TRUE",
);
const getAttachmentsForPostIds = (ids) => {
	if (!ids.length) {
		return [];
	}
	const placeholders = ids.map(() => "?").join(",");
	return db
		.query(`SELECT * FROM attachments WHERE post_id IN (${placeholders})`)
		.all(...ids);
};
const insertArticle = db.prepare(`
  INSERT INTO posts (
    id,
    user_id,
    content,
    reply_to,
    source,
    poll_id,
    quote_tweet_id,
    reply_restriction,
    scheduled_post_id,
    article_id,
    is_article,
    article_title,
    article_body_markdown
  )
  VALUES (?, ?, ?, NULL, ?, NULL, NULL, 'everyone', NULL, NULL, TRUE, ?, ?)
  RETURNING *
`);
const saveAttachment = db.prepare(`
  INSERT INTO attachments (
    id,
    post_id,
    file_hash,
    file_name,
    file_type,
    file_size,
    file_url
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const serializeUser = (user) => {
	if (!user) return null;
	return {
		id: user.id,
		username: user.username,
		name: user.name,
		avatar: user.avatar,
		verified: !!user.verified,
		gold: !!user.gold,
		avatar_radius:
			user.avatar_radius === null || user.avatar_radius === undefined
				? null
				: user.avatar_radius,
		accent_color: user.accent_color,
		pronouns: user.pronouns,
	};
};

const buildExcerpt = (markdown) => {
	if (!markdown) {
		return "";
	}
	const stripped = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/[#>*_~]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (stripped.length <= 260) {
		return stripped;
	}
	return `${stripped.slice(0, 257)}…`;
};

const attachArticleExtras = (articles, attachmentsMap, userMap) => {
	return articles.map((article) => {
		const attachments = attachmentsMap.get(article.id) || [];
		const cover =
			attachments.find((item) => item.file_type.startsWith("image/")) || null;
		return {
			...article,
			author: serializeUser(userMap.get(article.user_id)),
			attachments,
			cover,
			excerpt: article.content || buildExcerpt(article.article_body_markdown),
		};
	});
};

export default new Elysia({ prefix: "/articles", tags: ["Articles"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 20,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		let user;
		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };
			user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };
		} catch (error) {
			console.error("Article auth error:", error);
			return { error: "Authentication failed" };
		}

		const { title, markdown, cover, source } = body || {};

		if (!title || typeof title !== "string" || title.trim().length < 5) {
			return { error: "Title must be at least 5 characters" };
		}

		if (
			!markdown ||
			typeof markdown !== "string" ||
			markdown.trim().length < 50
		) {
			return { error: "Article body must be at least 50 characters" };
		}

		if (cover) {
			if (typeof cover !== "object") {
				return { error: "Invalid cover metadata" };
			}

			if (cover.type !== "image/webp") {
				return { error: "Cover image must be a WebP file" };
			}

			if (
				typeof cover.hash !== "string" ||
				typeof cover.name !== "string" ||
				typeof cover.url !== "string" ||
				typeof cover.size !== "number"
			) {
				return { error: "Invalid cover metadata" };
			}
		}

		const excerpt = buildExcerpt(markdown);
		const articleId = Bun.randomUUIDv7();

		const article = insertArticle.get(
			articleId,
			user.id,
			excerpt,
			source || "articles",
			title.trim(),
			markdown.trim(),
		);

		if (!article) {
			return { error: "Failed to create article" };
		}

		let attachment = null;
		if (cover) {
			attachment = saveAttachment.get(
				Bun.randomUUIDv7(),
				articleId,
				cover.hash,
				cover.name,
				cover.type,
				cover.size,
				cover.url,
			);
		}

		return {
			success: true,
			article: {
				...article,
				author: serializeUser(user),
				attachments: attachment ? [attachment] : [],
				cover: attachment || null,
				excerpt,
			},
		};
	})
	.get("/", async ({ jwt, headers, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };
		} catch (error) {
			console.error("Articles list auth error:", error);
			return { error: "Authentication failed" };
		}

		const before = query?.before;
		let articles;
		if (before) {
			articles = listArticlesBefore.all(before);
		} else {
			articles = listArticles.all();
		}

		if (articles.length === 0) {
			return { articles: [] };
		}

		const userIds = [...new Set(articles.map((item) => item.user_id))];
		const userPlaceholders = userIds.map(() => "?").join(",");
		const users = userPlaceholders
			? db
					.query(`SELECT * FROM users WHERE id IN (${userPlaceholders})`)
					.all(...userIds)
			: [];
		const userMap = new Map(users.map((u) => [u.id, u]));

		const attachments = getAttachmentsForPostIds(
			articles.map((item) => item.id),
		);
		const attachmentsMap = new Map();
		attachments.forEach((attachment) => {
			if (!attachmentsMap.has(attachment.post_id)) {
				attachmentsMap.set(attachment.post_id, []);
			}
			attachmentsMap.get(attachment.post_id).push(attachment);
		});

		return {
			articles: attachArticleExtras(articles, attachmentsMap, userMap),
			next:
				articles.length === 10
					? articles[articles.length - 1].created_at
					: null,
		};
	})
	.get("/:id", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };
		} catch (error) {
			console.error("Article fetch auth error:", error);
			return { error: "Authentication failed" };
		}

		const article = getArticleById.get(params.id);
		if (!article) {
			return { error: "Article not found" };
		}

		const author = getUserById.get(article.user_id);
		if (!author) {
			return { error: "Author not found" };
		}

		// Hide articles authored by shadowbanned users unless viewer is owner or admin
		const currentUser = getUserByUsername.get(payload.username);
		if (
			author.shadowbanned &&
			!(currentUser && (currentUser.admin || currentUser.id === author.id))
		) {
			return { error: "Article not found" };
		}

		const attachments = db
			.query("SELECT * FROM attachments WHERE post_id = ?")
			.all(article.id);

		const replies = db
			.query(
				"SELECT * FROM posts WHERE reply_to = ? ORDER BY created_at ASC LIMIT 100",
			)
			.all(article.id);

		const replyUserIds = [...new Set(replies.map((reply) => reply.user_id))];
		const replyUsers = replyUserIds.length
			? db
					.query(
						`SELECT * FROM users WHERE id IN (${replyUserIds
							.map(() => "?")
							.join(",")})`,
					)
					.all(...replyUserIds)
			: [];
		const replyUserMap = new Map(replyUsers.map((u) => [u.id, u]));

		const replyAttachments = getAttachmentsForPostIds(
			replies.map((reply) => reply.id),
		);
		const replyAttachmentMap = new Map();
		replyAttachments.forEach((attachment) => {
			if (!replyAttachmentMap.has(attachment.post_id)) {
				replyAttachmentMap.set(attachment.post_id, []);
			}
			replyAttachmentMap.get(attachment.post_id).push(attachment);
		});

		const serializedReplies = replies.map((reply) => ({
			...reply,
			author: serializeUser(replyUserMap.get(reply.user_id)),
			attachments: replyAttachmentMap.get(reply.id) || [],
		}));

		return {
			article: {
				...article,
				author: serializeUser(author),
				attachments,
				cover:
					attachments.find((item) => item.file_type.startsWith("image/")) ||
					null,
				excerpt: article.content || buildExcerpt(article.article_body_markdown),
			},
			replies: serializedReplies,
		};
	});
