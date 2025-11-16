import toastQueue from "../../shared/toasts.js";
import { createPopup } from "../../shared/ui-utils.js";
import switchPage, { addRoute } from "./pages.js";
import openProfile from "./profile.js";
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

		if (window.location.pathname !== "/") {
			window.location.href = "/";
		}
		return;
	}

	const { user, error, suspension, restricted } = await query("/auth/me");

	if (error && suspension) {
		document.documentElement.innerHTML = suspension;
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
				"(prefers-color-scheme: dark)",
			).matches;
			if (systemDark) {
				root.classList.add("dark");
			} else {
				root.classList.remove("dark");
			}
		}
	}

	document.querySelector(".account img").src =
		user.avatar || `/public/shared/assets/default-avatar.svg`;

	if (restricted) {
		toastQueue.add(
			`<h1>Account restricted</h1><p>Your account has limited privileges — you can browse posts, but interactions such as tweeting, liking, retweeting, DMs, and following are disabled.</p>`,
		);
		user.restricted = true;
	}

	const accountBtn = document.querySelector(".account");
	accountBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		e.preventDefault();

		createPopup({
			triggerElement: accountBtn,
			items: [
				{
					title: "My profile",

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
					onClick: async () => {
						const { openSettingsModal } = await import("./settings.js");
						openSettingsModal("account");
					},
				},
				{
					title: "Sign out",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
					onClick: () => {
						localStorage.removeItem("authToken");

						document.querySelector(".loader").style.opacity = "0";
						document.querySelector(".loader").style.display = "flex";
						setTimeout(() => {
							document.querySelector(".loader").style.opacity = "1";
						}, 1);

						setTimeout(() => {
							window.location.href = "/";
						}, 100);
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
				`<h1>Error loading bookmarks</h1><p>${response.error}</p>`,
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
