import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import admin from "./api/admin.js";
import articles from "./api/articles.js";
import auth from "./api/auth.js";
import blocking from "./api/blocking.js";
import bookmarks from "./api/bookmarks.js";
import communities from "./api/communities.js";
import dm from "./api/dm.js";
import extensions from "./api/extensions.js";
import hashtags from "./api/hashtags.js";
import notifications from "./api/notifications.js";
import profile, { avatarRoutes } from "./api/profile.js";
import reports from "./api/reports.js";
import scheduled from "./api/scheduled.js";
import search from "./api/search.js";
import tenor from "./api/tenor.js";
import timeline from "./api/timeline.js";
import tweet from "./api/tweet.js";
import upload, { uploadRoutes } from "./api/upload.js";
import db from "./db.js";
import ratelimit from "./helpers/ratelimit.js";

function formatExpiry(expiryStr) {
  const now = new Date();
  const expiry = new Date(expiryStr);

  const diffMs = expiry - now;
  if (diffMs <= 0) return "expired";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "in less than 1 minute";
  if (diffMin < 60) return `in ${diffMin} minute${diffMin > 1 ? "s" : ""}`;
  if (diffHour < 24) {
    const hours = diffHour;
    const minutes = diffMin % 60;
    return `in ${hours} hour${hours > 1 ? "s" : ""}${
      minutes ? ` and ${minutes} minute${minutes > 1 ? "s" : ""}` : ""
    }`;
  }
  if (diffDay < 7) {
    const days = diffDay;
    const hours = diffHour % 24;
    return `in ${days} day${days > 1 ? "s" : ""}${
      hours ? ` and ${hours} hour${hours > 1 ? "s" : ""}` : ""
    }`;
  }

  return expiry.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const isSuspendedQuery = db.prepare(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const liftSuspension = db.prepare(`
  UPDATE suspensions SET status = 'lifted' WHERE id = ?
`);

const updateUserSuspended = db.prepare(
  "UPDATE users SET suspended = ? WHERE id = ?"
);

const suspensionCache = new Map();
const CACHE_TTL = 30_000;

export default new Elysia({
  prefix: "/api",
})
  .use(
    rateLimit({
      duration: 10_000,
      max: 30,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .onBeforeHandle(async ({ headers }) => {
    const token = headers.authorization?.split(" ")[1];
    if (!token) return;

    const { userId } = JSON.parse(atob(token.split(".")[1]));

    const now = Date.now();
    let cached = suspensionCache.get(userId);

    if (!cached || cached.expiry < now) {
      let suspension = isSuspendedQuery.get(userId);

      if (suspension?.expires_at) {
        const expiresAt = new Date(suspension.expires_at).getTime();
        if (Date.now() > expiresAt) {
          liftSuspension.run(suspension.id);
          updateUserSuspended.run(false, userId);
          suspension = null;
        }
      }

      cached = { suspension, expiry: now + CACHE_TTL };
      suspensionCache.set(userId, cached);
    }

    if (cached.suspension) {
      const suspensionHtml = (
        await Bun.file("./src/assets/suspended.html").text()
      ).replace(
        "%%text%%",
        `Reason: ${cached.suspension.reason}${
          cached.suspension.expires_at
            ? `<br>Expires ${formatExpiry(cached.suspension.expires_at)}`
            : ""
        }`
      );

      return {
        error: "You are suspended",
        suspension: suspensionHtml,
      };
    }
  })
  .get("/emojis", async () => {
    try {
      const rows = db
        .query(
          "SELECT id, name, file_hash, file_url, created_by, created_at FROM emojis ORDER BY created_at DESC"
        )
        .all();
      return { emojis: rows };
    } catch (_err) {
      return { emojis: [] };
    }
  })
  .use(auth)
  .use(admin)
  .use(blocking)
  .use(bookmarks)
  .use(communities)
  .use(tweet)
  .use(articles)
  .use(profile)
  .use(timeline)
  .use(search)
  .use(upload)
  .use(extensions)
  .use(notifications)
  .use(dm)
  .use(tenor)
  .use(hashtags)
  .use(scheduled)
  .use(reports)
  .use(avatarRoutes)
  .use(uploadRoutes);
