import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import { broadcastToUser } from "../index.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

const getUserByUsername = db.prepare(
  "SELECT * FROM users WHERE username = ?"
);

const createReport = db.prepare(`
  INSERT INTO reports (id, reporter_id, reported_type, reported_id, reason, additional_info)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const checkReportBan = db.prepare(`
  SELECT id FROM report_bans WHERE user_id = ?
`);

const getReports = db.prepare(`
  SELECT * FROM reports
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`);

const getReportById = db.prepare(`
  SELECT * FROM reports WHERE id = ?
`);

const updateReportStatus = db.prepare(`
  UPDATE reports
  SET status = ?, resolved_by = ?, resolved_at = datetime('now', 'utc'), resolution_action = ?
  WHERE id = ?
`);

const banReporter = db.prepare(`
  INSERT INTO report_bans (id, user_id, banned_by, reason)
  VALUES (?, ?, ?, ?)
`);

const createSuspension = db.prepare(`
  INSERT INTO suspensions (id, user_id, suspended_by, reason, severity, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateUserSuspended = db.prepare(`
  UPDATE users SET suspended = TRUE WHERE id = ?
`);

const deletePost = db.prepare(`
  DELETE FROM posts WHERE id = ?
`);

const createFactCheck = db.prepare(`
  INSERT INTO fact_checks (id, post_id, created_by, note, severity)
  VALUES (?, ?, ?, ?, ?)
`);

const getUser = db.prepare(`
  SELECT id, username, name, avatar FROM users WHERE id = ?
`);

const getPost = db.prepare(`
  SELECT id, user_id, content FROM posts WHERE id = ?
`);

const createNotification = db.prepare(`
  INSERT INTO notifications (id, user_id, type, content, related_id, actor_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const createModerationLog = db.prepare(`
  INSERT INTO moderation_logs (id, moderator_id, action, target_type, target_id, details)
  VALUES (?, ?, ?, ?, ?, ?)
`);

export default new Elysia({ prefix: "/reports" })
  .post(
    "/create",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Authentication required" };
      }

      const banned = checkReportBan.get(user.userId);
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

      try {
        createReport.run(
          reportId,
          user.userId,
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
  )
  .get("/list", async ({ user, query, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Authentication required" };
    }

    const requestingUser = getUser.get(user.userId);
    if (!requestingUser || !requestingUser.admin) {
      set.status = 403;
      return { error: "Admin access required" };
    }

    const limit = Number.parseInt(query.limit) || 50;
    const offset = Number.parseInt(query.offset) || 0;

    try {
      const reports = getReports.all(limit, offset);

      const enrichedReports = reports.map((report) => {
        const reporter = getUser.get(report.reporter_id);
        let reported = null;

        if (report.reported_type === "user") {
          reported = getUser.get(report.reported_id);
        } else if (report.reported_type === "post") {
          reported = getPost.get(report.reported_id);
        }

        return {
          ...report,
          reporter: reporter
            ? {
                id: reporter.id,
                username: reporter.username,
                name: reporter.name,
                avatar: reporter.avatar,
              }
            : null,
          reported,
        };
      });

      return { reports: enrichedReports };
    } catch (error) {
      console.error("Error fetching reports:", error);
      set.status = 500;
      return { error: "Failed to fetch reports" };
    }
  })
  .post(
    "/resolve/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Authentication required" };
      }

      const requestingUser = getUser.get(user.userId);
      if (!requestingUser || !requestingUser.admin) {
        set.status = 403;
        return { error: "Admin access required" };
      }

      const { action, duration, severity, note } = body;
      const report = getReportById.get(params.id);

      if (!report) {
        set.status = 404;
        return { error: "Report not found" };
      }

      try {
        let resolutionAction = action;

        if (action === "ban_user" && report.reported_type === "user") {
          const suspensionId = Bun.randomUUIDv7();
          const expiresAt = duration
            ? new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
            : null;

          createSuspension.run(
            suspensionId,
            report.reported_id,
            user.userId,
            report.reason,
            severity || 3,
            expiresAt
          );

          updateUserSuspended.run(report.reported_id);

          createModerationLog.run(
            Bun.randomUUIDv7(),
            user.userId,
            "suspend_user",
            "user",
            report.reported_id,
            JSON.stringify({ reportId: params.id, duration, severity })
          );

          const notifId = Bun.randomUUIDv7();
          createNotification.run(
            notifId,
            report.reported_id,
            "suspension",
            expiresAt
              ? `Your account has been suspended until ${new Date(
                  expiresAt
                ).toLocaleString()}`
              : "Your account has been permanently suspended",
            suspensionId,
            user.userId
          );

          broadcastToUser(report.reported_id, {
            type: "n",
            notification: {
              id: notifId,
              type: "suspension",
              content: expiresAt
                ? `Your account has been suspended until ${new Date(
                    expiresAt
                  ).toLocaleString()}`
                : "Your account has been permanently suspended",
            },
          });
        } else if (
          action === "delete_post" &&
          report.reported_type === "post"
        ) {
          deletePost.run(report.reported_id);

          createModerationLog.run(
            Bun.randomUUIDv7(),
            user.userId,
            "delete_post",
            "post",
            report.reported_id,
            JSON.stringify({ reportId: params.id })
          );
        } else if (
          action === "fact_check" &&
          report.reported_type === "post" &&
          note
        ) {
          const factCheckId = Bun.randomUUIDv7();
          createFactCheck.run(
            factCheckId,
            report.reported_id,
            user.userId,
            note,
            severity || "warning"
          );

          createModerationLog.run(
            Bun.randomUUIDv7(),
            user.userId,
            "fact_check",
            "post",
            report.reported_id,
            JSON.stringify({ reportId: params.id, note, severity })
          );
        } else if (action === "ban_reporter") {
          const banId = Bun.randomUUIDv7();
          banReporter.run(
            banId,
            report.reporter_id,
            user.userId,
            "Abusing report system"
          );

          createModerationLog.run(
            Bun.randomUUIDv7(),
            user.userId,
            "ban_reporter",
            "user",
            report.reporter_id,
            JSON.stringify({ reportId: params.id })
          );

          resolutionAction = "banned_reporter";
        } else if (action === "ignore") {
          resolutionAction = "ignored";
        } else {
          set.status = 400;
          return { error: "Invalid action or missing required fields" };
        }

        updateReportStatus.run(
          "resolved",
          user.userId,
          resolutionAction,
          params.id
        );

        return { success: true };
      } catch (error) {
        console.error("Error resolving report:", error);
        set.status = 500;
        return { error: "Failed to resolve report" };
      }
    },
    {
      body: t.Object({
        action: t.String(),
        duration: t.Optional(t.Number()),
        severity: t.Optional(t.Number()),
        note: t.Optional(t.String()),
      }),
    }
  );
