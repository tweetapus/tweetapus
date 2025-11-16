import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.prepare(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)"
);
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");

const checkBlockExists = db.prepare(`
  SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?
`);

const addBlock = db.prepare(`
  INSERT INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)
`);

const removeBlock = db.prepare(`
  DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?
`);

const isUserBlocked = db.prepare(`
  SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?
`);

export default new Elysia({ prefix: "/blocking", tags: ["Blocking"] })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 10_000,
      max: 30,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .post("/block", async ({ jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const { userId } = body;
      if (!userId) return { error: "User ID is required" };

      if (userId === user.id) {
        return { error: "You cannot block yourself" };
      }

      const targetUser = getUserById.get(userId);
      if (!targetUser) return { error: "Target user not found" };

      const existingBlock = checkBlockExists.get(user.id, userId);
      if (existingBlock) {
        return { error: "User is already blocked" };
      }

      const blockId = Bun.randomUUIDv7();
      addBlock.run(blockId, user.id, userId);

      db.query(
        "DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)"
      ).run(user.id, userId, userId, user.id);
      db.query(
        "DELETE FROM follow_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)"
      ).run(user.id, userId, userId, user.id);

      return { success: true, blocked: true };
    } catch (error) {
      console.error("Block user error:", error);
      return { error: "Failed to block user" };
    }
  }, {
    detail: {
      description: "Blocks a user",
    },
    body: t.Object({
      userId: t.String(),
    }),
    response: t.Object({
      success: t.Boolean(),
      error: t.Optional(t.String()),
      blocked: true,
    }),
  })
  .post("/unblock", async ({ jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const { userId } = body;
      if (!userId) return { error: "User ID is required" };

      const existingBlock = checkBlockExists.get(user.id, userId);
      if (!existingBlock) {
        return { error: "User is not blocked" };
      }

      removeBlock.run(user.id, userId);

      return { success: true, blocked: false };
    } catch (error) {
      console.error("Unblock user error:", error);
      return { error: "Failed to unblock user" };
    }
  }, {
    detail: {
      description: "Unblocks a user",
    },
    body: t.Object({
      userId: t.String(),
    }),
    response: t.Object({
      success: t.Boolean(),
      error: t.Optional(t.String()),
      blocked: false,
    }),
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
      const isBlocked = isUserBlocked.get(user.id, userId);

      return {
        success: true,
        blocked: !!isBlocked,
      };
    } catch (error) {
      console.error("Check block status error:", error);
      return { error: "Failed to check block status" };
    }
  }, {
    detail: {
      description: "Checks if a user is blocked",
    },
    params: t.Object({
      userId: t.String(),
    }),
    response: t.Object({
      success: t.Boolean(),
      blocked: t.Boolean(),
    }),
  });
