import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import { checkMultipleRateLimits } from "../helpers/customRateLimit.js";
import ratelimit from "../helpers/ratelimit.js";
import { calculateSpamScoreWithDetails } from "../helpers/spam-detection.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getIdentifier = (headers) => {
	const token = headers.authorization?.split(" ")[1];
	const ip =
		headers["cf-connecting-ip"] ||
		headers["x-forwarded-for"]?.split(",")[0] ||
		"0.0.0.0";
	return token || ip;
};

const getFollowers = db.prepare(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.bio, users.checkmark_outline, users.avatar_outline
  FROM follows
  JOIN users ON follows.follower_id = users.id
	WHERE follows.following_id = ? AND users.suspended = 0 AND users.shadowbanned = 0
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getFollowing = db.prepare(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.bio, users.checkmark_outline, users.avatar_outline
  FROM follows
  JOIN users ON follows.following_id = users.id
	WHERE follows.follower_id = ? AND users.suspended = 0 AND users.shadowbanned = 0
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getUserByUsername = db.prepare(
	`SELECT id, username, created_at, name, avatar, verified, bio, location, website, banner, 
	 follower_count, following_count, suspended, restricted, shadowbanned, private, pronouns, 
	 avatar_radius, gold, gray, affiliate, label_type, label_automated, affiliate_with, selected_community_tag,
	 transparency_location_display, checkmark_outline, avatar_outline
	 FROM users WHERE LOWER(username) = LOWER(?)`,
);

const getUserCustomBadges = db.prepare(`
  SELECT cb.id, cb.name, cb.svg_content, cb.image_url, cb.color, cb.description
  FROM user_custom_badges ucb
  JOIN custom_badges cb ON ucb.badge_id = cb.id
  WHERE ucb.user_id = ?
  ORDER BY ucb.granted_at ASC
`);

const updateProfile = db.prepare(`
  UPDATE users
  SET name = ?, bio = ?, location = ?, website = ?, pronouns = ?, avatar_radius = ?
  WHERE id = ?
`);

const updateThemeAccent = db.prepare(`
	UPDATE users
	SET theme = ?, accent_color = ?
	WHERE id = ?
`);

const updateLabels = db.prepare(`
  UPDATE users
  SET label_type = ?, label_automated = ?
  WHERE id = ?
`);

const updatePrivacy = db.prepare(`
  UPDATE users
  SET private = ?
  WHERE id = ?
`);

const updateTransparencyLocationDisplay = db.prepare(`
  UPDATE users
  SET transparency_location_display = ?
  WHERE id = ?
`);

const updateBanner = db.prepare(`
  UPDATE users
  SET banner = ?
  WHERE id = ?
`);

const updateAvatar = db.prepare(`
  UPDATE users
  SET avatar = ?
  WHERE id = ?
`);

const updateUsername = db.prepare(`
  UPDATE users
  SET username = ?
  WHERE id = ?
`);

const deleteUser = db.prepare(`
  DELETE FROM users WHERE id = ?
`);

const updatePassword = db.prepare(`
  UPDATE users
  SET password_hash = ?
  WHERE id = ?
`);

const updateOutlines = db.prepare(`
  UPDATE users
  SET checkmark_outline = ?, avatar_outline = ?
  WHERE id = ?
`);

const getUserReplies = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NOT NULL
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getUserRepliesPaginated = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NOT NULL AND posts.id < ?
  ORDER BY posts.created_at DESC 
  LIMIT ?
`);

const getUserMedia = db.prepare(`
  SELECT DISTINCT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  JOIN attachments ON posts.id = attachments.post_id
  WHERE posts.user_id = ? AND users.suspended = 0 AND (attachments.file_type LIKE 'image/%' OR attachments.file_type LIKE 'video/%')
  ORDER BY posts.created_at DESC
  LIMIT ?
`);

const getUserMediaPaginated = db.prepare(`
  SELECT DISTINCT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  JOIN attachments ON posts.id = attachments.post_id
  WHERE posts.user_id = ? AND posts.id < ? AND users.suspended = 0 AND (attachments.file_type LIKE 'image/%' OR attachments.file_type LIKE 'video/%')
  ORDER BY posts.created_at DESC
  LIMIT ?
`);

const getUserPostsPaginated = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NULL AND users.suspended = 0 AND posts.id < ?
  ORDER BY posts.created_at DESC
  LIMIT ?
`);

const getUserRetweetsPaginated = db.prepare(`
  SELECT 
    original_posts.*,
    original_users.username, original_users.name, original_users.avatar, original_users.verified, original_users.gold, original_users.gray, original_users.avatar_radius, original_users.affiliate, original_users.affiliate_with, original_users.selected_community_tag, original_users.checkmark_outline, original_users.avatar_outline,
    retweets.created_at as retweet_created_at,
    retweets.post_id as original_post_id,
    retweets.id as retweet_id
  FROM retweets
  JOIN posts original_posts ON retweets.post_id = original_posts.id
  JOIN users original_users ON original_posts.user_id = original_users.id
  WHERE retweets.user_id = ? AND retweets.id < ?
  ORDER BY retweets.created_at DESC
  LIMIT ?
`);

const getFollowStatus = db.prepare(`
	SELECT id, notify_tweets FROM follows WHERE follower_id = ? AND following_id = ?
`);

const updateFollowNotificationPreference = db.prepare(
	`UPDATE follows SET notify_tweets = ? WHERE follower_id = ? AND following_id = ?`,
);

const addFollow = db.prepare(`
  INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)
`);

const removeFollow = db.prepare(`
	DELETE FROM follows WHERE follower_id = ? AND following_id = ?
`);

const getFollowRequest = db.prepare(`
  SELECT * FROM follow_requests WHERE requester_id = ? AND target_id = ?
`);

const createFollowRequest = db.prepare(`
  INSERT INTO follow_requests (id, requester_id, target_id) VALUES (?, ?, ?)
`);

const approveFollowRequest = db.prepare(`
  UPDATE follow_requests 
  SET status = 'approved', responded_at = datetime('now', 'utc')
  WHERE id = ?
`);

const denyFollowRequest = db.prepare(`
  UPDATE follow_requests 
  SET status = 'denied', responded_at = datetime('now', 'utc')
  WHERE id = ?
`);

const deleteFollowRequest = db.prepare(`
  DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?
`);

const getAffiliateRequest = db.prepare(
	`SELECT * FROM affiliate_requests WHERE requester_id = ? AND target_id = ?`,
);

const createAffiliateRequest = db.prepare(
	`INSERT INTO affiliate_requests (id, requester_id, target_id) VALUES (?, ?, ?)`,
);

const updateUserAffiliateWith = db.prepare(
	`UPDATE users SET affiliate = ?, affiliate_with = ? WHERE id = ?`,
);

const getUserById = db.prepare(
	`SELECT id, username, name, avatar, verified, gold, avatar_radius FROM users WHERE id = ?`,
);

const getFactCheckForPost = db.prepare(`
  SELECT fc.*, u.username as admin_username, u.name as admin_name
  FROM fact_checks fc
  JOIN users u ON fc.created_by = u.id
  WHERE fc.post_id = ?
  LIMIT 1
`);

const getPendingAffiliateRequests = db.prepare(`
  SELECT ar.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius, u.bio
  FROM affiliate_requests ar
  JOIN users u ON ar.requester_id = u.id
  WHERE ar.target_id = ? AND ar.status = 'pending'
  ORDER BY ar.created_at DESC
`);

const approveAffiliateRequest = db.prepare(
	`UPDATE affiliate_requests SET status = 'approved', responded_at = datetime('now', 'utc') WHERE id = ?`,
);

const denyAffiliateRequest = db.prepare(
	`UPDATE affiliate_requests SET status = 'denied', responded_at = datetime('now', 'utc') WHERE id = ?`,
);

const getAffiliatesList = db.prepare(`
  SELECT u.id, u.username, u.name, u.avatar, u.verified, u.gold, u.gray, u.avatar_radius, u.checkmark_outline, u.avatar_outline, u.selected_community_tag, u.bio
  FROM users u
  WHERE u.affiliate = 1 AND u.affiliate_with = ?
  ORDER BY u.created_at DESC
`);

const getPendingFollowRequests = db.prepare(`
  SELECT fr.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius, u.bio
  FROM follow_requests fr
  JOIN users u ON fr.requester_id = u.id
  WHERE fr.target_id = ? AND fr.status = 'pending'
  ORDER BY fr.created_at DESC
`);

const getFollowCounts = db.prepare(`
	SELECT 
		((SELECT COUNT(*) FROM follows WHERE follower_id = ?) + (SELECT COUNT(*) FROM ghost_follows WHERE follower_type = 'following' AND target_id = ?)) AS following_count,
		((SELECT COUNT(*) FROM follows WHERE following_id = ?) + (SELECT COUNT(*) FROM ghost_follows WHERE follower_type = 'follower' AND target_id = ?)) AS follower_count,
		(SELECT COUNT(*) FROM posts WHERE user_id = ? AND reply_to IS NULL) AS post_count
`);

const getPollByPostId = db.prepare(`
  SELECT * FROM polls WHERE post_id = ?
`);

const getPollOptions = db.prepare(`
  SELECT * FROM poll_options WHERE poll_id = ? ORDER BY option_order ASC
`);

const getUserPollVote = db.prepare(`
  SELECT option_id FROM poll_votes WHERE user_id = ? AND poll_id = ?
`);

const getTotalPollVotes = db.prepare(`
  SELECT SUM(vote_count) as total FROM poll_options WHERE poll_id = ?
`);

const getPollVoters = db.prepare(`
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getQuotedTweet = db.prepare(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const getAttachmentsByPostId = db.prepare(`
  SELECT * FROM attachments WHERE post_id = ?
`);
const isSuspendedQuery = db.prepare(
	`SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'suspend' AND (expires_at IS NULL OR expires_at > datetime('now'))`,
);
const getUserSuspendedFlag = db.prepare(`
  SELECT suspended FROM users WHERE id = ?
`);

const isRestrictedQuery = db.prepare(`
	SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);
const getUserRestrictedFlag = db.prepare(`
	SELECT restricted FROM users WHERE id = ?
`);

const _isUserRestrictedById = (userId) => {
	const r = isRestrictedQuery.get(userId);
	const f = getUserRestrictedFlag.get(userId);
	return !!r || !!f?.restricted;
};

const getTweetAttachments = (tweetId) => {
	return getAttachmentsByPostId.all(tweetId);
};

const getCardByPostId = db.prepare(`
  SELECT * FROM interactive_cards WHERE post_id = ?
`);

const getCardOptions = db.prepare(`
  SELECT * FROM interactive_card_options WHERE card_id = ? ORDER BY option_order ASC
`);

const getBlockStatus = db.prepare(`
	SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?
`);

const getTweetForPin = db.prepare(`
	SELECT * FROM posts WHERE id = ? AND user_id = ?
`);

const getExistingPinnedTweet = db.prepare(`
	SELECT * FROM posts WHERE user_id = ? AND pinned = 1
`);

const unpinTweet = db.prepare(`
	UPDATE posts SET pinned = 0 WHERE id = ?
`);

const pinTweet = db.prepare(`
	UPDATE posts SET pinned = 1 WHERE id = ?
`);

const getCommunityMembership = db.prepare(`
	SELECT * FROM community_members WHERE user_id = ? AND community_id = ? AND banned = FALSE
`);

const getCommunityById = db.prepare(`
	SELECT * FROM communities WHERE id = ?
`);

const clearCommunityTag = db.prepare(`
	UPDATE users SET selected_community_tag = NULL WHERE id = ?
`);

const updateCommunityTag = db.prepare(`
	UPDATE users SET selected_community_tag = ? WHERE id = ?
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

	const suspensionRow = isSuspendedQuery.get(quotedTweet.user_id);
	const userSuspendedFlag = getUserSuspendedFlag.get(quotedTweet.user_id);
	const authorSuspended = !!suspensionRow || !!userSuspendedFlag?.suspended;

	if (authorSuspended) {
		return {
			id: quotedTweet.id,
			unavailable_reason: "suspended",
			created_at: quotedTweet.created_at,
		};
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

	if (quotedTweet.selected_community_tag) {
		const community = db
			.query(
				"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
			)
			.get(quotedTweet.selected_community_tag);
		if (community?.tag_enabled) {
			author.community_tag = {
				community_id: community.id,
				community_name: community.name,
				emoji: community.tag_emoji,
				text: community.tag_text,
			};
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

const getPollDataForPost = getPollDataForTweet;
const getQuotedPostData = getQuotedTweetData;
const getPostAttachments = getTweetAttachments;

export default new Elysia({ prefix: "/profile", tags: ["Profile"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 240_000,
			max: 300,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get("/:username", async ({ params, jwt, headers }) => {
		try {
			const { username } = params;

			const user = getUserByUsername.get(username);
			if (!user) {
				return { error: "User not found" };
			}

			const counts = getFollowCounts.get(
				user.id,
				user.id,
				user.id,
				user.id,
				user.id,
			);

			const suspensionRow = isSuspendedQuery.get(user.id);
			const userSuspendedFlag = getUserSuspendedFlag.get(user.id);
			const isSuspended = !!suspensionRow || !!userSuspendedFlag?.suspended;

			if (isSuspended) {
				const minimalProfile = {
					username: user.username,
					name: user.name,
					avatar: user.avatar || null,
					banner: user.banner || null,
					created_at: user.created_at || null,
					following_count: counts?.following_count || 0,
					follower_count: counts?.follower_count || 0,
					post_count: counts?.post_count || 0,
				};

				return { error: "User is suspended", profile: minimalProfile };
			}

			const userPostsQuery = db.query(`
				SELECT posts.*, users.username, users.name, users.avatar, users.verified, users.gold, users.gray, users.avatar_radius, users.affiliate, users.affiliate_with, users.selected_community_tag, users.checkmark_outline, users.avatar_outline
				FROM posts 
				JOIN users ON posts.user_id = users.id 
				WHERE posts.user_id = ? AND posts.reply_to IS NULL AND users.suspended = 0
				ORDER BY posts.pinned DESC, posts.created_at DESC
				LIMIT 10
			`);
			const userRetweetsQuery = db.query(`
				SELECT 
					original_posts.*,
					original_users.username, original_users.name, original_users.avatar, original_users.verified, original_users.gold, original_users.gray, original_users.avatar_radius, original_users.affiliate, original_users.affiliate_with, original_users.selected_community_tag, original_users.checkmark_outline, original_users.avatar_outline,
					retweets.created_at as retweet_created_at,
					retweets.post_id as original_post_id
				FROM retweets
				JOIN posts original_posts ON retweets.post_id = original_posts.id
				JOIN users original_users ON original_posts.user_id = original_users.id
				WHERE retweets.user_id = ?
				ORDER BY retweets.created_at DESC
				LIMIT 10
			`);

			const userPosts = userPostsQuery.all(user.id);
			const userRetweets = userRetweetsQuery.all(user.id);

			const profile = {
				...user,
				following_count: counts.following_count,
				follower_count: counts.follower_count,
				post_count: counts.post_count,
			};

			if (profile.affiliate_with) {
				try {
					const aff = getUserById.get(profile.affiliate_with);
					if (aff) {
						profile.affiliate_with_profile = aff;
					}
				} catch {}
			}

			if (profile.selected_community_tag) {
				const community = db
					.query(
						"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
					)
					.get(profile.selected_community_tag);
				if (community?.tag_enabled) {
					profile.community_tag = {
						community_id: community.id,
						community_name: community.name,
						emoji: community.tag_emoji,
						text: community.tag_text,
					};
				}
			}

			let isFollowing = false;
			let followsMe = false;
			let isOwnProfile = false;
			let currentUserId = null;
			let followRequestStatus = null;
			let notifyTweetsSetting = false;

			const authorization = headers.authorization;
			if (authorization) {
				try {
					const payload = await jwt.verify(
						authorization.replace("Bearer ", ""),
					);
					if (payload) {
						const currentUser = getUserByUsername.get(payload.username);
						if (currentUser) {
							currentUserId = currentUser.id;
							isOwnProfile = currentUser.id === user.id;
							if (!isOwnProfile) {
								const followStatus = getFollowStatus.get(
									currentUser.id,
									user.id,
								);
								isFollowing = !!followStatus;
								notifyTweetsSetting = !!followStatus?.notify_tweets;

								const followsBackStatus = getFollowStatus.get(
									user.id,
									currentUser.id,
								);
								followsMe = !!followsBackStatus;

								if (!isFollowing) {
									const followRequest = getFollowRequest.get(
										currentUser.id,
										user.id,
									);
									followRequestStatus = followRequest?.status || null;
								}
							}
						}
					}
				} catch {}
			}

			let blockedByProfile = false;
			let blockedProfile = false;
			if (currentUserId && !isOwnProfile) {
				const blockedRow = getBlockStatus.get(user.id, currentUserId);
				blockedByProfile = !!blockedRow;

				const myBlockRow = getBlockStatus.get(currentUserId, user.id);
				blockedProfile = !!myBlockRow;
			}

			profile.blockedByProfile = blockedByProfile;
			profile.blockedProfile = blockedProfile;
			profile.notifyTweets = notifyTweetsSetting;

			if (user.shadowbanned && !isOwnProfile) {
				try {
					const payload = headers.authorization
						? await jwt.verify(headers.authorization.replace("Bearer ", ""))
						: null;
					const currentUser = payload
						? getUserByUsername.get(payload.username)
						: null;
					if (!currentUser?.admin) {
						const minimalProfile = {
							username: user.username,
							name: user.name,
							avatar: user.avatar || null,
							banner: user.banner || null,
							created_at: user.created_at || null,
							following_count: counts?.following_count || 0,
							follower_count: counts?.follower_count || 0,
							post_count: counts?.post_count || 0,
						};
						return { error: "User is shadowbanned", profile: minimalProfile };
					}
				} catch {}
			}

			const allContent = [
				...userPosts.map((post) => ({
					...post,
					content_type: "post",
					sort_date: new Date(post.created_at),
				})),
				...userRetweets.map((retweet) => ({
					...retweet,
					content_type: "retweet",
					sort_date: new Date(retweet.retweet_created_at),
					retweet_created_at: retweet.retweet_created_at,
				})),
			]
				.sort((a, b) => {
					if (a.pinned && !b.pinned) return -1;
					if (!a.pinned && b.pinned) return 1;
					return b.sort_date - a.sort_date;
				})
				.slice(0, 20);

			const allPostsAndReplies = [...allContent];
			const affiliateIds = new Set();
			if (profile.affiliate_with) affiliateIds.add(profile.affiliate_with);
			for (const item of allPostsAndReplies) {
				if (item.affiliate && item.affiliate_with) {
					affiliateIds.add(item.affiliate_with);
				}
			}
			const affiliateProfilesMap = new Map();
			if (affiliateIds.size > 0) {
				const affiliateProfiles = db
					.query(`
					SELECT id, username, name, avatar, verified, gold, avatar_radius 
					FROM users WHERE id IN (${[...affiliateIds].map(() => "?").join(",")})
				`)
					.all(...affiliateIds);
				for (const aff of affiliateProfiles) {
					affiliateProfilesMap.set(aff.id, aff);
				}
			}

			if (
				profile.affiliate_with &&
				affiliateProfilesMap.has(profile.affiliate_with)
			) {
				profile.affiliate_with_profile = affiliateProfilesMap.get(
					profile.affiliate_with,
				);
			}

			for (const item of allPostsAndReplies) {
				const author = {
					username: item.username,
					name: item.name,
					avatar: item.avatar,
					verified: item.verified || false,
					gold: item.gold || false,
					gray: item.gray || false,
					avatar_radius: item.avatar_radius || null,
					checkmark_outline: item.checkmark_outline || null,
					avatar_outline: item.avatar_outline || null,
					affiliate: item.affiliate || false,
					affiliate_with: item.affiliate_with || null,
				};
				if (
					author.affiliate &&
					author.affiliate_with &&
					affiliateProfilesMap.has(author.affiliate_with)
				) {
					author.affiliate_with_profile = affiliateProfilesMap.get(
						author.affiliate_with,
					);
				}

				if (item.selected_community_tag) {
					const community = db
						.query(
							"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
						)
						.get(item.selected_community_tag);
					if (community?.tag_enabled) {
						author.community_tag = {
							community_id: community.id,
							community_name: community.name,
							emoji: community.tag_emoji,
							text: community.tag_text,
						};
					}
				}

				item.author = author;
			}

			let posts = [];

			if (user.private && !isFollowing && !isOwnProfile) {
				posts = [];
			} else {
				const allPostIds = allContent.map((p) => p.id);
				const allIds = [...allPostIds];

				const attachmentsMap = new Map();
				const factChecksMap = new Map();

				if (allIds.length > 0) {
					const attachments = db
						.query(`
						SELECT * FROM attachments WHERE post_id IN (${allIds.map(() => "?").join(",")})
					`)
						.all(...allIds);
					for (const att of attachments) {
						if (!attachmentsMap.has(att.post_id))
							attachmentsMap.set(att.post_id, []);
						attachmentsMap.get(att.post_id).push(att);
					}

					const factChecks = db
						.query(`
						SELECT fc.*, u.username as admin_username, u.name as admin_name
						FROM fact_checks fc
						JOIN users u ON fc.created_by = u.id
						WHERE fc.post_id IN (${allIds.map(() => "?").join(",")})
					`)
						.all(...allIds);
					for (const fc of factChecks) {
						factChecksMap.set(fc.post_id, fc);
					}
				}

				posts = allContent.map((post) => ({
					...post,
					poll: getPollDataForPost(post.id, currentUserId),
					quoted_tweet: getQuotedPostData(post.quote_tweet_id, currentUserId),
					attachments: attachmentsMap.get(post.id) || [],
					liked_by_user: false,
					retweeted_by_user: false,
					fact_check: factChecksMap.get(post.id) || null,
					interactive_card: getCardDataForTweet(post.id),
				}));
			}

			if (
				currentUserId &&
				allContent.length > 0 &&
				(!user.private || isFollowing || isOwnProfile)
			) {
				try {
					const postIds = allContent.map((p) => p.id);
					const likesQuery = db.query(`
						SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds
							.map(() => "?")
							.join(",")})
					`);
					const retweetsQuery = db.query(`
						SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${postIds
							.map(() => "?")
							.join(",")})
					`);

					const likedPosts = likesQuery.all(currentUserId, ...postIds);
					const retweetedPosts = retweetsQuery.all(currentUserId, ...postIds);

					const likedPostsSet = new Set(likedPosts.map((like) => like.post_id));
					const retweetedPostsSet = new Set(
						retweetedPosts.map((retweet) => retweet.post_id),
					);

					posts.forEach((post) => {
						post.liked_by_user = likedPostsSet.has(post.id);
						post.retweeted_by_user = retweetedPostsSet.has(post.id);
					});
				} catch (e) {
					console.warn("Failed to fetch likes/retweets:", e);
				}
			}

			const customBadges = getUserCustomBadges.all(user.id);

			return {
				profile,
				posts,
				replies: [],
				isFollowing,
				followsMe,
				isOwnProfile,
				followRequestStatus,
				customBadges,
			};
		} catch (error) {
			console.error("Profile fetch error:", error);
			return { error: "Failed to fetch profile" };
		}
	})
	.get(
		"/:username/replies",
		async ({ params, query: queryParams, headers, jwt }) => {
			try {
				const { username } = params;

				const user = getUserByUsername.get(username);
				if (!user) {
					return { error: "User not found" };
				}

				const before = queryParams.before;
				const limit = parseInt(queryParams.limit || "20", 10);

				let replies;
				if (before) {
					replies = getUserRepliesPaginated.all(user.id, before, limit);
				} else {
					replies = getUserReplies.all(user.id);
				}

				let currentUserId = null;
				const authorization = headers.authorization;
				if (authorization) {
					try {
						const payload = await jwt.verify(
							authorization.replace("Bearer ", ""),
						);
						if (payload) {
							const currentUser = getUserByUsername.get(payload.username);
							if (currentUser) {
								currentUserId = currentUser.id;
							}
						}
					} catch {}
				}

				const processedReplies = replies.map((reply) => {
					const author = {
						username: reply.username,
						name: reply.name,
						avatar: reply.avatar || null,
						verified: reply.verified || false,
						gold: reply.gold || false,
						gray: reply.gray || false,
						avatar_radius: reply.avatar_radius || null,
						affiliate: reply.affiliate || false,
						affiliate_with: reply.affiliate_with || null,
						checkmark_outline: reply.checkmark_outline || null,
						avatar_outline: reply.avatar_outline || null,
					};

					if (author.affiliate && author.affiliate_with) {
						const affiliateProfile = getUserById.get(author.affiliate_with);
						if (affiliateProfile) {
							author.affiliate_with_profile = affiliateProfile;
						}
					}

					if (reply.selected_community_tag) {
						const community = db
							.query(
								"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
							)
							.get(reply.selected_community_tag);
						if (community?.tag_enabled) {
							author.community_tag = {
								community_id: community.id,
								community_name: community.name,
								emoji: community.tag_emoji,
								text: community.tag_text,
							};
						}
					}

					return {
						...reply,
						author,
						poll: getPollDataForPost(reply.id, currentUserId),
						quoted_tweet: getQuotedPostData(
							reply.quote_tweet_id,
							currentUserId,
						),
						attachments: getPostAttachments(reply.id),
						liked_by_user: false,
						retweeted_by_user: false,
						fact_check: getFactCheckForPost.get(reply.id) || null,
						interactive_card: getCardDataForTweet(reply.id),
					};
				});

				if (currentUserId && replies.length > 0) {
					try {
						const replyIds = replies.map((r) => r.id);
						const likesQuery = db.query(`
            SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${replyIds
							.map(() => "?")
							.join(",")})
          `);
						const retweetsQuery = db.query(`
            SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${replyIds
							.map(() => "?")
							.join(",")})
          `);

						const likedPosts = likesQuery.all(currentUserId, ...replyIds);
						const retweetedPosts = retweetsQuery.all(
							currentUserId,
							...replyIds,
						);

						const likedPostsSet = new Set(
							likedPosts.map((like) => like.post_id),
						);
						const retweetedPostsSet = new Set(
							retweetedPosts.map((retweet) => retweet.post_id),
						);

						processedReplies.forEach((reply) => {
							reply.liked_by_user = likedPostsSet.has(reply.id);
							reply.retweeted_by_user = retweetedPostsSet.has(reply.id);
						});
					} catch (e) {
						console.warn("Failed to fetch likes/retweets for replies:", e);
					}
				}

				return {
					replies: processedReplies,
				};
			} catch (error) {
				console.error("Replies fetch error:", error);
				return { error: "Failed to fetch replies" };
			}
		},
	)
	.get("/:username/media", async ({ params, query: queryParams }) => {
		try {
			const { username } = params;

			const user = getUserByUsername.get(username);
			if (!user) {
				return { error: "User not found" };
			}

			const before = queryParams.before;
			const limit = parseInt(queryParams.limit || "20", 10);

			let media;
			if (before) {
				media = getUserMediaPaginated.all(user.id, before, limit);
			} else {
				media = getUserMedia.all(user.id, limit);
			}

			const processedMedia = media.map((post) => {
				const author = {
					username: post.username,
					name: post.name,
					avatar: post.avatar || null,
					verified: post.verified || false,
					gold: post.gold || false,
					gray: post.gray || false,
					avatar_radius: post.avatar_radius || null,
					affiliate: post.affiliate || false,
					affiliate_with: post.affiliate_with || null,
					checkmark_outline: post.checkmark_outline || null,
					avatar_outline: post.avatar_outline || null,
				};

				if (author.affiliate && author.affiliate_with) {
					const affiliateProfile = getUserById.get(author.affiliate_with);
					if (affiliateProfile) {
						author.affiliate_with_profile = affiliateProfile;
					}
				}

				if (post.selected_community_tag) {
					const community = db
						.query(
							"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
						)
						.get(post.selected_community_tag);
					if (community?.tag_enabled) {
						author.community_tag = {
							community_id: community.id,
							community_name: community.name,
							emoji: community.tag_emoji,
							text: community.tag_text,
						};
					}
				}

				return {
					...post,
					author,
					attachments: getPostAttachments(post.id),
					fact_check: getFactCheckForPost.get(post.id) || null,
				};
			});

			return {
				media: processedMedia,
			};
		} catch (error) {
			console.error("Media fetch error:", error);
			return { error: "Failed to fetch media" };
		}
	})
	.get(
		"/:username/posts",
		async ({ params, query: queryParams, headers, jwt }) => {
			try {
				const { username } = params;
				const user = getUserByUsername.get(username);
				if (!user) {
					return { error: "User not found" };
				}

				const before = queryParams.before;
				const limit = parseInt(queryParams.limit || "10", 10);

				let userPosts = [];
				let userRetweets = [];

				if (before) {
					userPosts = getUserPostsPaginated.all(user.id, before, limit);
					userRetweets = getUserRetweetsPaginated.all(user.id, before, limit);
				} else {
					return { error: "before parameter required" };
				}

				const allContent = [
					...userPosts.map((post) => ({
						...post,
						content_type: "post",
						sort_date: new Date(post.created_at),
					})),
					...userRetweets.map((retweet) => ({
						...retweet,
						content_type: "retweet",
						sort_date: new Date(retweet.retweet_created_at),
						retweet_created_at: retweet.retweet_created_at,
					})),
				]
					.sort((a, b) => b.sort_date - a.sort_date)
					.slice(0, limit);

				let currentUserId = null;
				const authorization = headers.authorization;
				if (authorization) {
					try {
						const payload = await jwt.verify(
							authorization.replace("Bearer ", ""),
						);
						if (payload) {
							const currentUser = getUserByUsername.get(payload.username);
							if (currentUser) currentUserId = currentUser.id;
						}
					} catch {}
				}

				const affiliateIds = new Set();
				for (const item of allContent) {
					if (item.affiliate && item.affiliate_with) {
						affiliateIds.add(item.affiliate_with);
					}
				}
				const affiliateProfilesMap = new Map();
				if (affiliateIds.size > 0) {
					const affiliateProfiles = db
						.query(`
					SELECT id, username, name, avatar, verified, gold, avatar_radius 
					FROM users WHERE id IN (${[...affiliateIds].map(() => "?").join(",")})
				`)
						.all(...affiliateIds);
					for (const aff of affiliateProfiles) {
						affiliateProfilesMap.set(aff.id, aff);
					}
				}

				for (const item of allContent) {
					const author = {
						username: item.username,
						name: item.name,
						avatar: item.avatar,
						verified: item.verified || false,
						gold: item.gold || false,
						gray: item.gray || false,
						avatar_radius: item.avatar_radius || null,
						affiliate: item.affiliate || false,
						affiliate_with: item.affiliate_with || null,
						checkmark_outline: item.checkmark_outline || null,
						avatar_outline: item.avatar_outline || null,
					};
					if (
						author.affiliate &&
						author.affiliate_with &&
						affiliateProfilesMap.has(author.affiliate_with)
					) {
						author.affiliate_with_profile = affiliateProfilesMap.get(
							author.affiliate_with,
						);
					}

					if (item.selected_community_tag) {
						const community = db
							.query(
								"SELECT id, name, tag_enabled, tag_emoji, tag_text FROM communities WHERE id = ?",
							)
							.get(item.selected_community_tag);
						if (community?.tag_enabled) {
							author.community_tag = {
								community_id: community.id,
								community_name: community.name,
								emoji: community.tag_emoji,
								text: community.tag_text,
							};
						}
					}

					item.author = author;
				}

				const allPostIds = allContent.map((p) => p.id);
				const attachmentsMap = new Map();
				const factChecksMap = new Map();

				if (allPostIds.length > 0) {
					const attachments = db
						.query(`
					SELECT * FROM attachments WHERE post_id IN (${allPostIds.map(() => "?").join(",")})
				`)
						.all(...allPostIds);
					for (const att of attachments) {
						if (!attachmentsMap.has(att.post_id))
							attachmentsMap.set(att.post_id, []);
						attachmentsMap.get(att.post_id).push(att);
					}

					const factChecks = db
						.query(`
					SELECT fc.*, u.username as admin_username, u.name as admin_name
					FROM fact_checks fc
					JOIN users u ON fc.created_by = u.id
					WHERE fc.post_id IN (${allPostIds.map(() => "?").join(",")})
				`)
						.all(...allPostIds);
					for (const fc of factChecks) {
						factChecksMap.set(fc.post_id, fc);
					}
				}

				const posts = allContent.map((post) => ({
					...post,
					poll: getPollDataForPost(post.id, currentUserId),
					quoted_tweet: getQuotedPostData(post.quote_tweet_id, currentUserId),
					attachments: attachmentsMap.get(post.id) || [],
					liked_by_user: false,
					retweeted_by_user: false,
					fact_check: factChecksMap.get(post.id) || null,
					interactive_card: getCardDataForTweet(post.id),
				}));

				if (currentUserId && posts.length > 0) {
					try {
						const postIds = posts.map((p) => p.id);
						const likesQuery = db.query(`
						SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})
					`);
						const retweetsQuery = db.query(`
						SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})
					`);
						const likedPosts = likesQuery.all(currentUserId, ...postIds);
						const retweetedPosts = retweetsQuery.all(currentUserId, ...postIds);
						const likedPostsSet = new Set(
							likedPosts.map((like) => like.post_id),
						);
						const retweetedPostsSet = new Set(
							retweetedPosts.map((retweet) => retweet.post_id),
						);
						posts.forEach((post) => {
							post.liked_by_user = likedPostsSet.has(post.id);
							post.retweeted_by_user = retweetedPostsSet.has(post.id);
						});
					} catch (e) {
						console.warn("Failed to fetch likes/retweets:", e);
					}
				}

				return { posts };
			} catch (error) {
				console.error("Posts fetch error:", error);
				return { error: "Failed to fetch posts" };
			}
		},
	)
	.put("/:username", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot edit profile settings" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only edit your own profile" };
			}

			const { name, bio, location, website, pronouns } = body;

			const { theme, accent_color } = body;

			const { label_type, label_automated } = body;

			let radiusToStore = currentUser.avatar_radius;
			if (body.avatar_radius !== undefined) {
				if (!currentUser.gold && !currentUser.gray) {
					return {
						error:
							"Only gold or gray check accounts can customize avatar corner radius",
					};
				}
				const parsed = parseInt(body.avatar_radius, 10);
				if (Number.isNaN(parsed) || parsed < 0 || parsed > 1000) {
					return { error: "Invalid avatar radius" };
				}
				radiusToStore = parsed;
			}

			if (name && name.length > 50) {
				return { error: "Display name must be 50 characters or less" };
			}

			if (bio && bio.length > 160) {
				return { error: "Bio must be 160 characters or less" };
			}

			if (location && location.length > 30) {
				return { error: "Location must be 30 characters or less" };
			}

			if (website && website.length > 100) {
				return { error: "Website must be 100 characters or less" };
			}

			if (pronouns && pronouns.length > 30) {
				return { error: "Pronouns must be 30 characters or less" };
			}

			if (label_type !== undefined) {
				const validLabels = ["parody", "fan", "commentary", null];
				if (!validLabels.includes(label_type)) {
					return {
						error:
							"Invalid label type. Must be parody, fan, commentary, or none",
					};
				}
			}

			const labelTypeToStore =
				label_type !== undefined ? label_type : currentUser.label_type;
			const labelAutomatedToStore =
				label_automated !== undefined
					? !!label_automated
					: currentUser.label_automated || false;

			updateProfile.run(
				name || currentUser.name,
				bio !== undefined ? bio : currentUser.bio,
				location !== undefined ? location : currentUser.location,
				website !== undefined ? website : currentUser.website,
				pronouns !== undefined ? pronouns : currentUser.pronouns,
				radiusToStore,
				currentUser.id,
			);
			if (theme !== undefined || accent_color !== undefined) {
				updateThemeAccent.run(
					theme !== undefined ? theme : currentUser.theme,
					accent_color !== undefined ? accent_color : currentUser.accent_color,
					currentUser.id,
				);
			}

			if (label_type !== undefined || label_automated !== undefined) {
				updateLabels.run(
					labelTypeToStore,
					labelAutomatedToStore,
					currentUser.id,
				);
			}

			const updatedUser = getUserByUsername.get(currentUser.username);
			return { success: true, profile: updatedUser };
		} catch (error) {
			console.error("Profile update error:", error);
			return { error: "Failed to update profile" };
		}
	})
	.post("/:username/follow", async ({ params, jwt, headers, set }) => {
		try {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const identifier = getIdentifier(headers);
			const rateLimitResult = checkMultipleRateLimits(identifier, [
				"follow",
				"followBurst",
			]);
			if (rateLimitResult.isLimited) {
				set.status = 429;
				return {
					error: "Too many requests",
					resetIn: rateLimitResult.resetIn,
				};
			}

			const { username } = params;
			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			if (currentUser.id === targetUser.id) {
				return { error: "You cannot follow yourself" };
			}

			const blocked = db
				.query(
					"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
				)
				.get(currentUser.id, targetUser.id, targetUser.id, currentUser.id);
			if (blocked) {
				return { error: "Cannot follow this user" };
			}

			const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
			if (existingFollow) {
				return { error: "Already following this user" };
			}

			const existingRequest = getFollowRequest.get(
				currentUser.id,
				targetUser.id,
			);
			if (existingRequest) {
				if (existingRequest.status === "pending") {
					return { error: "Follow request already sent" };
				}
				if (existingRequest.status === "denied") {
					deleteFollowRequest.run(currentUser.id, targetUser.id);
				}
			}

			if (targetUser.private) {
				const requestId = Bun.randomUUIDv7();
				createFollowRequest.run(requestId, currentUser.id, targetUser.id);

				addNotification(
					targetUser.id,
					"follow_request",
					`has requested to follow you`,
					currentUser.username,
					currentUser.id,
					currentUser.username,
					currentUser.name || currentUser.username,
				);

				return { success: true, requestSent: true };
			} else {
				const followId = Bun.randomUUIDv7();
				addFollow.run(followId, currentUser.id, targetUser.id);

				addNotification(
					targetUser.id,
					"follow",
					`followed you`,
					currentUser.username,
					currentUser.id,
					currentUser.username,
					currentUser.name || currentUser.username,
				);

				return { success: true, requestSent: false };
			}
		} catch (error) {
			console.error("Follow error:", error);
			return { error: "Failed to follow user" };
		}
	})
	.delete("/:username/follow", async ({ params, jwt, headers, set }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const identifier = getIdentifier(headers);
			const rateLimitResult = checkMultipleRateLimits(identifier, [
				"follow",
				"followBurst",
			]);
			if (rateLimitResult.isLimited) {
				set.status = 429;
				return {
					error: "Too many requests",
					resetIn: rateLimitResult.resetIn,
				};
			}

			const { username } = params;
			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
			const existingRequest = getFollowRequest.get(
				currentUser.id,
				targetUser.id,
			);

			if (existingFollow) {
				removeFollow.run(currentUser.id, targetUser.id);
				return { success: true, action: "unfollowed" };
			} else if (existingRequest && existingRequest.status === "pending") {
				deleteFollowRequest.run(currentUser.id, targetUser.id);
				return { success: true, action: "request_cancelled" };
			} else {
				return { error: "Not following this user and no pending request" };
			}
		} catch (error) {
			console.error("Unfollow error:", error);
			return { error: "Failed to unfollow user" };
		}
	})
	.post("/:username/notify-tweets", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			if (currentUser.id === targetUser.id) {
				return { error: "You cannot enable notifications for yourself" };
			}

			const followStatus = getFollowStatus.get(currentUser.id, targetUser.id);
			if (!followStatus) {
				return {
					error: "You must follow this user to update notification settings",
				};
			}

			const notify = body?.notify;
			if (typeof notify !== "boolean") {
				return { error: "Invalid notify setting" };
			}

			updateFollowNotificationPreference.run(
				notify ? 1 : 0,
				currentUser.id,
				targetUser.id,
			);

			return { success: true };
		} catch (error) {
			console.error("Update notify tweets error:", error);
			return { error: "Failed to update notification settings" };
		}
	})
	.post("/:username/avatar", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only update your own avatar" };
			}

			const { avatar } = body;
			if (!avatar || !avatar.stream) {
				return { error: "Avatar file is required" };
			}

			const allowedTypes = {
				"image/webp": ".webp",
			};

			if (currentUser.gold) {
				allowedTypes["image/gif"] = ".gif";
			}

			const fileExtension = allowedTypes[avatar.type];
			if (!fileExtension) {
				return {
					error: currentUser.gold
						? "Invalid file type. Only WebP images (and GIF for Gold accounts) are allowed for avatars."
						: "Invalid file type. Only WebP images are allowed for avatars.",
				};
			}

			if (avatar.size > 5 * 1024 * 1024) {
				return {
					error: "File too large. Please upload an image smaller than 5MB.",
				};
			}

			const uploadsDir = "./.data/uploads";

			const arrayBuffer = await avatar.arrayBuffer();

			if (avatar.type === "image/webp") {
				try {
					const bytes = new Uint8Array(arrayBuffer);
					let hasANIM = false;
					for (let i = 0; i < bytes.length - 3; i++) {
						if (
							bytes[i] === 0x41 &&
							bytes[i + 1] === 0x4e &&
							bytes[i + 2] === 0x49 &&
							bytes[i + 3] === 0x4d
						) {
							hasANIM = true;
							break;
						}
					}

					if (hasANIM && !currentUser.gold) {
						return {
							error:
								"Animated WebP avatars are allowed for Gold accounts only.",
						};
					}
				} catch {}
			}

			const hasher = new Bun.CryptoHasher("sha256");
			hasher.update(arrayBuffer);
			const fileHash = hasher.digest("hex");

			const fileName = `${fileHash}${fileExtension}`;
			const filePath = `${uploadsDir}/${fileName}`;

			await Bun.write(filePath, arrayBuffer);

			const avatarUrl = `/api/uploads/${fileName}`;
			updateAvatar.run(avatarUrl, currentUser.id);

			const updatedUser = getUserByUsername.get(currentUser.username);
			return { success: true, avatar: updatedUser.avatar };
		} catch (error) {
			console.error("Avatar upload error:", error);
			return { error: "Failed to upload avatar" };
		}
	})
	.delete("/:username/avatar", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot change avatars" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only update your own avatar" };
			}

			updateAvatar.run(null, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Avatar removal error:", error);
			return { error: "Failed to remove avatar" };
		}
	})
	.post("/:username/banner", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only update your own banner" };
			}

			const { banner } = body;
			if (!banner || !banner.stream) {
				return { error: "Banner file is required" };
			}

			const allowedTypes = {
				"image/webp": ".webp",
			};

			const fileExtension = allowedTypes[banner.type];
			if (!fileExtension) {
				return {
					error: "Invalid file type. Only WebP images are allowed for banners.",
				};
			}

			if (banner.size > 10 * 1024 * 1024) {
				return {
					error: "File too large. Please upload an image smaller than 10MB.",
				};
			}

			const uploadsDir = "./.data/uploads";

			const arrayBuffer = await banner.arrayBuffer();
			const hasher = new Bun.CryptoHasher("sha256");
			hasher.update(arrayBuffer);
			const fileHash = hasher.digest("hex");

			const fileName = `${fileHash}${fileExtension}`;
			const filePath = `${uploadsDir}/${fileName}`;

			await Bun.write(filePath, arrayBuffer);

			const bannerUrl = `/api/uploads/${fileName}`;
			updateBanner.run(bannerUrl, currentUser.id);

			const updatedUser = getUserByUsername.get(currentUser.username);
			return { success: true, banner: updatedUser.banner };
		} catch (error) {
			console.error("Banner upload error:", error);
			return { error: "Failed to upload banner" };
		}
	})
	.delete("/:username/banner", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot change banners" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only update your own banner" };
			}

			updateBanner.run(null, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Banner removal error:", error);
			return { error: "Failed to remove banner" };
		}
	})
	.get("/:username/followers", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const { username } = params;
			const user = getUserByUsername.get(username);
			if (!user) return { error: "User not found" };

			const followers = getFollowers.all(user.id);
			return { followers };
		} catch (error) {
			console.error("Get followers error:", error);
			return { error: "Failed to get followers" };
		}
	})
	.get("/:username/following", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const { username } = params;
			const user = getUserByUsername.get(username);
			if (!user) return { error: "User not found" };

			const following = getFollowing.all(user.id);
			return { following };
		} catch (error) {
			console.error("Get following error:", error);
			return { error: "Failed to get following" };
		}
	})
	.get("/:username/mutuals", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			const mutuals = db
				.prepare(`
				SELECT u.id, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius, u.bio
				FROM follows f1
				JOIN follows f2 ON f1.following_id = f2.follower_id AND f2.following_id = ?
				JOIN users u ON f1.following_id = u.id
				WHERE f1.follower_id = ? AND u.suspended = 0 AND u.shadowbanned = 0
				ORDER BY u.follower_count DESC
				LIMIT 50
			`)
				.all(targetUser.id, currentUser.id);

			return { mutuals };
		} catch (error) {
			console.error("Get mutuals error:", error);
			return { error: "Failed to get mutual followers" };
		}
	})
	.get("/:username/followers-you-know", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			if (currentUser.id === targetUser.id) {
				return { followersYouKnow: [], count: 0 };
			}

			const followersYouKnow = db
				.prepare(`
				SELECT u.id, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius, u.bio
				FROM follows target_followers
				JOIN follows my_following ON target_followers.follower_id = my_following.following_id
				JOIN users u ON target_followers.follower_id = u.id
				WHERE target_followers.following_id = ? AND my_following.follower_id = ? AND u.suspended = 0 AND u.shadowbanned = 0
				ORDER BY u.follower_count DESC
				LIMIT 50
			`)
				.all(targetUser.id, currentUser.id);

			const countResult = db
				.prepare(`
				SELECT COUNT(*) as count
				FROM follows target_followers
				JOIN follows my_following ON target_followers.follower_id = my_following.following_id
				JOIN users u ON target_followers.follower_id = u.id
				WHERE target_followers.following_id = ? AND my_following.follower_id = ? AND u.suspended = 0 AND u.shadowbanned = 0
			`)
				.get(targetUser.id, currentUser.id);

			return { followersYouKnow, count: countResult?.count || 0 };
		} catch (error) {
			console.error("Get followers you know error:", error);
			return { error: "Failed to get followers you know" };
		}
	})
	.patch("/:username/username", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot change usernames" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only change your own username" };
			}

			const { newUsername } = body;
			if (!newUsername) {
				return { error: "Username is required" };
			}

			if (newUsername.length > 40) {
				return { error: "Username must be less than 40 characters" };
			}

			if (!/^[a-zA-Z0-9._-]+$/.test(newUsername)) {
				return {
					error:
						"Username can only contain lowercase letters, numbers, periods, and hyphens",
				};
			}

			const existingUser = getUserByUsername.get(newUsername);
			if (existingUser && existingUser.id !== currentUser.id) {
				return { error: "Username is already taken" };
			}

			updateUsername.run(newUsername, currentUser.id);

			const newToken = await jwt.sign({
				username: newUsername,
				userId: currentUser.id,
			});

			return { success: true, username: newUsername, token: newToken };
		} catch (error) {
			console.error("Update username error:", error);
			return { error: "Failed to update username" };
		}
	})
	.patch("/:username/password", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot change passwords" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only change your own password" };
			}

			const { currentPassword, newPassword } = body;

			if (!newPassword || newPassword.length < 8) {
				return { error: "New password must be at least 8 characters long" };
			}

			if (currentUser.password_hash) {
				if (!currentPassword) {
					return { error: "Current password is required" };
				}

				const isValid = await Bun.password.verify(
					currentPassword,
					currentUser.password_hash,
				);
				if (!isValid) {
					return { error: "Current password is incorrect" };
				}
			}

			const passwordHash = await Bun.password.hash(newPassword);
			updatePassword.run(passwordHash, currentUser.id);

			return { success: true, message: "Password updated successfully" };
		} catch (error) {
			console.error("Update password error:", error);
			return { error: "Failed to update password" };
		}
	})
	.patch("/:username/outlines", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot change outlines" };
			}

			const currentUser = db
				.query(
					"SELECT id, username, gray FROM users WHERE LOWER(username) = LOWER(?)",
				)
				.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			if (
				currentUser.username.toLowerCase() !== params.username.toLowerCase()
			) {
				return { error: "You can only change your own outlines" };
			}

			if (!currentUser.gray) {
				return { error: "Only gray check users can customize outlines" };
			}

			const checkmarkOutline =
				body.checkmark_outline !== undefined
					? body.checkmark_outline || null
					: undefined;
			const avatarOutline =
				body.avatar_outline !== undefined
					? body.avatar_outline || null
					: undefined;

			if (checkmarkOutline === undefined && avatarOutline === undefined) {
				return { error: "No outline values provided" };
			}

			const currentOutlines = db
				.query(
					"SELECT checkmark_outline, avatar_outline FROM users WHERE id = ?",
				)
				.get(currentUser.id);

			updateOutlines.run(
				checkmarkOutline !== undefined
					? checkmarkOutline
					: currentOutlines.checkmark_outline,
				avatarOutline !== undefined
					? avatarOutline
					: currentOutlines.avatar_outline,
				currentUser.id,
			);

			return { success: true };
		} catch (error) {
			console.error("Update outlines error:", error);
			return { error: "Failed to update outlines" };
		}
	})
	.delete("/:username", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			if (payload.isDelegate) {
				return { error: "Delegates cannot delete accounts" };
			}

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only delete your own account" };
			}

			const { confirmationText } = body;
			if (confirmationText !== "DELETE MY ACCOUNT") {
				return { error: "Please type 'DELETE MY ACCOUNT' to confirm" };
			}

			deleteUser.run(currentUser.id);

			return { success: true, message: "Account deleted successfully" };
		} catch (error) {
			console.error("Delete account error:", error);
			return { error: "Failed to delete account" };
		}
	})
	.post("/:username/password", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only add a password to your own account" };
			}

			const { password } = body;
			if (!password || password.length < 6) {
				return { error: "Password must be at least 6 characters long" };
			}

			const passwordHash = await Bun.password.hash(password);
			updatePassword.run(passwordHash, currentUser.id);

			return { success: true, message: "Password added successfully" };
		} catch (error) {
			console.error("Add password error:", error);
			return { error: "Failed to add password" };
		}
	})
	.get("/follow-requests", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const requests = getPendingFollowRequests.all(currentUser.id);
			return { requests };
		} catch (error) {
			console.error("Get follow requests error:", error);
			return { error: "Failed to get follow requests" };
		}
	})
	.post(
		"/follow-requests/:requestId/approve",
		async ({ params, jwt, headers }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const currentUser = getUserByUsername.get(payload.username);
				if (!currentUser) return { error: "User not found" };

				const { requestId } = params;
				const request = db
					.query("SELECT * FROM follow_requests WHERE id = ?")
					.get(requestId);

				if (!request) return { error: "Follow request not found" };
				if (request.target_id !== currentUser.id)
					return { error: "Unauthorized" };
				if (request.status !== "pending")
					return { error: "Request already processed" };

				approveFollowRequest.run(requestId);
				const followId = Bun.randomUUIDv7();
				addFollow.run(followId, request.requester_id, currentUser.id);

				const requester = db
					.query("SELECT id, username, name FROM users WHERE id = ?")
					.get(request.requester_id);
				if (requester) {
					addNotification(
						requester.id,
						"follow_approved",
						`has approved your follow request`,
						currentUser.username,
						currentUser.id,
						currentUser.username,
						currentUser.name || currentUser.username,
					);
				}

				return { success: true };
			} catch (error) {
				console.error("Approve follow request error:", error);
				return { error: "Failed to approve follow request" };
			}
		},
	)
	.post(
		"/follow-requests/:requestId/deny",
		async ({ params, jwt, headers }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const currentUser = getUserByUsername.get(payload.username);
				if (!currentUser) return { error: "User not found" };

				const { requestId } = params;
				const request = db
					.query("SELECT * FROM follow_requests WHERE id = ?")
					.get(requestId);

				if (!request) return { error: "Follow request not found" };
				if (request.target_id !== currentUser.id)
					return { error: "Unauthorized" };
				if (request.status !== "pending")
					return { error: "Request already processed" };

				denyFollowRequest.run(requestId);

				return { success: true };
			} catch (error) {
				console.error("Deny follow request error:", error);
				return { error: "Failed to deny follow request" };
			}
		},
	)
	.post("/:username/affiliate", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const currentUser = getUserByUsername.get(payload.username);
		if (!currentUser) return { error: "User not found" };

		const { username } = params;
		const targetUser = getUserByUsername.get(username);
		if (!targetUser) return { error: "User not found" };

		if (currentUser.id === targetUser.id) {
			return { error: "You cannot request affiliate for yourself" };
		}

		const existing = getAffiliateRequest.get(currentUser.id, targetUser.id);
		if (existing) {
			if (existing.status === "pending")
				return { error: "Affiliate request already sent" };
		}

		db.query(
			"DELETE FROM affiliate_requests WHERE requester_id = ? AND target_id = ?",
		).run(currentUser.id, targetUser.id);

		const id = Bun.randomUUIDv7();
		try {
			createAffiliateRequest.run(id, currentUser.id, targetUser.id);

			addNotification(
				targetUser.id,
				"affiliate_request",
				`${currentUser.username} requested you to become an affiliate`,
				`affiliate_request:${id}`,
				currentUser.id,
				currentUser.username,
				currentUser.name || currentUser.username,
			);

			return { success: true };
		} catch (err) {
			console.error("Create affiliate request error:", err);
			return { error: "Failed to send affiliate request" };
		}
	})

	.get("/affiliate-requests", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const payload = await jwt.verify(authorization.replace("Bearer ", ""));
		if (!payload) return { error: "Invalid token" };

		const currentUser = getUserByUsername.get(payload.username);
		if (!currentUser) return { error: "User not found" };

		try {
			const requests = getPendingAffiliateRequests.all(currentUser.id);
			return { requests };
		} catch (err) {
			console.error("Get affiliate requests error:", err);
			return { error: "Failed to get affiliate requests" };
		}
	})

	.post(
		"/affiliate-requests/:requestId/approve",
		async ({ params, jwt, headers }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const currentUser = getUserByUsername.get(payload.username);
				if (!currentUser) return { error: "User not found" };

				const { requestId } = params;
				const request = db
					.query("SELECT * FROM affiliate_requests WHERE id = ?")
					.get(requestId);
				if (!request) return { error: "Affiliate request not found" };
				if (request.target_id !== currentUser.id)
					return { error: "Unauthorized" };
				if (request.status !== "pending")
					return { error: "Request already processed" };

				approveAffiliateRequest.run(requestId);
				updateUserAffiliateWith.run(1, request.requester_id, currentUser.id);

				const requester = db
					.query("SELECT id, username, name FROM users WHERE id = ?")
					.get(request.requester_id);
				if (requester) {
					addNotification(
						requester.id,
						"affiliate_approved",
						`accepted your affiliate request`,
						currentUser.username,
						currentUser.id,
						currentUser.username,
						currentUser.name || currentUser.username,
					);
				}

				return { success: true };
			} catch (err) {
				console.error("Approve affiliate request error:", err);
				return { error: "Failed to approve affiliate request" };
			}
		},
	)

	.post(
		"/affiliate-requests/:requestId/deny",
		async ({ params, jwt, headers }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const currentUser = getUserByUsername.get(payload.username);
				if (!currentUser) return { error: "User not found" };

				const { requestId } = params;
				const request = db
					.query("SELECT * FROM affiliate_requests WHERE id = ?")
					.get(requestId);
				if (!request) return { error: "Affiliate request not found" };
				if (request.target_id !== currentUser.id)
					return { error: "Unauthorized" };
				if (request.status !== "pending")
					return { error: "Request already processed" };

				denyAffiliateRequest.run(requestId);

				return { success: true };
			} catch (err) {
				console.error("Deny affiliate request error:", err);
				return { error: "Failed to deny affiliate request" };
			}
		},
	)
	.get("/:username/affiliates", async ({ params }) => {
		try {
			const { username } = params;
			const user = getUserByUsername.get(username);
			if (!user) return { error: "User not found" };

			const affiliates = getAffiliatesList.all(user.id);
			return { affiliates };
		} catch (err) {
			console.error("Get affiliates error:", err);
			return { error: "Failed to get affiliates" };
		}
	})
	.delete("/remove-affiliate", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			updateUserAffiliateWith.run(0, null, currentUser.id);

			return { success: true };
		} catch (err) {
			console.error("Remove affiliate error:", err);
			return { error: "Failed to remove affiliate" };
		}
	})
	.post("/pin/:tweetId", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { tweetId } = params;

			const tweet = db
				.query("SELECT * FROM posts WHERE id = ? AND user_id = ?")
				.get(tweetId, currentUser.id);
			if (!tweet) {
				return { error: "Tweet not found or doesn't belong to you" };
			}

			const existingPinned = db
				.query("SELECT * FROM posts WHERE user_id = ? AND pinned = 1")
				.get(currentUser.id);
			if (existingPinned) {
				db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(
					existingPinned.id,
				);
			}

			db.query("UPDATE posts SET pinned = 1 WHERE id = ?").run(tweetId);

			return { success: true };
		} catch (error) {
			console.error("Pin tweet error:", error);
			return { error: "Failed to pin tweet" };
		}
	})
	.delete("/pin/:tweetId", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { tweetId } = params;

			db.query("UPDATE posts SET pinned = 0 WHERE id = ?").run(tweetId);

			return { success: true };
		} catch (error) {
			console.error("Unpin tweet error:", error);
			return { error: "Failed to unpin tweet" };
		}
	})
	.post("/:username/pin/:tweetId", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username, tweetId } = params;
			if (currentUser.username !== username) {
				return { error: "You can only pin your own tweets" };
			}

			const tweet = getTweetForPin.get(tweetId, currentUser.id);
			if (!tweet) {
				return { error: "Tweet not found or doesn't belong to you" };
			}

			const existingPinned = getExistingPinnedTweet.get(currentUser.id);
			if (existingPinned) {
				unpinTweet.run(existingPinned.id);
			}

			pinTweet.run(tweetId);

			return { success: true };
		} catch (error) {
			console.error("Pin tweet error:", error);
			return { error: "Failed to pin tweet" };
		}
	})
	.delete("/:username/pin/:tweetId", async ({ params, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username, tweetId } = params;
			if (currentUser.username !== username) {
				return { error: "You can only unpin your own tweets" };
			}

			unpinTweet.run(tweetId);

			return { success: true };
		} catch (error) {
			console.error("Unpin tweet error:", error);
			return { error: "Failed to unpin tweet" };
		}
	})
	.post("/settings/private", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { enabled } = body;

			updatePrivacy.run(enabled ? 1 : 0, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Update privacy setting error:", error);
			return { error: "Failed to update setting" };
		}
	})
	.post("/settings/community-tag", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { community_id } = body;

			if (!community_id) {
				clearCommunityTag.run(currentUser.id);
				return { success: true };
			}

			const membership = getCommunityMembership.get(
				currentUser.id,
				community_id,
			);

			if (!membership) {
				return { error: "You are not a member of this community" };
			}

			const community = getCommunityById.get(community_id);

			if (!community) {
				return { error: "Community not found" };
			}

			if (!community.tag_enabled) {
				return { error: "This community does not have tags enabled" };
			}

			updateCommunityTag.run(community_id, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Update community tag setting error:", error);
			return { error: "Failed to update setting" };
		}
	})
	.post("/settings/transparency-location", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { display } = body;

			if (!["full", "country", "continent"].includes(display)) {
				return { error: "Invalid display option" };
			}

			updateTransparencyLocationDisplay.run(display, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Update transparency location setting error:", error);
			return { error: "Failed to update setting" };
		}
	})
	.get("/:username/algorithm-stats", async ({ params }) => {
		try {
			const { username } = params;
			const user = db
				.prepare(`
				SELECT id, username, created_at, blocked_by_count, muted_by_count, spam_score, 
				follower_count, following_count, post_count, verified, gold, super_tweeter
				FROM users WHERE LOWER(username) = LOWER(?)`)
				.get(username);

			if (!user) {
				return { error: "User not found" };
			}

			const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
			const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

			// Ensure spam_score is a number, defaulting to 0.0 if null/undefined
			const spamScore =
				typeof user.spam_score === "number" ? user.spam_score : 0.0;

			const stats = {
				blocked_by_count: user.blocked_by_count || 0,
				muted_by_count: user.muted_by_count || 0,
				spam_score: spamScore,
				account_age_days: Math.floor(accountAgeDays),
				follower_count: user.follower_count || 0,
				following_count: user.following_count || 0,
				post_count: user.post_count || 0,
				verified: user.verified || false,
				gold: user.gold || false,
				super_tweeter: user.super_tweeter || false,
				algorithm_impact: {
					reputation_multiplier: 1.0,
					account_age_multiplier: 1.0,
					description: "How the algorithm views this account",
				},
			};

			let reputationMultiplier = 1.0;

			if (stats.blocked_by_count > 0) {
				const blockPenalty = 1.0 / (1.0 + stats.blocked_by_count * 0.08);
				reputationMultiplier *= blockPenalty;
				if (stats.blocked_by_count > 10) reputationMultiplier *= 0.7;
				if (stats.blocked_by_count > 50) reputationMultiplier *= 0.5;
				if (stats.blocked_by_count > 100) reputationMultiplier *= 0.3;
			}

			if (stats.muted_by_count > 0) {
				const mutePenalty = 1.0 / (1.0 + stats.muted_by_count * 0.05);
				reputationMultiplier *= mutePenalty;
				if (stats.muted_by_count > 20) reputationMultiplier *= 0.8;
				if (stats.muted_by_count > 100) reputationMultiplier *= 0.6;
			}

			if (stats.spam_score > 0.0) {
				const spamPenalty = 1.0 / (1.0 + stats.spam_score * 0.5);
				reputationMultiplier *= spamPenalty;
				if (stats.spam_score > 0.5) reputationMultiplier *= 0.6;
				if (stats.spam_score > 0.8) reputationMultiplier *= 0.3;
			}

			let accountAgeMultiplier = 1.0;
			if (accountAgeDays > 30) {
				accountAgeMultiplier =
					1.0 + Math.log(accountAgeDays / 30.0 + 1.0) * 0.08;
				if (accountAgeMultiplier > 1.35) accountAgeMultiplier = 1.35;
			} else if (accountAgeDays < 7) {
				accountAgeMultiplier = 0.85 + (accountAgeDays / 7.0) * 0.15;
			}

			stats.algorithm_impact.reputation_multiplier =
				Math.round(reputationMultiplier * 1000) / 1000;
			stats.algorithm_impact.account_age_multiplier =
				Math.round(accountAgeMultiplier * 1000) / 1000;

			const overallMultiplier = reputationMultiplier * accountAgeMultiplier;
			stats.algorithm_impact.overall_multiplier =
				Math.round(overallMultiplier * 1000) / 1000;

			let rating = "Excellent";
			if (overallMultiplier < 0.3) rating = "Very Poor";
			else if (overallMultiplier < 0.5) rating = "Poor";
			else if (overallMultiplier < 0.7) rating = "Below Average";
			else if (overallMultiplier < 0.9) rating = "Average";
			else if (overallMultiplier < 1.1) rating = "Good";

			stats.algorithm_impact.rating = rating;

			return stats;
		} catch (error) {
			console.error("Algorithm stats error:", error);
			return { error: "Failed to fetch algorithm stats" };
		}
	})
	.get("/:username/spam-score", async ({ params }) => {
		try {
			const { username } = params;
			const user = db
				.prepare(`
				SELECT id, created_at FROM users WHERE LOWER(username) = LOWER(?)`)
				.get(username);

			if (!user) {
				return { error: "User not found" };
			}

			const analysis = calculateSpamScoreWithDetails(user.id);

			const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
			const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

			const followerCount =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM follows WHERE following_id = ?",
					)
					.get(user.id)?.count || 0;
			const followingCount =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM follows WHERE follower_id = ?",
					)
					.get(user.id)?.count || 0;
			const totalPosts =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NULL",
					)
					.get(user.id)?.count || 0;
			const totalReplies =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NOT NULL",
					)
					.get(user.id)?.count || 0;

			const now = Date.now();
			const oneHourAgo = new Date(now - 3600000).toISOString();
			const sixHoursAgo = new Date(now - 6 * 3600000).toISOString();
			const oneDayAgo = new Date(now - 24 * 3600000).toISOString();

			const postsLastHour =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NULL AND created_at > ?",
					)
					.get(user.id, oneHourAgo)?.count || 0;

			const postsLast6Hours =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NULL AND created_at > ?",
					)
					.get(user.id, sixHoursAgo)?.count || 0;

			const postsLastDay =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NULL AND created_at > ?",
					)
					.get(user.id, oneDayAgo)?.count || 0;

			const repliesLastHour =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NOT NULL AND created_at > ?",
					)
					.get(user.id, oneHourAgo)?.count || 0;

			const repliesLastDay =
				db
					.prepare(
						"SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND reply_to IS NOT NULL AND created_at > ?",
					)
					.get(user.id, oneDayAgo)?.count || 0;

			const indicators = (analysis.indicators || []).map((ind) => ({
				name: ind.name,
				displayName: ind.displayName,
				score: ind.score,
				weight: ind.weight,
				contribution: `${(ind.score * ind.weight * 100).toFixed(1)}%`,
				details: ind.details,
				status:
					ind.score > 0.5 ? "warning" : ind.score > 0.2 ? "caution" : "good",
				impactingTweets: ind.impactingTweets || [],
			}));

			return {
				spamScore: analysis.spamScore,
				spamPercentage: Math.round(analysis.spamScore * 1000) / 10,
				accountMetrics: {
					accountAgeDays: Math.floor(accountAgeDays),
					followerCount,
					followingCount,
					totalPosts,
					totalReplies,
					postsLastHour,
					postsLast6Hours,
					postsLastDay,
					repliesLastHour,
					repliesLastDay,
					followRatio:
						followingCount > 0
							? (followingCount / Math.max(followerCount, 1)).toFixed(2)
							: 0,
				},
				indicators: indicators.sort(
					(a, b) => b.score * b.weight - a.score * a.weight,
				),
				message: analysis.message,
			};
		} catch (error) {
			console.error("Spam score error:", error);
			return { error: "Failed to fetch spam score" };
		}
	});
