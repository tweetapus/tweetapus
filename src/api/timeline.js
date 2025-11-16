import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { isAlgorithmAvailable, rankTweets } from "../algo/algorithm.js";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const normalizeContent = (value) => {
	if (typeof value !== "string") return "";
	return value
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

const enrichUsersWithAffiliateProfiles = (users) => {
	users.forEach((user) => {
		if (user.affiliate && user.affiliate_with) {
			const affiliateProfile = db
				.query(
					"SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE id = ?",
				)
				.get(user.affiliate_with);
			if (affiliateProfile) {
				user.affiliate_with_profile = affiliateProfile;
			}
		}
	});
};

const JWT_SECRET = process.env.JWT_SECRET;

const getTimelinePosts = db.query(`
  SELECT posts.* FROM posts 
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
  LEFT JOIN follows ON (posts.user_id = follows.following_id AND follows.follower_id = ?)
	WHERE posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0 AND posts.community_only = FALSE AND (users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)
  AND (users.private = 0 OR follows.id IS NOT NULL OR posts.user_id = ?)
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

const getTimelinePostsBefore = db.query(`
  SELECT posts.* FROM posts 
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
  LEFT JOIN follows ON (posts.user_id = follows.following_id AND follows.follower_id = ?)
	WHERE posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0 AND posts.community_only = FALSE AND (users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)
  AND (users.private = 0 OR follows.id IS NOT NULL OR posts.user_id = ?)
  AND (posts.created_at < ? OR (posts.created_at = ? AND posts.id < ?))
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

const getFollowingTimelinePosts = db.query(`
  SELECT posts.* FROM posts 
  JOIN follows ON posts.user_id = follows.following_id
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
	WHERE follows.follower_id = ? AND posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0 AND posts.community_only = FALSE AND (users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

const getFollowingTimelinePostsBefore = db.query(`
  SELECT posts.* FROM posts 
  JOIN follows ON posts.user_id = follows.following_id
  JOIN users ON posts.user_id = users.id
  LEFT JOIN blocks ON (posts.user_id = blocks.blocked_id AND blocks.blocker_id = ?)
	WHERE follows.follower_id = ? AND posts.reply_to IS NULL AND blocks.id IS NULL AND posts.pinned = 0 AND users.suspended = 0 AND posts.community_only = FALSE AND (users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)
  AND (posts.created_at < ? OR (posts.created_at = ? AND posts.id < ?))
  ORDER BY posts.created_at DESC, posts.id DESC
  LIMIT ?
`);

// Helper to lookup a post's created_at for composite cursor pagination
const getPostCreatedAt = db.query(`SELECT created_at FROM posts WHERE id = ?`);

const getUserByUsername = db.query(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);

const getSeenTweets = db.query(`
  SELECT tweet_id, seen_at FROM seen_tweets 
  WHERE user_id = ? AND seen_at > datetime('now', '-7 days')
`);

const markTweetsAsSeen = db.prepare(`
  INSERT INTO seen_tweets (id, user_id, tweet_id, seen_at)
  VALUES (?, ?, ?, datetime('now', 'utc'))
  ON CONFLICT(user_id, tweet_id)
  DO UPDATE SET seen_at = excluded.seen_at
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
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const countReactionsForPost = db.query(`
  SELECT COUNT(*) as total FROM post_reactions WHERE post_id = ?
`);

const getTopReactionsForPost = db.query(`
  SELECT emoji, COUNT(*) as count
  FROM post_reactions
  WHERE post_id = ?
  GROUP BY emoji
  ORDER BY count DESC
  LIMIT 3
`);

const getFactCheckForPost = db.query(`
  SELECT fc.*, u.username as admin_username, u.name as admin_name
  FROM fact_checks fc
  JOIN users u ON fc.created_by = u.id
  WHERE fc.post_id = ?
  LIMIT 1
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const getTopReply = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.reply_to = ?
  ORDER BY posts.like_count DESC, posts.retweet_count DESC, posts.created_at ASC
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

const getCardByPostId = db.query(`
  SELECT * FROM interactive_cards WHERE post_id = ?
`);

const getCardOptions = db.query(`
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

	return {
		...quotedTweet,
		author,
		poll: getPollDataForTweet(quotedTweet.id, userId),
		attachments: getTweetAttachments(quotedTweet.id),
		interactive_card: getCardDataForTweet(quotedTweet.id),
	};
};

const getTopReplyData = (tweetId, userId) => {
	const topReply = getTopReply.get(tweetId);
	if (!topReply) return null;

	const author = {
		username: topReply.username,
		name: topReply.name,
		avatar: topReply.avatar,
		verified: topReply.verified || false,
		gold: topReply.gold || false,
		avatar_radius: topReply.avatar_radius || null,
		affiliate: topReply.affiliate || false,
		affiliate_with: topReply.affiliate_with || null,
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
		...topReply,
		author,
		poll: getPollDataForTweet(topReply.id, userId),
		quoted_tweet: getQuotedTweetData(topReply.quote_tweet_id, userId),
		attachments: getTweetAttachments(topReply.id),
		interactive_card: getCardDataForTweet(topReply.id),
	};
};

const summarizeArticle = (article) => {
	if (!article) return "";
	const trimmedContent = article.content?.trim();
	if (trimmedContent) {
		return trimmedContent;
	}
	if (!article.article_body_markdown) {
		return "";
	}
	const stripped = article.article_body_markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/[>#*_~]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (stripped.length <= 260) {
		return stripped;
	}
	return `${stripped.slice(0, 257)}…`;
};

export default new Elysia({ prefix: "/timeline", tags: ["Timeline"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 30,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get("/", async ({ jwt, headers, query }) => {
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

		const beforeId = query.before;
		const limit = Math.min(Math.max(parseInt(query.limit) || 10, 1), 50);
		let posts = [];
		if (beforeId) {
			const cursor = getPostCreatedAt.get(beforeId);
			if (!cursor) {
				posts = [];
			} else {
				posts = getTimelinePostsBefore.all(
					user.id,
					user.id,
					user.id,
					user.id,
					user.admin ? 1 : 0,
					cursor.created_at,
					cursor.created_at,
					beforeId,
					limit,
				);
			}
		} else {
			posts = getTimelinePosts.all(
				user.id,
				user.id,
				user.id,
				user.id,
				user.admin ? 1 : 0,
				limit,
			);
		}

		// Compute per-batch author/content repeat counts to aid debugging
		const authorCounts = new Map();
		const contentCounts = new Map();
		posts.forEach((p) => {
			const aKey = p.user_id || p.user?.id || p.author?.id || p.author_id;
			if (aKey) authorCounts.set(aKey, (authorCounts.get(aKey) || 0) + 1);

			const cKey = normalizeContent(p.content || "");
			if (cKey) contentCounts.set(cKey, (contentCounts.get(cKey) || 0) + 1);
			p._normalized_content = cKey; // keep for debugging later
		});

		if (user.use_c_algorithm && isAlgorithmAvailable()) {
			const postIds = posts.map((p) => p.id);
			if (postIds.length > 0) {
				const attachmentPlaceholders = postIds.map(() => "?").join(",");
				const allAttachments = db
					.query(
						`SELECT * FROM attachments WHERE post_id IN (${attachmentPlaceholders})`,
					)
					.all(...postIds);

				const attachmentMap = new Map();
				allAttachments.forEach((attachment) => {
					if (!attachmentMap.has(attachment.post_id)) {
						attachmentMap.set(attachment.post_id, []);
					}
					attachmentMap.get(attachment.post_id).push(attachment);
				});

				const allFactChecks = db
					.query(
						`SELECT post_id FROM fact_checks WHERE post_id IN (${attachmentPlaceholders})`,
					)
					.all(...postIds);
				const factCheckSet = new Set(allFactChecks.map((fc) => fc.post_id));

				const userIds = [...new Set(posts.map((p) => p.user_id))];
				const userPlaceholders = userIds.map(() => "?").join(",");
				const postUsers = db
					.query(
						`SELECT id, verified, gold, follower_count FROM users WHERE id IN (${userPlaceholders})`,
					)
					.all(...userIds);
				const userDataMap = new Map(postUsers.map((u) => [u.id, u]));

				posts.forEach((post) => {
					post.attachments = attachmentMap.get(post.id) || [];
					post.has_community_note = factCheckSet.has(post.id);
					const userData = userDataMap.get(post.user_id);
					if (userData) {
						post.verified = userData.verified;
						post.gold = userData.gold;
						post.follower_count = userData.follower_count;
					}
				});
			}

			const seenTweets = getSeenTweets.all(user.id);
			const seenMeta = new Map(
				seenTweets.map((row) => [row.tweet_id, row.seen_at]),
			);
			posts = rankTweets(posts, seenMeta);

			for (const post of posts.slice(0, 10)) {
				markTweetsAsSeen.run(Bun.randomUUIDv7(), user.id, post.id);
			}
		}

		const userIds = [...new Set(posts.map((post) => post.user_id))];

		const placeholders = userIds.map(() => "?").join(",");
		const getUsersQuery = db.query(
			`SELECT * FROM users WHERE id IN (${placeholders})`,
		);

		const users = getUsersQuery.all(...userIds);

		enrichUsersWithAffiliateProfiles(users);

		const userMap = {};
		users.forEach((user) => {
			userMap[user.id] = user;
		});

		const rawTopReplies = posts
			.map((post) => getTopReply.get(post.id))
			.filter(Boolean);

		const articleIds = new Set();
		posts.forEach((post) => {
			if (post.article_id) {
				articleIds.add(post.article_id);
			}
		});
		rawTopReplies.forEach((reply) => {
			if (reply.article_id) {
				articleIds.add(reply.article_id);
			}
		});

		let articleMap = new Map();
		if (articleIds.size > 0) {
			const ids = [...articleIds];
			const placeholders = ids.map(() => "?").join(",");
			const articles = db
				.query(
					`SELECT * FROM posts WHERE id IN (${placeholders}) AND is_article = TRUE`,
				)
				.all(...ids);
			const articleUserIds = [
				...new Set(articles.map((article) => article.user_id)),
			];
			const articleUsers = articleUserIds.length
				? db
						.query(
							`SELECT * FROM users WHERE id IN (${articleUserIds
								.map(() => "?")
								.join(",")})`,
						)
						.all(...articleUserIds)
				: [];
			const articleUserMap = new Map(articleUsers.map((u) => [u.id, u]));
			const attachmentPlaceholders = ids.map(() => "?").join(",");
			const articleAttachments = db
				.query(
					`SELECT * FROM attachments WHERE post_id IN (${attachmentPlaceholders})`,
				)
				.all(...ids);
			const attachmentMap = new Map();
			articleAttachments.forEach((attachment) => {
				if (!attachmentMap.has(attachment.post_id)) {
					attachmentMap.set(attachment.post_id, []);
				}
				attachmentMap.get(attachment.post_id).push(attachment);
			});
			articleMap = new Map(
				articles.map((article) => {
					const attachmentsForArticle = attachmentMap.get(article.id) || [];
					return [
						article.id,
						{
							...article,
							author: articleUserMap.get(article.user_id) || null,
							attachments: attachmentsForArticle,
							cover:
								attachmentsForArticle.find((item) =>
									item.file_type.startsWith("image/"),
								) || null,
							excerpt: summarizeArticle(article),
						},
					];
				}),
			);
		}

		const postIds = posts.map((post) => post.id);
		const topReplyIds = rawTopReplies.map((r) => r.id);
		const combinedIds = [...new Set([...postIds, ...topReplyIds])];

		const likePlaceholders = combinedIds.map(() => "?").join(",");
		const getUserLikesQuery = db.query(
			`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userLikes = getUserLikesQuery.all(user.id, ...combinedIds);
		const userLikedPosts = new Set(userLikes.map((like) => like.post_id));

		const getUserRetweetsQuery = db.query(
			`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userRetweets = getUserRetweetsQuery.all(user.id, ...combinedIds);
		const userRetweetedPosts = new Set(
			userRetweets.map((retweet) => retweet.post_id),
		);

		const getUserBookmarksQuery = db.query(
			`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userBookmarks = getUserBookmarksQuery.all(user.id, ...combinedIds);
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
					topReply.article_preview = topReply.article_id
						? articleMap.get(topReply.article_id) || null
						: null;
				}

				const author = userMap[post.user_id];
				if (!author) return null;

				return {
					...post,
					author,
					liked_by_user: userLikedPosts.has(post.id),
					retweeted_by_user: userRetweetedPosts.has(post.id),
					bookmarked_by_user: userBookmarkedPosts.has(post.id),
					reaction_count: countReactionsForPost.get(post.id)?.total || 0,
					top_reactions: getTopReactionsForPost.all(post.id),
					poll: getPollDataForTweet(post.id, user.id),
					quoted_tweet: getQuotedTweetData(post.quote_tweet_id, user.id),
					top_reply: shouldShowTopReply ? topReply : null,
					attachments: getTweetAttachments(post.id),
					article_preview: post.article_id
						? articleMap.get(post.article_id) || null
						: null,
					fact_check: getFactCheckForPost.get(post.id) || null,
					interactive_card: getCardDataForTweet(post.id),
				};
			})
			.filter(Boolean);

		if (!user.use_c_algorithm) {
			timeline.sort((a, b) => {
				const timeA = Number(new Date(a.created_at));
				const timeB = Number(new Date(b.created_at));
				const diff = timeB - timeA;
				if (diff !== 0) return diff;
				return b.id.localeCompare(a.id);
			});
		}

		return { timeline };
	})
	.get("/following", async ({ jwt, headers, query }) => {
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

		const beforeId = query.before;
		const limit = Math.min(Math.max(parseInt(query.limit) || 10, 1), 50);
		let posts = [];
		if (beforeId) {
			const cursor = getPostCreatedAt.get(beforeId);
			if (!cursor) {
				posts = [];
			} else {
				posts = getFollowingTimelinePostsBefore.all(
					user.id,
					user.id,
					user.id,
					user.admin ? 1 : 0,
					cursor.created_at,
					cursor.created_at,
					beforeId,
					limit,
				);
			}
		} else {
			posts = getFollowingTimelinePosts.all(
				user.id,
				user.id,
				user.id,
				user.admin ? 1 : 0,
				limit,
			);
		}

		const authorCounts = new Map();
		const contentCounts = new Map();
		posts.forEach((p) => {
			const aKey = p.user_id || p.user?.id || p.author?.id || p.author_id;
			if (aKey) authorCounts.set(aKey, (authorCounts.get(aKey) || 0) + 1);

			const cKey = normalizeContent(p.content || "");
			if (cKey) contentCounts.set(cKey, (contentCounts.get(cKey) || 0) + 1);
			p._normalized_content = cKey;
		});

		if (posts.length === 0) {
			return { timeline: [] };
		}

		if (user.use_c_algorithm && isAlgorithmAvailable()) {
			const postIds = posts.map((p) => p.id);
			if (postIds.length > 0) {
				const attachmentPlaceholders = postIds.map(() => "?").join(",");
				const allAttachments = db
					.query(
						`SELECT * FROM attachments WHERE post_id IN (${attachmentPlaceholders})`,
					)
					.all(...postIds);

				const attachmentMap = new Map();
				allAttachments.forEach((attachment) => {
					if (!attachmentMap.has(attachment.post_id)) {
						attachmentMap.set(attachment.post_id, []);
					}
					attachmentMap.get(attachment.post_id).push(attachment);
				});

				const allFactChecks = db
					.query(
						`SELECT post_id FROM fact_checks WHERE post_id IN (${attachmentPlaceholders})`,
					)
					.all(...postIds);
				const factCheckSet = new Set(allFactChecks.map((fc) => fc.post_id));

				const userIds = [...new Set(posts.map((p) => p.user_id))];
				const userPlaceholders = userIds.map(() => "?").join(",");
				const postUsers = db
					.query(
						`SELECT id, verified, gold, follower_count FROM users WHERE id IN (${userPlaceholders})`,
					)
					.all(...userIds);
				const userDataMap = new Map(postUsers.map((u) => [u.id, u]));

				posts.forEach((post) => {
					post.attachments = attachmentMap.get(post.id) || [];
					post.has_community_note = factCheckSet.has(post.id);
					const userData = userDataMap.get(post.user_id);
					if (userData) {
						post.verified = userData.verified;
						post.gold = userData.gold;
						post.follower_count = userData.follower_count;
					}
				});
			}

			const seenTweets = getSeenTweets.all(user.id);
			const seenMeta = new Map(
				seenTweets.map((row) => [row.tweet_id, row.seen_at]),
			);

			// Non-destructive suppression: for posts that are part of a
			// repeated-content cluster (e.g. content_repeat_count >= 3), mark
			// them as "seen" in the in-memory seenMeta used for ranking so
			// the ranking algorithm will tend to deprioritize them for this
			// request. This does not modify DB state or the C algorithm.
			const CLUSTER_SUPPRESS_THRESHOLD = 3;
			for (const post of posts) {
				const c = post._normalized_content || "";
				if (c && contentCounts.get(c) >= CLUSTER_SUPPRESS_THRESHOLD) {
					// Only set if not already present in seenMeta
					if (!seenMeta.has(post.id)) {
						seenMeta.set(post.id, new Date().toISOString());
					}
				}
			}

			posts = rankTweets(posts, seenMeta);

			for (const post of posts.slice(0, 10)) {
				markTweetsAsSeen.run(Bun.randomUUIDv7(), user.id, post.id);
			}
		}

		const userIds = [...new Set(posts.map((post) => post.user_id))];

		const placeholders = userIds.map(() => "?").join(",");
		const getUsersQuery = db.query(
			`SELECT * FROM users WHERE id IN (${placeholders})`,
		);

		const users = getUsersQuery.all(...userIds);

		enrichUsersWithAffiliateProfiles(users);

		const userMap = {};
		users.forEach((user) => {
			userMap[user.id] = user;
		});

		const rawTopReplies = posts
			.map((post) => getTopReply.get(post.id))
			.filter(Boolean);

		const articleIds = new Set();
		posts.forEach((post) => {
			if (post.article_id) {
				articleIds.add(post.article_id);
			}
		});
		rawTopReplies.forEach((reply) => {
			if (reply.article_id) {
				articleIds.add(reply.article_id);
			}
		});

		let articleMap = new Map();
		if (articleIds.size > 0) {
			const ids = [...articleIds];
			const placeholders = ids.map(() => "?").join(",");
			const articles = db
				.query(
					`SELECT * FROM posts WHERE id IN (${placeholders}) AND is_article = TRUE`,
				)
				.all(...ids);
			const articleUserIds = [
				...new Set(articles.map((article) => article.user_id)),
			];
			const articleUsers = articleUserIds.length
				? db
						.query(
							`SELECT * FROM users WHERE id IN (${articleUserIds
								.map(() => "?")
								.join(",")})`,
						)
						.all(...articleUserIds)
				: [];
			const articleUserMap = new Map(articleUsers.map((u) => [u.id, u]));
			const attachmentPlaceholders = ids.map(() => "?").join(",");
			articleAttachments = db
				.query(
					`SELECT * FROM attachments WHERE post_id IN (${attachmentPlaceholders})`,
				)
				.all(...ids);
			const attachmentMap = new Map();
			articleAttachments.forEach((attachment) => {
				if (!attachmentMap.has(attachment.post_id)) {
					attachmentMap.set(attachment.post_id, []);
				}
				attachmentMap.get(attachment.post_id).push(attachment);
			});
			articleMap = new Map(
				articles.map((article) => {
					const attachmentsForArticle = attachmentMap.get(article.id) || [];
					return [
						article.id,
						{
							...article,
							author: articleUserMap.get(article.user_id) || null,
							attachments: attachmentsForArticle,
							cover:
								attachmentsForArticle.find((item) =>
									item.file_type.startsWith("image/"),
								) || null,
							excerpt: summarizeArticle(article),
						},
					];
				}),
			);
		}

		const postIds = posts.map((post) => post.id);
		const topReplyIds = rawTopReplies.map((r) => r.id);
		const combinedIds = [...new Set([...postIds, ...topReplyIds])];

		const likePlaceholders = combinedIds.map(() => "?").join(",");
		const getUserLikesQuery = db.query(
			`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userLikes = getUserLikesQuery.all(user.id, ...combinedIds);
		const userLikedPosts = new Set(userLikes.map((like) => like.post_id));

		const getUserRetweetsQuery = db.query(
			`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userRetweets = getUserRetweetsQuery.all(user.id, ...combinedIds);
		const userRetweetedPosts = new Set(
			userRetweets.map((retweet) => retweet.post_id),
		);

		const getUserBookmarksQuery = db.query(
			`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
		);

		const userBookmarks = getUserBookmarksQuery.all(user.id, ...combinedIds);
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
					topReply.article_preview = topReply.article_id
						? articleMap.get(topReply.article_id) || null
						: null;
				}

				const author = userMap[post.user_id];
				if (!author) return null;

				return {
					...post,
					author,
					liked_by_user: userLikedPosts.has(post.id),
					retweeted_by_user: userRetweetedPosts.has(post.id),
					bookmarked_by_user: userBookmarkedPosts.has(post.id),
					reaction_count: countReactionsForPost.get(post.id)?.total || 0,
					top_reactions: getTopReactionsForPost.all(post.id),
					poll: getPollDataForTweet(post.id, user.id),
					quoted_tweet: getQuotedTweetData(post.quote_tweet_id, user.id),
					top_reply: shouldShowTopReply ? topReply : null,
					attachments: getTweetAttachments(post.id),
					article_preview: post.article_id
						? articleMap.get(post.article_id) || null
						: null,
					fact_check: getFactCheckForPost.get(post.id) || null,
					interactive_card: getCardDataForTweet(post.id),
				};
			})
			.filter(Boolean);

		return { timeline };
	});
