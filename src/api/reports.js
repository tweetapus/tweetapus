import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.prepare(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)"
);

const createReport = db.prepare(`
  INSERT INTO reports (id, reporter_id, reported_type, reported_id, reason, additional_info)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const checkReportBan = db.prepare(`
  SELECT id FROM report_bans WHERE user_id = ?
`);

const getUser = db.prepare(`
  SELECT id, username, name, avatar FROM users WHERE id = ?
`);

const getPost = db.prepare(`
  SELECT id, user_id, content FROM posts WHERE id = ?
`);

export default new Elysia({ prefix: "/reports", tags: ["Reports"] })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 10_000,
      max: 30,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .post(
    "/create",
    async ({ jwt, headers, body, set }) => {
      const authorization = headers.authorization;
      if (!authorization) {
        set.status = 401;
        return { error: "Authentication required" };
      }

      try {
        const payload = await jwt.verify(authorization.replace("Bearer ", ""));
        if (!payload) {
          set.status = 401;
          return { error: "Invalid token" };
        }

        const user = getUserByUsername.get(payload.username);
        if (!user) {
          set.status = 401;
          return { error: "User not found" };
        }

        const banned = checkReportBan.get(user.id);
        if (banned) {
          set.status = 403;
          return { error: "You are banned from submitting reports" };
        }

        const { reported_type, reported_id, reason, additional_info } = body;

        if (reported_type === "user") {
          const reportedUser = getUser.get(reported_id);
          if (!reportedUser) {
            set.status = 404;
            return { error: "User not found" };
          }
        } else if (reported_type === "post") {
          const reportedPost = getPost.get(reported_id);
          if (!reportedPost) {
            set.status = 404;
            return { error: "Post not found" };
          }
        } else {
          set.status = 400;
          return { error: "Invalid report type" };
        }

        const reportId = Bun.randomUUIDv7();

        createReport.run(
          reportId,
          user.id,
          reported_type,
          reported_id,
          reason,
          additional_info || null
        );

        return { success: true, reportId };
      } catch (error) {
        console.error("Error creating report:", error);
        set.status = 500;
        return { error: "Failed to create report" };
      }
    },
    {
      body: t.Object({
        reported_type: t.String(),
        reported_id: t.String(),
        reason: t.String(),
        additional_info: t.Optional(t.String()),
      }),
    }
  );
