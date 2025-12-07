import DOMPurify from "../../shared/assets/js/dompurify.js";
import { marked } from "../../shared/assets/js/marked.js";
import { isConvertibleImage } from "../../shared/image-utils.js";
import {
	createArticleSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";

const ARTICLE_DOMPURIFY_CONFIG = {
	ALLOWED_TAGS: [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"p",
		"br",
		"hr",
		"ul",
		"ol",
		"li",
		"blockquote",
		"pre",
		"code",
		"strong",
		"em",
		"b",
		"i",
		"u",
		"s",
		"del",
		"ins",
		"a",
		"img",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		"span",
		"div",
	],
	ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
	ALLOW_DATA_ATTR: false,
};

let initialized = false;
let container;
let openComposerButton;
let composerModal;
let composerOverlay;
let titleInput;
let coverButton;
let coverInput;
let coverPreview;
let markdownInput;
let publishButton;
let closeModalButton;
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
							},
						);
						resolve(webpFile);
					} else {
						resolve(file);
					}
					URL.revokeObjectURL(img.src);
				},
				"image/webp",
				0.9,
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(img.src);
			resolve(file);
		};

		img.src = URL.createObjectURL(file);
	});

const resetComposer = () => {
	uploadedCover = null;
	if (titleInput) titleInput.value = "";
	if (markdownInput) markdownInput.value = "";
	if (coverInput) coverInput.value = "";
	if (coverPreview) {
		coverPreview.style.backgroundImage = "";
		coverPreview.classList.add(hiddenClass);
	}
	const previewContent = document.querySelector(".article-preview-content");
	if (previewContent) previewContent.innerHTML = "";
};

const openComposerModal = () => {
	if (!composerModal || !composerOverlay) return;
	composerModal.classList.add("article-modal-open");
	composerOverlay.classList.remove(hiddenClass);
	document.body.style.overflow = "hidden";
	if (titleInput) titleInput.focus();
};

const closeComposerModal = () => {
	if (!composerModal || !composerOverlay) return;
	composerModal.classList.remove("article-modal-open");
	composerOverlay.classList.add(hiddenClass);
	document.body.style.overflow = "";
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

	let skeletons = [];
	try {
		if (!append) {
			articleCursor = null;
			reachedEnd = false;
			articlesList.innerHTML = "";
			toggleEmptyState(false);
			skeletons = showSkeletons(articlesList, createArticleSkeleton, 3);
		}

		const queryString = articleCursor
			? `?before=${encodeURIComponent(articleCursor)}`
			: "";
		const response = await query(`/articles${queryString}`);

		removeSkeletons(skeletons);

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

		items.forEach((article) => {
			renderArticleCard(article);
		});

		if (items.length < 10 || !response.next) {
			reachedEnd = true;
			setLoadMoreVisibility(false);
		} else {
			articleCursor = response.next;
			setLoadMoreVisibility(true);
		}
	} catch (error) {
		removeSkeletons(skeletons);
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
				`<h1>Upload failed</h1><p>${result.error || "Try again"}</p>`,
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
			`<h1>Article too short</h1><p>Write at least 50 characters</p>`,
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
				`<h1>Failed</h1><p>${response.error || "Could not publish"}</p>`,
			);
			return;
		}

		toastQueue.add(`<h1>Article published!</h1>`);

		if (response.article) {
			renderArticleCard(response.article, { prepend: true });
			toggleEmptyState(false);
		}

		resetComposer();
		closeComposerModal();
	} catch (error) {
		console.error("Publish article error:", error);
		toastQueue.add(`<h1>Failed to publish</h1>`);
	} finally {
		publishButton.disabled = false;
		publishButton.textContent = "Publish article";
	}
};

