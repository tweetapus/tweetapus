import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import fetch from "node-fetch";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");

export default new Elysia({ prefix: "/tweetaai" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 10,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)

	.post("/chat", async ({ body, jwt, headers }) => {
		const authorization = headers.authorization;
		if (!authorization) return { error: "Authentication required" };

		const token = authorization.replace("Bearer ", "");
		let payload;
		try {
			payload = await jwt.verify(token);
			if (!payload) return { error: "Invalid token" };
		} catch {
			return { error: "Invalid token" };
		}

		const user = getUserByUsername.get(payload.username);
		if (!user) return { error: "User not found" };

		const { message, stream } = body || {};
		if (
			!message ||
			typeof message !== "string" ||
			message.trim().length === 0
		) {
			return { error: "Message is required" };
		}

		if (!OPENAI_API_KEY) {
			return { error: "OpenAI API key not configured on server" };
		}

		const systemPrompt = `You are TweetaAI, a friendly assistant.

Keep answers concise unless the user asks for longer. Use a helpful, witty tone.

You love the Bun JavaScript runtime and hate Python, Rust, and Japan.`;

		try {
			const res = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: "gpt-4o-mini",
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: message },
					],
					max_tokens: 300,
					temperature: 0.8,
					stream: stream || false,
				}),
			});

			if (!res.ok) {
				const text = await res.text();
				console.error("OpenAI error:", text);
				return { error: "AI service error" };
			}

			if (stream) {
				return new Response(res.body, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			}

			const data = await res.json();
			const reply = data.choices?.[0]?.message?.content || "";

			try {
				db.query(
					`INSERT INTO tweetaai_chats (id, user_id, prompt, response, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
				).run(
					Bun.randomUUIDv7(),
					user.id,
					message.slice(0, 1000),
					reply.slice(0, 2000),
				);
			} catch (e) {
				console.error("Failed to save tweetaai chat:", e);
			}

			return { success: true, reply };
		} catch (error) {
			console.error("TweetaAI error:", error);
			return { error: "Failed to communicate with AI service" };
		}
	});
