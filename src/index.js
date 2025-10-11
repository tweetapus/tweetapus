import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, file } from "elysia";
import api from "./api.js";
import { compression } from "./compress.js";
import db from "./db.js";

const connectedUsers = new Map();
const sseConnections = new Map();
const sseRateLimits = new Map();

const getUnreadNotificationsCount = db.prepare(
  "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = FALSE"
);

const getUnreadDMCount = db.prepare(`
  SELECT COUNT(DISTINCT dm.conversation_id) as count
  FROM dm_messages dm
  JOIN conversation_participants cp ON dm.conversation_id = cp.conversation_id
  WHERE cp.user_id = ?
  AND dm.created_at > COALESCE(cp.last_read_at, '1970-01-01')
  AND dm.sender_id != ?
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
    type: "unread_counts",
    notifications: notifResult?.count || 0,
    dms: dmResult?.count || 0,
  });
}

new Elysia()
  .use(compression)
  .use(staticPlugin())
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET }))
  .get("/sse", async ({ jwt, query, set }) => {
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

        try {
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "unread_counts",
              notifications: notifResult?.count || 0,
              dms: dmResult?.count || 0,
            })}\n\n`
          );
        } catch (error) {
          console.error("Error sending initial unread counts:", error);
        }

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
  })
  .ws("/ws", {
    open: async (ws) => {
      const { token } = ws.data.query;

      if (!token) ws.close();

      const payload = await ws.data.jwt.verify(token);
      if (!payload) ws.close();

      ws.data.userId = payload.userId;
      ws.data.username = payload.username;
      if (!connectedUsers.has(payload.userId)) {
        connectedUsers.set(payload.userId, new Set());
      }
      connectedUsers.get(payload.userId).add(ws);
    },
    close: (ws) => {
      if (ws.data.userId && connectedUsers.has(ws.data.userId)) {
        connectedUsers.get(ws.data.userId).delete(ws);
        if (connectedUsers.get(ws.data.userId).size === 0) {
          connectedUsers.delete(ws.data.userId);
        }
      }
    },
  })
  .get("/account", () => file("./public/account/index.html"))
  .get("/admin", () => file("./public/admin/index.html"))
  .get("/profile/:username", () => file("./public/timeline/index.html"))
  .get("/settings", ({ redirect }) => redirect("/settings/account"))
  .get("/settings/:page", () => file("./public/account/index.html"))
  .get("/legal", () => file("./public/legal.html"))
  .get("*", ({ cookie, redirect }) => {
    return cookie.agree?.value === "yes"
      ? file("./public/timeline/index.html")
      : redirect("/account");
  })
  .use(api)
  .listen({ port: 3000, idleTimeout: 255 }, () => {
    console.log(
      "Happies tweetapus app is running on http://localhost:3000 ✅✅✅✅✅✅✅✅✅"
    );
  });
