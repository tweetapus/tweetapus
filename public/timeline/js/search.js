import query from "./api.js";
import { createTweetElement } from "./tweets.js";

let currentFilter = "all";
let searchTimeout;
let isInitialized = false;
let lastSearchId = 0;
let currentAbortController = null;

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
    console.warn("Search page elemants not found, skipping initalization");
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
      // If the query is empty, show the empty state and cancel any in-flight
      // search requests to avoid stale results. Allow short queries (1-2
      // characters) to perform normal searches.
      if (!query) {
        // Cancel any inflight request
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

  const performSearch = async (q) => {
    // Use a search id + AbortController to prevent out-of-order or
    // stale responses from overwriting newer results.
    const searchId = ++lastSearchId;

    // Cancel previous request if any
    if (currentAbortController) {
      try {
        currentAbortController.abort();
      } catch {}
    }

    const controller = new AbortController();
    currentAbortController = controller;

    try {
      const promises = [];

      // Add a cache-buster for single-character queries so the browser
      // doesn't reuse cached responses and each one-char input issues
      // a fresh network request.
      const encoded = encodeURIComponent(q);
      const cacheBuster = q.length === 1 ? `&_=${Date.now()}` : "";

      if (currentFilter === "all" || currentFilter === "users") {
        promises.push(
          query(`/search/users?q=${encoded}${cacheBuster}`, {
            signal: controller.signal,
          })
        );
      }

      if (currentFilter === "all" || currentFilter === "tweets") {
        promises.push(
          query(`/search/posts?q=${encoded}${cacheBuster}`, {
            signal: controller.signal,
          })
        );
      }

      const results = await Promise.all(promises);

      // If this search was aborted or a newer search has started, ignore results
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

      // Double-check the input hasn't changed since the request started.
      const liveQuery = searchPageInput.value.trim();
      if (liveQuery !== q) {
        // A newer query exists; ignore this result.
        return;
      }

      displayResults(users, posts);
    } catch (error) {
      // The API wrapper normalizes errors, but guard anyway.
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
        return `
			<a href="/@${user.username}" class="search-user">
				<img src="${user.avatar || "/default-avatar.png"}" alt="${user.name.replaceAll(
          '"',
          ""
        )}" style="border-radius: ${radius};">
				<div class="user-info">
					<h4>${user.name.replaceAll('"', "")}</h4>
					<p>@${user.username.replaceAll('"', "")}</p>
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

  showEmptyState();
};

export const openHashtagView = async (hashtag) => {
  const switchPage = (await import("./pages.js")).default;
  switchPage("search", { path: `/search?q=%23${hashtag}` });

  const searchPage = document.querySelector(".search-page");
  if (!searchPage) return;

  const searchPageInput = document.getElementById("searchPageInput");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const searchEmpty = document.getElementById("searchEmpty");
  const usersSection = document.getElementById("usersSection");
  const tweetsSection = document.getElementById("tweetsSection");
  const tweetsResults = document.querySelector(".tweets-results-page");

  searchEmpty.style.display = "none";
  usersSection.style.display = "none";
  tweetsSection.style.display = "block";

  filterBtns.forEach((b) => b.classList.remove("active"));
  const tweetFilter = Array.from(filterBtns).find(
    (b) => b.dataset.filter === "tweets"
  );
  if (tweetFilter) tweetFilter.classList.add("active");

  if (searchPageInput) {
    searchPageInput.value = `#${hashtag}`;
  }

  tweetsResults.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const result = await query(`/hashtags/${hashtag}`);

    if (result.error) {
      tweetsResults.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
          <p>${result.error}</p>
        </div>
      `;
      return;
    }

    if (!result.tweets || result.tweets.length === 0) {
      tweetsResults.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
          <p>No tweets found for #${hashtag}</p>
        </div>
      `;
      return;
    }

    tweetsResults.innerHTML = "";
    result.tweets.forEach((tweet) => {
      const tweetEl = createTweetElement(tweet, {
        clickToOpen: true,
        showTopReply: false,
        isTopReply: false,
        size: "normal",
      });
      tweetsResults.appendChild(tweetEl);
    });
  } catch (error) {
    console.error("Error loading hashtag:", error);
    tweetsResults.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <p>Failed to load tweets for #${hashtag}</p>
      </div>
    `;
  }
};
