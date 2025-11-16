import { Elysia } from "elysia";
import db from "../db.js";

let sendUnreadCounts;
try {
  const indexModule = await import("../index.js");
  sendUnreadCounts = indexModule.sendUnreadCounts;
} catch {
  sendUnreadCounts = () => {};
}

const getUserByUsername = db.query(
  "SELECT id FROM users WHERE LOWER(username) = LOWER(?)"
);

const getNotifications = db.prepare(`
  SELECT 
    n.id, n.type, n.content, n.related_id, n.actor_id, n.actor_username, n.actor_name, n.read, n.created_at,
    u.avatar as actor_avatar, u.verified as actor_verified, u.gold as actor_gold, u.avatar_radius as actor_avatar_radius
  FROM notifications n
  LEFT JOIN users u ON n.actor_id = u.id
  WHERE n.user_id = ? 
  ORDER BY n.created_at DESC 
  LIMIT ?
`);

const getNotificationsBefore = db.prepare(`
  SELECT 
    n.id, n.type, n.content, n.related_id, n.actor_id, n.actor_username, n.actor_name, n.read, n.created_at,
    u.avatar as actor_avatar, u.verified as actor_verified, u.gold as actor_gold, u.avatar_radius as actor_avatar_radius
  FROM notifications n
  LEFT JOIN users u ON n.actor_id = u.id
  WHERE n.user_id = ? AND n.created_at < (SELECT created_at FROM notifications WHERE id = ?)
  ORDER BY n.created_at DESC 
  LIMIT ?
`);

const getTweetById = db.prepare(`
  SELECT 
    p.*,
    u.username,
    u.name,
    u.avatar,
    u.verified,
    u.gold,
    u.avatar_radius,
    COALESCE(like_counts.count, 0) as like_count,
    COALESCE(retweet_counts.count, 0) as retweet_count,
    COALESCE(reply_counts.count, 0) as reply_count,
    COALESCE(quote_counts.count, 0) as quote_count,
    EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND post_id = p.id) as liked_by_user,
    EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND post_id = p.id) as retweeted_by_user
  FROM posts p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN (
    SELECT post_id, COUNT(*) as count FROM likes GROUP BY post_id
  ) like_counts ON p.id = like_counts.post_id
  LEFT JOIN (
    SELECT post_id, COUNT(*) as count FROM retweets GROUP BY post_id
  ) retweet_counts ON p.id = retweet_counts.post_id
  LEFT JOIN (
    SELECT reply_to, COUNT(*) as count FROM posts WHERE reply_to IS NOT NULL GROUP BY reply_to
  ) reply_counts ON p.id = reply_counts.reply_to
  LEFT JOIN (
    SELECT quote_tweet_id, COUNT(*) as count FROM posts WHERE quote_tweet_id IS NOT NULL GROUP BY quote_tweet_id
  ) quote_counts ON p.id = quote_counts.quote_tweet_id
  WHERE p.id = ?
`);

const markAsRead = db.prepare(`
  UPDATE notifications 
  SET read = TRUE 
  WHERE id = ? AND user_id = ?
`);

const markAllAsRead = db.prepare(`
  UPDATE notifications 
  SET read = TRUE 
  WHERE user_id = ?
`);

const getUnreadCount = db.prepare(`
  SELECT COUNT(*) as count 
  FROM notifications 
  WHERE user_id = ? AND read = FALSE
`);

