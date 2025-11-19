import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import { createComposer } from "./composer.js";
import dm from "./dm.js";
import switchPage, { addRoute, showPage } from "./pages.js";
import { addTweetToTimeline } from "./tweets.js";

import {
	activateArticlesTab,
	deactivateArticlesTab,
	handleArticlesScroll,
	initArticles,
} from "./articles.js";

window.onerror = (message, source, lineno, colno) => {
	toastQueue.add(
		`<h1>${message}</h1><p>at ${lineno || "?"}:${colno || "?"} in ${
			source || "?"
		}</p>`,
	);

	return false;
};

window.onunhandledrejection = (event) => {
	const reason = event.reason;

	if (reason instanceof Error) {
		toastQueue.add(
			`<h1>${reason.message}</h1><p>at ${reason.lineNumber || "?"}:${
				reason.columnNumber || "?"
			} in ${reason.fileName || "?"}</p>`,
		);
	} else {
		toastQueue.add(`<h1>${String(reason)}</h1><p>Error</p>`);
	}
};

let timelineScrollPosition = 0;

(async () => {
	if (!authToken) {
		// If there's no auth token, ensure any loader UI is hidden so the
		// page doesn't appear to load forever. The auth module handles redirects
		// to the landing page; here we just tidy up the UI and stop initialization.
		const loaderEl = document.querySelector(".loader");
		if (loaderEl) {
			loaderEl.style.opacity = "0";
			setTimeout(() => {
				loaderEl.style.display = "none";
			}, 150);
		}
		return;
	}

	let currentTimeline = "home";

	let isLoading = false;
	let hasMoreTweets = true;
	let oldestTweetId = null;
	const BATCH_SIZE = 10;
	let lastScrollCheck = 0;
	const SCROLL_DEBOUNCE = 100;

	initArticles();
	deactivateArticlesTab();

	const getTweetsContainer = () => document.querySelector(".tweets");

	const loadTimeline = async (type = "home", append = false) => {
		if (isLoading) return;
		isLoading = true;

		const endpoint =
			type === "following" ? "/timeline/following" : "/timeline/";
		const url =
			oldestTweetId && append
				? `${endpoint}?before=${oldestTweetId}&limit=${BATCH_SIZE}`
				: `${endpoint}?limit=${BATCH_SIZE}`;

		try {
			const { timeline } = await query(url);

			if (!append) {
				getTweetsContainer().innerHTML = "";
				oldestTweetId = null;
				hasMoreTweets = true;
			}

			if (timeline.length === 0) {
				if (type === "following" && !append) {
					const emptyMessage = document.createElement("div");
					emptyMessage.className = "empty-timeline";
					emptyMessage.innerHTML = `
						<h3>Welcome to your Following timeline!</h3>
						<p>Follow some accounts to see their tweets here.</p>
					`;
					getTweetsContainer().appendChild(emptyMessage);
				}
				hasMoreTweets = false;
			} else {
				timeline.forEach((tweet) => {
					addTweetToTimeline(tweet, false);
					oldestTweetId = tweet.id;
				});

				if (timeline.length < BATCH_SIZE) {
					hasMoreTweets = false;
				}
			}
		} catch (error) {
			console.error("Error loading timeline:", error);
			toastQueue.add(`<h1>Error loading timeline</h1><p>Please try again</p>`);
		} finally {
			isLoading = false;
		}
	};

	const feedLinks = document.querySelectorAll("h1 a");
	feedLinks.forEach((link) => {
		link.addEventListener("click", async (e) => {
			e.preventDefault();

			feedLinks.forEach((l) => {
				l.classList.remove("active");
			});
			link.classList.add("active");

			const tab = link.dataset.tab || "home";
			if (tab === "articles") {
				currentTimeline = "articles";
				deactivateArticlesTab();
				document.querySelector("#composer-container").style.display = "none";
				document.querySelector(".tweets").style.display = "none";
				activateArticlesTab();
				return;
			}

			deactivateArticlesTab();
			document.querySelector("#composer-container").style.display = "block";
			document.querySelector(".tweets").style.display = "flex";
			oldestTweetId = null;
			hasMoreTweets = true;
			currentTimeline = tab === "following" ? "following" : "home";
			await loadTimeline(currentTimeline);
		});
	});

	window.addEventListener("scroll", async () => {
		if (currentTimeline === "articles") {
			await handleArticlesScroll();
			return;
		}
		if (document.querySelector(".tweetPage").style.display === "flex") return;

		if (!hasMoreTweets || isLoading) return;

		const now = Date.now();
		if (now - lastScrollCheck < SCROLL_DEBOUNCE) return;
		lastScrollCheck = now;

		const scrollPosition = window.innerHeight + window.scrollY;
		const threshold = document.documentElement.scrollHeight - 500;

		if (
			scrollPosition >= threshold &&
			(!location.pathname || location.pathname === "/")
		) {
			await loadTimeline(currentTimeline, true);
		}
	});

	const searchBtn = document.getElementById("searchBtn");
	if (searchBtn) {
		searchBtn.addEventListener("click", () => {
			switchPage("search", { path: "/search" });
		});
	}

	const communitiesBtn = document.getElementById("communitiesBtn");
	if (communitiesBtn) {
		communitiesBtn.addEventListener("click", () => {
			switchPage("communities", { path: "/communities" });
		});
	}

	const handleUrlParams = () => {
		const urlParams = new URLSearchParams(window.location.search);
		const tweetId = urlParams.get("tweet");
		const profileUsername = urlParams.get("profile");

		if (tweetId) {
			window.history.replaceState(null, "", `/tweet/${tweetId}`);
			window.dispatchEvent(new PopStateEvent("popstate"));
		} else if (profileUsername) {
			window.history.replaceState(null, "", `/@${profileUsername}`);
			window.dispatchEvent(new PopStateEvent("popstate"));
		}
	};

	await loadTimeline("home");
	handleUrlParams();

	dm.connectSSE();

	const composer = await createComposer({
		callback: (tweet) => {
			if (currentTimeline === "home") {
				addTweetToTimeline(tweet, true).classList.add("created");
			}
		},
	});

	document.querySelector("#composer-container").appendChild(composer);

	document
		.getElementById("notificationsBtn")
		?.addEventListener("click", async () => {
			timelineScrollPosition = window.scrollY;
			const { openNotifications } = await import("./notifications.js");
			openNotifications(true);
		});

	document
		.getElementById("profileDropdownBtn")
		?.addEventListener("click", async (e) => {
			const { handleProfileDropdown } = await import("./profile.js");
			handleProfileDropdown(e);
		});

	document
		.getElementById("markAllReadBtn")
		?.addEventListener("click", async () => {
			const { handleMarkAllRead } = await import("./notifications.js");
			handleMarkAllRead();
		});
})();

