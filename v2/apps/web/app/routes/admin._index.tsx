import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, CardContent, CardHeader, CardTitle } from "@tweetapus/ui";
import { MessageSquare, UserCheck, Users, UserX } from "lucide-react";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  const [statsResponse, activityResponse] = await Promise.all([
    fetch("http://localhost:3000/api/admin/stats", {
      headers: { Authorization: `Bearer ${user.token}` },
    }),
    fetch("http://localhost:3000/api/admin/recent-activity", {
      headers: { Authorization: `Bearer ${user.token}` },
    }),
  ]);

  if (!statsResponse.ok || !activityResponse.ok) {
    throw new Response("Failed to fetch admin data", { status: 500 });
  }

  const [statsData, activityData] = await Promise.all([
    statsResponse.json(),
    activityResponse.json(),
  ]);

  return json({
    stats: statsData.stats,
    activity: activityData.activity,
  });
}

export default function AdminDashboard() {
  const { stats, activity } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage users, content, and monitor system activity
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.total}</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.posts.total}</div>
            <p className="text-xs text-muted-foreground">
              +15.3% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Verified Users
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.verified}</div>
            <p className="text-xs text-muted-foreground">
              +5.2% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Suspended Users
            </CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.suspended}</div>
            <p className="text-xs text-muted-foreground">
              -2.1% from last month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent User Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.users.map(
                (user: { username: string; createdAt: string }) => (
                  <div
                    key={user.username}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">@{user.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Suspensions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.suspensions.map(
                (suspension: { username: string; createdAt: string }) => (
                  <div
                    key={suspension.username}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">@{suspension.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(suspension.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
