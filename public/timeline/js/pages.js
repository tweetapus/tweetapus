const pages = {
  timeline: document.querySelector(".timeline"),
  tweet: document.querySelector(".tweetPage"),
  profile: document.querySelector(".profile"),
  notifications: document.querySelector(".notifications"),
  search: document.querySelector(".search-page"),
  bookmarks: document.querySelector(".bookmarks-page"),
  "direct-messages": document.querySelector(".direct-messages"),
  "dm-conversation": document.querySelector(".dm-conversation"),
  settings: null,
};
const states = {};
const lazyInitializers = {
  search: false,
};

function showPage(page, options = {}) {
  const { recoverState = () => {} } = options;

  Object.values(pages).forEach((p) => {
    if (p) {
      p.style.display = "none";
      p.classList.remove("page-active");
    }
  });

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
          console.error("Failed to initialize search page:", error)
        );
    }
  } else if (page === "settings") {
    const settingsElement = document.querySelector(".settings");
    if (settingsElement) {
      pages.settings = settingsElement;
      settingsElement.style.display = "flex";
      settingsElement.classList.add("page-active");
      requestAnimationFrame(() => recoverState(settingsElement));
    }
  }

  return pages[page];
}

export default function switchPage(
  page,
  { recoverState = () => {}, path = "/" } = {}
) {
  if (history.state) {
    history.replaceState(
      {
        ...history.state,
        scroll: window.scrollY,
      },
      "",
      window.location.pathname
    );
  }

  showPage(page, { recoverState, path });

  const stateId = crypto.randomUUID();
  states[stateId] = recoverState;

  history.pushState(
    {
      page,
      stateId,
      scroll: 0,
    },
    "",
    path
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

  showPage(page, { recoverState });

  setTimeout(() => {
    window.scrollTo(0, scroll || 0);
  }, 0);
});

export { showPage };
