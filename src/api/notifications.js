import { Elysia } from "elysia";
import db from "../db.js";

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

const getNotifications = db.prepare(`
  SELECT id, type, content, related_id, read, created_at
  FROM notifications 
  WHERE user_id = ? 
  ORDER BY created_at DESC 
  LIMIT ?
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
	try {
		const id = Bun.randomUUIDv7();
		createNotification.run(id, userId, type, content, relatedId);
		console.log(`Notification created: ${type} for user ${userId}`);
		return id;
	} catch (error) {
		console.error("Error creating notification:", error);
		return null;
	}
}

export default new Elysia({ prefix: "/notifications" })
	.get("/", ({ headers, query: { limit = 20 } }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const notifications = getNotifications.all(user.id, parseInt(limit));
			
			return { notifications };
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
		return { success: true };
	})

	.patch("/mark-all-read", ({ headers }) => {
		const token = headers.authorization?.replace("Bearer ", "");
		if (!token) return { error: "Unauthorized" };

		const payload = JSON.parse(atob(token.split(".")[1]));
		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		markAllAsRead.run(user.id);
		return { success: true };
	});
