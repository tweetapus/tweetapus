import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
	Link,
	useFetcher,
	useLoaderData,
} from "@remix-run/react";
import {
	Avatar,
	AvatarFallback,
	Button,
	Card,
	CardContent,
} from "@tweetapus/ui";
import {
	ArrowLeft,
	Calendar,
	Home,
	Link as LinkIcon,
	MapPin,
	UserMinus,
	UserPlus,
	Users,
} from "lucide-react";
import { useState } from "react";
import { apiCall, getOptionalUser, requireAuth } from "~/lib/auth.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	return [
		{
			title: `${data?.profileUser?.name || "User"} (@${
				data?.profileUser?.username || "user"
			}) - Tweetapus`,
		},
		{
			name: "description",
			content: `${data?.profileUser?.bio || `Profile of ${data?.profileUser?.name}`}`,
		},
	];
};

export async function loader({ params, request }: LoaderFunctionArgs) {
	const username = params.username;
	if (!username) {
		throw new Response("Not Found", { status: 404 });
	}

	const currentUser = await getOptionalUser(request);

	try {
		const profileData = await apiCall(
			`/users/${username}`,
			{},
			currentUser?.token,
		);

		if (profileData.error) {
			throw new Response("User not found", { status: 404 });
		}

		let relationship = null;
		if (currentUser) {
			try {
				const relationshipData = await apiCall(
					`/users/${username}/relationship`,
					{},
					currentUser.token,
				);
				relationship = relationshipData.relationship;
			} catch {
				relationship = null;
			}
		}

		try {
			const postsData = await apiCall(
				`/posts/user/${username}`,
				{},
				currentUser?.token,
			);
			const posts = postsData.posts || [];

			return json({
				profileUser: profileData.user,
				currentUser,
				relationship,
				posts,
			});
		} catch {
			return json({
				profileUser: profileData.user,
				currentUser,
				relationship,
				posts: [],
			});
		}
	} catch {
		throw new Response("User not found", { status: 404 });
	}
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAuth(request);
	const formData = await request.formData();
	const intent = formData.get("intent");
	const username = params.username;

	if (!username) {
		return json({ error: "Username required" });
	}

	if (intent === "follow") {
		try {
			const data = await apiCall(
				`/users/${username}/follow`,
				{ method: "POST" },
				user.token,
			);
			return json({ success: data.success, error: data.error });
		} catch {
			return json({ error: "Failed to follow user" });
		}
	}

	if (intent === "unfollow") {
		try {
			const data = await apiCall(
				`/users/${username}/follow`,
				{ method: "DELETE" },
				user.token,
			);
			return json({ success: data.success, error: data.error });
		} catch {
			return json({ error: "Failed to unfollow user" });
		}
	}

  return json({ error: "Invalid action" });
}

