import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { initializeDatabase } from "@tweetapus/database";
import { Elysia } from "elysia";
import { authMiddleware, suspensionMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { dmRouter } from "./routes/dm";
import { notificationsRouter } from "./routes/notifications";
import { postsRouter } from "./routes/posts";
import { searchRouter } from "./routes/search";
import { tweetaaiRouter } from "./routes/tweetaai";
import { uploadRouter } from "./routes/upload";
import { usersRouter } from "./routes/users";
import { wsHandler } from "./websocket";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

await initializeDatabase();

const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3001", "http://localhost:3000"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: JWT_SECRET,
    })
  )
  .use(
    staticPlugin({
      assets: ".DATA/UPLOADS",
      prefix: "/uploads",
    })
  )
  .use(rateLimitMiddleware)
  .use(suspensionMiddleware)
  .ws("/ws", wsHandler)
  .group("/api", (app) =>
    app
      .use(authRouter)
      .use(usersRouter)
      .use(postsRouter)
      .use(dmRouter)
      .use(notificationsRouter)
      .use(adminRouter)
      .use(uploadRouter)
      .use(tweetaaiRouter)
      .use(searchRouter)
  )
  .get("*", () => {
    return new Response("Tweetapus 🚀", { status: 200 });
  })
  .listen(3000);

console.log("🚀 Tweetapus API is running on http://localhost:3000");

export type App = typeof app;
export { app };
