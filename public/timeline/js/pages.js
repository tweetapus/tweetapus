const pages = {
	timeline: document.querySelector(".timeline"),
	tweet: document.querySelector(".tweetPage"),
	profile: document.querySelector(".profile"),
	notifications: document.querySelector(".notifications"),
	search: document.querySelector(".search-page"),
	settings: null,
};
const states = {};
let searchInitialized = false;

function showPage(page, recoverState = () => {}) {
	Object.values(pages).forEach((p) => {
		if (p) p.style.display = "none";
	});

	if (pages[page]) {
		pages[page].style.display = "flex";
		recoverState(pages[page]);

		if (page === "search" && !searchInitialized) {
			searchInitialized = true;
			try {
				import("./search.js").then(({ initializeSearchPage }) => {
					initializeSearchPage();
				});
			} catch (error) {
				console.error("Failed to initialize search page:", error);
			}
		}
	} else if (page === "settings") {
		const settingsElement = document.querySelector(".settings");
		if (settingsElement) {
			pages.settings = settingsElement;
			settingsElement.style.display = "flex";
			recoverState(settingsElement);
		}
	} else if (page === "search") {
	}

	return pages[page];
}

export default function switchPage(
	page,
	{ recoverState = () => {}, path = "/" } = {},
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

	showPage(page, recoverState);

	const stateId = crypto.randomUUID();
	states[stateId] = recoverState;

	history.pushState(
		{
			page,
			stateId,
			scroll: 0,
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
	const { page, stateId, scroll } = event.state || {
		page: "timeline",
		stateId: null,
		scroll: 0,
	};

	const recoverState = (stateId && states[stateId]) || (() => {});

	showPage(page, recoverState);

	setTimeout(() => {
		window.scrollTo(0, scroll || 0);
	}, 0);
});

export { showPage };
