import {
	createTweetSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import { updateTabIndicator } from "../../shared/tab-indicator.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import {
	activateArticlesTab,
	deactivateArticlesTab,
	handleArticlesScroll,
	initArticles,
} from "./articles.js";
import { authToken } from "./auth.js";
import { createComposer } from "./composer.js";
import dm from "./dm.js";
import switchPage, { addRoute, showPage } from "./pages.js";
import { addTweetToTimeline } from "./tweets.js";

window.onerror = (message, source, lineno, colno) => {
	toastQueue.add(
		`<h1>${message}</h1><p>at ${lineno || "?"}:${colno || "?"} in ${ // kristiago
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
	if (!authToken) return;

	let currentTimeline = "home";

	let isLoading = false;
	let hasMoreTweets = true;
	let oldestTweetId = null;
	const BATCH_SIZE = 10;
	let lastScrollCheck = 0;
	const SCROLL_DEBOUNCE = 100;
	let currentSkeletons = [];
	let newTweetsCount = 0;
	let latestTweetId = null;
	let isTabActive = true;
	let eventSource = null;

	initArticles();
	deactivateArticlesTab();

	const getTweetsContainer = () => document.querySelector(".tweets");

	const composer = await createComposer({
		callback: (tweet) => {
			if (currentTimeline === "home" || currentTimeline === "latest") {
				addTweetToTimeline(tweet, true).classList.add("created");
			}
		},
	});

	document.querySelector("#composer-container").appendChild(composer);

	const createNewTweetsBanner = () => {
		const banner = document.createElement("div");
		banner.id = "new-tweets-banner";
		banner.style.cssText = `
			display: none;
			position: sticky;
			top: 0;
			z-index: 10;
			background: var(--primary);
			color: var(--primary-fg);
			padding: 12px 16px;
			text-align: center;
			cursor: pointer;
			border-bottom: 1px solid var(--border);
			font-weight: 600;
			transition: all 0.2s ease;
		`;
		banner.addEventListener("mouseover", () => {
			banner.style.background = "var(--primary-hover, var(--primary))";
		});
		banner.addEventListener("mouseout", () => {
			banner.style.background = "var(--primary)";
		});
		banner.addEventListener("click", async () => {
			banner.style.display = "none";
			newTweetsCount = 0;
			latestTweetId = null;
			await loadTimeline(currentTimeline, false);
			window.scrollTo(0, 0);
		});
		getTweetsContainer().parentElement.insertBefore(
			banner,
			getTweetsContainer(),
		);
		return banner;
	};

	const newTweetsBanner = createNewTweetsBanner();

	const updateNewTweetsBanner = () => {
		if (newTweetsCount > 0 && isTabActive && currentTimeline === "latest") {
			newTweetsBanner.textContent = `Show ${newTweetsCount} new ${
				newTweetsCount === 1 ? "tweet" : "tweets"
			}`;
			newTweetsBanner.style.display = "block";
		} else {
			newTweetsBanner.style.display = "none";
		}
	};

	document.addEventListener("visibilitychange", () => {
		isTabActive = !document.hidden;
		if (isTabActive && newTweetsCount > 0 && currentTimeline === "latest") {
			updateNewTweetsBanner();
		}
	});

	const createPullToRefreshIndicator = () => {
		const indicator = document.createElement("div");
		indicator.id = "pull-to-refresh";
		indicator.innerHTML = `
			<svg class="ptr-spinner" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
				<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path>
				<path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" fill="currentColor" class="ptr-path"></path>
			</svg>
			<span class="ptr-text">Pull to refresh</span>
		`;
		getTweetsContainer().parentElement.insertBefore(
			indicator,
			getTweetsContainer(),
		);
		return indicator;
	};

	const ptrIndicator = createPullToRefreshIndicator();
	let ptrStartY = 0;
	let ptrCurrentY = 0;
	let ptrRefreshing = false;

	const handleTouchStart = (e) => {
		if (
			window.scrollY === 0 &&
			!ptrRefreshing &&
			currentTimeline !== "articles"
		) {
			ptrStartY = e.touches[0].clientY;
		}
	};

	const handleTouchMove = (e) => {
		if (ptrStartY === 0 || ptrRefreshing || currentTimeline === "articles")
			return;
		ptrCurrentY = e.touches[0].clientY;
		const pullDistance = ptrCurrentY - ptrStartY;
		if (pullDistance > 0 && window.scrollY === 0) {
			const progress = Math.min(pullDistance / 100, 1);
			ptrIndicator.style.height = `${Math.min(pullDistance * 0.5, 60)}px`;
			ptrIndicator.style.opacity = progress;
			ptrIndicator.querySelector(".ptr-path").style.transform =
				`rotate(${progress * 360}deg)`;
			if (pullDistance > 80) {
				ptrIndicator.querySelector(".ptr-text").textContent =
					"Release to refresh";
			} else {
				ptrIndicator.querySelector(".ptr-text").textContent = "Pull to refresh";
			}
		}
	};

	const handleTouchEnd = async () => {
		if (ptrStartY === 0 || ptrRefreshing || currentTimeline === "articles") {
			ptrStartY = 0;
			return;
		}
		const pullDistance = ptrCurrentY - ptrStartY;
		if (pullDistance > 80) {
			ptrRefreshing = true;
			ptrIndicator.classList.add("refreshing");
			ptrIndicator.querySelector(".ptr-text").textContent = "Refreshing...";
			oldestTweetId = null;
			hasMoreTweets = true;
			await loadTimeline(currentTimeline, false);
			ptrRefreshing = false;
			ptrIndicator.classList.remove("refreshing");
		}
		ptrIndicator.style.height = "0";
		ptrIndicator.style.opacity = "0";
		ptrStartY = 0;
		ptrCurrentY = 0;
	};

	document.addEventListener("touchstart", handleTouchStart, { passive: true });
	document.addEventListener("touchmove", handleTouchMove, { passive: true });
	document.addEventListener("touchend", handleTouchEnd);

	const loadTimeline = async (type = "home", append = false) => {
		if (isLoading) return;
		isLoading = true;

		const endpoint =
			type === "following" ? "/timeline/following" : "/timeline/";

		let queryParams = `limit=${BATCH_SIZE}`;
		if (oldestTweetId && append) {
			queryParams += `&before=${oldestTweetId}`;
		}
		if (type === "latest") {
			queryParams += "&latest=true";
		}

		const url = `${endpoint}?${queryParams}`;

		if (!append) {
			getTweetsContainer().innerHTML = "";
			currentSkeletons = showSkeletons(
				getTweetsContainer(),
				createTweetSkeleton,
				5,
			);
		} else {
			currentSkeletons = showSkeletons(
				getTweetsContainer(),
				createTweetSkeleton,
				3,
			);
		}

		try {
			const { timeline } = await query(url);

			if (!append) {
				oldestTweetId = null;
				hasMoreTweets = true;
			}

			if (timeline.length === 0) {
				removeSkeletons(currentSkeletons);
				currentSkeletons = [];
				if (type === "following" && !append) {
					const emptyMessage = document.createElement("div");
					emptyMessage.className = "empty-timeline";
					emptyMessage.innerHTML = `
					  <img src="/public/shared/assets/img/cats/snail_cat_400.png" alt="Snail cat" draggable="false">
						<h3>You haven't followed<br> anyone yet!</h3>
					`;
					getTweetsContainer().appendChild(emptyMessage);
				}
				hasMoreTweets = false;
			} else {
				removeSkeletons(currentSkeletons);
				currentSkeletons = [];
				timeline.sort(
					(a, b) => new Date(b.created_at) - new Date(a.created_at),
				);
				timeline.forEach((tweet) => {
					addTweetToTimeline(tweet, false);
					oldestTweetId = tweet.id;
				});

				if (timeline.length < BATCH_SIZE) {
					hasMoreTweets = false;
				}
			}
		} catch (error) {
			removeSkeletons(currentSkeletons);
			currentSkeletons = [];
			console.error("Error loading timeline:", error);
			toastQueue.add(`<h1>Error loading timeline</h1><p>Please try again</p>`);
		} finally {
			isLoading = false;
		}
	};

	const feedLinks = document.querySelectorAll(".tab-nav a");
	const tabContainer = document.querySelector(".timeline .tab-nav");

	if (tabContainer) {
		const activeTab = tabContainer.querySelector(".active");
		if (activeTab) {
			updateTabIndicator(tabContainer, activeTab);
		}
	}

	feedLinks.forEach((link) => {
		link.addEventListener("click", async (e) => {
			e.preventDefault();

			feedLinks.forEach((l) => {
				l.classList.remove("active");
			});
			link.classList.add("active");

			if (tabContainer) {
				updateTabIndicator(tabContainer, link);
			}

			const tab = link.dataset.tab || "home";
			if (tab === "articles") {
				disconnectLatestTimelineSSE();
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
			currentTimeline = tab;

			if (tab === "latest") {
				connectLatestTimelineSSE();
			} else {
				disconnectLatestTimelineSSE();
			}

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

			requestAnimationFrame(() => {
				document.getElementById("searchPageInput")?.focus();
			});
		});
	}

	const communitiesBtn = document.getElementById("communitiesBtn");
	if (communitiesBtn) {
		communitiesBtn.addEventListener("click", () => {
			switchPage("communities", { path: "/communities" });
		});
	}

	const listsBtn = document.getElementById("listsBtn");
	if (listsBtn) {
		listsBtn.addEventListener("click", async () => {
			const { openListsPage, initLists } = await import("./lists.js");
			initLists();
			openListsPage();
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

	const connectLatestTimelineSSE = () => {
		if (!authToken || currentTimeline !== "latest") return;

		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		eventSource = new EventSource("/api/sse/timeline/latest");

		eventSource.addEventListener("tweet", (event) => {
			if (isTabActive) {
				const tweet = JSON.parse(event.data);
				newTweetsCount++;
				if (!latestTweetId) latestTweetId = tweet.id;
				updateNewTweetsBanner();
			}
		});

		eventSource.addEventListener("error", () => {
			if (eventSource && eventSource.readyState === EventSource.CLOSED) {
				eventSource.close();
				eventSource = null;
			}
		});
	};

	const disconnectLatestTimelineSSE = () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		newTweetsCount = 0;
		latestTweetId = null;
		updateNewTweetsBanner();
	};

	dm.connectSSE();

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
			e.preventDefault();
			e.stopPropagation();

			const { handleProfileDropdown } = await import("./profile.js");
			handleProfileDropdown(document.getElementById("profileDropdownBtn"));
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
		const articleLink = document.querySelector(
			'.tab-nav a[data-tab="articles"]',
		);
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
	(pathname) => pathname === "/lists",
	async () => {
		const { openListsPage, initLists } = await import("./lists.js");
		initLists();
		openListsPage();
	},
);

addRoute(
	(pathname) =>
		pathname.startsWith("/lists/") && pathname.split("/").length === 3,
	async (pathname) => {
		const listId = pathname.split("/")[2];
		const { openListDetail, initLists } = await import("./lists.js");
		initLists();
		openListDetail(listId);
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
