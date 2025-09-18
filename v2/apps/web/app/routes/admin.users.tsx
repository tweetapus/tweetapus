import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Form, useLoaderData, useSubmit } from "@remix-run/react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@tweetapus/ui";
import { Search, Trash2, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const page = url.searchParams.get("page") || "1";
  const limit = 20;

  const response = await fetch(
    `http://localhost:3000/api/admin/users?search=${encodeURIComponent(
      search
    )}&page=${page}&limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${user.token}` },
    }
  );

  if (!response.ok) {
    throw new Response("Failed to fetch users", { status: 500 });
  }

  const data = await response.json();
  return json(data);
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const userId = formData.get("userId");

  if (action === "suspend") {
    const reason = formData.get("reason");
    const severity = formData.get("severity");

    const response = await fetch(
      `http://localhost:3000/api/admin/users/${userId}/suspend`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          reason,
          severity: Number(severity),
        }),
      }
    );

    if (!response.ok) {
      throw new Response("Failed to suspend user", { status: 500 });
    }
  } else if (action === "unsuspend") {
    const response = await fetch(
      `http://localhost:3000/api/admin/users/${userId}/suspend`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      }
    );

    if (!response.ok) {
      throw new Response("Failed to unsuspend user", { status: 500 });
    }
  } else if (action === "delete") {
    const response = await fetch(
      `http://localhost:3000/api/admin/users/${userId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      }
    );

    if (!response.ok) {
      throw new Response("Failed to delete user", { status: 500 });
    }
  }

  return json({ success: true });
}

export default function AdminUsers() {
  const { users, pagination } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    submit({ search: searchQuery }, { method: "get" });
  };

  const handleAction = (
    action: string,
    userId: string,
    extraData?: Record<string, string>
  ) => {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("userId", userId);

    if (extraData) {
      Object.entries(extraData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    submit(formData, { method: "post" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          Search, moderate, and manage user accounts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search by username, email, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users ({pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map(
              (user: {
                id: string;
                name: string;
                username: string;
                email: string;
                verified: boolean;
                suspended: boolean;
              }) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.name}</p>
                        {user.verified && (
                          <UserCheck className="h-4 w-4 text-blue-500" />
                        )}
                        {user.suspended && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        @{user.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {user.suspended ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction("unsuspend", user.id)}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Unsuspend
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleAction("suspend", user.id, {
                            reason: "Manual suspension",
                            severity: "3",
                          })
                        }
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Suspend
                      </Button>
                    )}

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            "Are you sure you want to delete this user? This action cannot be undone."
                          )
                        ) {
                          handleAction("delete", user.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              )
            )}

            {users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No users found. Try adjusting your search criteria.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
