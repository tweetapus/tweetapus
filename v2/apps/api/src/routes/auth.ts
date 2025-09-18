import { jwt } from "@elysiajs/jwt";
import { createUser, getUserByUsername } from "@tweetapus/database";
import { generateId } from "@tweetapus/shared";
import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export const authRouter = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  .get("/check-username/:username", async ({ params }) => {
    const user = await getUserByUsername(params.username);
    return { available: !user };
  })

  .post(
    "/register",
    async ({ body, jwt }) => {
      const { username, name, password } = body;

      const existingUser = await getUserByUsername(username);
      if (existingUser) {
        return { error: "Username already taken" };
      }

      try {
        const passwordHash = await Bun.password.hash(password);

        const user = await createUser({
          id: generateId(),
          username,
          name,
          passwordHash,
          verified: false,
          admin: false,
          suspended: false,
          private: false,
          postCount: 0,
          followerCount: 0,
          followingCount: 0,
        });

        const token = await jwt.sign({
          userId: user.id,
          username: user.username,
        });

        return { success: true, token, user };
      } catch (error) {
        return { error: "Registration failed" };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1, maxLength: 50 }),
        name: t.String({ minLength: 1, maxLength: 50 }),
        password: t.String({ minLength: 6, maxLength: 100 }),
      }),
    }
  )

  .post(
    "/login",
    async ({ body, jwt }) => {
      const { username, password } = body;

      const user = await getUserByUsername(username);
      if (!user) {
        return { error: "Invalid username or password" };
      }

      try {
        const isValidPassword = await Bun.password.verify(
          password,
          user.passwordHash || ""
        );
        if (!isValidPassword) {
          return { error: "Invalid username or password" };
        }

        const token = await jwt.sign({
          userId: user.id,
          username: user.username,
        });

        // Remove password hash from user object
        const { passwordHash: _, ...userWithoutPassword } = user;
        return { success: true, token, user: userWithoutPassword };
      } catch (error) {
        console.error("Login error:", error);
        return { error: "Login failed" };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    }
  )

  .use(authMiddleware)
  .get("/me", ({ user }) => {
    if (!user) {
      return { error: "Not authenticated" };
    }
    return { user };
  })

  .post("/logout", () => {
    return { success: true };
  });
