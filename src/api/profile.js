import { jwt } from "@elysiajs/jwt";
import { Elysia, file } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";
import { addNotification } from "./notifications.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getFollowers = db.query(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.bio
  FROM follows
  JOIN users ON follows.follower_id = users.id
  WHERE follows.following_id = ?
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getFollowing = db.query(`
  SELECT users.id, users.username, users.name, users.avatar, users.verified, users.bio
  FROM follows
  JOIN users ON follows.following_id = users.id
  WHERE follows.follower_id = ?
  ORDER BY follows.created_at DESC
  LIMIT 50
`);

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

const searchUsers = db.query(`
  SELECT id, username, name, avatar, verified
  FROM users 
  WHERE username LIKE ? OR name LIKE ?
  ORDER BY 
    CASE 
      WHEN username LIKE ? THEN 1
      WHEN name LIKE ? THEN 2
      ELSE 3
    END,
    username
  LIMIT 10
`);

const updateProfile = db.query(`
  UPDATE users
  SET name = ?, bio = ?, location = ?, website = ?
  WHERE id = ?
`);

const updateAvatar = db.query(`
  UPDATE users
  SET avatar = ?
  WHERE id = ?
`);

const getUserReplies = db.query(`
  SELECT posts.*, users.username, users.name, users.verified 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NOT NULL
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getUserPosts = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NULL
  ORDER BY posts.created_at DESC
`);

const getUserRetweets = db.query(`
  SELECT 
    original_posts.*,
    original_users.username, original_users.name, original_users.avatar, original_users.verified,
    retweets.created_at as retweet_created_at,
    retweets.post_id as original_post_id
  FROM retweets
  JOIN posts original_posts ON retweets.post_id = original_posts.id
  JOIN users original_users ON original_posts.user_id = original_users.id
  WHERE retweets.user_id = ?
  ORDER BY retweets.created_at DESC
`);

const getFollowStatus = db.query(`
  SELECT id FROM follows WHERE follower_id = ? AND following_id = ?
`);

const addFollow = db.query(`
  INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)
`);

const removeFollow = db.query(`
	DELETE FROM follows WHERE follower_id = ? AND following_id = ?
`);

const getFollowCounts = db.query(`
	SELECT 
		(SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
		(SELECT COUNT(*) FROM posts WHERE user_id = ? AND reply_to IS NULL) AS post_count
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
  SELECT DISTINCT users.username, users.name, users.avatar, users.verified
  FROM poll_votes 
  JOIN users ON poll_votes.user_id = users.id 
  WHERE poll_votes.poll_id = ?
  ORDER BY poll_votes.created_at DESC
  LIMIT 10
`);

