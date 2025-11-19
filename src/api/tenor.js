import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import { LRUCache } from "../helpers/cache.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const gifCache = new LRUCache(200, 600000);

const getUserByUsername = db.query(
	"SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
);

export default new Elysia({ prefix: "/tenor", tags: ["Tenor"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 10_000,
			max: 20,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get(
		"/search",
		async ({ jwt, headers, query }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { q = "", limit = 8 } = query;

				if (!q || q.trim().length === 0) {
					return { error: "Search query is required" };
				}

				const cacheKey = `tenor:${q}:${limit}`;
				const cached = gifCache.get(cacheKey);
				if (cached) {
					return cached;
				}

				const finalLimit = Math.min(parseInt(limit, 10) || 8, 20);
				const url = new URL(`${process.env.TENOR_API_HOST || "https://tenor.googleapis.com/v2/"}search`);
				url.searchParams.set("q", q);
				url.searchParams.set("key", TENOR_API_KEY);
				url.searchParams.set("client_key", "tweetapus");
				url.searchParams.set("limit", finalLimit.toString());
				url.searchParams.set("media_filter", "gif,tinygif");

				const response = await fetch(url.toString(), {
					signal: AbortSignal.timeout(5000),
				});

				if (!response.ok) {
					console.error("Tenor API error:", response.status);
					return { error: "Failed to fetch GIFs" };
				}

				const data = await response.json();
				const result = {
					success: true,
					results: data.results || [],
					next: data.next || null,
				};

				gifCache.set(cacheKey, result);
				return result;
			} catch (error) {
				console.error("Tenor search error:", error.message);
				return { error: "Failed to search GIFs" };
			}
		},
		{
			detail: {
				description: "Searches for GIFs using Tenor API",
			},
			query: t.Object({
				q: t.String(),
				limit: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	);
