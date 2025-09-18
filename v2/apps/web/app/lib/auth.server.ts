import { createCookieSessionStorage, redirect } from "@remix-run/node";

const sessionSecret = process.env.SESSION_SECRET || "tweetapus-session-secret";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__tweetapus_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export interface User {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  verified: boolean;
  admin: boolean;
  suspended: boolean;
}

export interface AuthUser extends User {
  token: string;
}

export async function createUserSession(
  user: User,
  token: string,
  redirectTo = "/timeline"
) {
  const session = await sessionStorage.getSession();
  session.set("token", token);
  session.set("user", user);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export async function getUserSession(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  return {
    token: session.get("token") as string | undefined,
    user: session.get("user") as User | undefined,
  };
}

export async function requireAuth(request: Request): Promise<AuthUser> {
  const { token, user } = await getUserSession(request);

  if (!token || !user) {
    throw redirect("/login");
  }

  // Verify token with API
  try {
    const response = await fetch("http://localhost:3000/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw redirect("/login");
    }

    const data = await response.json();
    if (data.error) {
      throw redirect("/login");
    }

    return { ...user, token };
  } catch {
    throw redirect("/login");
  }
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const authUser = await requireAuth(request);

  if (!authUser.admin) {
    throw redirect("/timeline");
  }

  return authUser;
}

export async function logout(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}

export async function getOptionalUser(
  request: Request
): Promise<AuthUser | null> {
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}

export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  token?: string
) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`http://localhost:3000/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }

  return response.json();
}
