import { staticPlugin } from "@elysiajs/static";
import { Elysia, file } from "elysia";

import api from "./api.js";

const connectedUsers = new Map();

const wsHandler = {
	message: (ws, message) => {
		try {
			let data;
			if (typeof message === "string") {
				data = JSON.parse(message);
			} else {
				data = message;
			}

			if (data.type === "authenticate") {
				const { token } = data;
				if (token) {
					try {
						const payload = JSON.parse(atob(token.split(".")[1]));
						ws.data.userId = payload.userId;
						ws.data.username = payload.username;

						if (!connectedUsers.has(payload.userId)) {
							connectedUsers.set(payload.userId, new Set());
						}
						connectedUsers.get(payload.userId).add(ws);

						ws.send(JSON.stringify({ type: "authenticated", success: true }));
					} catch {
						ws.send(
							JSON.stringify({
								type: "authenticated",
								success: false,
								error: "Invalid token",
							}),
						);
					}
				}
			}
		} catch (error) {
			console.error("WebSocket message error:", error);
		}
	},

	close: (ws) => {
		if (ws.data.userId && connectedUsers.has(ws.data.userId)) {
			connectedUsers.get(ws.data.userId).delete(ws);
			if (connectedUsers.get(ws.data.userId).size === 0) {
				connectedUsers.delete(ws.data.userId);
			}
		}
	},
};

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
}

new Elysia()
	.use(staticPlugin())
	.ws("/ws", wsHandler)
	.get("/account", () => file("./public/account/index.html"))
	.get("/admin", () => file("./public/admin/index.html"))
	.get("/profile/:username", () => file("./public/profile.html"))
	.get("/settings", ({ redirect }) => redirect("/settings/account"))
	.get("/legal", () => file("./public/legal.html"))
	.get("*", ({ cookie, redirect }) => {
		return cookie.agree?.value === "yes"
			? file("./public/timeline/index.html")
			: redirect("/account");
	})
	.use(api)
	.listen(3000, () => {
		console.log(
			"Happies tweetapus app is running on http://localhost:3000 ✅✅✅✅✅✅✅✅✅",
		);
	});
