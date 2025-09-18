import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  Textarea,
} from "@tweetapus/ui";
import {
  Bell,
  Bot,
  Heart,
  Home,
  Image,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Search,
  Share,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { apiCall, requireAuth } from "~/lib/auth.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Timeline - Tweetapus" },
    { name: "description", content: "Your Tweetapus timeline" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);

  try {
    const data = await apiCall("/posts", {}, user.token);
    return json({ posts: data.posts || [], error: null, user });
  } catch {
    return json({ posts: [], error: "Failed to load posts", user });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const content = formData.get("content") as string;
  const postId = formData.get("postId") as string;
  const imageUrl = formData.get("imageUrl") as string;

  if (intent === "create_post") {
    if (!content || content.trim().length === 0) {
      return json({ error: "Post content is required" });
    }

    if (content.length > 280) {
      return json({ error: "Post must be 280 characters or less" });
    }

    try {
      const postData: any = { content };
      if (imageUrl) {
        postData.imageUrl = imageUrl;
      }

      const data = await apiCall(
        "/posts",
        {
          method: "POST",
          body: JSON.stringify(postData),
        },
        user.token
      );

      if (data.success) {
        return redirect("/timeline-new");
      } else {
        return json({ error: data.error || "Failed to create post" });
      }
    } catch {
      return json({ error: "Network error" });
    }
  }

  if (intent === "like_post") {
    try {
      const data = await apiCall(
        `/posts/${postId}/like`,
        { method: "POST" },
        user.token
      );
      return json({ success: data.success, error: data.error });
    } catch {
      return json({ error: "Network error" });
    }
  }

  if (intent === "unlike_post") {
    try {
      const data = await apiCall(
        `/posts/${postId}/like`,
        { method: "DELETE" },
        user.token
      );
      return json({ success: data.success, error: data.error });
    } catch {
      return json({ error: "Network error" });
    }
  }

  if (intent === "retweet_post") {
    try {
      const data = await apiCall(
        `/posts/${postId}/retweet`,
        { method: "POST" },
        user.token
      );
      return json({ success: data.success, error: data.error });
    } catch {
      return json({ error: "Network error" });
    }
  }

  return json({ error: "Invalid action" });
}

interface Post {
  post: {
    id: string;
    content: string;
    createdAt: string;
    likeCount: number;
    retweetCount: number;
    replyCount: number;
  };
  author: {
    id: string;
    username: string;
    name: string;
    avatar?: string;
  };
}

