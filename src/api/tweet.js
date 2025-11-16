import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import { generateAIResponse } from "../helpers/ai-assistant.js";
import ratelimit from "../helpers/ratelimit.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);

const checkReplyPermission = async (replier, originalAuthor, restriction) => {
	if (replier.id === originalAuthor.id) {
		return true;
	}

	switch (restriction) {
		case "followers": {
			const isFollower = db
				.query(
					"SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
				)
				.get(replier.id, originalAuthor.id);
			return !!isFollower;
		}

		case "following": {
			const isFollowing = db
				.query(
					"SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
				)
				.get(originalAuthor.id, replier.id);
			return !!isFollowing;
		}

		case "verified":
			return !!replier.verified || !!replier.gold;

		// case "everyone":
		default:
			return true;
	}
};
const getTweetById = db.query(`
  SELECT *
  FROM posts 
  WHERE posts.id = ?
`);

const isSuspendedQuery = db.query(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'suspend' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const isRestrictedQuery = db.query(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const getUserSuspendedFlag = db.query(`
  SELECT suspended FROM users WHERE id = ?
`);
const getUserShadowbannedFlag = db.query(`
	SELECT shadowbanned FROM users WHERE id = ?
`);
const isShadowbannedQuery = db.query(`
	SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'shadowban' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);
const getUserRestrictedFlag = db.query(`
  SELECT restricted FROM users WHERE id = ?
`);

const isUserSuspendedById = (userId) => {
	const suspensionRow = isSuspendedQuery.get(userId);
	const userSuspFlag = getUserSuspendedFlag.get(userId);
	return !!suspensionRow || !!userSuspFlag?.suspended;
};

const isUserRestrictedById = (userId) => {
	const restrictionRow = isRestrictedQuery.get(userId);
	const userResFlag = getUserRestrictedFlag.get(userId);
	return !!restrictionRow || !!userResFlag?.restricted;
};

const isUserShadowbannedById = (userId) => {
	const row = isShadowbannedQuery.get(userId);
	const flag = getUserShadowbannedFlag.get(userId);
	return !!row || !!flag?.shadowbanned;
};

const getArticlePreviewById = db.query(`
	SELECT *
	FROM posts
	WHERE id = ? AND is_article = TRUE
`);

const getUserById = db.query("SELECT * FROM users WHERE id = ?");

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
  LIMIT ?
`);

const getTweetRepliesBefore = db.query(`
  SELECT *
  FROM posts
  WHERE reply_to = ? AND created_at < (SELECT created_at FROM posts WHERE id = ?)
  ORDER BY created_at ASC
  LIMIT ?
`);

const createTweet = db.query(`
	INSERT INTO posts (id, user_id, content, reply_to, source, poll_id, quote_tweet_id, reply_restriction, article_id, community_id, community_only, posted_as_id) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	RETURNING *
`);

const saveAttachment = db.query(`
  INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url, is_spoiler)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const updateQuoteCount = db.query(`
  UPDATE posts SET quote_count = quote_count + ? WHERE id = ?
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with
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
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getTweetLikes = db.query(`
  SELECT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM likes
  JOIN users ON likes.user_id = users.id
  WHERE likes.post_id = ?
  ORDER BY likes.created_at DESC
  LIMIT 3
`);

const getTweetRetweets = db.query(`
  SELECT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM retweets
  JOIN users ON retweets.user_id = users.id
  WHERE retweets.post_id = ?
  ORDER BY retweets.created_at DESC
  LIMIT 3
`);

const getTweetQuotes = db.query(`
  SELECT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.quote_tweet_id = ?
  ORDER BY posts.created_at DESC
  LIMIT 3
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

const getFactCheckForPost = db.query(`
  SELECT fc.*, u.username as admin_username, u.name as admin_name
  FROM fact_checks fc
  JOIN users u ON fc.created_by = u.id
  WHERE fc.post_id = ?
  LIMIT 1
`);

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

const getQuotedTweetData = (quoteTweetId, userId) => {
	if (!quoteTweetId) return null;

	const quotedTweet = getQuotedTweet.get(quoteTweetId);
	if (!quotedTweet) return null;

	// If the quoted tweet's author is suspended, return a placeholder so the
	// frontend can show an appropriate 'suspended' message instead of the full
	// quoted tweet content.
	const authorSuspended = isUserSuspendedById(quotedTweet.user_id);
	const authorShadowbanned = isUserShadowbannedById(quotedTweet.user_id);
	if (authorSuspended) {
		return {
			id: quotedTweet.id,
			unavailable_reason: "suspended",
			created_at: quotedTweet.created_at,
		};
	}
	if (authorShadowbanned) {
		// allow author view if userId is the author or if current user is admin
		const viewer = userId ? getUserById.get(userId) : null;
		if (!(viewer && (viewer.id === quotedTweet.user_id || viewer.admin))) {
			return {
				id: quotedTweet.id,
				unavailable_reason: "shadowbanned",
				created_at: quotedTweet.created_at,
			};
		}
	}

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
		const affiliateProfile = getUserById.get(author.affiliate_with);
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

const getTweetLikers = db.query(`
  SELECT u.id, u.username, u.name, u.avatar, u.verified, l.created_at as liked_at
  FROM likes l
  JOIN users u ON l.user_id = u.id
  WHERE l.post_id = ?
  ORDER BY l.created_at DESC
  LIMIT ?
`);

const getTweetRetweeters = db.query(`
  SELECT u.id, u.username, u.name, u.avatar, u.verified, r.created_at as retweeted_at
  FROM retweets r
  JOIN users u ON r.user_id = u.id
  WHERE r.post_id = ?
  ORDER BY r.created_at DESC
  LIMIT ?
`);

const getTweetQuoters = db.query(`
  SELECT u.id, u.username, u.name, u.avatar, u.verified, p.created_at as quoted_at, p.id as quote_tweet_id, p.content as quote_content
  FROM posts p
  JOIN users u ON p.user_id = u.id
  WHERE p.quote_tweet_id = ?
  ORDER BY p.created_at DESC
  LIMIT ?
`);

const checkReactionExists = db.query(`
  SELECT id FROM post_reactions WHERE user_id = ? AND post_id = ? AND emoji = ?
`);

const addReaction = db.query(`
  INSERT INTO post_reactions (id, post_id, user_id, emoji) VALUES (?, ?, ?, ?)
`);

const removeReaction = db.query(`
  DELETE FROM post_reactions WHERE user_id = ? AND post_id = ? AND emoji = ?
`);

const countReactionsForPost = db.query(`
  SELECT COUNT(*) as total FROM post_reactions WHERE post_id = ?
`);

const listReactionsForPost = db.query(`
  SELECT pr.emoji, u.id as user_id, u.username, u.name, u.avatar
  FROM post_reactions pr
  JOIN users u ON pr.user_id = u.id
  WHERE pr.post_id = ?
  ORDER BY pr.created_at DESC
  LIMIT ?
`);

const getTopReactionsForPost = db.query(`
  SELECT emoji, COUNT(*) as count
  FROM post_reactions
  WHERE post_id = ?
  GROUP BY emoji
  ORDER BY count DESC
  LIMIT 2
`);

const createInteractiveCard = db.query(`
  INSERT INTO interactive_cards (id, post_id, media_type, media_url)
  VALUES (?, ?, ?, ?)
  RETURNING *
`);

const createCardOption = db.query(`
  INSERT INTO interactive_card_options (id, card_id, description, tweet_text, option_order)
  VALUES (?, ?, ?, ?, ?)
  RETURNING *
`);

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

export default new Elysia({ prefix: "/tweets", tags: ["Tweets"] })
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

			// Restricted users cannot create new tweets
			if (isUserRestrictedById(user.id)) {
				return { error: "Action not allowed: account is restricted" };
			}

			const {
				content,
				reply_to,
				source,
				poll,
				quote_tweet_id,
				files,
				reply_restriction,
				gif_url,
				article_id,
				community_id,
				community_only,
				spoiler_flags,
				interactive_card,
				posted_as_user_id,
			} = body;
			const tweetContent = typeof content === "string" ? content : "";
			const trimmedContent = tweetContent.trim();
			const hasAttachments = Array.isArray(files) && files.length > 0;
			const hasBody = trimmedContent.length > 0;
			const targetArticleId = article_id ? String(article_id) : null;

			let effectiveUserId = user.id;
			let postedAsUserId = null;

			if (posted_as_user_id && posted_as_user_id !== user.id) {
				const delegation = db
					.query(
						"SELECT * FROM delegates WHERE owner_id = ? AND delegate_id = ? AND status = 'accepted'",
					)
					.get(posted_as_user_id, user.id);

				if (!delegation) {
					return {
						error: "You are not authorized to post as this user",
					};
				}

				const postedAsUser = getUserById.get(posted_as_user_id);
				if (!postedAsUser) {
					return { error: "Posted-as user not found" };
				}

				if (isUserSuspendedById(postedAsUser.id)) {
					return {
						error: "Cannot post as a suspended user",
					};
				}

				if (isUserRestrictedById(postedAsUser.id)) {
					return {
						error: "Cannot post as a restricted user",
					};
				}

				effectiveUserId = posted_as_user_id;
				postedAsUserId = posted_as_user_id;
			}

			if (community_id) {
				const isMember = db
					.query(
						"SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ? AND banned = FALSE",
					)
					.get(community_id, effectiveUserId);

				if (!isMember) {
					return { error: "You must be a community member to post here" };
				}
			}

			if (interactive_card && !user.verified && !user.gold) {
				return { error: "Only verified users can create interactive cards" };
			}

			if (interactive_card) {
				if (!interactive_card.media_url || !interactive_card.media_type) {
					return { error: "Card media is required" };
				}
				if (!["image", "video", "gif"].includes(interactive_card.media_type)) {
					return { error: "Invalid media type for card" };
				}
				if (
					!interactive_card.options ||
					!Array.isArray(interactive_card.options) ||
					interactive_card.options.length < 2 ||
					interactive_card.options.length > 4
				) {
					return { error: "Card must have 2-4 options" };
				}
				for (const option of interactive_card.options) {
					if (!option.description || !option.tweet_text) {
						return {
							error: "Each option must have description and tweet text",
						};
					}
					if (option.description.length > 100) {
						return {
							error: "Option description must be 100 characters or less",
						};
					}
					if (option.tweet_text.length > 280) {
						return {
							error: "Option tweet text must be 280 characters or less",
						};
					}
				}
			}

			// Require at least one of: non-empty content, attachments, gif, poll, card or article
			if (
				!hasBody &&
				!hasAttachments &&
				!gif_url &&
				!poll &&
				!interactive_card &&
				!targetArticleId
			) {
				return { error: "Tweet content is required" };
			}

			let referencedArticle = null;
			if (targetArticleId) {
				referencedArticle = getArticlePreviewById.get(targetArticleId);
				if (!referencedArticle) {
					return { error: "Article not found" };
				}
			}

			// Allow longer tweets for gold or verified users, or use custom limit
			let maxTweetLength = user.character_limit || 400;
			if (!user.character_limit) {
				maxTweetLength = user.gold ? 16500 : user.verified ? 5500 : 400;
			}
			if (trimmedContent.length > maxTweetLength) {
				return {
					error: `Tweet content must be ${maxTweetLength} characters or less`,
				};
			}

			if (gif_url) {
				if (
					typeof gif_url !== "string" ||
					!gif_url.startsWith("https://media.tenor.com/")
				) {
					return { error: "Invalid GIF URL" };
				}
			}

			const validRestrictions = [
				"everyone",
				"followers",
				"following",
				"verified",
			];
			const replyRestriction =
				reply_restriction && validRestrictions.includes(reply_restriction)
					? reply_restriction
					: "everyone";

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

			if (reply_to) {
				const originalTweet = getTweetById.get(reply_to);
				if (!originalTweet) {
					return { error: "Original tweet not found" };
				}
				// If the original tweet's author is suspended, do not allow replies.
				if (isUserSuspendedById(originalTweet.user_id)) {
					return { error: "Tweet not found" };
				}
				const originalAuthor = db
					.query("SELECT * FROM users WHERE id = ?")
					.get(originalTweet.user_id);

				const isBlocked = db
					.query(
						"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
					)
					.get(user.id, originalAuthor.id, originalAuthor.id, user.id);

				if (isBlocked) {
					return { error: "You cannot reply to this tweet" };
				}

				if (
					originalTweet.reply_restriction &&
					originalTweet.reply_restriction !== "everyone"
				) {
					// Check if user can reply based on restriction
					const canReply = await checkReplyPermission(
						user,
						originalAuthor,
						originalTweet.reply_restriction,
					);
					if (!canReply) {
						return {
							error: "You don't have permission to reply to this tweet",
						};
					}
				}
			}

			const tweetId = Bun.randomUUIDv7().split("-").pop();
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
				effectiveUserId,
				trimmedContent,
				reply_to || null,
				source || null,
				pollId,
				quote_tweet_id || null,
				replyRestriction,
				targetArticleId,
				community_id || null,
				community_only || false,
				postedAsUserId,
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
						user.id,
						user.username,
						user.name || user.username,
					);
				}
			}
			if (quote_tweet_id) {
				// If the quoted tweet's author is suspended, do not update counts or notify.
				const quotedTweet = getTweetById.get(quote_tweet_id);
				if (quotedTweet && !isUserSuspendedById(quotedTweet.user_id)) {
					updateQuoteCount.run(1, quote_tweet_id);
					if (quotedTweet.user_id !== user.id) {
						addNotification(
							quotedTweet.user_id,
							"quote",
							`${user.name || user.username} quoted your tweet`,
							tweetId,
							user.id,
							user.username,
							user.name || user.username,
						);
					}
				}
			}

			const mentionRegex = /@(\w+)/g;
			const mentions = new Set();
			if (tweetContent && typeof tweetContent === "string") {
				let match;
				mentionRegex.lastIndex = 0;
				match = mentionRegex.exec(tweetContent);
				while (match !== null) {
					mentions.add(match[1]);
					match = mentionRegex.exec(tweetContent);
				}
			}

			for (const mentionedUsername of mentions) {
				if (mentionedUsername.toLowerCase() === user.username.toLowerCase())
					continue;

				const mentionedUser = getUserByUsername.get(mentionedUsername);
				if (mentionedUser) {
					addNotification(
						mentionedUser.id,
						"mention",
						`${user.name || user.username} mentioned you in a tweet`,
						tweetId,
						user.id,
						user.username,
						user.name || user.username,
					);
				}
			}

			const shouldTriggerAI = mentions.has("h") || mentions.has("H");
			let isReplyToAIThread = false;

			if (!shouldTriggerAI && reply_to) {
				const aiUser = getUserByUsername.get("h");
				if (aiUser) {
					const threadPosts = getTweetWithThread.all(reply_to);
					isReplyToAIThread = threadPosts.some(
						(post) => post.user_id === aiUser.id,
					);
				}
			}

			if (shouldTriggerAI || isReplyToAIThread) {
				const aiUser = getUserByUsername.get("h");
				if (aiUser) {
					(async () => {
						try {
							const aiResponse = await generateAIResponse(
								tweetId,
								trimmedContent,
								db,
							);
							if (aiResponse) {
								const aiTweetId = Bun.randomUUIDv7().split("-").pop();
								createTweet.get(
									aiTweetId,
									aiUser.id,
									aiResponse,
									tweetId,
									null,
									null,
									null,
									"everyone",
									null,
									null,
									false,
									null,
								);
								updatePostCounts.run(tweetId);
								addNotification(
									user.id,
									"reply",
									`${aiUser.name || aiUser.username} replied to your tweet`,
									aiTweetId,
									aiUser.id,
									aiUser.username,
									aiUser.name || aiUser.username,
								);
							}
						} catch (error) {
							console.error("Failed to generate AI response:", error);
						}
					})();
				}
			}

			const attachments = [];
			if (files && Array.isArray(files)) {
				files.forEach((file, index) => {
					const attachmentId = Bun.randomUUIDv7();
					const isSpoiler =
						Array.isArray(spoiler_flags) && spoiler_flags.includes(index);
					const attachment = saveAttachment.get(
						attachmentId,
						tweetId,
						file.hash,
						file.name,
						file.type,
						file.size,
						file.url,
						isSpoiler,
					);
					attachments.push(attachment);
				});
			}

			if (gif_url) {
				const attachmentId = Bun.randomUUIDv7();
				const attachment = saveAttachment.get(
					attachmentId,
					tweetId,
					null,
					"tenor.gif",
					"image/gif",
					0,
					gif_url,
					false,
				);
				attachments.push(attachment);
			}

			let articlePreview = null;
			if (targetArticleId) {
				if (!referencedArticle) {
					referencedArticle = getArticlePreviewById.get(targetArticleId);
				}
				if (referencedArticle) {
					const articleAuthor = getUserById.get(referencedArticle.user_id);
					const articleAttachments = getTweetAttachments(referencedArticle.id);
					articlePreview = {
						...referencedArticle,
						author: articleAuthor || null,
						attachments: articleAttachments,
						cover:
							articleAttachments.find((item) =>
								item.file_type.startsWith("image/"),
							) || null,
						excerpt: summarizeArticle(referencedArticle),
					};
				}
			}

			let cardData = null;
			if (interactive_card) {
				const cardId = Bun.randomUUIDv7();
				const card = createInteractiveCard.get(
					cardId,
					tweetId,
					interactive_card.media_type,
					interactive_card.media_url,
				);

				const cardOptions = [];
				interactive_card.options.forEach((option, index) => {
					const optionId = Bun.randomUUIDv7();
					const savedOption = createCardOption.get(
						optionId,
						cardId,
						option.description.trim(),
						option.tweet_text.trim(),
						index,
					);
					cardOptions.push(savedOption);
				});

				cardData = {
					...card,
					options: cardOptions,
				};
			}

			const effectiveUser =
				effectiveUserId !== user.id ? getUserById.get(effectiveUserId) : user;

			return {
				success: true,
				tweet: {
					...tweet,
					author: effectiveUser,
					liked_by_user: false,
					retweeted_by_user: false,
					poll: getPollDataForTweet(tweet.id, user.id),
					attachments: attachments,
					article_preview: articlePreview,
					interactive_card: cardData,
				},
			};
		} catch (error) {
			console.error("Tweet creation error:", error);
			return { error: "Failed to create tweet" };
		}
	})
	.post("/:id/reaction", async ({ jwt, headers, params, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			// Restricted users cannot react
			if (isUserRestrictedById(user.id)) {
				return { error: "Action not allowed: account is restricted" };
			}

			const { id: tweetId } = params;
			const { emoji } = body || {};
			if (!emoji || typeof emoji !== "string")
				return { error: "Emoji is required" };

			const tweet = getTweetById.get(tweetId);
			if (!tweet) return { error: "Tweet not found" };
			// Block interactions on tweets whose author is suspended.
			if (isUserSuspendedById(tweet.user_id)) {
				return { error: "Tweet not found" };
			}

			const blockCheck = db
				.query(
					"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) ",
				)
				.get(user.id, tweet.user_id, tweet.user_id, user.id);
			if (blockCheck) {
				return { error: "You cannot interact with this user" };
			}

			const existing = checkReactionExists.get(user.id, tweetId, emoji);

			if (existing) {
				removeReaction.run(user.id, tweetId, emoji);
				const total = countReactionsForPost.get(tweetId)?.total || 0;
				const topReactions = getTopReactionsForPost.all(tweetId);
				return {
					success: true,
					reacted: false,
					total_reactions: total,
					top_reactions: topReactions,
				};
			} else {
				const reactionId = Bun.randomUUIDv7();
				addReaction.run(reactionId, tweetId, user.id, emoji);
				const total = countReactionsForPost.get(tweetId)?.total || 0;
				const topReactions = getTopReactionsForPost.all(tweetId);

				if (tweet.user_id !== user.id) {
					addNotification(
						tweet.user_id,
						"reaction",
						`${user.name || user.username} reacted to your tweet`,
						tweetId,
						user.id,
						user.username,
						user.name || user.username,
					);
				}

				return {
					success: true,
					reacted: true,
					total_reactions: total,
					top_reactions: topReactions,
				};
			}
		} catch (err) {
			console.error("Reaction toggle error:", err);
			return { error: "Failed to toggle reaction" };
		}
	})
	.get("/:id/reactions", async ({ jwt, headers, params, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { limit = 50 } = query;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			const reactions = listReactionsForPost.all(id, parseInt(limit));
			const total = countReactionsForPost.get(id)?.total || 0;
			const topReactions = getTopReactionsForPost.all(id);

			return {
				success: true,
				reactions,
				total_reactions: total,
				top_reactions: topReactions,
			};
		} catch (err) {
			console.error("Get reactions error:", err);
			return { error: "Failed to get reactions" };
		}
	})
	.get("/:id", async ({ params, jwt, headers, query }) => {
		const { id } = params;
		const { before, limit = 20 } = query;

		const tweet = getTweetById.get(id);
		if (!tweet) {
			return { error: "Tweet not found" };
		}

		// If the tweet's author is suspended or shadowbanned (to non-owning viewers), hide the tweet completely.
		if (isUserSuspendedById(tweet.user_id)) {
			return { error: "Tweet not found" };
		}

		const authorization = headers.authorization;
		if (!authorization) return { error: "Unauthorized" };

		let currentUser = null;
		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (payload) {
				currentUser = getUserByUsername.get(payload.username);
			}
		} catch {
			return { error: "Invalid token" };
		}

		// If author is shadowbanned and the request is not from their account or an admin, hide the tweet
		if (isUserShadowbannedById(tweet.user_id)) {
			if (
				!(
					currentUser &&
					(currentUser.admin || currentUser.id === tweet.user_id)
				)
			) {
				return { error: "Tweet not found" };
			}
		}

		db.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").run(
			id,
		);

		let threadPosts = getTweetWithThread.all(id);
		let replies = before
			? getTweetRepliesBefore.all(id, before, parseInt(limit))
			: getTweetReplies.all(id, parseInt(limit));

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

		users.forEach((user) => {
			if (user.affiliate && user.affiliate_with) {
				const affiliateProfile = getUserById.get(user.affiliate_with);
				if (affiliateProfile) {
					user.affiliate_with_profile = affiliateProfile;
				}
			}
		});

		const userMap = new Map(users.map((user) => [user.id, user]));

		// Remove any shadowbanned posts from the thread/replies unless the viewer is author or admin
		if (
			!(currentUser && (currentUser.admin || currentUser.id === tweet.user_id))
		) {
			threadPosts = threadPosts.filter((p) => {
				const u = userMap.get(p.user_id);
				return !u || !u.shadowbanned;
			});
			replies = replies.filter((p) => {
				const u = userMap.get(p.user_id);
				return !u || !u.shadowbanned;
			});
		}

		const articleIds = new Set();
		if (tweet.article_id) {
			articleIds.add(tweet.article_id);
		}
		threadPosts.forEach((post) => {
			if (post.article_id) {
				articleIds.add(post.article_id);
			}
		});
		replies.forEach((reply) => {
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

		const processedThreadPosts = threadPosts.map((post) => ({
			...post,
			liked_by_user: likedPosts.has(post.id),
			retweeted_by_user: retweetedPosts.has(post.id),
			author: userMap.get(post.user_id),
			poll: getPollDataForTweet(post.id, currentUser.id),
			quoted_tweet: getQuotedTweetData(post.quote_tweet_id, currentUser.id),
			attachments: getTweetAttachments(post.id),
			article_preview: post.article_id
				? articleMap.get(post.article_id) || null
				: null,
			reaction_count: countReactionsForPost.get(post.id)?.total || 0,
			top_reactions: getTopReactionsForPost.all(post.id),
			fact_check: getFactCheckForPost.get(post.id) || null,
			interactive_card: getCardDataForTweet(post.id),
		}));

		const processedReplies = replies.map((reply) => ({
			...reply,
			liked_by_user: likedPosts.has(reply.id),
			retweeted_by_user: retweetedPosts.has(reply.id),
			author: userMap.get(reply.user_id),
			poll: getPollDataForTweet(reply.id, currentUser.id),
			quoted_tweet: getQuotedTweetData(reply.quote_tweet_id, currentUser.id),
			attachments: getTweetAttachments(reply.id),
			article_preview: reply.article_id
				? articleMap.get(reply.article_id) || null
				: null,
			fact_check: getFactCheckForPost.get(reply.id) || null,
			interactive_card: getCardDataForTweet(reply.id),
		}));

		const extendedStats = {
			likes: getTweetLikes.all(tweet.id),
			retweets: getTweetRetweets.all(tweet.id),
			quotes: getTweetQuotes.all(tweet.id),
		};

		const hasMoreReplies = replies.length === parseInt(limit);

		const tweetReactionCount = countReactionsForPost.get(tweet.id)?.total || 0;
		const tweetTopReactions = getTopReactionsForPost.all(tweet.id);

		return {
			tweet: {
				...tweet,
				author: userMap.get(tweet.user_id),
				poll: getPollDataForTweet(tweet.id, currentUser.id),
				quoted_tweet: getQuotedTweetData(tweet.quote_tweet_id, currentUser.id),
				attachments: getTweetAttachments(tweet.id),
				article_preview: tweet.article_id
					? articleMap.get(tweet.article_id) || null
					: null,
				reaction_count: tweetReactionCount,
				top_reactions: tweetTopReactions,
				fact_check: getFactCheckForPost.get(tweet.id) || null,
				interactive_card: getCardDataForTweet(tweet.id),
			},
			threadPosts: processedThreadPosts,
			replies: processedReplies,
			extendedStats,
			hasMoreReplies,
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

			// Restricted users cannot like
			if (isUserRestrictedById(user.id)) {
				return { error: "Action not allowed: account is restricted" };
			}

			const { id } = params;
			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			// Block interactions on tweets whose author is suspended.
			if (isUserSuspendedById(tweet.user_id)) {
				return { error: "Tweet not found" };
			}

			// Prevent liking if either party has blocked the other (blocker cannot be interacted with)
			const blockCheck = db
				.query(
					"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) ",
				)
				.get(user.id, tweet.user_id, tweet.user_id, user.id);
			if (blockCheck) {
				return { error: "You cannot interact with this user" };
			}

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
						user.id,
						user.username,
						user.name || user.username,
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

			// Restricted users cannot retweet
			if (isUserRestrictedById(user.id)) {
				return { error: "Action not allowed: account is restricted" };
			}

			const { id } = params;
			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };
			// Block interactions on tweets whose author is suspended.
			if (isUserSuspendedById(tweet.user_id)) {
				return { error: "Tweet not found" };
			}

			const blockCheck = db
				.query(
					"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) ",
				)
				.get(user.id, tweet.user_id, tweet.user_id, user.id);
			if (blockCheck) {
				return { error: "You cannot interact with this user" };
			}

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
						user.id,
						user.username,
						user.name || user.username,
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

			// Restricted users cannot vote on polls
			if (isUserRestrictedById(user.id)) {
				return { error: "Action not allowed: account is restricted" };
			}

			const { id: tweetId } = params;
			const { optionId } = body;

			if (!optionId) {
				return { error: "Option ID is required" };
			}

			const poll = getPollByPostId.get(tweetId);
			if (!poll) {
				return { error: "Poll not found" };
			}

			// Prevent voting if blocked by the tweet author or vice versa
			const tweet = getTweetById.get(tweetId);
			if (!tweet) return { error: "Tweet not found" };
			// Block interactions on tweets whose author is suspended.
			if (isUserSuspendedById(tweet.user_id)) {
				return { error: "Tweet not found" };
			}
			const blockCheck = db
				.query(
					"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) ",
				)
				.get(user.id, tweet.user_id, tweet.user_id, user.id);
			if (blockCheck) {
				return { error: "You cannot interact with this user" };
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
	})
	.get("/:id/likes", async ({ jwt, headers, params, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { limit = 20 } = query;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };
			// If the tweet's author is suspended, hide replies/can-reply info.
			if (isUserSuspendedById(tweet.user_id)) {
				return { canReply: false, error: "Tweet not found" };
			}

			const likers = getTweetLikers.all(id, parseInt(limit));

			return {
				success: true,
				users: likers,
				type: "likes",
			};
		} catch (error) {
			console.error("Get likers error:", error);
			return { error: "Failed to get likers" };
		}
	})
	.get("/:id/retweets", async ({ jwt, headers, params, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { limit = 20 } = query;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			const retweeters = getTweetRetweeters.all(id, parseInt(limit));

			return {
				success: true,
				users: retweeters,
				type: "retweets",
			};
		} catch (error) {
			console.error("Get retweeters error:", error);
			return { error: "Failed to get retweeters" };
		}
	})
	.get("/:id/quotes", async ({ jwt, headers, params, query }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { limit = 20 } = query;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			const quoters = getTweetQuoters.all(id, parseInt(limit));

			const quoteTweets = quoters
				.map((quoter) => {
					const quoteTweet = getTweetById.get(quoter.quote_tweet_id);
					if (!quoteTweet) return null;

					const author = db
						.query(
							"SELECT id, username, name, avatar, verified FROM users WHERE id = ?",
						)
						.get(quoteTweet.user_id);
					const attachments = db
						.query("SELECT * FROM attachments WHERE post_id = ?")
						.all(quoteTweet.id);
					const liked = db
						.query("SELECT * FROM likes WHERE user_id = ? AND post_id = ?")
						.get(user.id, quoteTweet.id);
					const retweeted = db
						.query("SELECT * FROM retweets WHERE user_id = ? AND post_id = ?")
						.get(user.id, quoteTweet.id);
					const bookmarked = db
						.query("SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?")
						.get(user.id, quoteTweet.id);

					return {
						id: quoteTweet.id,
						content: quoteTweet.content,
						created_at: quoteTweet.created_at,
						author,
						like_count: quoteTweet.like_count || 0,
						retweet_count: quoteTweet.retweet_count || 0,
						reply_count: quoteTweet.reply_count || 0,
						quote_count: quoteTweet.quote_count || 0,
						liked_by_user: !!liked,
						retweeted_by_user: !!retweeted,
						bookmarked_by_user: !!bookmarked,
						attachments: attachments || [],
						source: quoteTweet.source,
						reply_to: quoteTweet.reply_to,
						quote_tweet_id: quoteTweet.quote_tweet_id,
						pinned: quoteTweet.pinned || 0,
					};
				})
				.filter((tweet) => tweet !== null);

			return {
				success: true,
				tweets: quoteTweets,
				type: "quotes",
			};
		} catch (error) {
			console.error("Get quoters error:", error);
			return { error: "Failed to get quoters" };
		}
	})
	.get("/can-reply/:id", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization)
			return { canReply: false, error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { canReply: false, error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { canReply: false, error: "User not found" };

			const { id } = params;
			const tweet = getTweetById.get(id);
			if (!tweet) return { canReply: false, error: "Tweet not found" };

			const tweetAuthor = db
				.query("SELECT * FROM users WHERE id = ?")
				.get(tweet.user_id);
			if (!tweetAuthor)
				return { canReply: false, error: "Tweet author not found" };

			const isBlocked = db
				.query("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
				.get(tweetAuthor.id, user.id);

			if (isBlocked) {
				return { canReply: false, reason: "blocked" };
			}

			const replyRestriction = tweet.reply_restriction || "everyone";

			if (replyRestriction === "everyone") {
				return { canReply: true };
			}

			const canReply = await checkReplyPermission(
				user,
				tweetAuthor,
				replyRestriction,
			);

			return {
				canReply,
				restriction: replyRestriction,
				reason: canReply ? null : "restriction",
			};
		} catch (error) {
			console.error("Check reply permission error:", error);
			return { canReply: false, error: "Failed to check reply permission" };
		}
	})
	.delete("/:id", async ({ jwt, headers, params }) => {
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

			if (tweet.user_id !== user.id && !user.admin) {
				return { error: "You can only delete your own tweets" };
			}

			db.query("DELETE FROM posts WHERE id = ?").run(id);

			return { success: true };
		} catch (error) {
			console.error("Delete tweet error:", error);
			return { error: "Failed to delete tweet" };
		}
	})
	.patch("/:id/reply-restriction", async ({ jwt, headers, params, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { reply_restriction } = body;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			if (tweet.user_id !== user.id) {
				return { error: "You can only modify your own tweets" };
			}

			const validRestrictions = [
				"everyone",
				"followers",
				"following",
				"verified",
			];
			if (!validRestrictions.includes(reply_restriction)) {
				return { error: "Invalid reply restriction" };
			}

			db.query("UPDATE posts SET reply_restriction = ? WHERE id = ?").run(
				reply_restriction,
				id,
			);

			return { success: true };
		} catch (error) {
			console.error("Update reply restriction error:", error);
			return { error: "Failed to update reply restriction" };
		}
	})
	.put("/:id", async ({ jwt, headers, params, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { content } = body;

			const tweet = getTweetById.get(id);
			if (!tweet) return { error: "Tweet not found" };

			if (tweet.user_id !== user.id) {
				return { error: "You can only edit your own tweets" };
			}

			if (tweet.poll_id) {
				return { error: "Cannot edit tweets with polls" };
			}

			if (!content || typeof content !== "string") {
				return { error: "Content is required" };
			}

			const trimmedContent = content.trim();
			if (trimmedContent.length === 0) {
				return { error: "Tweet content cannot be empty" };
			}

			let maxTweetLength = user.character_limit || 400;
			if (!user.character_limit) {
				maxTweetLength = user.gold ? 16500 : user.verified ? 5500 : 400;
			}
			if (trimmedContent.length > maxTweetLength) {
				return {
					error: `Tweet content must be ${maxTweetLength} characters or less`,
				};
			}

			db.query(
				"UPDATE posts SET content = ?, edited_at = datetime('now', 'utc') WHERE id = ?",
			).run(trimmedContent, id);

			const updatedTweet = getTweetById.get(id);

			return {
				success: true,
				tweet: {
					...updatedTweet,
					author: user,
					poll: getPollDataForTweet(updatedTweet.id, user.id),
					quoted_tweet: getQuotedTweetData(
						updatedTweet.quote_tweet_id,
						user.id,
					),
					attachments: getTweetAttachments(updatedTweet.id),
					fact_check: getFactCheckForPost.get(updatedTweet.id) || null,
					interactive_card: getCardDataForTweet(updatedTweet.id),
				},
			};
		} catch (error) {
			console.error("Edit tweet error:", error);
			return { error: "Failed to edit tweet" };
		}
	});
