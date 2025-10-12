import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import admin from "./api/admin.js";
import articles from "./api/articles.js";
import auth from "./api/auth.js";
import blocking from "./api/blocking.js";
import bookmarks from "./api/bookmarks.js";
import dm from "./api/dm.js";
import hashtags from "./api/hashtags.js";
import notifications from "./api/notifications.js";
import presence from "./api/presence.js";
import profile, { avatarRoutes } from "./api/profile.js";
import scheduled from "./api/scheduled.js";
import search from "./api/search.js";
import tenor from "./api/tenor.js";
import timeline from "./api/timeline.js";
import tweet from "./api/tweet.js";
import upload, { uploadRoutes } from "./api/upload.js";
import db from "./db.js";
import ratelimit from "./helpers/ratelimit.js";

const isSuspendedQuery = db.query(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const liftSuspension = db.query(`
  UPDATE suspensions SET status = 'lifted' WHERE id = ?
`);

const updateUserSuspended = db.query(
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
  .onBeforeHandle(({ headers }) => {
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
      return {
        error: "You are suspended",
        suspension: cached.suspension,
      };
    }
  })
  .use(auth)
  .use(admin)
  .use(blocking)
  .use(bookmarks)
  .use(tweet)
  .use(articles)
  .use(profile)
  .use(timeline)
  .use(search)
  .use(upload)
  .use(notifications)
  .use(dm)
  .use(tenor)
  .use(hashtags)
  .use(scheduled)
  .use(presence)
  .use(avatarRoutes)
  .use(uploadRoutes);
