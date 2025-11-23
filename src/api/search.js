import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

// Utility: basic cleanup & normalize
const normalizeQuery = (q) => (q || "").trim();

// For user search we prioritize prefix matches and fall back to contains.
// We accept a limit param.
const buildSearchUsersQuery = (limit = 20) => {
	return db.query(`
		SELECT * FROM users
		WHERE suspended = 0 AND shadowbanned = 0
		AND (
			LOWER(username) LIKE LOWER(?)
			OR LOWER(name) LIKE LOWER(?)
		)
		ORDER BY CASE WHEN LOWER(username) LIKE LOWER(?) THEN 0 ELSE 1 END, follower_count DESC, created_at DESC
		LIMIT ${limit}
	`);
};

// Build a dynamic posts search query based on filters. We intentionally build
// this in JS to support many operators like from:, has:media, since:, until:, etc.
const buildSearchPostsQuery = ({
	userId = null,
	q = "",
	limit = 20,
	cursor = null, // created_at cursor YYYY-mm-dd HH:MM:SS or epoch milliseconds
	sort = "latest",
	fromUsername = null,
	hasMedia = null,
	hasLink = null,
	onlyReplies = null,
	onlyOriginal = null,
	hasPoll = null,
	since = null,
	until = null,
	exactPhrase = null,
	excludeTerms = [],
	hashtags = [],
	mentions = [],
}) => {
	const where = ["users.suspended = 0"];
	const params = [];

	// Shadowban/admin handling
	if (userId) {
		where.push("(users.shadowbanned = 0 OR posts.user_id = ? OR ? = 1)");
		const adminRow = db
			.query("SELECT admin FROM users WHERE id = ?")
			.get(userId);
		const isAdmin = adminRow?.admin ? 1 : 0;
		params.push(userId, isAdmin);
	} else {
		where.push("users.shadowbanned = 0");
	}

	// Private posts handling
	if (userId) {
		where.push(
			"(users.private = 0 OR follows.id IS NOT NULL OR posts.user_id = ?)",
		);
		params.push(userId);
	} else {
		where.push("users.private = 0");
	}

	// Search term
	if (q && q.length > 0) {
		if (exactPhrase) {
			where.push("posts.content LIKE ?");
			params.push(`%${exactPhrase}%`);
		} else {
			// Break into words, all must be present
			const terms = q
				.split(/\s+/)
				.filter(Boolean)
				.map((t) => t.replace(/["'\\%_]/g, ""));
			terms.forEach((t) => {
				where.push("LOWER(posts.content) LIKE LOWER(?)");
				params.push(`%${t}%`);
			});
		}
	}

	// from:username filter
	if (fromUsername) {
		where.push("LOWER(users.username) = LOWER(?)");
		params.push(fromUsername);
	}

	// has:media
	if (hasMedia !== null) {
		if (hasMedia) {
			where.push(
				"EXISTS(SELECT 1 FROM attachments a WHERE a.post_id = posts.id)",
			);
		} else {
			where.push(
				"NOT EXISTS(SELECT 1 FROM attachments a WHERE a.post_id = posts.id)",
			);
		}
	}

	// has:link
	if (hasLink !== null) {
		if (hasLink) {
			where.push("posts.content LIKE '%http%'");
		} else {
			where.push("posts.content NOT LIKE '%http%'");
		}
	}

	// reply filters
	if (onlyReplies) {
		where.push("posts.reply_to IS NOT NULL");
	}
	if (onlyOriginal) {
		where.push(
			"posts.reply_to IS NULL AND posts.retweet_id IS NULL AND posts.quote_tweet_id IS NULL",
		);
	}

	// polls/cards
	if (hasPoll) {
		where.push("EXISTS(SELECT 1 FROM polls p WHERE p.post_id = posts.id)");
	}

	// date filters
	if (since) {
		where.push("posts.created_at >= ?");
		params.push(since);
	}
	if (until) {
		where.push("posts.created_at <= ?");
		params.push(until);
	}

	// cursor
	if (cursor) {
		where.push("posts.created_at < ?");
		params.push(cursor);
	}

	// hashtags and mentions
	hashtags.forEach((ht) => {
		where.push("posts.content LIKE ?");
		params.push(`%#${ht}%`);
	});
	mentions.forEach((m) => {
		where.push("posts.content LIKE ?");
		params.push(`@${m}`);
	});

	let orderClause = "posts.created_at DESC";
	if (sort === "latest") orderClause = "posts.created_at DESC";
	else if (sort === "oldest") orderClause = "posts.created_at ASC";
	else if (sort === "top")
		orderClause = "(posts.like_count + posts.retweet_count) DESC";

	const finalQuery = `
		SELECT posts.* FROM posts
		JOIN users ON posts.user_id = users.id
		LEFT JOIN follows ON (posts.user_id = follows.following_id AND follows.follower_id = ?)
		WHERE ${where.join(" AND ")}
		ORDER BY ${orderClause}
		LIMIT ${limit}
	`;

	params.unshift(userId || null);
	return db.query(finalQuery).all(...params);
};

const getUserByUsername = db.query(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);

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

export default new Elysia({ prefix: "/search", tags: ["Search"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 30,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get(
		"/users",
		async ({ query: { q }, jwt, headers }) => {
			const authorization = headers.authorization;

			if (authorization) {
				try {
					const payload = await jwt.verify(
						authorization.replace("Bearer ", ""),
					);
					if (payload) {
						getUserByUsername.get(payload.username) || null;
					}
				} catch (e) {
					console.error("Search users: JWT verify failed", e);
				}
			}

			q = normalizeQuery(q);
			if (!q || q.length === 0) return { users: [] };

			const limit =
				parseInt(
					new URLSearchParams(headers["x-query-params"] || "").get("limit"),
				) || 20;
			// Prefer prefix matches
			const searchQuery = buildSearchUsersQuery(
				Math.max(5, Math.min(limit, 100)),
			);
			const users = searchQuery.all(`${q}%`, `${q}%`, `${q}%`);

			return { users };
		},
		{
			detail: {
				description: "Searches for users by username or name",
			},
			query: t.Object({
				q: t.String(),
			}),
			response: t.Any(),
		},
	)
	.get(
		"/posts",
		async ({ query: { q }, jwt, headers }) => {
			const authorization = headers.authorization;
			let user = null;

			if (authorization) {
				try {
					const payload = await jwt.verify(
						authorization.replace("Bearer ", ""),
					);
					if (payload) {
						user = getUserByUsername.get(payload.username) || null;
					}
				} catch (e) {
					console.error("Search posts: JWT verify failed", e);
					user = null;
				}
			}

			q = normalizeQuery(q);
			if (!q || q.length === 0) return { posts: [] };

			const queryParams = new URLSearchParams(headers["x-query-params"] || "");
			const limit = Math.min(
				100,
				Math.max(1, parseInt(queryParams.get("limit") || "20")),
			);
			const cursor = queryParams.get("cursor") || null;
			const sort = queryParams.get("sort") || "latest";

			// Parse the query string for operators
			const parsed = (() => {
				const obj = {
					terms: [],
					from: null,
					hasMedia: null,
					hasLink: null,
					onlyReplies: null,
					onlyOriginal: null,
					hasPoll: null,
					since: null,
					until: null,
					exact: null,
					hashtags: [],
					mentions: [],
				};
				let remaining = q;
				// exact phrase
				const exactRe = /"([^"]+)"/g;
				const exactMatch = exactRe.exec(remaining);
				if (exactMatch) {
					obj.exact = exactMatch[1];
					remaining = remaining.replace(exactMatch[0], "");
				}
				const parts = remaining.split(/\s+/).filter(Boolean);
				parts.forEach((part) => {
					const lower = part.toLowerCase();
					if (lower.startsWith("from:")) {
						obj.from = part.substr(5);
					} else if (lower.startsWith("has:media")) {
						obj.hasMedia = true;
					} else if (
						lower.startsWith("has:link") ||
						lower.startsWith("has:links")
					) {
						obj.hasLink = true;
					} else if (lower === "filter:replies") {
						obj.onlyReplies = true;
					} else if (lower === "filter:original" || lower === "only:original") {
						obj.onlyOriginal = true;
					} else if (lower === "has:poll") {
						obj.hasPoll = true;
					} else if (lower.startsWith("since:")) {
						obj.since = part.substr(6);
					} else if (lower.startsWith("until:")) {
						obj.until = part.substr(6);
					} else if (lower.startsWith("#")) {
						obj.hashtags.push(part.substr(1));
					} else if (lower.startsWith("@")) {
						obj.mentions.push(part.substr(1));
					} else {
						obj.terms.push(part);
					}
				});
				return obj;
			})();

			const userId = user?.id || null;
			const posts = buildSearchPostsQuery({
				userId,
				q: parsed.terms.join(" "),
				limit,
				cursor,
				sort,
				fromUsername: parsed.from,
				hasMedia: parsed.hasMedia,
				hasLink: parsed.hasLink,
				onlyReplies: parsed.onlyReplies,
				onlyOriginal: parsed.onlyOriginal,
				hasPoll: parsed.hasPoll,
				since: parsed.since,
				until: parsed.until,
				exactPhrase: parsed.exact,
				hashtags: parsed.hashtags,
				mentions: parsed.mentions,
			});

			if (posts.length === 0) return { posts: [] };

			const userIds = [...new Set(posts.map((post) => post.user_id))];

			const placeholders = userIds.map(() => "?").join(",");
			const getUsersQuery = db.query(
				`SELECT * FROM users WHERE id IN (${placeholders})`,
			);

			const users = getUsersQuery.all(...userIds);

			const userMap = {};
			users.forEach((u) => {
				if (u.affiliate && u.affiliate_with) {
					const affiliateProfile = db
						.query(
							"SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE id = ?",
						)
						.get(u.affiliate_with);
					if (affiliateProfile) {
						u.affiliate_with_profile = affiliateProfile;
					}
				}

				if (u.selected_community_tag) {
					const community = db
						.query(
							"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
						)
						.get(u.selected_community_tag);
					if (community?.tag_enabled) {
						u.community_tag = {
							community_id: community.id,
							community_name: community.name,
							emoji: community.tag_emoji,
							text: community.tag_text,
						};
					}
				}

				userMap[u.id] = u;
			});

			const postIds = posts.map((post) => post.id);
			const likePlaceholders = postIds.map(() => "?").join(",");

			// Only fetch likes/retweets if we have an authenticated user.
			let userLikedPosts = new Set();
			let userRetweetedPosts = new Set();

			if (user?.id) {
				const getUserLikesQuery = db.query(
					`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
				);

				const userLikes = getUserLikesQuery.all(user.id, ...postIds);
				userLikedPosts = new Set(userLikes.map((like) => like.post_id));

				const getUserRetweetsQuery = db.query(
					`SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${likePlaceholders})`,
				);

				const userRetweets = getUserRetweetsQuery.all(user.id, ...postIds);
				userRetweetedPosts = new Set(
					userRetweets.map((retweet) => retweet.post_id),
				);
			}

			const enrichedPosts = posts.map((post) => {
				const topReply = getTopReplyData(post.id, user ? user.id : null);
				const shouldShowTopReply =
					topReply &&
					post.like_count > 0 &&
					topReply.like_count / post.like_count >= 0.8;

				if (topReply) {
					topReply.liked_by_user = userLikedPosts.has(topReply.id);
					topReply.retweeted_by_user = userRetweetedPosts.has(topReply.id);
				}

				return {
					...post,
					// mark an excerpt with highlighted terms
					highlighted_content: (() => {
						try {
							const escaped = post.content;
							const rawTerms = q.split(/\s+/).filter(Boolean);
							let html = escaped;
							rawTerms.forEach((t) => {
								if (!t) return;
								const re = new RegExp(
									`(${t.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`,
									"ig",
								);
								html = html.replace(re, "<em>$1</em>");
							});
							return html;
						} catch (e) {
							return post.content;
						}
					})(),
					author: userMap[post.user_id],
					liked_by_user: userLikedPosts.has(post.id),
					retweeted_by_user: userRetweetedPosts.has(post.id),
					poll: getPollDataForTweet(post.id, user ? user.id : null),
					quoted_tweet: getQuotedTweetData(
						post.quote_tweet_id,
						user ? user.id : null,
					),
					top_reply: shouldShowTopReply ? topReply : null,
					attachments: getTweetAttachments(post.id),
					interactive_card: getCardDataForTweet(post.id),
				};
			});

			return { posts: enrichedPosts };
		},
		{
			detail: {
				description: "Searches for posts by content",
			},
			query: t.Object({
				q: t.String(),
			}),
			response: t.Any(),
		},
	);
