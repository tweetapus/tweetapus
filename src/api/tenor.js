import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;
const TENOR_API_KEY = process.env.TENOR_API_KEY;

const getUserByUsername = db.query(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)"
);

export default new Elysia({ prefix: "/tenor", tags: ["Tenor"] })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 10_000,
      max: 20,
      scoping: "scoped",
      generator: ratelimit,
    })
  )
  .get("/search", async ({ jwt, headers, query }) => {
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

      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(
        q
      )}&key=${TENOR_API_KEY}&client_key=tweetapus&limit=${Math.min(
        parseInt(limit),
        20
      )}&media_filter=gif,tinygif`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error("Tenor API error:", response.status, response.statusText);
        return { error: "Failed to fetch GIFs" };
      }

      const data = await response.json();

      return {
        success: true,
        results: data.results || [],
        next: data.next || null,
      };
    } catch (error) {
      console.error("Tenor search error:", error);
      return { error: "Failed to search GIFs" };
    }
  });
