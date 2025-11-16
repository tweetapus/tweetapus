import { jwt } from "@elysiajs/jwt";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, file } from "elysia";

import api from "./api.js";
import { compression } from "./compress.js";
import db from "./db.js";

const connectedUsers = new Map();
const sseConnections = new Map();
const sseRateLimits = new Map();

const getUnreadNotificationsCount = db.prepare(
	"SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = FALSE",
);

const getUnreadDMCount = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM conversations c
  JOIN conversation_participants cp ON c.id = cp.conversation_id
  WHERE cp.user_id = ?
  AND EXISTS (
    SELECT 1 FROM dm_messages dm
    WHERE dm.conversation_id = c.id
    AND dm.created_at > COALESCE(cp.last_read_at, '1970-01-01')
    AND dm.sender_id != ?
  )
`);

export function broadcastToUser(userId, message) {
	const userSockets = connectedUsers.get(userId);
	if (userSockets) {
		for (const socket of userSockets) {
			try {
				socket.send(JSON.stringify(message));
			} catch (error) {
				console.error("Error sending WebSocket message:", error);
				userSockets.delete(socket);
			}
		}
	}

	const sseClients = sseConnections.get(userId);
	if (sseClients) {
		for (const client of sseClients) {
			try {
				client.controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
			} catch (error) {
				console.error("Error sending SSE message:", error);
				sseClients.delete(client);
			}
		}
	}
}

export function sendUnreadCounts(userId) {
	const notifResult = getUnreadNotificationsCount.get(userId);
	const dmResult = getUnreadDMCount.get(userId, userId);

	broadcastToUser(userId, {
		type: "u",
		notifications: notifResult?.count || 0,
		dms: dmResult?.count || 0,
	});
}

const cleanupExpiredMessages = () => {
	try {
		const expiredMessages = db
			.query(`
      SELECT id, conversation_id FROM dm_messages 
      WHERE expires_at IS NOT NULL 
      AND expires_at <= datetime('now', 'utc') 
      AND deleted_at IS NULL
    `)
			.all();

		if (expiredMessages.length > 0) {
			const deleteStmt = db.prepare(
				"UPDATE dm_messages SET deleted_at = datetime('now', 'utc') WHERE id = ?",
			);

			for (const message of expiredMessages) {
				deleteStmt.run(message.id);

				const participants = db
					.query(
						"SELECT user_id FROM conversation_participants WHERE conversation_id = ?",
					)
					.all(message.conversation_id);

				for (const participant of participants) {
					broadcastToUser(participant.user_id, {
						type: "message-delete",
						conversationId: message.conversation_id,
						messageId: message.id,
					});
				}
			}
		}
	} catch (error) {
		console.error("Error cleaning up expired messages:", error);
	}
};

setInterval(cleanupExpiredMessages, 60000);
cleanupExpiredMessages();

new Elysia()
	.use(compression)
	.use(staticPlugin())
	.use(
		openapi({
			path: "/api",
			scalar: {
				hideTestRequestButton: true,
				hideModels: true,
				hideClientButton: true,
				showSidebar: true,
				telemetry: false,
			},
			documentation: {
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "JWT",
						},
					},
				},
			},
			exclude: {
				paths: ["/*", "/public/*", "/legal", "/admin", "/api/admin/*"],
				tags: ["admin"],
			},
		}),
	)
	.use(jwt({ name: "jwt", secret: process.env.JWT_SECRET }))
	.get(
		"/api/sse",
		async ({ jwt, query, set }) => {
			const { token } = query;

			if (!token) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const payload = await jwt.verify(token);
			if (!payload) {
				set.status = 401;
				return { error: "Invalid token" };
			}

			const userId = payload.userId;
			const now = Date.now();
			const lastConnection = sseRateLimits.get(userId) || 0;

			if (now - lastConnection < 1000) {
				set.status = 429;
				return { error: "Too many connection attempts. Please wait." };
			}

			sseRateLimits.set(userId, now);

			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(`:ok\n\n`);

					if (!sseConnections.has(userId)) {
						sseConnections.set(userId, new Set());
					}
					const client = { controller };
					sseConnections.get(userId).add(client);

					const notifResult = getUnreadNotificationsCount.get(userId);
					const dmResult = getUnreadDMCount.get(userId, userId);

					controller.enqueue(
						`data: ${JSON.stringify({
							type: "u",
							notifications: notifResult?.count || 0,
							dms: dmResult?.count || 0,
						})}\n\n`,
					);

					const keepAlive = setInterval(() => {
						try {
							controller.enqueue(`:ping\n\n`);
						} catch {
							clearInterval(keepAlive);
						}
					}, 30000);

					client.keepAlive = keepAlive;
				},
				cancel() {
					if (sseConnections.has(userId)) {
						const clients = sseConnections.get(userId);
						for (const client of clients) {
							if (client.keepAlive) clearInterval(client.keepAlive);
						}
						clients.clear();
						sseConnections.delete(userId);
					}
				},
			});

			set.headers = {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			};

			return new Response(stream, {
				headers: set.headers,
			});
		},
		{
			detail: {
				description: "Notifications & DMs stream",
			},
		},
	)
	.get("/admin", () => file("./public/admin/index.html"))
	.get("/legal", () => file("./public/legal.html"))
	.get("*", ({ cookie }) => {
		return cookie.agree?.value === "yes"
			? file("./public/timeline/index.html")
			: file("./public/account-v2/index.html");
	})
	.use(api)
	.listen({ port: process.env.PORT || 3000, idleTimeout: 255 }, () => {
		console.log(
			`\x1b[38;2;29;161;242m __    _                     _
 \\ \\  | |___      _____  ___| |_ __ _ _ __  _   _ ___
  \\ \\ | __\\ \\ /\\ / / _ \\/ _ \\ __/ _\` | '_ \\| | | / __|
  / / | |_ \\ V  V /  __/  __/ || (_| | |_) | |_| \\__ \\
 /_/   \\__| \\_/\\_/ \\___|\\___|\\__\\__,_| .__/ \\__,_|___/
                                     |_|\x1b[0m

Happies tweetapus app is running on \x1b[38;2;29;161;242m\x1b[1m\x1b[4mhttp://localhost:${
				process.env.PORT || 3000
			}\x1b[0m`,
		);
	});
