import {
	createNewsSkeleton,
	createTweetSkeleton,
	createUserSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import { updateTabIndicator } from "../../shared/tab-indicator.js";
import query from "./api.js";
import { createTweetElement } from "./tweets.js";

const searchPageInput = document.getElementById("searchPageInput");
const filterBtns = document.querySelectorAll(".filter-btn");
const searchEmpty = document.getElementById("searchEmpty");
const usersSection = document.getElementById("usersSection");
const tweetsSection = document.getElementById("tweetsSection");
const usersResults = document.querySelector(".users-results-page");
const tweetsResults = document.querySelector(".tweets-results-page");

let currentFilter = "all";
let searchTimeout;
let isInitialized = false;
let lastSearchId = 0;
let currentAbortController = null;
let trends;

const performSearch = async (q) => {
	const searchId = ++lastSearchId;

	if (currentAbortController) {
		try {
			currentAbortController.abort();
		} catch {}
	}

	const controller = new AbortController();
	currentAbortController = controller;

	searchEmpty.style.display = "none";

	let userSkeletons = [];
	let tweetSkeletons = [];

	if (currentFilter === "all" || currentFilter === "users") {
		usersSection.style.display = "block";
		usersResults.innerHTML = "";
		userSkeletons = showSkeletons(usersResults, createUserSkeleton, 3);
	}

	if (currentFilter === "all" || currentFilter === "tweets") {
		tweetsSection.style.display = "block";
		tweetsResults.innerHTML = "";
		tweetSkeletons = showSkeletons(tweetsResults, createTweetSkeleton, 3);
	}

	try {
		const promises = [];

		const encoded = encodeURIComponent(q);

		if (currentFilter === "all" || currentFilter === "users") {
			promises.push(
				query(`/search/users?q=${encoded}`, {
					signal: controller.signal,
				}),
			);
		}

		if (currentFilter === "all" || currentFilter === "tweets") {
			promises.push(
				query(`/search/posts?q=${encoded}`, {
					signal: controller.signal,
				}),
			);
		}

		const results = await Promise.all(promises);

		removeSkeletons(userSkeletons);
		removeSkeletons(tweetSkeletons);

		if (controller.signal.aborted || searchId !== lastSearchId) return;

		let users = [];
		let posts = [];

		if (results.some((r) => r?.error)) {
			console.error(
				"Search API error:",
				results.map((r) => r?.error || null),
			);
			showNoResultsState();
			return;
		}

		if (currentFilter === "all") {
			const [usersData, postsData] = results;
			users = usersData?.users || [];
			posts = postsData?.posts || [];
		} else if (currentFilter === "users") {
			users = results[0]?.users || [];
		} else if (currentFilter === "tweets") {
			posts = results[0]?.posts || [];
		}

		const liveQuery = searchPageInput.value.trim();
		if (liveQuery !== q) {
			return;
		}

		displayResults(users, posts);
	} catch (error) {
		removeSkeletons(userSkeletons);
		removeSkeletons(tweetSkeletons);
		if (controller.signal.aborted) return;
		console.error("Search error:", error);
	} finally {
		if (currentAbortController === controller) currentAbortController = null;
	}
};

const displayResults = (users, posts) => {
	searchEmpty.style.display = "none";

	if (currentFilter === "all") {
		usersSection.style.display = users.length > 0 ? "block" : "none";
		tweetsSection.style.display = posts.length > 0 ? "block" : "none";
	} else if (currentFilter === "users") {
		usersSection.style.display = "block";
		tweetsSection.style.display = "none";
	} else if (currentFilter === "tweets") {
		usersSection.style.display = "none";
		tweetsSection.style.display = "block";
	}

	const escapeHtml = (str) => {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	};

	usersResults.innerHTML = users
		.map((user) => {
			const radius =
				user.avatar_radius !== null && user.avatar_radius !== undefined
					? `${user.avatar_radius}px`
					: user.gold || user.gray
						? "4px"
						: "50px";
			return `
			<a href="/@${escapeHtml(user.username)}" class="search-user">
				<img src="${escapeHtml(
					user.avatar || "/public/shared/assets/default-avatar.svg",
				)}" alt="${escapeHtml(user.name)}" style="border-radius: ${radius};">
				<div class="user-info">
					<h4>${escapeHtml(user.name)}</h4>
					<p>@${escapeHtml(user.username)}</p>
				</div>
			</a>
		`;
		})
		.join("");

	tweetsResults.innerHTML = "";
	posts.forEach((post) => {
		const tweetEl = createTweetElement(post, {
			clickToOpen: true,
			showTopReply: true,
		});
		tweetsResults.appendChild(tweetEl);
	});

	if (users.length === 0 && posts.length === 0) {
		showNoResultsState();
	}
};

const showEmptyState = async () => {
	searchEmpty.style.display = "block";
	usersSection.style.display = "none";
	tweetsSection.style.display = "none";

	searchEmpty.innerHTML = "";
	const skeletons = showSkeletons(searchEmpty, createNewsSkeleton, 4);

	if (!trends) {
		trends = await query("/trends");
	}

	removeSkeletons(skeletons);

	function timeAgo(ts) {
		const now = Date.now();
		const diff = Math.max(0, now - ts);

		const s = Math.floor(diff / 1000);
		if (s < 60) return `${s} seconds ago`;

		const m = Math.floor(s / 60);
		if (m < 60) return `${m} minutes ago`;

		const h = Math.floor(m / 60);
		if (h < 24) return `${h} hours ago`;

		const d = Math.floor(h / 24);
		if (d < 30) return `${d} days ago`;

		const mo = Math.floor(d / 30);
		if (mo < 12) return `${mo} months ago`;

		const y = Math.floor(mo / 12);
		return `${y} years ago`;
	}

	const parser = new DOMParser();
	const eventsEl = parser.parseFromString(
		trends.eventsHtml.replaceAll(` <i>(pictured)</i>`, ""),
		"text/html",
	);

	eventsEl.querySelectorAll("a").forEach((a) => {
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noopener noreferrer");

		a.href = new URL(
			a.getAttribute("href"),
			"https://en.wikipedia.org/wiki/Portal:Current_events",
		).href;
	});

	searchEmpty.innerHTML = `<p class="lup">Last updated ${timeAgo(trends.updated)}</p>
${
	Array.from(eventsEl.querySelectorAll(".current-events"))
		.map((event) => {
			const date = new Date(
				event
					.querySelector(".current-events-title .summary")
					.innerText.replace(/\u00A0/g, " ")
					.split(" (")[0],
			);

			const isToday = date.toDateString() === new Date().toDateString();
			const dateString = isToday
				? "Today"
				: date
						.toLocaleDateString("en-US", {
							weekday: "long",
							year: "numeric",
							month: "long",
							day: "numeric",
						})
						.replace(`, ${date.getFullYear()}`, "");

			const body = event.querySelector(
				".current-events-content.description",
			).innerHTML;

			return `<div class="current-event${isToday ? " today-event" : ""}">
<h3>${dateString}</h3>
<div class="body">${body}</div>
</div>`;
		})
		.join("") || "<p>No current events</p>"
}
<p class="credit">Content provided "as-is" by Wikipedia under CC BY-SA 4.0, sourced from "Current events", English Wikipedia. We do not guarantee accuracy and are not responsible for its content.</p>`;

	searchEmpty
		.querySelectorAll(".current-event:not(.today-event)")
		.forEach((event) => {
			const body = event.querySelector(".body");
			body.style.display = "none";

			event.querySelector("h3").addEventListener("click", () => {
				if (body.style.display === "none") {
					body.style.display = "block";
					event.querySelector("h3").classList.add("active");
				} else {
					body.style.display = "none";
					event.querySelector("h3").classList.remove("active");
				}
			});
		});

	searchEmpty.querySelectorAll(".current-event .body a").forEach((link) => {
		if (link.innerText.trim().startsWith("(") && link.innerText.endsWith(")")) {
			link.classList.add("parenthetical-link");
		}
	});
};

const showNoResultsState = () => {
	searchEmpty.style.display = "block";
	usersSection.style.display = "none";
	tweetsSection.style.display = "none";

	searchEmpty.innerHTML = `
			<svg class="search-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<path d="M21 21l-4.35-4.35" />
			</svg>
			<h3 class="nrf-title">No search results found</h3>
			<p>Try searching for something else</p>
		`;
};

export const searchQuery = async (q) => {
	const switchPage = (await import("./pages.js")).default;
	switchPage("search", { path: `/search` });
	document.getElementById("searchPageInput")?.focus();

	searchPageInput.value = q;
	performSearch(q);
};

export const initializeSearchPage = () => {
	if (isInitialized) return;
	isInitialized = true;

	const filterContainer = document.querySelector(".search-filters");
	if (filterContainer) {
		const activeFilter = filterContainer.querySelector(".active");
		if (activeFilter) {
			updateTabIndicator(filterContainer, activeFilter);
		}
	}

	filterBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			filterBtns.forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");
			currentFilter = btn.dataset.filter;

			if (filterContainer) {
				updateTabIndicator(filterContainer, btn);
			}

			const query = searchPageInput.value.trim();
			if (query) {
				performSearch(query);
			}
		});
	});

	searchPageInput.addEventListener("input", () => {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const query = searchPageInput.value.trim();
			if (!query) {
				if (currentAbortController) {
					try {
						currentAbortController.abort();
					} catch {}
					currentAbortController = null;
				}
				showEmptyState();
				return;
			}

			performSearch(query);
		}, 300);
	});

	showEmptyState();
};
