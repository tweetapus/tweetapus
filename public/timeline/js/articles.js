import DOMPurify from "https://esm.sh/dompurify@2.4.0";
import { marked } from "https://esm.sh/marked@16.3.0";
import { isConvertibleImage } from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";

let initialized = false;
let container;
let composerHost;
let titleInput;
let coverButton;
let coverInput;
let coverPreview;
let markdownInput;
let previewPane;
let publishButton;
let articlesList;
let emptyState;
let loadMoreButton;
let articleCursor = null;
let loadingArticles = false;
let reachedEnd = false;
let uploadedCover = null;
let hasLoadedInitial = false;

const hiddenClass = "hidden";

const convertToWebP = (file) =>
  new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/webp") {
      resolve(file);
      return;
    }

    if (!isConvertibleImage(file)) {
      resolve(file);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const webpFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, ".webp"),
              {
                type: "image/webp",
                lastModified: Date.now(),
              }
            );
            resolve(webpFile);
          } else {
            resolve(file);
          }
          URL.revokeObjectURL(img.src);
        },
        "image/webp",
        0.9
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };

    img.src = URL.createObjectURL(file);
  });

const sanitizeMarkdown = (markdown) =>
  DOMPurify.sanitize(
    marked.parse(markdown, {
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false,
    })
  );

const updatePreview = () => {
  if (!previewPane) return;
  const markdown = markdownInput?.value?.trim() || "";
  if (!markdown) {
    previewPane.innerHTML = "";
    previewPane.classList.add(hiddenClass);
    return;
  }
  previewPane.innerHTML = sanitizeMarkdown(markdown);
  previewPane.classList.remove(hiddenClass);
};

const resetComposer = () => {
  uploadedCover = null;
  if (titleInput) titleInput.value = "";
  if (markdownInput) markdownInput.value = "";
  if (coverInput) coverInput.value = "";
  if (coverPreview) {
    coverPreview.style.backgroundImage = "";
    coverPreview.classList.add(hiddenClass);
  }
  updatePreview();
};

const renderArticleCard = (article, { prepend = false } = {}) => {
  if (!articlesList) return;
  const card = document.createElement("article");
  card.className = "article-card";

  if (article.cover?.file_url) {
    const coverEl = document.createElement("div");
    coverEl.className = "article-card-cover";
    coverEl.style.backgroundImage = `url(${article.cover.file_url})`;
    card.appendChild(coverEl);
  }

  const contentEl = document.createElement("div");
  contentEl.className = "article-card-content";

  const titleEl = document.createElement("h3");
  titleEl.className = "article-card-title";
  titleEl.textContent = article.article_title || "Untitled article";
  contentEl.appendChild(titleEl);

  if (article.excerpt) {
    const excerptEl = document.createElement("p");
    excerptEl.className = "article-card-excerpt";
    excerptEl.textContent = article.excerpt;
    contentEl.appendChild(excerptEl);
  }

  const metaEl = document.createElement("div");
  metaEl.className = "article-card-meta";
  const authorName =
    article.author?.name || article.author?.username || "Unknown";
  const createdAt = article.created_at
    ? new Date(article.created_at).toLocaleString()
    : "";
  metaEl.textContent = createdAt ? `${authorName} • ${createdAt}` : authorName;
  contentEl.appendChild(metaEl);

  card.appendChild(contentEl);

  card.addEventListener("click", async () => {
    const { default: openTweet } = await import("./tweet.js");
    openTweet({ id: article.id });
  });

  if (prepend && articlesList.firstChild) {
    articlesList.insertBefore(card, articlesList.firstChild);
  } else {
    articlesList.appendChild(card);
  }
};

const toggleEmptyState = (show) => {
  if (!emptyState) return;
  if (show) {
    emptyState.textContent = "No articles published yet.";
    emptyState.classList.remove(hiddenClass);
  } else {
    emptyState.classList.add(hiddenClass);
  }
};

const setLoadMoreVisibility = (visible) => {
  if (!loadMoreButton) return;
  if (visible) {
    loadMoreButton.classList.remove(hiddenClass);
  } else {
    loadMoreButton.classList.add(hiddenClass);
  }
};

const loadArticles = async ({ append } = { append: false }) => {
  if (loadingArticles || (reachedEnd && append)) return;
  loadingArticles = true;

  try {
    if (!append) {
      articleCursor = null;
      reachedEnd = false;
      articlesList.innerHTML = "";
      toggleEmptyState(false);
    }

    const queryString = articleCursor
      ? `?before=${encodeURIComponent(articleCursor)}`
      : "";
    const response = await query(`/articles${queryString}`);

    if (response.error) {
      toastQueue.add(`<h1>Error</h1><p>${response.error}</p>`);
      return;
    }

    const items = response.articles || [];

    if (!append && items.length === 0) {
      toggleEmptyState(true);
      setLoadMoreVisibility(false);
      reachedEnd = true;
      return;
    }

    items.forEach((article) => renderArticleCard(article));

    if (items.length < 10 || !response.next) {
      reachedEnd = true;
      setLoadMoreVisibility(false);
    } else {
      articleCursor = response.next;
      setLoadMoreVisibility(true);
    }
  } catch (error) {
    console.error("Load articles error:", error);
    toastQueue.add(`<h1>Failed to load articles</h1>`);
  } finally {
    loadingArticles = false;
  }
};