const createNotification = db.prepare(`
  INSERT INTO notifications (id, user_id, type, content, related_id, actor_id, actor_username, actor_name) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function addNotification(
  userId,
  type,
  content,
  relatedId = null,
  actorId = null,
  actorUsername = null,
  actorName = null
) {
  const id = Bun.randomUUIDv7();

  createNotification.run(
    id,
    userId,
    type,
    content,
    relatedId,
    actorId,
    actorUsername,
    actorName
  );
  sendUnreadCounts(userId);
  return id;
}

export default new Elysia({ prefix: "/notifications", tags: ["Notifications"] })
  .get("/", ({ headers, query: { limit = 20, before } }) => {
    try {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) return { error: "Unauthorized" };

      const payload = JSON.parse(atob(token.split(".")[1]));
      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const notifications = before
        ? getNotificationsBefore.all(user.id, before, parseInt(limit, 10))
        : getNotifications.all(user.id, parseInt(limit, 10));

      const enhancedNotifications = notifications.map((notification) => {
        const enhanced = { ...notification };

        try {
          if (
            notification.related_id &&
            typeof notification.related_id === "string"
          ) {
            if (notification.related_id.startsWith("subtitle:")) {
              const encoded = notification.related_id.substring(
                "subtitle:".length
              );
              const decoded = Buffer.from(encoded, "base64").toString("utf8");
              if (enhanced.content !== decoded)
                enhanced.tweet = { content: decoded };
            } else if (notification.related_id.startsWith("meta:")) {
              const encoded = notification.related_id.substring("meta:".length);
              const json = Buffer.from(encoded, "base64").toString("utf8");
              try {
                const meta = JSON.parse(json);
                if (meta.subtitle) {
                  if (enhanced.content !== meta.subtitle) {
                    enhanced.tweet = { content: meta.subtitle };
                  }
                }
                if (meta.url) enhanced.url = meta.url;
                if (meta.customIcon) enhanced.customIcon = meta.customIcon;
              } catch (e) {
                console.error("Failed to parse meta related_id:", e);
              }
            }
          }
        } catch (err) {
          console.error("Failed to decode related_id metadata:", err);
        }

        if (
          notification.related_id &&
          typeof notification.related_id === "string" &&
          !notification.related_id.startsWith("meta:") &&
          !notification.related_id.startsWith("subtitle:") &&
          [
            "like",
            "retweet",
            "reply",
            "quote",
            "mention",
            "fact_check",
          ].includes(notification.type)
        ) {
          try {
            const tweet = getTweetById.get(
              user.id,
              user.id,
              notification.related_id
            );
            if (tweet) {
              enhanced.tweet = {
                id: tweet.id,
                content: tweet.content,
                created_at: tweet.created_at,
                user: {
                  username: tweet.username,
                  name: tweet.name,
                  avatar: tweet.avatar,
                  verified: tweet.verified,
                  gold: tweet.gold,
                  avatar_radius: tweet.avatar_radius,
                },
                like_count: tweet.like_count,
                retweet_count: tweet.retweet_count,
                reply_count: tweet.reply_count,
                quote_count: tweet.quote_count,
              };
            }
          } catch (error) {
            console.error("Error fetching tweet for notification:", error);
          }
        }

        return enhanced;
      });

      const hasMoreNotifications = notifications.length === parseInt(limit);

      return {
        notifications: enhancedNotifications,
        hasMoreNotifications,
      };
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return { error: "Failed to fetch notifications" };
    }
  })

  .get("/unread-count", ({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) return { error: "Unauthorized" };

    const payload = JSON.parse(atob(token.split(".")[1]));
    const user = getUserByUsername.get(payload.username);
    if (!user) return { error: "User not found" };

    const result = getUnreadCount.get(user.id);
    return { count: result.count };
  })

  .patch("/:id/read", ({ headers, params: { id } }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) return { error: "Unauthorized" };

    const payload = JSON.parse(atob(token.split(".")[1]));
    const user = getUserByUsername.get(payload.username);
    if (!user) return { error: "User not found" };

    markAsRead.run(id, user.id);
    sendUnreadCounts(user.id);
    return { success: true };
  })

  .patch("/mark-all-read", ({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) return { error: "Unauthorized" };

    const payload = JSON.parse(atob(token.split(".")[1]));
    const user = getUserByUsername.get(payload.username);
    if (!user) return { error: "User not found" };

    markAllAsRead.run(user.id);
    sendUnreadCounts(user.id);
    return { success: true };
  });
