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

const performSearch = async (q) => {
  const searchId = ++lastSearchId;

  if (currentAbortController) {
    try {
      currentAbortController.abort();
    } catch {}
  }

  const controller = new AbortController();
  currentAbortController = controller;

  try {
    const promises = [];

    const encoded = encodeURIComponent(q);

    if (currentFilter === "all" || currentFilter === "users") {
      promises.push(
        query(`/search/users?q=${encoded}`, {
          signal: controller.signal,
        })
      );
    }

    if (currentFilter === "all" || currentFilter === "tweets") {
      promises.push(
        query(`/search/posts?q=${encoded}`, {
          signal: controller.signal,
        })
      );
    }

    const results = await Promise.all(promises);

    if (controller.signal.aborted || searchId !== lastSearchId) return;

    let users = [];
    let posts = [];

    if (results.some((r) => r?.error)) {
      console.error(
        "Search API error:",
        results.map((r) => r?.error || null)
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

  usersResults.innerHTML = users
    .map((user) => {
      const radius =
        user.avatar_radius !== null && user.avatar_radius !== undefined
          ? `${user.avatar_radius}px`
          : user.gold
          ? "4px"
          : "50px";
      const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
      };
      const escapedName = escapeHtml(user.name);
      const escapedUsername = escapeHtml(user.username);
      const escapedAvatar = escapeHtml(user.avatar || "/default-avatar.png");
      return `
			<a href="/@${escapedUsername}" class="search-user">
				<img src="${escapedAvatar}" alt="${escapedName}" style="border-radius: ${radius};">
				<div class="user-info">
					<h4>${escapedName}</h4>
					<p>@${escapedUsername}</p>
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

export const searchQuery = async (q) => {
  const switchPage = (await import("./pages.js")).default;
  switchPage("search", { path: `/search` });

  searchPageInput.value = q;
  performSearch(q);
};

export const initializeSearchPage = () => {
  if (isInitialized) return;
  isInitialized = true;

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
