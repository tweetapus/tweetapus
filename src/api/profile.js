import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

const updateProfile = db.query(`
  UPDATE users
  SET name = ?, bio = ?, location = ?, website = ?
  WHERE id = ?
`);

const getUserReplies = db.query(`
  SELECT posts.*, users.username, users.name as display_name, users.verified 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NOT NULL
  ORDER BY posts.created_at DESC 
  LIMIT 20
`);

const getUserPosts = db.query(`
  SELECT posts.*, users.username, users.name as display_name, users.verified 
  FROM posts 
  JOIN users ON posts.user_id = users.id 
  WHERE posts.user_id = ? AND posts.reply_to IS NULL
  ORDER BY posts.created_at DESC 
  LIMIT 20
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

export default new Elysia({ prefix: "/profile" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 15_000,
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

			const posts = getUserPosts.all(user.id);
			const counts = getFollowCounts.get(user.id, user.id, user.id);

			const profile = {
				...user,
				following_count: counts.following_count,
				follower_count: counts.follower_count,
				post_count: counts.post_count,
			};

			let isFollowing = false;
			let isOwnProfile = false;

			const authorization = headers.authorization;
			if (authorization) {
				try {
					const payload = await jwt.verify(
						authorization.replace("Bearer ", ""),
					);
					if (payload) {
						const currentUser = getUserByUsername.get(payload.username);
						if (currentUser) {
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

			return {
				profile,
				posts,
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

			const { display_name, bio, location, website } = body;

			if (display_name && display_name.length > 50) {
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
				display_name || currentUser.name,
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
	});
