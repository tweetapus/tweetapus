import toastQueue from "../../shared/toasts.js";
import { createPopup } from "../../shared/ui-utils.js";
import switchPage, { addRoute } from "./pages.js";
import openProfile from "./profile.js";
import { openSettings } from "./settings.js";
import { createTweetElement } from "./tweets.js";

export const authToken = localStorage.getItem("authToken");

let _user;

(async () => {
  const { default: query } = await import("./api.js");

  const urlParams = new URLSearchParams(window.location.search);
  const impersonateToken = urlParams.get("impersonate");

  if (impersonateToken) {
    localStorage.setItem("authToken", decodeURIComponent(impersonateToken));
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (!authToken && !impersonateToken) {
    cookieStore.delete("agree");
    window.location.href = "/";
    return;
  }

  const { user, error, suspension } = await query("/auth/me");

  if (error && suspension) {
    document.body.style.flexDirection = "column";
    document.body.style.maxWidth = "500px";
    document.body.style.margin = "0px auto";
    document.body.style.height = "fit-content";
    document.body.style.marginTop = "2em";
    document.body.style.overflow = "hidden";
    document.body.style.padding = "16px";

    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor-x-icon lucide-monitor-x"><path d="m14.5 12.5-5-5"/><path d="m9.5 12.5 5-5"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>
		
		<h1 style="font-weight: 500;">Your account has been suspended</h1>
		<p>Your account has been ${
      suspension.expires_at ? "temporarily" : `permanently`
    } suspended by a moderator due to a violation of our policies.</p>

		<p><b>Reason:</b> ${suspension.reason}</p>

		${
      suspension.expires_at
        ? `<p>This suspension will expire on ${new Date(
            suspension.expires_at
          ).toLocaleString()}</p>`
        : ""
    }

		<p>Note that if you attempt to evade a suspension by creating new accounts, we will suspend your new accounts. If you wish to appeal this suspension, please contact our support team.</p>
		
		<p>You may also pursue alternative forms of redress, including out-of-court dispute settlement or judicial redress.</p>
		
		<p><a href="javascript:" onclick="localStorage.removeItem("authToken");window.location.href = "/";">Log out</a></p>`;
    document.body.querySelectorAll("p").forEach((p) => { p.style.marginBottom = "0px" });
    return;
  }

  if (error || !user) {
    localStorage.removeItem("authToken");
    window.location.href = "/";
    return;
  }
  _user = user;

  if (user.theme) {
    localStorage.setItem("theme", user.theme);
    const root = document.documentElement;
    if (user.theme === "dark") {
      root.classList.add("dark");
    } else if (user.theme === "light") {
      root.classList.remove("dark");
    } else {
      const systemDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      if (systemDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }

  if (user.accent_color) {
    localStorage.setItem("accentColor", user.accent_color);
    const root = document.documentElement;
    root.style.setProperty("--primary", user.accent_color);

    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : null;
    };

    const adjustBrightness = (hex, percent) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return hex;
      const adjust = (color) =>
        Math.max(0, Math.min(255, Math.round(color + (color * percent) / 100)));
      return `#${adjust(rgb.r).toString(16).padStart(2, "0")}${adjust(rgb.g)
        .toString(16)
        .padStart(2, "0")}${adjust(rgb.b).toString(16).padStart(2, "0")}`;
    };

    const rgb = hexToRgb(user.accent_color);
    if (rgb)
      root.style.setProperty("--primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty(
      "--primary-hover",
      adjustBrightness(user.accent_color, -10)
    );
    root.style.setProperty(
      "--primary-focus",
      adjustBrightness(user.accent_color, -20)
    );
  }

  document.querySelector(".account img").src =
    user.avatar || `/public/shared/default-avatar.png`;

  const accountBtn = document.querySelector(".account");
  accountBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    createPopup({
      triggerElement: accountBtn,
      items: [
        {
          title: "My Profile",

          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
          onClick: () => {
            switchPage("profile", {
              path: `/@${user.username}`,
              recoverState: async () => {
                await openProfile(user.username);
              },
            });
          },
        },
        {
          title: "Bookmarks",

          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
          onClick: () => {
            openBookmarks();
          },
        },
        {
          title: "Settings",

          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
          onClick: () => {
            switchPage("settings", {
              path: "/settings/account",
              recoverState: async () => {
                openSettings("account");
              },
            });
          },
        },
        {
          title: "Manage passkeys",

          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>`,
          onClick: () => {
            switchPage("settings", {
              path: "/settings/passkeys",
              recoverState: async () => {
                openSettings("passkeys");
              },
            });
          },
        },
        {
          title: "Sign Out",
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
          onClick: () => {
            localStorage.removeItem("authToken");
            window.location.href = "/";
          },
        },
      ],
    });
  });

  document.getElementById("homeBtn").addEventListener("click", () => {
    switchPage("timeline", {
      path: "/",
    });
  });

  document.querySelector(".loader").style.opacity = "0";
  setTimeout(() => {
    document.querySelector(".loader").style.display = "none";
  }, 150);
})();

const openBookmarks = async () => {
  switchPage("bookmarks", {
    path: "/bookmarks",
    recoverState: async () => {
      await loadBookmarks();
    },
  });
};

const loadBookmarks = async () => {
  const { default: query } = await import("./api.js");

  if (!authToken) {
    toastQueue.add("<h1>Please log in to view bookmarks</h1>");
    return;
  }

  try {
    const response = await query("/bookmarks");

    if (response.error) {
      toastQueue.add(
        `<h1>Error loading bookmarks</h1><p>${response.error}</p>`
      );
      return;
    }

    const bookmarksList = document.getElementById("bookmarksList");
    const bookmarksEmpty = document.getElementById("bookmarksEmpty");

    if (!response.bookmarks || response.bookmarks.length === 0) {
      bookmarksList.innerHTML = "";
      bookmarksEmpty.style.display = "block";
      return;
    }

    bookmarksEmpty.style.display = "none";
    bookmarksList.innerHTML = "";

    response.bookmarks.forEach((bookmark) => {
      const tweetElement = createTweetElement(bookmark, {
        clickToOpen: true,
      });
      bookmarksList.appendChild(tweetElement);
    });
  } catch (error) {
    console.error("Error loading bookmarks:", error);
    toastQueue.add("<h1>Failed to load bookmarks</h1>");
  }
};

addRoute((pathname) => pathname === "/bookmarks", openBookmarks);

export default function getUser() {
  return new Promise((resolve) => {
    if (_user) resolve(_user);

    const interval = setInterval(() => {
      if (!_user) return;
      resolve(_user);
      clearInterval(interval);
    }, 1);
  });
}
