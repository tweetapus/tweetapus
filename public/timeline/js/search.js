import { authToken } from "./auth.js";
import { createTweetElement } from "./tweets.js";

let currentFilter = "all";
let searchTimeout;
let isInitialized = false;

export const initializeSearchPage = () => {
	if (isInitialized) return;
	isInitialized = true;
	const searchPageInput = document.getElementById("searchPageInput");
	const filterBtns = document.querySelectorAll(".filter-btn");
	const searchEmpty = document.getElementById("searchEmpty");
	const usersSection = document.getElementById("usersSection");
	const tweetsSection = document.getElementById("tweetsSection");
	const usersResults = document.querySelector(".users-results-page");
	const tweetsResults = document.querySelector(".tweets-results-page");

	if (!searchPageInput || !filterBtns.length || !searchEmpty) {
		console.warn("Search page elements not found, skipping initialization");
		return;
	}

	filterBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			filterBtns.forEach((b) => b.classList.remove("active"));
			btn.classList.add("active");
			currentFilter = btn.dataset.filter;

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
				showEmptyState();
				return;
			}
			performSearch(query);
		}, 300);
	});

	const performSearch = async (query) => {
		try {
			const promises = [];

			if (currentFilter === "all" || currentFilter === "users") {
				promises.push(
					fetch(`/api/search/users?q=${encodeURIComponent(query)}`, {
						headers: { Authorization: `Bearer ${authToken}` },
					}),
				);
			}

			if (currentFilter === "all" || currentFilter === "tweets") {
				promises.push(
					fetch(`/api/search/posts?q=${encodeURIComponent(query)}`, {
						headers: { Authorization: `Bearer ${authToken}` },
					}),
				);
			}

			const responses = await Promise.all(promises);
			let users = [];
			let posts = [];

			if (currentFilter === "all") {
				const [usersRes, postsRes] = responses;
				const usersData = await usersRes.json();
				const postsData = await postsRes.json();
				users = usersData.users;
				posts = postsData.posts;
			} else if (currentFilter === "users") {
				const usersData = await responses[0].json();
				users = usersData.users;
			} else if (currentFilter === "tweets") {
				const postsData = await responses[0].json();
				posts = postsData.posts;
			}

			displayResults(users, posts);
		} catch (error) {
			console.error("Search error:", error);
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

		usersResults.innerHTML = users
			.map(
				(user) => `
			<a href="/@${user.username}" class="search-user">
				<img src="${user.avatar || "/default-avatar.png"}" alt="${user.name}">
				<div class="user-info">
					<h4>${user.name}</h4>
					<p>@${user.username}</p>
				</div>
			</a>
		`,
			)
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

	const showEmptyState = () => {
		searchEmpty.style.display = "block";
		usersSection.style.display = "none";
		tweetsSection.style.display = "none";

		searchEmpty.innerHTML = `
			<svg class="search-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<path d="M21 21l-4.35-4.35" />
			</svg>
			<h3>Search for people and tweets</h3>
			<p>Start typing to find what you're looking for</p>
		`;
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
			<h3>No search results found</h3>
			<p>Try searching for something else</p>
		`;
	};

	showEmptyState();
};
