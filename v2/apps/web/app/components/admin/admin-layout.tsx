import { Link, useLocation } from "@remix-run/react";
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from "@tweetapus/ui";
import {
  ArrowLeft,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

interface AdminLayoutProps {
  children: ReactNode;
  stats: {
    users: { total: number; suspended: number; verified: number };
    posts: { total: number };
    suspensions: { active: number };
  };
}

const navigation = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Posts",
    href: "/admin/posts",
    icon: MessageSquare,
  },
  {
    name: "Suspensions",
    href: "/admin/suspensions",
    icon: Shield,
  },
  {
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
];

export function AdminLayout({ children, stats }: AdminLayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <div className="w-64 bg-card border-r">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Link to="/timeline">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to App
                </Button>
              </Link>
            </div>

            <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>

            <nav className="space-y-2">
              {navigation.map((item) => {
                const isActive =
                  location.pathname === item.href ||
                  (item.href === "/admin" && location.pathname === "/admin");

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-6 border-t">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Users</span>
                    <span className="font-medium">{stats.users.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Posts</span>
                    <span className="font-medium">{stats.posts.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Suspended</span>
                    <span className="font-medium text-destructive">
                      {stats.users.suspended}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
