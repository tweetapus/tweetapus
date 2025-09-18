import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { Avatar, AvatarFallback, Button, Card, CardContent, Input, Tabs, TabsList, TabsTrigger } from "@tweetapus/ui";
import { Search, UserCheck } from "lucide-react";
import { requireAuth } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const type = url.searchParams.get("type") || "all";

  if (!q.trim()) {
    return json({ users: [], posts: [], query: "" });
  }

  const response = await fetch(
    `http://localhost:3000/api/search?q=${encodeURIComponent(q)}&type=${type}`,
    {
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Response("Search failed", { status: 500 });
  }

  const data = await response.json();
  return json({ ...data, query: q });
}

export default function SearchPage() {
  const { users, posts, query } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const currentType = searchParams.get("type") || "all";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 p-4 border-b">
        <h1 className="text-2xl font-bold mb-4">Search</h1>

        <Form method="get" className="flex gap-2">
          <Input
            name="q"
            placeholder="Search users and posts..."
            defaultValue={query}
            className="flex-1"
          />
          <input type="hidden" name="type" value={currentType} />
          <Button type="submit">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </Form>

        {query && (
          <div className="mt-4">
            <Tabs defaultValue={currentType}>
              <TabsList>
                <TabsTrigger value="all" asChild>
                  <a href={`/search?q=${encodeURIComponent(query)}&type=all`}>
                    All
                  </a>
                </TabsTrigger>
                <TabsTrigger value="users" asChild>
                  <a href={`/search?q=${encodeURIComponent(query)}&type=users`}>
                    Users ({users.length})
                  </a>
                </TabsTrigger>
                <TabsTrigger value="posts" asChild>
                  <a href={`/search?q=${encodeURIComponent(query)}&type=posts`}>
                    Posts ({posts.length})
                  </a>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>

      {!query && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Search Tweetapus</h2>
          <p className="text-muted-foreground">
            Find users and posts by searching for keywords
          </p>
        </div>
      )}

      {query && (
        <div className="space-y-6">
          {(currentType === "all" || currentType === "users") &&
            users.length > 0 && (
              <div className="space-y-4">
                {currentType === "all" && (
                  <h2 className="text-lg font-semibold">Users</h2>
                )}

                {users.map(
                  (user: {
                    id: string;
                    username: string;
                    name: string;
                    bio?: string;
                    verified: boolean;
                    avatar?: string;
                    followersCount: number;
                  }) => (
                    <Card key={user.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback>
                                {user.name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{user.name}</h3>
                                {user.verified && (
                                  <UserCheck className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                              <p className="text-muted-foreground">
                                @{user.username}
                              </p>
                              {user.bio && (
                                <p className="mt-2 text-sm">{user.bio}</p>
                              )}
                              <p className="text-sm text-muted-foreground mt-1">
                                {user.followersCount} followers
                              </p>
                            </div>
                          </div>

                          <Button variant="outline" size="sm">
                            Follow
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )}

          {(currentType === "all" || currentType === "posts") &&
            posts.length > 0 && (
              <div className="space-y-4">
                {currentType === "all" && (
                  <h2 className="text-lg font-semibold">Posts</h2>
                )}

                {posts.map(
                  (post: {
                    post: {
                      id: string;
                      content: string;
                      createdAt: string;
                      likeCount: number;
                    };
                    author: { username: string; name: string };
                  }) => (
                    <Card
                      key={post.post.id}
                      className="border-l-0 border-r-0 border-t-0 rounded-none"
                    >
                      <CardContent className="p-4">
                        <div className="flex space-x-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {post.author?.name
                                ?.split(" ")
                                .map((n: string) => n[0])
                                .join("") || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold text-sm">
                                {post.author?.name}
                              </h3>
                              <span className="text-muted-foreground text-sm">
                                @{post.author?.username}
                              </span>
                              <span className="text-muted-foreground text-sm">
                                ·
                              </span>
                              <span className="text-muted-foreground text-sm">
                                {new Date(
                                  post.post.createdAt
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="mt-2 text-sm">{post.post.content}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )}

          {query && users.length === 0 && posts.length === 0 && (
            <div className="text-center py-12">
              <h2 className="text-xl font-semibold mb-2">No results found</h2>
              <p className="text-muted-foreground">
                Try searching for different keywords
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