function PostCard({ post }: { post: Post }) {
  const fetcher = useFetcher();
  const [isLiked, setIsLiked] = useState(false);
  const [isRetweeted, setIsRetweeted] = useState(false);
  const [likeCount, setLikeCount] = useState(post.post.likeCount);
  const [retweetCount, setRetweetCount] = useState(post.post.retweetCount);

  const handleLike = () => {
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount((prev) => (newIsLiked ? prev + 1 : prev - 1));

    fetcher.submit(
      {
        intent: newIsLiked ? "like_post" : "unlike_post",
        postId: post.post.id,
      },
      { method: "post" }
    );
  };

  const handleRetweet = () => {
    const newIsRetweeted = !isRetweeted;
    setIsRetweeted(newIsRetweeted);
    setRetweetCount((prev) => (newIsRetweeted ? prev + 1 : prev - 1));

    fetcher.submit(
      { intent: "retweet_post", postId: post.post.id },
      { method: "post" }
    );
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "now";
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="border-l-0 border-r-0 border-t-0 rounded-none">
      <CardContent className="p-4">
        <div className="flex space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {post.author?.name
                ?.split(" ")
                .map((n) => n[0])
                .join("") || "U"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-sm truncate">
                {post.author?.name || "Unknown"}
              </h3>
              <span className="text-muted-foreground text-sm">
                @{post.author?.username || "unknown"}
              </span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-muted-foreground text-sm">
                {timeAgo(post.post.createdAt)}
              </span>
              <div className="ml-auto">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-2 text-sm">{post.post.content}</p>

            <div className="flex items-center justify-between mt-3 max-w-md">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-blue-600"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                {post.post.replyCount}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className={`text-muted-foreground hover:text-green-600 ${
                  isRetweeted ? "text-green-600" : ""
                }`}
                onClick={handleRetweet}
                disabled={fetcher.state !== "idle"}
              >
                <Repeat2 className="h-4 w-4 mr-1" />
                {retweetCount}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className={`text-muted-foreground hover:text-red-600 ${
                  isLiked ? "text-red-600" : ""
                }`}
                onClick={handleLike}
                disabled={fetcher.state !== "idle"}
              >
                <Heart
                  className={`h-4 w-4 mr-1 ${isLiked ? "fill-current" : ""}`}
                />
                {likeCount}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <Share className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComposeCard({ user }: { user: any }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [content, setContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  const characterCount = content.length;
  const isOverLimit = characterCount > 280;
  const canPost = content.trim().length > 0 && !isOverLimit && !uploading;

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Maximum size is 10MB");
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        alert("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed");
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canPost) return;

    setUploading(true);

    try {
      let imageUrl = null;

      if (selectedImage) {
        const formData = new FormData();
        formData.append("file", selectedImage);

        const uploadResponse = await fetch(
          "http://localhost:3000/api/upload/image",
          {
            method: "POST",
            body: formData,
          }
        );

        const uploadData = await uploadResponse.json();

        if (uploadData.success) {
          imageUrl = uploadData.url;
        } else {
          alert(uploadData.error || "Failed to upload image");
          return;
        }
      }

      const postFormData = new FormData();
      postFormData.append("intent", "create_post");
      postFormData.append("content", content);
      if (imageUrl) {
        postFormData.append("imageUrl", imageUrl);
      }

      const response = await fetch("/timeline-new", {
        method: "POST",
        body: postFormData,
      });

      if (response.ok) {
        setContent("");
        removeImage();
        window.location.reload();
      }
    } catch (error) {
      alert("Failed to create post");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-l-0 border-r-0 border-t-0 rounded-none">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {user?.name
                ?.split(" ")
                .map((n: string) => n[0])
                .join("") || "U"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <Textarea
              name="content"
              placeholder="What's happening?"
              className="min-h-[80px] border-0 p-0 resize-none focus-visible:ring-0 text-lg"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSubmitting || uploading}
            />

            {imagePreview && (
              <div className="relative mt-3">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-64 rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={removeImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {actionData?.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-2">
                {actionData.error}
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center space-x-3 text-muted-foreground">
                <input
                  type="file"
                  id="image-upload"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <label htmlFor="image-upload">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                  >
                    <span>
                      <Image className="h-4 w-4" />
                    </span>
                  </Button>
                </label>

                <span
                  className={`text-sm ${isOverLimit ? "text-destructive" : ""}`}
                >
                  {characterCount}/280
                </span>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={!canPost || isSubmitting || uploading}
              >
                {uploading
                  ? "Uploading..."
                  : isSubmitting
                  ? "Posting..."
                  : "Post"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Timeline() {
  const { posts, error, user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto flex">
        <div className="w-64 bg-card border-r p-4 h-screen sticky top-0">
          <div className="space-y-4">
            <div className="px-4 py-2">
              <h1 className="text-xl font-bold">Tweetapus</h1>
            </div>

            <nav className="space-y-2">
              <Form method="get" action="/timeline-new">
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start"
                >
                  <Home className="h-5 w-5 mr-3" />
                  Home
                </Button>
              </Form>

              <Form method="get" action={`/profile/${user.username}`}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start"
                >
                  <User className="h-5 w-5 mr-3" />
                  Profile
                </Button>
              </Form>

              <Link to="/notifications">
                <Button variant="ghost" className="w-full justify-start">
                  <Bell className="h-5 w-5 mr-3" />
                  Notifications
                </Button>
              </Link>

              <Link to="/search">
                <Button variant="ghost" className="w-full justify-start">
                  <Search className="h-5 w-5 mr-3" />
                  Search
                </Button>
              </Link>

              <Link to="/messages">
                <Button variant="ghost" className="w-full justify-start">
                  <MessageCircle className="h-5 w-5 mr-3" />
                  Messages
                </Button>
              </Link>

              <Link to="/tweetaai">
                <Button variant="ghost" className="w-full justify-start">
                  <Bot className="h-5 w-5 mr-3" />
                  TweetaAI
                </Button>
              </Link>
            </nav>

            <div className="mt-auto pt-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {user?.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("") || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    @{user?.username}
                  </p>
                </div>
                <Form method="post" action="/logout">
                  <Button type="submit" variant="ghost" size="icon">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </Form>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-2xl border-x border-border">
          <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
            <h1 className="text-xl font-bold">Home</h1>
          </div>

          <ComposeCard user={user} />

          <div>
            {error && (
              <div className="p-4 text-center text-destructive">
                <p>Failed to load posts: {error}</p>
              </div>
            )}

            {posts && posts.length > 0 ? (
              posts.map((post: Post) => (
                <PostCard key={post.post.id} post={post} />
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>No posts yet! 🎉</p>
                <p className="text-sm mt-2">Be the first to post something.</p>
              </div>
            )}
          </div>

          <div className="p-8 text-center text-muted-foreground">
            <p>That's all for now! 🎉</p>
          </div>
        </div>

        <div className="w-80 p-4">
          <div className="bg-card rounded-lg p-4">
            <h3 className="font-semibold mb-3">What's happening</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>🚧 Tweetapus v2 is in active development</p>
              <p>✨ Built with modern web technologies</p>
              <p>🔄 Real-time features coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
