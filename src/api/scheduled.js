import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)"
);

const createScheduledPost = db.query(`
  INSERT INTO scheduled_posts (id, user_id, content, scheduled_for, poll_data, files_data, gif_url, reply_restriction)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const getScheduledPosts = db.query(`
  SELECT * FROM scheduled_posts
  WHERE user_id = ? AND status = 'pending'
  ORDER BY scheduled_for ASC
`);

const deleteScheduledPost = db.query(`
  DELETE FROM scheduled_posts WHERE id = ? AND user_id = ?
`);

const getPendingScheduledPosts = db.query(`
  SELECT * FROM scheduled_posts
  WHERE status = 'pending' AND scheduled_for <= datetime('now', 'utc')
  ORDER BY scheduled_for ASC
  LIMIT 100
`);

const updateScheduledPostStatus = db.query(`
  UPDATE scheduled_posts
  SET status = ?, posted_at = datetime('now', 'utc')
  WHERE id = ?
`);

export default new Elysia({ prefix: "/scheduled", tags: ["Scheduling"] })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 10_000,
      max: 30,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .post("/", async ({ jwt, headers, body }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const {
        content,
        scheduled_for,
        poll,
        files,
        gif_url,
        reply_restriction,
      } = body;

      if (!content || content.trim().length === 0) {
        return { error: "Content is required" };
      }

      const maxContentLength = user.gold ? 16500 : user.verified ? 5500 : 400;
      if (content.length > maxContentLength) {
        return {
          error: `Content must be ${maxContentLength} characters or less`,
        };
      }

      if (!scheduled_for) {
        return { error: "Scheduled time is required" };
      }

      const scheduledDate = new Date(scheduled_for);
      const now = new Date();

      if (scheduledDate <= now) {
        return { error: "Scheduled time must be in the future" };
      }

      const maxScheduleTime = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000
      );
      if (scheduledDate > maxScheduleTime) {
        return { error: "Cannot schedule more than 1 year in advance" };
      }

      const scheduledPostId = Bun.randomUUIDv7();

      const scheduledPost = createScheduledPost.get(
        scheduledPostId,
        user.id,
        content.trim(),
        scheduledDate.toISOString(),
        poll ? JSON.stringify(poll) : null,
        files ? JSON.stringify(files) : null,
        gif_url || null,
        reply_restriction || "everyone"
      );

      return { success: true, scheduledPost };
    } catch (error) {
      console.error("Scheduled post creation error:", error);
      return { error: "Failed to schedule post" };
    }
  })
  .get("/", async ({ jwt, headers }) => {
    const authorization = headers.authorization;
    if (!authorization) return { error: "Authentication required" };

    try {
      const payload = await jwt.verify(authorization.replace("Bearer ", ""));
      if (!payload) return { error: "Invalid token" };

      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const scheduledPosts = getScheduledPosts.all(user.id);

      return {
        success: true,
        scheduledPosts: scheduledPosts.map((post) => ({
          ...post,
          poll_data: post.poll_data ? JSON.parse(post.poll_data) : null,
          files_data: post.files_data ? JSON.parse(post.files_data) : null,
        })),
      };
    } catch (error) {
      console.error("Get scheduled posts error:", error);
      return { error: "Failed to get scheduled posts" };
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

      const result = deleteScheduledPost.run(params.id, user.id);

      if (result.changes === 0) {
        return { error: "Scheduled post not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("Delete scheduled post error:", error);
      return { error: "Failed to delete scheduled post" };
    }
  });

const processScheduledPosts = async () => {
  const pendingPosts = getPendingScheduledPosts.all();

  for (const scheduledPost of pendingPosts) {
    try {
      const tweetId = Bun.randomUUIDv7();
      const user = db
        .query("SELECT * FROM users WHERE id = ?")
        .get(scheduledPost.user_id);

      if (!user) {
        updateScheduledPostStatus.run("failed", scheduledPost.id);
        continue;
      }

      if (user.restricted) {
        updateScheduledPostStatus.run("failed", scheduledPost.id);
        continue;
      }

      let pollId = null;
      if (scheduledPost.poll_data) {
        const poll = JSON.parse(scheduledPost.poll_data);
        pollId = Bun.randomUUIDv7();
        const expiresAt = new Date(
          Date.now() + poll.duration * 60 * 1000
        ).toISOString();

        db.query(
          "INSERT INTO polls (id, post_id, expires_at) VALUES (?, ?, ?)"
        ).run(pollId, tweetId, expiresAt);

        poll.options.forEach((option, index) => {
          const optionId = Bun.randomUUIDv7();
          db.query(
            "INSERT INTO poll_options (id, poll_id, option_text, option_order) VALUES (?, ?, ?, ?)"
          ).run(optionId, pollId, option.trim(), index);
        });
      }

      db.query(
        `INSERT INTO posts (id, user_id, content, source, poll_id, reply_restriction, scheduled_post_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tweetId,
        user.id,
        scheduledPost.content,
        "scheduled",
        pollId,
        scheduledPost.reply_restriction,
        scheduledPost.id
      );

      if (scheduledPost.files_data) {
        const files = JSON.parse(scheduledPost.files_data);
        files.forEach((file) => {
          const attachmentId = Bun.randomUUIDv7();
          db.query(
            `INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            attachmentId,
            tweetId,
            file.hash,
            file.name,
            file.type,
            file.size,
            file.url
          );
        });
      }

      if (scheduledPost.gif_url) {
        const attachmentId = Bun.randomUUIDv7();
        db.query(
          `INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          attachmentId,
          tweetId,
          null,
          "tenor.gif",
          "image/gif",
          0,
          scheduledPost.gif_url
        );
      }

      updateScheduledPostStatus.run("posted", scheduledPost.id);
    } catch (error) {
      console.error(
        `Failed to post scheduled tweet ${scheduledPost.id}:`,
        error
      );
      updateScheduledPostStatus.run("failed", scheduledPost.id);
    }
  }
};

setInterval(() => {
  processScheduledPosts().catch((error) => {
    console.error("Error processing scheduled posts:", error);
  });
}, 60000);
