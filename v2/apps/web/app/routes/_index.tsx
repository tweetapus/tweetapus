import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tweetapus/ui";
import { MessageCircle, TrendingUp, Users, Zap } from "lucide-react";
import { getOptionalUser } from "~/lib/auth.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Tweetapus - Modern Social Media Platform" },
    { name: "description", content: "Connect, share, and discover on the modern social media platform built for speed and simplicity." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getOptionalUser(request);
  return { user };
}

export default function Index() {
  const { user } = useLoaderData<typeof loader>();

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card className="backdrop-blur-sm bg-white/90 dark:bg-gray-900/90 border-0 shadow-xl">
              <CardHeader className="text-center pb-8">
                <div className="flex justify-center mb-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">
                      {user.name?.split(" ").map((n: string) => n[0]).join("") || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <CardTitle className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Welcome back, {user.name}!
                </CardTitle>
                <CardDescription className="text-lg">
                  Ready to see what's happening in your world?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link to="/timeline-new" className="group">
                    <Card className="hover:shadow-lg transition-all duration-200 group-hover:scale-105">
                      <CardHeader className="text-center pb-4">
                        <TrendingUp className="h-8 w-8 mx-auto text-blue-600" />
                        <CardTitle className="text-xl">Timeline</CardTitle>
                        <CardDescription>See the latest posts</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                  
                  <Link to={`/profile/${user.username}`} className="group">
                    <Card className="hover:shadow-lg transition-all duration-200 group-hover:scale-105">
                      <CardHeader className="text-center pb-4">
                        <Users className="h-8 w-8 mx-auto text-green-600" />
                        <CardTitle className="text-xl">Profile</CardTitle>
                        <CardDescription>Manage your account</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                  
                  <Link to="/messages" className="group">
                    <Card className="hover:shadow-lg transition-all duration-200 group-hover:scale-105">
                      <CardHeader className="text-center pb-4">
                        <MessageCircle className="h-8 w-8 mx-auto text-purple-600" />
                        <CardTitle className="text-xl">Messages</CardTitle>
                        <CardDescription>Chat with friends</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                  
                  <Link to="/tweetaai" className="group">
                    <Card className="hover:shadow-lg transition-all duration-200 group-hover:scale-105">
                      <CardHeader className="text-center pb-4">
                        <Zap className="h-8 w-8 mx-auto text-yellow-600" />
                        <CardTitle className="text-xl">TweetaAI</CardTitle>
                        <CardDescription>AI-powered features</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </div>
                
                <div className="text-center pt-4">
                  <Link to="/timeline-new">
                    <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                      Get Started
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="backdrop-blur-sm bg-white/90 dark:bg-gray-900/90 border-0 shadow-xl">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
                Tweetapus
              </CardTitle>
              <CardDescription className="text-xl">
                The modern social media platform built for speed, simplicity, and connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="text-center p-6">
                  <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Zap className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Lightning Fast</h3>
                  <p className="text-sm text-muted-foreground">Built with Bun and modern web technologies for incredible performance</p>
                </div>
                
                <div className="text-center p-6">
                  <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Users className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Connect & Share</h3>
                  <p className="text-sm text-muted-foreground">Share your thoughts, connect with friends, and discover new content</p>
                </div>
                
                <div className="text-center p-6">
                  <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="font-semibold mb-2">AI-Powered</h3>
                  <p className="text-sm text-muted-foreground">Enhanced with AI features to make your social media experience smarter</p>
                </div>
              </div>

              <div className="text-center space-y-6">
                <div className="flex gap-4 justify-center">
                  <Link to="/register">
                    <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                      Join Tweetapus
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="outline" size="lg">
                      Sign In
                    </Button>
                  </Link>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Built with Remix, React, shadcn/ui, Elysia, and Bun
                </p>
              </div>

              <div className="mt-8 p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl">
                <h3 className="font-semibold mb-4 text-center">🚀 Platform Features</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-green-600 font-medium">✅ Real-time Posts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-green-600 font-medium">✅ User Profiles</div>
                  </div>
                  <div className="text-center">
                    <div className="text-green-600 font-medium">✅ Authentication</div>
                  </div>
                  <div className="text-center">
                    <div className="text-green-600 font-medium">✅ Admin Panel</div>
                  </div>
                  <div className="text-center">
                    <div className="text-blue-600 font-medium">🔄 Direct Messages</div>
                  </div>
                  <div className="text-center">
                    <div className="text-blue-600 font-medium">🔄 Notifications</div>
                  </div>
                  <div className="text-center">
                    <div className="text-blue-600 font-medium">🔄 AI Features</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 font-medium">⏳ More Coming</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
