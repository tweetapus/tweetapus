const pageSelectors = {
	timeline: ".timeline",
	tweet: ".tweetPage",
	profile: ".profile",
	notifications: ".notifications",
	search: ".search-page",
	bookmarks: ".bookmarks-page",
	"direct-messages": ".direct-messages",
	"dm-conversation": ".dm-conversation",
	communities: ".communities-page",
	"community-detail": ".community-detail-page",
	"list-detail": ".list-detail-page",
	settings: ".settings",
};

const pageCache = {};

function getPage(name) {
	if (pageCache[name]) return pageCache[name];
	const selector = pageSelectors[name];
	if (!selector) return null;
	const el = document.querySelector(selector);
	if (el) pageCache[name] = el;
	return el;
}

const pages = new Proxy({}, {
	get(_, prop) {
		return getPage(prop);
	},
	set(_, prop, value) {
		pageCache[prop] = value;
		return true;
	}
});

const states = {};
const cleanups = {};
const lazyInitializers = {
	search: false,
	communities: false,
};

let unreadNotifications = 0;
let unreadDMs = 0;

const getPageTitle = (page, opts = {}) => {
	const titles = {
		timeline: () => null,
		tweet: () => (opts?.title ? `${opts.title}` : "tweetapus"),
		profile: () => (opts?.title ? `${opts.title}` : "tweetapus"),
		notifications: () => "notifications",
		search: () => "search",
		bookmarks: () => "bookmarks",
		"direct-messages": () => "messages",
		"dm-conversation": () =>
			opts?.title ? `${opts.title}` : "messages",
		communities: () => "communities",
		"community-detail": () =>
			opts?.title ? `${opts.title}` : "community",
		"list-detail": () =>
			opts?.title ? `${opts.title}` : "list",
		settings: () => "settings",
	};
	return titles[page]?.() ? `${titles[page]?.()} // tweetapus` : "tweetapus";
};

export function updatePageTitle(page, opts = {}) {
	if (unreadNotifications + unreadDMs) {
		document.title = `(${unreadNotifications + unreadDMs}) ${getPageTitle(page, opts)}`;
		return;
	}
	document.title = getPageTitle(page, opts);
}

export function setUnreadCounts(notifications = 0, dms = 0) {
	unreadNotifications = notifications;
	unreadDMs = dms;
}

const updateNavbar = () => {
	requestAnimationFrame(() => {
		const currentPath = window.location.pathname;
		const currentPage = currentPath.split("/")[1];

		document.querySelectorAll("nav button.active").forEach((btn) => {
			btn.classList.remove("active");
		});

		if (!currentPage) {
			document.querySelector(".home-btn").classList.add("active");
		}

		if (currentPage === "search") {
			document.querySelector(".search-btn").classList.add("active");
		}

		if (currentPage === "notifications") {
			document.querySelector(".notifications-btn").classList.add("active");
		}

		if (currentPage === "dm") {
			document.querySelector(".dm-btn").classList.add("active");
		}

		if (currentPage === "communities") {
			document.querySelector(".communities-btn").classList.add("active");
		}
	});
};

function showPage(page, options = {}) {
	const { recoverState = () => {}, title } = options;

	if (history.state?.stateId && cleanups[history.state.stateId]) {
		try {
			cleanups[history.state.stateId]();
			delete cleanups[history.state.stateId];
		} catch (error) {
			console.error("Error in cleanup:", error);
		}
	}

	Object.keys(pageSelectors).forEach((name) => {
		const p = getPage(name);
		if (p) {
			p.style.display = "none";
			p.classList.remove("page-active");
		}
	});

	const settingsElement = document.querySelector(".settings");
	if (settingsElement) {
		settingsElement.style.display = "none";
		settingsElement.classList.remove("page-active");
	}

	updatePageTitle(page, { title });

	if (pages[page]) {
		pages[page].style.display = "flex";
		pages[page].classList.add("page-active");

		requestAnimationFrame(() => {
			try {
				recoverState(pages[page]);
			} catch (error) {
				console.error(`Error in recoverState for page ${page}:`, error);
			}
		});

		if (page === "search" && !lazyInitializers.search) {
			lazyInitializers.search = true;
			import("./search.js")
				.then(({ initializeSearchPage }) => initializeSearchPage())
				.catch((error) =>
					console.error("Failed to initialize search page:", error),
				);
		}

		if (page === "communities" && !lazyInitializers.communities) {
			lazyInitializers.communities = true;
			import("./communities.js")
				.then(({ initializeCommunitiesPage }) => initializeCommunitiesPage())
				.catch((error) =>
					console.error("Failed to initialize communities page:", error),
				);
		}
	} else if (page === "settings") {
		updatePageTitle("settings");
		requestAnimationFrame(() => {
			try {
				recoverState();
			} catch (error) {
				console.error(`Error in recoverState for settings:`, error);
			}
		});
		const updatedSettingsElement = document.querySelector(".settings");
		if (updatedSettingsElement) {
			pages.settings = updatedSettingsElement;
		}
	}

	return pages[page];
}

export default function switchPage(
	page,
	{
		recoverState = () => {},
		path = "/",
		cleanup = () => {},
		noScroll,
		title,
	} = {},
) {
	if (history.state) {
		history.replaceState(
			{
				...history.state,
				scroll: window.scrollY,
			},
			"",
			window.location.pathname,
		);
	}

	showPage(page, { recoverState, path, cleanup, title });
	updateNavbar();

	const stateId = crypto.randomUUID();
	states[stateId] = recoverState;
	cleanups[stateId] = cleanup;

	history.pushState(
		{
			page,
			stateId,
			scroll: 0,
			noScroll,
			title,
		},
		"",
		path,
	);

	return pages[page];
}

export function addRoute(pathMatcher, onMatch) {
	const currentPath = window.location.pathname;

	if (pathMatcher(currentPath)) onMatch(currentPath);
}

window.addEventListener("popstate", (event) => {
	const { state } = event;
	const path = window.location.pathname || "";
	const pageFromPath = path.split("/")[1] || "timeline";
	const {
		page = pageFromPath,
		stateId = null,
		scroll = 0,
		noScroll = false,
		title = null,
	} = state || {};

	if (history.state?.stateId && cleanups[history.state.stateId]) {
		try {
			cleanups[history.state.stateId]();
			delete cleanups[history.state.stateId];
		} catch (e) {
			console.error("Error in cleanup:", e);
		}
	}

	const recoverState = (stateId && states[stateId]) || (() => {});

	showPage(page, { recoverState, title });
	updateNavbar();

	setTimeout(() => {
		if (noScroll) return;
		window.scrollTo(0, scroll || 0);
	}, 0);
});

updateNavbar();

export { showPage };
