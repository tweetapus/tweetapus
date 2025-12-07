import toastQueue from "../../shared/toasts.js";
import { createPopup } from "../../shared/ui-utils.js";
import switchPage, { addRoute } from "./pages.js";
import openProfile from "./profile.js";
import { createTweetElement } from "./tweets.js";

export const authToken = localStorage.getItem("authToken");

let _user;

function saveAccountToStorage(user, token) {
	const accounts = JSON.parse(localStorage.getItem("accounts") || "[]");

	const existingIndex = accounts.findIndex((acc) => acc.userId === user.id);
	const accountData = {
		userId: user.id,
		username: user.username,
		name: user.name,
		avatar: user.avatar,
		verified: user.verified,
		gold: user.gold,
		gray: user.gray,
		avatar_radius: user.avatar_radius,
		token: token,
	};

	if (existingIndex >= 0) {
		accounts[existingIndex] = accountData;
	} else {
		accounts.push(accountData);
	}

	localStorage.setItem("accounts", JSON.stringify(accounts));
}

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

	saveAccountToStorage(user, localStorage.getItem("authToken"));

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
	}

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
	document.querySelector(".account img").style.opacity = "1"
	document.querySelector(".account img").style.filter = "blur(0px)"

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

		const popupItems = [
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
				title: "Change user",

				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
				onClick: async () => {
					const { openAccountSwitcher } = await import(
						"../../shared/account-switcher.js"
					);
					openAccountSwitcher();
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

					if (window.cookieStore) {
						window.cookieStore.delete("agree");
					}

					try {
						// biome-ignore lint/suspicious/noDocumentCookie: idgaf bro
						document.cookie =
							"agree=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
					} catch {}

					setTimeout(() => {
						window.location.href = "/";
					}, 100);
				},
			},
		];

		try {
			window.dispatchEvent(
				new CustomEvent("tweetapus:account-menu-items", {
					detail: {
						add(item) {
							if (!item || typeof item !== "object") return;
							popupItems.push(item);
						},
					},
				}),
			);
		} catch (err) {
			console.error("Failed to process account menu extensions", err);
		}
		createPopup({
			triggerElement: accountBtn,
			items: popupItems,
		});
	});

	document.getElementById("homeBtn").addEventListener("click", async () => {
		const isAlreadyHome = location.pathname === "/";

		if (isAlreadyHome) {
			switchPage("timeline", {
				path: "/",
				noScroll: true,
			});
			setTimeout(() => window.scrollTo(0, 0), 0);
		} else {
			const indexModule = await import("./index.js");
			const savedScroll = indexModule.getTimelineScroll?.() || 0;

			switchPage("timeline", {
				path: "/",
				noScroll: true,
			});

			setTimeout(() => window.scrollTo(0, savedScroll), 0);
		}
	});
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
	const { createTweetSkeleton, removeSkeletons, showSkeletons } = await import(
		"../../shared/skeleton-utils.js"
	);

	if (!authToken) {
		toastQueue.add("<h1>Please log in to view bookmarks</h1>");
		return;
	}

	try {
		const bookmarksList = document.getElementById("bookmarksList");
		const bookmarksEmpty = document.getElementById("bookmarksEmpty");

		bookmarksList.innerHTML = "";
		bookmarksEmpty.style.display = "none";

		const skeletons = showSkeletons(bookmarksList, createTweetSkeleton, 8);

		const response = await query("/bookmarks");

		removeSkeletons(skeletons);

		if (response.error) {
			toastQueue.add(
				`<h1>Error loading bookmarks</h1><p>${response.error}</p>`,
			);
			return;
		}

		if (!response.bookmarks || response.bookmarks.length === 0) {
			bookmarksList.innerHTML = "";
			bookmarksEmpty.style.display = "block";
			return;
		}

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
