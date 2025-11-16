import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const inviteDelegate = db.prepare(
	"INSERT INTO delegates (id, owner_id, delegate_id, status) VALUES (?, ?, ?, 'pending')",
);
const acceptDelegate = db.prepare(
	"UPDATE delegates SET status = 'accepted', accepted_at = datetime('now', 'utc') WHERE id = ? AND delegate_id = ? AND status = 'pending'",
);
const declineDelegate = db.prepare(
	"UPDATE delegates SET status = 'declined' WHERE id = ? AND delegate_id = ? AND status = 'pending'",
);
const removeDelegate = db.prepare(
	"DELETE FROM delegates WHERE id = ? AND (owner_id = ? OR delegate_id = ?)",
);
const getDelegationById = db.prepare("SELECT * FROM delegates WHERE id = ?");
const checkDelegation = db.prepare(
	"SELECT * FROM delegates WHERE owner_id = ? AND delegate_id = ? AND status = 'accepted'",
);
const getMyDelegates = db.prepare(
	"SELECT d.*, u.username, u.name, u.avatar, u.verified FROM delegates d JOIN users u ON d.delegate_id = u.id WHERE d.owner_id = ? AND d.status = 'accepted' ORDER BY d.accepted_at DESC",
);
const getMyDelegations = db.prepare(
	"SELECT d.*, u.username, u.name, u.avatar, u.verified FROM delegates d JOIN users u ON d.owner_id = u.id WHERE d.delegate_id = ? AND d.status = 'accepted' ORDER BY d.accepted_at DESC",
);
const getPendingInvitations = db.prepare(
	"SELECT d.*, u.username, u.name, u.avatar, u.verified FROM delegates d JOIN users u ON d.owner_id = u.id WHERE d.delegate_id = ? AND d.status = 'pending' ORDER BY d.created_at DESC",
);
const checkIfAlreadyInvited = db.prepare(
	"SELECT * FROM delegates WHERE owner_id = ? AND delegate_id = ? AND status IN ('pending', 'accepted')",
);
const getUserByUsername = db.prepare(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);

const isRestrictedQuery = db.prepare(
	"SELECT 1 FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))",
);
const getUserRestrictedFlag = db.prepare(
	"SELECT restricted FROM users WHERE id = ?",
);
const isUserRestrictedById = (userId) => {
	const res = isRestrictedQuery.get(userId);
	const f = getUserRestrictedFlag.get(userId);
	return !!res || !!f?.restricted;
};

export default new Elysia({ prefix: "/delegates", tags: ["Delegates"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/invite", async ({ jwt, headers, body }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			if (isUserRestrictedById(user.id))
				return { error: "Action not allowed: account is restricted" };

			const { username } = body;
			if (!username) return { error: "Username is required" };

			const targetUser = getUserByUsername.get(username);
			if (!targetUser) return { error: "User not found" };

			if (targetUser.id === user.id) {
				return { error: "You cannot invite yourself as a delegate" };
			}

			const existing = checkIfAlreadyInvited.get(user.id, targetUser.id);
			if (existing) {
				if (existing.status === "accepted") {
					return { error: "User is already your delegate" };
				}
				return { error: "Invitation already sent to this user" };
			}

			const delegateId = Bun.randomUUIDv7();
			inviteDelegate.run(delegateId, user.id, targetUser.id);

			const notificationId = Bun.randomUUIDv7();
			db.prepare(
				"INSERT INTO notifications (id, user_id, type, content, related_id, actor_id) VALUES (?, ?, ?, ?, ?, ?)",
			).run(
				notificationId,
				targetUser.id,
				"delegate_invite",
				"invited you to be their delegate",
				delegateId,
				user.id,
			);

			return { success: true, id: delegateId };
		} catch (error) {
			console.error("Invite delegate error:", error);
			return { error: "Failed to invite delegate" };
		}
	})
	.post("/:id/accept", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			if (isUserRestrictedById(user.id))
				return { error: "Action not allowed: account is restricted" };

			const { id } = params;
			const delegation = getDelegationById.get(id);

			if (!delegation) return { error: "Delegation not found" };

			if (delegation.delegate_id !== user.id) {
				return {
					error: "You are not authorized to accept this invitation",
				};
			}

			if (delegation.status !== "pending") {
				return { error: "This invitation has already been responded to" };
			}

			acceptDelegate.run(id, user.id);

			const notificationId = Bun.randomUUIDv7();
			db.prepare(
				"INSERT INTO notifications (id, user_id, type, content, related_id, actor_id) VALUES (?, ?, ?, ?, ?, ?)",
			).run(
				notificationId,
				delegation.owner_id,
				"delegate_accepted",
				"accepted your delegate invitation",
				id,
				user.id,
			);

			return { success: true };
		} catch (error) {
			console.error("Accept delegate error:", error);
			return { error: "Failed to accept delegate invitation" };
		}
	})
	.post("/:id/decline", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			if (isUserRestrictedById(user.id))
				return { error: "Action not allowed: account is restricted" };

			const { id } = params;
			const delegation = getDelegationById.get(id);

			if (!delegation) return { error: "Delegation not found" };

			if (delegation.delegate_id !== user.id) {
				return {
					error: "You are not authorized to decline this invitation",
				};
			}

			if (delegation.status !== "pending") {
				return { error: "This invitation has already been responded to" };
			}

			declineDelegate.run(id, user.id);
			return { success: true };
		} catch (error) {
			console.error("Decline delegate error:", error);
			return { error: "Failed to decline delegate invitation" };
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

			if (isUserRestrictedById(user.id))
				return { error: "Action not allowed: account is restricted" };

			const { id } = params;
			const delegation = getDelegationById.get(id);

			if (!delegation) return { error: "Delegation not found" };

			if (
				delegation.owner_id !== user.id &&
				delegation.delegate_id !== user.id
			) {
				return {
					error: "You are not authorized to remove this delegation",
				};
			}

			removeDelegate.run(id, user.id, user.id);
			return { success: true };
		} catch (error) {
			console.error("Remove delegate error:", error);
			return { error: "Failed to remove delegation" };
		}
	})
	.get("/my-delegates", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const delegates = getMyDelegates.all(user.id);
			return { success: true, delegates };
		} catch (error) {
			console.error("Get delegates error:", error);
			return { error: "Failed to get delegates" };
		}
	})
	.get("/my-delegations", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const delegations = getMyDelegations.all(user.id);
			return { success: true, delegations };
		} catch (error) {
			console.error("Get delegations error:", error);
			return { error: "Failed to get delegations" };
		}
	})
	.get("/pending-invitations", async ({ jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const invitations = getPendingInvitations.all(user.id);
			return { success: true, invitations };
		} catch (error) {
			console.error("Get pending invitations error:", error);
			return { error: "Failed to get pending invitations" };
		}
	})
	.get("/check/:userId", async ({ jwt, headers, params }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		try {
			const payload = await jwt.verify(authorization.replace("Bearer ", ""));
			if (!payload) return { error: "Invalid token" };

			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { userId } = params;
			const delegation = checkDelegation.get(userId, user.id);

			return { success: true, canPostAs: !!delegation };
		} catch (error) {
			console.error("Check delegation error:", error);
			return { error: "Failed to check delegation" };
		}
	});