const getQuotedTweet = db.query(`
  SELECT posts.*, users.username, users.name, users.avatar, users.verified
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

const getAttachmentsByPostId = db.query(`
  SELECT * FROM attachments WHERE post_id = ?
`);

const getTweetAttachments = (tweetId) => {
	return getAttachmentsByPostId.all(tweetId);
};

const getQuotedTweetData = (quoteTweetId, userId) => {
	if (!quoteTweetId) return null;

	const quotedTweet = getQuotedTweet.get(quoteTweetId);
	if (!quotedTweet) return null;

	return {
		...quotedTweet,
		author: {
			username: quotedTweet.username,
			name: quotedTweet.name,
			avatar: quotedTweet.avatar,
			verified: quotedTweet.verified || false,
		},
		poll: getPollDataForTweet(quotedTweet.id, userId),
		attachments: getTweetAttachments(quotedTweet.id),
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

// Helper function aliases
const getPollDataForPost = getPollDataForTweet;
const getQuotedPostData = getQuotedTweetData;
const getPostAttachments = getTweetAttachments;

export default new Elysia({ prefix: "/profile" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
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

			// Get user's posts and retweets separately, then combine
			const userPosts = getUserPosts.all(user.id);
			const userRetweets = getUserRetweets.all(user.id);
			const replies = getUserReplies.all(user.id);
			const counts = getFollowCounts.get(user.id, user.id, user.id);

			const profile = {
				...user,
				following_count: counts.following_count,
				follower_count: counts.follower_count,
				post_count: counts.post_count,
			};

			let isFollowing = false;
			let isOwnProfile = false;
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
							isOwnProfile = currentUser.id === user.id;
							if (!isOwnProfile) {
								const followStatus = getFollowStatus.get(
									currentUser.id,
									user.id,
								);
								isFollowing = !!followStatus;
							}
						}
					}
				} catch {
					// Invalid token, continue as unauthenticated
				}
			}

			// Combine and sort by creation time
			const allContent = [
				...userPosts.map((post) => ({
					...post,
					content_type: "post",
					sort_date: new Date(post.created_at),
					author: {
						username: post.username,
						name: post.name,
						avatar: post.avatar,
						verified: post.verified || false,
					},
				})),
				...userRetweets.map((retweet) => ({
					...retweet,
					content_type: "retweet",
					sort_date: new Date(retweet.retweet_created_at),
					retweet_created_at: retweet.retweet_created_at,
					author: {
						username: retweet.username,
						name: retweet.name,
						avatar: retweet.avatar,
						verified: retweet.verified || false,
					},
				})),
			]
				.sort((a, b) => b.sort_date - a.sort_date)
				.slice(0, 20);

			const posts = allContent.map((post) => ({
				...post,
				poll: getPollDataForPost(post.id, currentUserId),
				quoted_tweet: getQuotedPostData(post.quote_tweet_id, currentUserId),
				attachments: getPostAttachments(post.id),
				liked_by_user: false, // Will be set below
				retweeted_by_user: false, // Will be set below
			}));

			// Get likes and retweets for current user
			if (currentUserId && allContent.length > 0) {
				try {
					const postIds = allContent.map((p) => p.id);
					// Use dynamic query based on actual number of posts
					const likesQuery = db.query(`
						SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})
					`);
					const retweetsQuery = db.query(`
						SELECT post_id FROM retweets WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})
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
					// If likes/retweets query fails, continue without them
					console.warn("Failed to fetch likes/retweets:", e);
				}
			}

			return {
				profile,
				posts,
				replies: replies.map((reply) => ({
					...reply,
					author: {
						username: reply.username,
						name: reply.name,
						avatar: reply.avatar || null,
						verified: reply.verified || false,
					},
					poll: getPollDataForPost(reply.id, currentUserId),
					quoted_tweet: getQuotedPostData(reply.quote_tweet_id, currentUserId),
					attachments: getPostAttachments(reply.id),
					liked_by_user: false,
					retweeted_by_user: false,
				})),
				isFollowing,
				isOwnProfile,
			};
		} catch (error) {
			console.error("Profile fetch error:", error);
			return { error: "Failed to fetch profile" };
		}
	})
	.get("/:username/replies", async ({ params }) => {
		try {
			const { username } = params;

			const user = getUserByUsername.get(username);
			if (!user) {
				return { error: "User not found" };
			}

			const replies = getUserReplies.all(user.id);

			return {
				replies,
			};
		} catch (error) {
			console.error("Replies fetch error:", error);
			return { error: "Failed to fetch replies" };
		}
	})
	.put("/:username", async ({ params, jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only edit your own profile" };
			}

			const { name, bio, location, website } = body;

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

			updateProfile.run(
				name || currentUser.name,
				bio !== undefined ? bio : currentUser.bio,
				location !== undefined ? location : currentUser.location,
				website !== undefined ? website : currentUser.website,
				currentUser.id,
			);

			const updatedUser = getUserByUsername.get(currentUser.username);
			return { success: true, profile: updatedUser };
		} catch (error) {
			console.error("Profile update error:", error);
			return { error: "Failed to update profile" };
		}
	})
	.post("/:username/follow", async ({ params, jwt, headers }) => {
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
				return { error: "You cannot follow yourself" };
			}

			const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
			if (existingFollow) {
				return { error: "Already following this user" };
			}

			const followId = Bun.randomUUIDv7();
			addFollow.run(followId, currentUser.id, targetUser.id);

			addNotification(
				targetUser.id,
				"follow",
				`${currentUser.name || currentUser.username} started following you`,
				currentUser.id,
			);

			return { success: true };
		} catch (error) {
			console.error("Follow error:", error);
			return { error: "Failed to follow user" };
		}
	})
	.delete("/:username/follow", async ({ params, jwt, headers }) => {
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

			const existingFollow = getFollowStatus.get(currentUser.id, targetUser.id);
			if (!existingFollow) {
				return { error: "Not following this user" };
			}

			removeFollow.run(currentUser.id, targetUser.id);

			return { success: true };
		} catch (error) {
			console.error("Unfollow error:", error);
			return { error: "Failed to unfollow user" };
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

			// Get file extension based on MIME type first
			const allowedTypes = {
				"image/webp": ".webp",
			};

			const fileExtension = allowedTypes[avatar.type];
			if (!fileExtension) {
				return {
					error: "Invalid file type. Only WebP images are allowed for avatars.",
				};
			}

			if (avatar.size > 5 * 1024 * 1024) {
				return {
					error: "File too large. Please upload an image smaller than 5MB.",
				};
			}

			const uploadsDir = "./.data/uploads";

			// Calculate secure hash for filename
			const arrayBuffer = await avatar.arrayBuffer();
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

			const currentUser = getUserByUsername.get(payload.username);
			if (!currentUser) return { error: "User not found" };

			const { username } = params;
			if (currentUser.username !== username) {
				return { error: "You can only update your own avatar" };
			}

			// Remove avatar from database
			updateAvatar.run(null, currentUser.id);

			return { success: true };
		} catch (error) {
			console.error("Avatar removal error:", error);
			return { error: "Failed to remove avatar" };
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
	.get("/search", async ({ query, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const { q } = query;
			if (!q || q.length < 1) return { users: [] };

			const searchTerm = `%${q}%`;
			const exactTerm = `${q}%`;

			const users = searchUsers.all(
				searchTerm,
				searchTerm,
				exactTerm,
				exactTerm,
			);
			return { users };
		} catch (error) {
			console.error("Search users error:", error);
			return { error: "Failed to search users" };
		}
	});

export const avatarRoutes = new Elysia({ prefix: "/avatars" }).get(
	"/:filename",
	({ params }) => {
		const { filename } = params;

		// Legacy avatar route - redirect to uploads
		if (!/^[a-f0-9]{64}\.(webp)$/i.test(filename)) {
			return new Response("Invalid filename", { status: 400 });
		}

		const filePath = `./.data/uploads/${filename}`;
		return file(filePath);
	},
);