const uploadCover = async (file) => {
  if (!file) return;

  const processedFile = await convertToWebP(file);
  if (processedFile.type !== "image/webp") {
    toastQueue.add(`<h1>Cover must be WebP</h1>`);
    return;
  }

  const formData = new FormData();
  formData.append("file", processedFile);

  coverButton.disabled = true;
  publishButton.disabled = true;

  try {
    const result = await query("/upload", {
      method: "POST",
      body: formData,
    });

    if (!result.success) {
      toastQueue.add(
        `<h1>Upload failed</h1><p>${result.error || "Try again"}</p>`
      );
      return;
    }

    uploadedCover = result.file;
    if (coverPreview) {
      coverPreview.style.backgroundImage = `url(${uploadedCover.url})`;
      coverPreview.classList.remove(hiddenClass);
    }
  } catch (error) {
    console.error("Cover upload error:", error);
    toastQueue.add(`<h1>Upload failed</h1>`);
  } finally {
    coverButton.disabled = false;
    publishButton.disabled = false;
  }
};

const publishArticle = async () => {
  if (!titleInput || !markdownInput || !publishButton) return;
  const title = titleInput.value.trim();
  const markdown = markdownInput.value.trim();

  if (title.length < 5) {
    toastQueue.add(`<h1>Title too short</h1><p>Use at least 5 characters</p>`);
    return;
  }

  if (markdown.length < 50) {
    toastQueue.add(
      `<h1>Article too short</h1><p>Write at least 50 characters</p>`
    );
    return;
  }

  publishButton.disabled = true;
  publishButton.textContent = "Publishing…";

  try {
    const payload = {
      title,
      markdown,
    };

    if (uploadedCover) {
      payload.cover = uploadedCover;
    }

    const response = await query("/articles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.success) {
      toastQueue.add(
        `<h1>Failed</h1><p>${response.error || "Could not publish"}</p>`
      );
      return;
    }

    toastQueue.add(`<h1>Article published!</h1>`);

    if (response.article) {
      renderArticleCard(response.article, { prepend: true });
      toggleEmptyState(false);
    }

    resetComposer();
  } catch (error) {
    console.error("Publish article error:", error);
    toastQueue.add(`<h1>Failed to publish</h1>`);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = "Publish article";
  }
};

const setupComposer = () => {
  if (!composerHost) return;

  const wrapper = document.createElement("div");
  wrapper.className = "article-composer";

  titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Article title";
  titleInput.maxLength = 160;
  titleInput.className = "article-title-input";
  wrapper.appendChild(titleInput);

  const coverRow = document.createElement("div");
  coverRow.className = "article-cover-row";

  coverButton = document.createElement("button");
  coverButton.type = "button";
  coverButton.textContent = "Upload cover (optional)";
  coverButton.className = "article-cover-button";
  coverRow.appendChild(coverButton);

  coverInput = document.createElement("input");
  coverInput.type = "file";
  coverInput.accept = "image/webp,image/png,image/jpeg,image/avif";
  coverInput.className = hiddenClass;
  coverRow.appendChild(coverInput);

  coverPreview = document.createElement("div");
  coverPreview.className = `article-cover-preview ${hiddenClass}`;
  coverRow.appendChild(coverPreview);

  wrapper.appendChild(coverRow);

  markdownInput = document.createElement("textarea");
  markdownInput.className = "article-markdown-input";
  markdownInput.rows = 12;
  markdownInput.placeholder = "Write your article in Markdown…";
  wrapper.appendChild(markdownInput);

  previewPane = document.createElement("div");
  previewPane.className = `article-markdown-preview ${hiddenClass}`;
  wrapper.appendChild(previewPane);

  const actionsRow = document.createElement("div");
  actionsRow.className = "article-actions";

  publishButton = document.createElement("button");
  publishButton.type = "button";
  publishButton.textContent = "Publish article";
  publishButton.className = "article-publish-button";
  actionsRow.appendChild(publishButton);

  wrapper.appendChild(actionsRow);

  composerHost.appendChild(wrapper);

  coverButton.addEventListener("click", () => coverInput?.click());
  coverInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      uploadCover(file);
    }
  });

  markdownInput.addEventListener("input", updatePreview);
  publishButton.addEventListener("click", publishArticle);
};

export const initArticles = () => {
  if (initialized) return;
  container = document.getElementById("articles-container");
  composerHost = document.getElementById("article-composer");
  articlesList = document.getElementById("articles-list");
  emptyState = document.getElementById("articles-empty");
  loadMoreButton = document.getElementById("articles-load-more");

  if (!container || !composerHost || !articlesList) {
    return;
  }

  setupComposer();

  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () =>
      loadArticles({ append: true })
    );
  }

  container.classList.add(hiddenClass);
  initialized = true;
};

export const activateArticlesTab = async () => {
  if (!initialized) initArticles();
  if (!container) return;
  container.classList.remove(hiddenClass);

  if (!hasLoadedInitial) {
    await loadArticles({ append: false });
    hasLoadedInitial = true;
  }
};

export const deactivateArticlesTab = () => {
  if (!initialized || !container) return;
  container.classList.add(hiddenClass);
};

export const handleArticlesScroll = async () => {
  if (!initialized || !container || container.classList.contains(hiddenClass)) {
    return;
  }

  if (loadingArticles || reachedEnd) {
    return;
  }

  const scrollPosition = window.innerHeight + window.scrollY;
  const threshold = document.documentElement.scrollHeight - 600;

  if (scrollPosition >= threshold) {
    await loadArticles({ append: true });
  }
};

export const openArticleById = async (articleId) => {
  const { default: openTweet } = await import("./tweet.js");
  openTweet({ id: articleId });
};