export function getTimelineScroll() {
	return timelineScrollPosition;
}

addRoute(
	(pathname) => pathname === "/" || !pathname,
	() => {
		showPage("timeline");
		setTimeout(() => window.scrollTo(0, timelineScrollPosition), 0);
	},
);

addRoute(
	(pathname) => pathname === "/articles",
	() => {
		showPage("timeline");
		const articleLink = document.querySelector('h1 a[data-tab="articles"]');
		articleLink?.click();
	},
);

addRoute(
	(pathname) => pathname === "/search",
	() => showPage("search"),
);

addRoute(
	(pathname) => pathname === "/notifications",
	async () => {
		const { openNotifications } = await import("./notifications.js");
		openNotifications(false);
	},
);

addRoute(
	(pathname) => pathname === "/communities",
	() => showPage("communities"),
);

addRoute(
	(pathname) =>
		pathname.startsWith("/communities/") && pathname.split("/").length === 3,
	(pathname) => {
		const communityId = pathname.split("/")[2];
		import("./communities.js").then(({ loadCommunityDetail }) => {
			loadCommunityDetail(communityId);
		});
	},
);

addRoute(
	(pathname) => pathname.startsWith("/@"),
	(pathname) => {
		const username = pathname.slice(2);

		(async () => {
			const { openProfile } = await import("./profile.js");
			openProfile(username);
		})();
	},
);

addRoute(
	(pathname) => pathname.startsWith("/tweet/"),
	(pathname) => {
		const tweetId = pathname.split("/tweet/")[1];
		(async () => {
			const openTweet = await import("./tweet.js");
			openTweet.default(tweetId);
		})();
	},
);