const setupComposer = () => {
	if (!composerModal) return;

	const modalContent = document.createElement("div");
	modalContent.className = "article-modal-content";

	const modalHeader = document.createElement("div");
	modalHeader.className = "article-modal-header";

	closeModalButton = document.createElement("button");
	closeModalButton.type = "button";
	closeModalButton.className = "article-modal-close";
	closeModalButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
	closeModalButton.addEventListener("click", closeComposerModal);
	modalHeader.appendChild(closeModalButton);

	modalContent.appendChild(modalHeader);

	titleInput = document.createElement("input");
	titleInput.type = "text";
	titleInput.placeholder = "Article title";
	titleInput.maxLength = 160;
	titleInput.className = "article-title-input";
	modalContent.appendChild(titleInput);

	const coverRow = document.createElement("div");
	coverRow.className = "article-cover-row";

	coverButton = document.createElement("button");
	coverButton.type = "button";
	coverButton.textContent = "Upload cover image";
	coverButton.className = "article-cover-button";
	coverRow.appendChild(coverButton);

	coverInput = document.createElement("input");
	coverInput.type = "file";
	coverInput.accept = "image/webp,image/png,image/jpeg,image/avif";
	coverInput.className = hiddenClass;
	coverRow.appendChild(coverInput);

	coverPreview = document.createElement("div");
	coverPreview.className = `article-cover-preview ${hiddenClass}`;

	const removeBtn = document.createElement("button");
	removeBtn.type = "button";
	removeBtn.className = "article-cover-remove";
	removeBtn.textContent = "Remove";
	removeBtn.addEventListener("click", () => {
		uploadedCover = null;
		coverPreview.style.backgroundImage = "";
		coverPreview.classList.add(hiddenClass);
		if (coverInput) coverInput.value = "";
	});
	coverPreview.appendChild(removeBtn);

	coverRow.appendChild(coverPreview);
	modalContent.appendChild(coverRow);

	const editorContainer = document.createElement("div");
	editorContainer.className = "article-editor-container";

	const editorPane = document.createElement("div");
	editorPane.className = "article-editor-pane";

	const editorLabel = document.createElement("label");
	editorLabel.textContent = "Editor";
	editorLabel.className = "article-pane-label";
	editorPane.appendChild(editorLabel);

	markdownInput = document.createElement("textarea");
	markdownInput.className = "article-markdown-input";
	markdownInput.placeholder =
		"Write your article in Markdown...\n\n# Heading 1\n## Heading 2\n\n**bold** and *italic*\n\n- List item\n- Another item\n\n> Blockquote\n\n`inline code`";

	const previewPane = document.createElement("div");
	previewPane.className = "article-preview-pane";

	const previewLabel = document.createElement("label");
	previewLabel.textContent = "Preview";
	previewLabel.className = "article-pane-label";

	const previewContent = document.createElement("div");
	previewContent.className = "article-preview-content";

	const updatePreview = () => {
		const raw = markdownInput.value;
		previewContent.innerHTML = DOMPurify.sanitize(
			marked.parse(raw, { gfm: true, breaks: true }),
			ARTICLE_DOMPURIFY_CONFIG,
		);
	};

	markdownInput.addEventListener("input", updatePreview);

	editorPane.appendChild(markdownInput);
	previewPane.appendChild(previewLabel);
	previewPane.appendChild(previewContent);

	editorContainer.appendChild(editorPane);
	editorContainer.appendChild(previewPane);
	modalContent.appendChild(editorContainer);

	const actionsRow = document.createElement("div");
	actionsRow.className = "article-actions";

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.textContent = "Cancel";
	cancelButton.className = "article-cancel-button";
	cancelButton.addEventListener("click", () => {
		if (
			titleInput?.value.trim() ||
			markdownInput?.value.trim() ||
			uploadedCover
		) {
			if (
				confirm("You have unsaved changes. Are you sure you want to close?")
			) {
				resetComposer();
				closeComposerModal();
			}
		} else {
			closeComposerModal();
		}
	});
	actionsRow.appendChild(cancelButton);

	publishButton = document.createElement("button");
	publishButton.type = "button";
	publishButton.textContent = "Publish Article";
	publishButton.className = "article-publish-button";
	actionsRow.appendChild(publishButton);

	modalContent.appendChild(actionsRow);
	composerModal.appendChild(modalContent);

	coverButton.addEventListener("click", () => coverInput?.click());
	coverInput.addEventListener("change", (event) => {
		const [file] = event.target.files || [];
		if (file) {
			uploadCover(file);
		}
	});

	publishButton.addEventListener("click", publishArticle);

	composerOverlay.addEventListener("click", (e) => {
		if (e.target === composerOverlay) {
			closeComposerModal();
		}
	});
};

export const initArticles = () => {
	if (initialized) return;
	container = document.getElementById("articles-container");
	openComposerButton = document.getElementById("open-article-composer");
	composerModal = document.getElementById("article-composer-modal");
	composerOverlay = document.getElementById("article-modal-overlay");
	articlesList = document.getElementById("articles-list");
	emptyState = document.getElementById("articles-empty");
	loadMoreButton = document.getElementById("articles-load-more");

	if (!container || !openComposerButton || !composerModal || !articlesList) {
		return;
	}

	setupComposer();

	openComposerButton.addEventListener("click", openComposerModal);

	if (loadMoreButton) {
		loadMoreButton.addEventListener("click", () =>
			loadArticles({ append: true }),
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
