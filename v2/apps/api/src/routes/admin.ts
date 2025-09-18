import {
  deletePost as dbDeletePost,
  deleteUser as dbDeleteUser,
  getAdminStats,
  getRecentActivity,
  getTimelinePosts,
  getUserById,
  searchPosts,
  searchUsers,
  suspendUser,
  unsuspendUser,
} from "@tweetapus/database";
import { generateId } from "@tweetapus/shared";
import { Elysia, t } from "elysia";
import { requireAdmin } from "../middleware/auth";

export const adminRouter = new Elysia({ prefix: "/admin" })
  .use(requireAdmin)

  .get("/stats", async () => {
    const stats = await getAdminStats();
    return { stats };
  })

  .get("/users", async ({ query }) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const search = (query.search as string) || "";

    let users;
    if (search) {
      users = await searchUsers(search, limit);
    } else {
      users = [];
    }

    const total = users.length;
    const pages = Math.ceil(total / limit);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  })

  .get("/users/:id", async ({ params }) => {
    const user = await getUserById(params.id);
    if (!user) {
      return { error: "User not found" };
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword };
  })

  .post(
    "/users/:id/suspend",
    async ({ params, body, user }) => {
      const { reason, severity, duration, notes } = body;

      try {
        await suspendUser({
          id: generateId(),
          userId: params.id,
          suspendedBy: user.id,
          reason,
          severity,
          expiresAt: duration
            ? new Date(Date.now() + duration * 60 * 1000).toISOString()
            : null,
          notes: notes || null,
          status: "active",
        });

        return { success: true };
      } catch {
        return { error: "Failed to suspend user" };
      }
    },
    {
      body: t.Object({
        reason: t.String({ minLength: 1, maxLength: 500 }),
        severity: t.Number({ minimum: 1, maximum: 5 }),
        duration: t.Optional(t.Number({ minimum: 1 })),
        notes: t.Optional(t.String({ maxLength: 1000 })),
      }),
    }
  )

  .delete("/users/:id/suspend", async ({ params }) => {
    try {
      await unsuspendUser(params.id);
      return { success: true };
    } catch {
      return { error: "Failed to unsuspend user" };
    }
  })

  .delete("/users/:id", async ({ params }) => {
    try {
      await dbDeleteUser(params.id);
      return { success: true };
    } catch {
      return { error: "Failed to delete user" };
    }
  })

  .get("/posts", async ({ query }) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const search = (query.search as string) || "";
    const offset = (page - 1) * limit;

    let posts;
    if (search) {
      posts = await searchPosts(search, limit);
    } else {
      posts = await getTimelinePosts(limit, offset);
    }

    const total = posts.length;
    const pages = Math.ceil(total / limit);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  })

  .delete("/posts/:id", async ({ params }) => {
    try {
      await dbDeletePost(params.id);
      return { success: true };
    } catch {
      return { error: "Failed to delete post" };
    }
  })

  .get("/suspensions", async ({ query }) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

    const mockSuspensions = [
      {
        id: "1",
        reason: "Spam posting",
        severity: 3,
        status: "active",
        createdAt: new Date().toISOString(),
        user: { username: "spammer1", name: "Spam User" },
        suspendedBy: { username: "admin", name: "Admin User" },
      },
    ];

    return {
      suspensions: mockSuspensions,
      pagination: {
        page,
        limit,
        total: mockSuspensions.length,
        pages: 1,
      },
    };
  })

  .get("/recent-activity", async () => {
    const activity = await getRecentActivity();
    return { activity };
  });