export default function Profile() {
  const { profileUser, currentUser, relationship, posts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
  const isOwnProfile = currentUser?.id === profileUser.id;
  const [isFollowing, setIsFollowing] = useState(relationship?.following || false);
  const [followerCount, setFollowerCount] = useState(profileUser.followerCount);

  const handleFollowToggle = () => {
    if (!currentUser) return;
    
    const newFollowing = !isFollowing;
    setIsFollowing(newFollowing);
    setFollowerCount((prev: number) => (newFollowing ? prev + 1 : prev - 1));

    fetcher.submit(
      { intent: newFollowing ? "follow" : "unfollow" },
      { method: "post" }
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto flex">
        {currentUser && (
          <div className="w-64 bg-card border-r p-4 h-screen sticky top-0">
            <div className="space-y-4">
              <div className="px-4 py-2">
                <h1 className="text-xl font-bold">Tweetapus</h1>
              </div>

              <nav className="space-y-2">
                <Link to="/timeline-new">
                  <Button variant="ghost" className="w-full justify-start">
                    <Home className="h-5 w-5 mr-3" />
                    Home
                  </Button>
                </Link>

                <Link to={`/profile/${currentUser.username}`}>
                  <Button
                    variant={isOwnProfile ? "default" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Users className="h-5 w-5 mr-3" />
                    Profile
                  </Button>
                </Link>
              </nav>

              <div className="mt-auto pt-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {currentUser?.name
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("") || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{currentUser?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      @{currentUser?.username}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 max-w-2xl border-x border-border">
          <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
            <div className="flex items-center gap-4">
              <Link to="/timeline-new">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">{profileUser.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {formatNumber(profileUser.postCount)} posts
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="h-48 bg-gradient-to-r from-blue-500 to-purple-600"></div>

            <div className="relative px-4 pb-4">
              <div className="flex justify-between items-start -mt-16 mb-4">
                <Avatar className="h-32 w-32 border-4 border-background">
                  <AvatarFallback className="text-2xl">
                    {profileUser.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("") || "U"}
                  </AvatarFallback>
                </Avatar>

                {!isOwnProfile && currentUser && (
                  <div className="mt-16">
                    <Button
                      variant={isFollowing ? "outline" : "default"}
                      className="ml-2"
                      onClick={handleFollowToggle}
                      disabled={fetcher.state !== "idle"}
                    >
                      {isFollowing ? (
                        <>
                          <UserMinus className="h-4 w-4 mr-2" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Follow
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <h1 className="text-xl font-bold">{profileUser.name}</h1>
                  <p className="text-muted-foreground">@{profileUser.username}</p>
                </div>

                {profileUser.bio && <p className="text-sm">{profileUser.bio}</p>}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {profileUser.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {profileUser.location}
                    </div>
                  )}

                  {profileUser.website && (
                    <div className="flex items-center gap-1">
                      <LinkIcon className="h-4 w-4" />
                      <a
                        href={profileUser.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {profileUser.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  )}

                  {profileUser.createdAt && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(profileUser.createdAt)}
                    </div>
                  )}
                </div>

                <div className="flex gap-6 text-sm">
                  <button type="button" className="hover:underline">
                    <span className="font-bold">
                      {formatNumber(profileUser.followingCount)}
                    </span>
                    <span className="text-muted-foreground ml-1">Following</span>
                  </button>
                  <button type="button" className="hover:underline">
                    <span className="font-bold">
                      {formatNumber(followerCount)}
                    </span>
                    <span className="text-muted-foreground ml-1">Followers</span>
                  </button>
                </div>

                {relationship?.followedBy && (
                  <div className="inline-block">
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
                      Follows you
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-border">
            <div className="flex">
              <button
                type="button"
                className="flex-1 py-4 px-4 text-center border-b-2 border-primary font-medium"
              >
                Posts
              </button>
              <button
                type="button"
                className="flex-1 py-4 px-4 text-center text-muted-foreground hover:bg-muted/50"
              >
                Replies
              </button>
              <button
                type="button"
                className="flex-1 py-4 px-4 text-center text-muted-foreground hover:bg-muted/50"
              >
                Media
              </button>
              <button
                type="button"
                className="flex-1 py-4 px-4 text-center text-muted-foreground hover:bg-muted/50"
              >
                Likes
              </button>
            </div>
          </div>

          <div>
            {posts && posts.length > 0 ? (
              posts.map((post: any) => (
                <Card key={post.post.id} className="border-l-0 border-r-0 border-t-0 rounded-none">
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
                          <h3 className="font-semibold text-sm">{post.author?.name}</h3>
                          <span className="text-muted-foreground text-sm">
                            @{post.author?.username}
                          </span>
                          <span className="text-muted-foreground text-sm">·</span>
                          <span className="text-muted-foreground text-sm">
                            {new Date(post.post.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{post.post.content}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No posts yet</p>
                <p className="text-sm mt-2">
                  {isOwnProfile
                    ? "Share your thoughts with your first post!"
                    : `@${profileUser.username} hasn't posted anything yet.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}