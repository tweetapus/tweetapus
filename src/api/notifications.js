import { Elysia } from "elysia";
import db from "../db.js";

let sendUnreadCounts;
try {
  const indexModule = await import("../index.js");
  sendUnreadCounts = indexModule.sendUnreadCounts;
} catch {
  sendUnreadCounts = () => {};
}

const getUserByUsername = db.query("SELECT id FROM users WHERE username = ?");

const getNotifications = db.prepare(`
  SELECT id, type, content, related_id, read, created_at
  FROM notifications 
  WHERE user_id = ? 
  ORDER BY created_at DESC 
  LIMIT ?
`);

const getNotificationsBefore = db.prepare(`
  SELECT id, type, content, related_id, read, created_at
  FROM notifications 
  WHERE user_id = ? AND created_at < (SELECT created_at FROM notifications WHERE id = ?)
  ORDER BY created_at DESC 
  LIMIT ?
`);

const getTweetById = db.prepare(`
  SELECT 
    p.*,
    u.username,
    u.name,
    u.avatar,
    u.verified,
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
  INSERT INTO notifications (id, user_id, type, content, related_id) 
  VALUES (?, ?, ?, ?, ?)
`);

export function addNotification(userId, type, content, relatedId = null) {
  const id = Bun.randomUUIDv7();

  createNotification.run(id, userId, type, content, relatedId);
  sendUnreadCounts(userId);
  return id;
}

export default new Elysia({ prefix: "/notifications" })
  .get("/", ({ headers, query: { limit = 20, before } }) => {
    try {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) return { error: "Unauthorized" };

      const payload = JSON.parse(atob(token.split(".")[1]));
      const user = getUserByUsername.get(payload.username);
      if (!user) return { error: "User not found" };

      const notifications = before
        ? getNotificationsBefore.all(user.id, before, parseInt(limit))
        : getNotifications.all(user.id, parseInt(limit));

      const enhancedNotifications = notifications.map((notification) => {
        const enhanced = { ...notification };

        if (
          notification.related_id &&
          ["like", "retweet", "reply", "quote", "mention"].includes(
            notification.type
          )
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

      const hasMoreNotifications =
        notifications.length === parseInt(limit);

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
