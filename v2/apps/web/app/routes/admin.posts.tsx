import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Form, useLoaderData, useSubmit } from "@remix-run/react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@tweetapus/ui";
import { Heart, Repeat2, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const page = url.searchParams.get("page") || "1";
  const limit = 20;

  const response = await fetch(
    `http://localhost:3000/api/admin/posts?search=${encodeURIComponent(
      search
    )}&page=${page}&limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${user.token}` },
    }
  );

  if (!response.ok) {
    throw new Response("Failed to fetch posts", { status: 500 });
  }

  const data = await response.json();
  return json(data);
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const postId = formData.get("postId");

  if (action === "delete") {
    const response = await fetch(
      `http://localhost:3000/api/admin/posts/${postId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      }
    );

    if (!response.ok) {
      throw new Response("Failed to delete post", { status: 500 });
    }
  }

  return json({ success: true });
}

export default function AdminPosts() {
  const { posts, pagination } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    submit({ search: searchQuery }, { method: "get" });
  };

  const handleDelete = (postId: string) => {
    if (
      confirm(
        "Are you sure you want to delete this post? This action cannot be undone."
      )
    ) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("postId", postId);
      submit(formData, { method: "post" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Post Management</h1>
        <p className="text-muted-foreground">
          Search, moderate, and manage user posts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <Form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search posts by content..."
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
          <CardTitle>Posts ({pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {posts.map(
              (post: {
                id: string;
                content: string;
                mediaUrl?: string;
                createdAt: string;
                author: { username: string; name: string };
                likesCount: number;
                retweetsCount: number;
              }) => (
                <div key={post.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{post.author.name}</span>
                      <span className="text-muted-foreground">
                        @{post.author.username}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-sm">
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(post.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>

                  <div className="mb-3">
                    <p className="whitespace-pre-wrap">{post.content}</p>
                    {post.mediaUrl && (
                      <div className="mt-2">
                        <img
                          src={post.mediaUrl}
                          alt="Post media"
                          className="rounded-lg max-w-md"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Heart className="h-4 w-4" />
                      <span>{post.likesCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Repeat2 className="h-4 w-4" />
                      <span>{post.retweetsCount}</span>
                    </div>
                  </div>
                </div>
              )
            )}

            {posts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No posts found. Try adjusting your search criteria.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
