import { showEmojiPickerPopup } from "../../shared/emoji-picker.js";
import { isConvertibleImage } from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import getUser from "./auth.js";

export const useComposer = (
	element,
	callback,
	{
		replyTo = null,
		quoteTweet = null,
		article = null,
		maxChars = 400,
		communityId = null,
		communitySelector = null,
		interactiveCard = null,
		cardOnly = false,
	} = {},
) => {
	const textarea = element.querySelector("#tweet-textarea");
	const charCount = element.querySelector("#char-count");
	const tweetButton = element.querySelector("#tweet-button");
	const pollToggle = element.querySelector("#poll-toggle");
	const pollContainer = element.querySelector("#poll-container");
	const addPollOptionBtn = element.querySelector("#add-poll-option");
	const pollDuration = element.querySelector("#poll-duration");
	const fileInput = element.querySelector("#file-input");
	const fileUploadBtn = element.querySelector("#file-upload-btn");
	const attachmentPreview = element.querySelector("#attachment-preview");
	const gifBtn = element.querySelector("#gif-btn");
	const gifPicker = element.querySelector("#gif-picker");
	const gifSearchInput = element.querySelector("#gif-search-input");
	const gifResults = element.querySelector("#gif-results");
	const gifPickerClose = element.querySelector("#gif-picker-close");
	const unsplashBtn = element.querySelector("#unsplash-btn");
	const unsplashPicker = element.querySelector("#unsplash-picker");
	const unsplashSearchInput = element.querySelector("#unsplash-search-input");
	const unsplashResults = element.querySelector("#unsplash-results");
	const unsplashPickerClose = element.querySelector("#unsplash-picker-close");
	const emojiBtn = element.querySelector("#emoji-btn");
	const replyRestrictionSelect = element.querySelector(
		"#reply-restriction-select",
	);
	const scheduleBtn = element.querySelector("#schedule-btn");
	const scheduleModal = element.querySelector("#schedule-modal");
	const scheduleModalClose = element.querySelector("#schedule-modal-close");
	const scheduleDateInput = element.querySelector("#schedule-date");
	const scheduleTimeInput = element.querySelector("#schedule-time");
	const confirmScheduleBtn = element.querySelector("#confirm-schedule-btn");
	const clearScheduleBtn = element.querySelector("#clear-schedule-btn");
	const cardToggleBtn = element.querySelector("#card-toggle");
	const cardModal = element.querySelector("#card-modal");
	const cardModalClose = element.querySelector("#card-modal-close");
	const cardMediaInput = element.querySelector("#card-media-input");
	const cardMediaUploadBtn = element.querySelector("#card-media-upload-btn");
	const confirmCardBtn = element.querySelector("#confirm-card-btn");
	const clearCardBtn = element.querySelector("#clear-card-btn");

	let pollEnabled = false;
	let pendingFiles = [];
	let replyRestriction = "everyone";
	let selectedGif = null;
	let selectedUnsplashImage = null;
	let scheduledFor = null;

	const updateCharacterCount = () => {
		if (!textarea || !charCount || !tweetButton) return;
		const length = textarea.value.length;
		charCount.textContent = length;

		if (length > maxChars) {
			charCount.parentElement.id = "over-limit";
			tweetButton.disabled = true;
		} else {
			charCount.parentElement.id = "";
			const hasExtras =
				(pendingFiles && pendingFiles.length > 0) ||
				!!selectedGif ||
				!!selectedUnsplashImage ||
				pollEnabled ||
				!!interactiveCard ||
				!!article;
			tweetButton.disabled = !hasExtras && length === 0;
		}
	};

	const addPollOption = (text = "") => {
		if (!pollContainer) return;
		const optionIndex = pollContainer.querySelectorAll(".poll-option").length;
		if (optionIndex >= 4) return;

		const optionDiv = document.createElement("div");
		optionDiv.className = "poll-option";
		optionDiv.innerHTML = `
			<input type="text" placeholder="Choice ${
				optionIndex + 1
			}" maxlength="100" value="${text}">
			${
				optionIndex >= 2
					? '<button type="button" class="remove-option">×</button>'
					: ""
			}
		`;

		pollContainer.querySelector(".poll-options").appendChild(optionDiv);

		if (optionDiv.querySelector(".remove-option")) {
			optionDiv
				.querySelector(".remove-option")
				.addEventListener("click", () => {
					optionDiv.remove();
					updateAddOptionButton();
				});
		}

		updateAddOptionButton();
	};

	const updateAddOptionButton = () => {
		if (!pollContainer || !addPollOptionBtn) return;
		const optionCount = pollContainer.querySelectorAll(".poll-option").length;
		addPollOptionBtn.style.display = optionCount >= 4 ? "none" : "block";
	};

	const togglePoll = () => {
		if (!pollContainer || !pollToggle) return;
		if (cardOnly) {
			toastQueue.add(
				`<h1>Polls not available</h1><p>Polls cannot be used in card composer mode</p>`,
			);
			return;
		}
		pollEnabled = !pollEnabled;
		pollContainer.style.display = pollEnabled ? "block" : "none";
		pollToggle.innerHTML = pollEnabled
			? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-x-icon lucide-circle-x"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`
			: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-column-big-icon lucide-chart-column-big"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="15" y="5" width="4" height="12" rx="1"/><rect x="7" y="8" width="4" height="9" rx="1"/></svg>`;

		if (
			pollEnabled &&
			pollContainer.querySelectorAll(".poll-option").length === 0
		) {
			addPollOption();
			addPollOption();
		}
	};

	textarea.addEventListener("input", updateCharacterCount);

	if (cardOnly) {
		if (fileUploadBtn) fileUploadBtn.style.display = "none";
		if (gifBtn) gifBtn.style.display = "none";
		if (pollToggle) pollToggle.style.display = "none";
	}

	textarea.addEventListener("input", () => {
		textarea.style.height = "0px";
		void textarea.offsetHeight;
		if (textarea.scrollHeight === 30) {
			textarea.style.height = `25px`;
		} else {
			textarea.style.height = `${Math.max(textarea.scrollHeight, 25)}px`;
		}

		if (textarea.scrollHeight < 250) {
			textarea.style.overflow = "hidden";
		} else {
			textarea.style.overflow = "auto";
		}
	});

	if (pollToggle) {
		pollToggle.addEventListener("click", togglePoll);
	}

	const convertToWebP = (file, quality = 0.8) => {
		return new Promise((resolve) => {
			if (!file.type.startsWith("image/")) {
				resolve(file);
				return;
			}

			if (file.type === "image/webp") {
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
					quality,
				);
			};

			img.onerror = () => {
				URL.revokeObjectURL(img.src);
				resolve(file);
			};

			img.src = URL.createObjectURL(file);
		});
	};

	const processFileForUpload = async (file) => {
		try {
			const processedFile = await convertToWebP(file);

			const allowedTypes = ["image/webp", "video/mp4"];

			if (!allowedTypes.includes(processedFile.type)) {
				toastQueue.add(
					`<h1>Unsupported file type</h1><p>Only WebP images and MP4 videos are allowed</p>`,
				);
				return null;
			}

			const maxSize =
				processedFile.type === "video/mp4"
					? 100 * 1024 * 1024
					: 10 * 1024 * 1024;
			if (processedFile.size > maxSize) {
				const maxSizeMB = maxSize / 1024 / 1024;
				const fileSizeMB = (processedFile.size / 1024 / 1024).toFixed(1);
				toastQueue.add(
					`<h1>File too large</h1><p>Your file is ${fileSizeMB}MB, but you can only upload up to ${maxSizeMB}MB${
						processedFile.type === "video/mp4"
							? " (videos will be compressed if needed)"
							: ""
					}</p>`,
				);
				return null;
			}

			const tempId = crypto.randomUUID();

			const fileData = {
				tempId,
				name: processedFile.name,
				type: processedFile.type,
				size: processedFile.size,
				file: processedFile,
				uploaded: false,
			};

			pendingFiles.push(fileData);
			displayAttachmentPreview(fileData);

			updateCharacterCount();
			return fileData;
		} catch (error) {
			console.error("File processing error:", error);
			toastQueue.add(`<h1>File processing failed</h1><p>Please try again</p>`);
			return null;
		}
	};

	const displayAttachmentPreview = (fileData) => {
		const previewEl = document.createElement("div");
		previewEl.className = "attachment-preview-item";
		previewEl.dataset.tempId = fileData.tempId;
		previewEl.dataset.isSpoiler = "false";

		if (fileData.type.startsWith("image/")) {
			const objectUrl = URL.createObjectURL(fileData.file);
			previewEl.innerHTML = `
				<img src="${objectUrl}" alt="${fileData.name}" />
				<button type="button" class="toggle-spoiler" title="Mark as spoiler">🚫</button>
				<button type="button" class="remove-attachment">×</button>
			`;
			previewEl
				.querySelector(".toggle-spoiler")
				?.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					const isSpoiler = previewEl.dataset.isSpoiler === "true";
					previewEl.dataset.isSpoiler = isSpoiler ? "false" : "true";
					const btn = previewEl.querySelector(".toggle-spoiler");
					btn.textContent = isSpoiler ? "🚫" : "⚠️";
					btn.title = isSpoiler ? "Mark as spoiler" : "Unmark as spoiler";
					previewEl.classList.toggle("spoiler-marked", !isSpoiler);
				});
		} else if (fileData.type === "video/mp4") {
			const objectUrl = URL.createObjectURL(fileData.file);
			previewEl.innerHTML = `
				<video src="${objectUrl}" controls></video>
				<button type="button" class="remove-attachment">×</button>
			`;
		}

		previewEl
			.querySelector(".remove-attachment")
			?.addEventListener("click", () => {
				pendingFiles = pendingFiles.filter((f) => f.tempId !== fileData.tempId);
				previewEl.remove();
				updateCharacterCount();
			});

		attachmentPreview.appendChild(previewEl);
	};

	if (fileUploadBtn && fileInput) {
		fileUploadBtn.addEventListener("click", () => {
			if (cardOnly) {
				toastQueue.add(
					`<h1>Media upload not available</h1><p>Images and videos cannot be uploaded in card composer mode</p>`,
				);
				return;
			}
			if (selectedGif || selectedUnsplashImage) {
				toastQueue.add(
					`<h1>Cannot add files</h1><p>Remove the GIF or Photo first to upload files</p>`,
				);
				return;
			}
			fileInput.click();
		});

		fileInput.addEventListener("change", async (e) => {
			if (cardOnly) {
				toastQueue.add(
					`<h1>Media upload not available</h1><p>Images and videos cannot be uploaded in card composer mode</p>`,
				);
				e.target.value = "";
				return;
			}
			if (selectedGif || selectedUnsplashImage) {
				toastQueue.add(
					`<h1>Cannot add files</h1><p>Remove the GIF or Photo first to upload files</p>`,
				);
				e.target.value = "";
				return;
			}
			const files = Array.from(e.target.files);
			for (const file of files) {
				await processFileForUpload(file);
			}
			e.target.value = "";
		});
	}

	textarea.addEventListener("paste", async (e) => {
		if (cardOnly) return;
		const items = Array.from(e.clipboardData.items);
		const fileItems = items.filter((item) => item.kind === "file");

		if (fileItems.length > 0) {
			e.preventDefault();
			for (const item of fileItems) {
				const file = item.getAsFile();
				if (file && (isConvertibleImage(file) || file.type === "video/mp4")) {
					await processFileForUpload(file);
				}
			}
		}
	});

	let mentionBox = document.querySelector("#mention-suggestions-popup");
	if (!mentionBox) {
		mentionBox = document.createElement("div");
		mentionBox.id = "mention-suggestions-popup";
		mentionBox.className = "mention-suggestions popup";
		mentionBox.style.display = "none";
		mentionBox.style.position = "absolute";
		mentionBox.style.zIndex = 10000;
		document.body.appendChild(mentionBox);
	}
	let mentionCandidates = [];
	let mentionIndex = -1;
	let mentionQuery = "";
	let mentionDebounce;

	const closeMentions = () => {
		mentionCandidates = [];
		mentionIndex = -1;
		mentionQuery = "";
		if (mentionBox) mentionBox.style.display = "none";
	};

	const renderMentions = () => {
		if (!mentionBox) return;
		if (!mentionCandidates) mentionCandidates = [];
		if (mentionCandidates.length === 0) {
			const rect = textarea.getBoundingClientRect();
			mentionBox.style.left = `${rect.left + window.scrollX}px`;
			mentionBox.style.top = `${rect.bottom + window.scrollY + 6}px`;
			mentionBox.style.minWidth = `${Math.max(220, rect.width)}px`;
			mentionBox.innerHTML = `<div class="no-results">No users found</div>`;
			mentionBox.style.display = "block";
			return;
		}

		const rect = textarea.getBoundingClientRect();
		mentionBox.style.left = `${rect.left + window.scrollX}px`;
		mentionBox.style.top = `${rect.bottom + window.scrollY + 6}px`;
		mentionBox.style.minWidth = `${Math.max(220, rect.width)}px`;
		mentionBox.style.maxWidth = `420px`;
		mentionBox.innerHTML = "";
		mentionCandidates.forEach((user, i) => {
			const div = document.createElement("button");
			div.type = "button";
			div.className = `mention-suggestion ${i === mentionIndex ? " selected" : ""}`;
			div.innerHTML = `
        <img class="mention-avatar" src="${
					user.avatar || "/public/shared/assets/default-avatar.svg"
				}" alt="" />
        <div class="mention-info">
          <div class="mention-name">${user.name}</div>
          <div class="mention-username">@${user.username}</div>
        </div>
      `;
			div.addEventListener("mousedown", (ev) => {
				ev.preventDefault();
				selectMention(i);
			});
			mentionBox.appendChild(div);
		});
		mentionBox.style.display = "block";
	};

	const selectMention = (i) => {
		const user = mentionCandidates[i];
		if (!user) return;

		const value = textarea.value;
		const selStart = textarea.selectionStart;
		const upto = value.slice(0, selStart);
		const atMatch = upto.match(/@([\w\d_\-.]{0,64})$/);
		if (!atMatch) return closeMentions();

		const prefixStart = selStart - atMatch[0].length;
		const before = value.slice(0, prefixStart);
		const after = value.slice(selStart);
		const insert = `@${user.username} `;
		const newPos = before.length + insert.length;
		textarea.value = before + insert + after;
		textarea.focus();
		textarea.setSelectionRange(newPos, newPos);
		updateCharacterCount();
		closeMentions();
	};

	const searchMentions = async (q) => {
		if (!q || q.trim().length === 0) {
			mentionCandidates = [];
			renderMentions();
			return;
		}

		try {
			const { users, error } = await query(
				`/search/users?q=${encodeURIComponent(q)}`,
			);
			if (error) {
				mentionCandidates = [];
			} else {
				const lower = q.toLowerCase();
				const filtered = (users || []).filter((u) => {
					if (!u) return false;
					if (u.suspended) return false;
					const uname = (u.username || "").toLowerCase();
					const name = (u.name || "").toLowerCase();
					return (
						uname.startsWith(lower) ||
						name.startsWith(lower) ||
						uname.includes(lower) ||
						name.includes(lower)
					);
				});
				mentionCandidates = filtered.slice(0, 8);
			}
		} catch {
			mentionCandidates = [];
		}
		mentionIndex = 0;
		renderMentions();
	};

	textarea.addEventListener("input", () => {
		const selStart = textarea.selectionStart;
		const upto = textarea.value.slice(0, selStart);
		const match = upto.match(/@([\w\d_\-.]{0,64})$/);
		if (!match) {
			closeMentions();
			return;
		}

		mentionQuery = match[1];
		clearTimeout(mentionDebounce);
		mentionDebounce = setTimeout(() => searchMentions(mentionQuery), 200);
	});

	textarea.addEventListener("keydown", (e) => {
		if (!mentionBox || mentionBox.style.display === "none") return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
			renderMentions();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			mentionIndex =
				(mentionIndex - 1 + mentionCandidates.length) %
				mentionCandidates.length;
			renderMentions();
		} else if (e.key === "Enter" || e.key === "Tab") {
			if (mentionCandidates.length > 0) {
				e.preventDefault();
				selectMention(mentionIndex >= 0 ? mentionIndex : 0);
			}
		} else if (e.key === "Escape") {
			closeMentions();
		}
	});

	document.addEventListener("click", (e) => {
		if (!mentionBox) return;
		if (!element.contains(e.target) && e.target !== mentionBox) {
			closeMentions();
		}
	});

	let selectedVibe = "normal";

	const VIBES = [
		{ id: "normal", label: "Normal", emoji: "🤖" },
		{ id: "friendly", label: "Friendly", emoji: "😊" },
		{ id: "coder", label: "Coder", emoji: "💻" },
		{ id: "angry", label: "Angry", emoji: "😤" },
		{ id: "cute", label: "Cute", emoji: "🥺" },
		{ id: "happyphone", label: "HappyPhone", emoji: "📱" },
	];

	const updateVibeButton = () => {
		const vibeBtn = element.querySelector("#vibe-btn");
		if (!vibeBtn) return;

		const currentVibe = VIBES.find((v) => v.id === selectedVibe);
		if (currentVibe) {
			vibeBtn.textContent = `${currentVibe.emoji} ${currentVibe.label} vibe`;
		}
	};

	const showVibeModal = () => {
		const modal = document.createElement("div");
		modal.className = "modal-overlay";
		modal.innerHTML = `
			<div class="modal vibe-modal">
				<div class="modal-header">
					<h3>Choose @h's vibe</h3>
					<button type="button" class="modal-close">×</button>
				</div>
				<div class="vibe-options-list">
					${VIBES.map(
						(vibe) => `
						<button type="button" class="vibe-option-item${vibe.id === selectedVibe ? " selected" : ""}" data-vibe="${vibe.id}">
							<span class="vibe-emoji">${vibe.emoji}</span>
							<span class="vibe-label">${vibe.label}</span>
						</button>
					`,
					).join("")}
				</div>
			</div>
		`;

		const closeModal = () => modal.remove();

		modal.querySelector(".modal-close").addEventListener("click", closeModal);
		modal.addEventListener("click", (e) => {
			if (e.target === modal) closeModal();
		});

		modal.querySelectorAll(".vibe-option-item").forEach((btn) => {
			btn.addEventListener("click", () => {
				selectedVibe = btn.dataset.vibe;
				updateVibeButton();
				closeModal();
			});
		});

		document.body.appendChild(modal);
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		textarea.classList.add("drag-over");
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		if (!textarea.contains(e.relatedTarget)) {
			textarea.classList.remove("drag-over");
		}
	};

	const handleDrop = async (e) => {
		e.preventDefault();
		textarea.classList.remove("drag-over");

		if (cardOnly) {
			toastQueue.add(
				`<h1>Media upload not available</h1><p>Images and videos cannot be uploaded in card composer mode</p>`,
			);
			return;
		}

		const files = Array.from(e.dataTransfer.files);
		const validFiles = files.filter(
			(file) => isConvertibleImage(file) || file.type === "video/mp4",
		);

		for (const file of validFiles) {
			await processFileForUpload(file);
		}
	};

	textarea.addEventListener("dragover", handleDragOver);
	textarea.addEventListener("dragleave", handleDragLeave);
	textarea.addEventListener("drop", handleDrop);

	if (gifBtn && gifPicker && gifSearchInput && gifResults && gifPickerClose) {
		let searchTimeout;

		gifBtn.addEventListener("click", () => {
			if (cardOnly) {
				toastQueue.add(
					`<h1>GIFs not available</h1><p>GIFs cannot be used in card composer mode</p>`,
				);
				return;
			}
			if (pendingFiles.length > 0 || selectedUnsplashImage) {
				toastQueue.add(
					`<h1>Cannot add GIF</h1><p>Remove uploaded files or Photo first to select a GIF</p>`,
				);
				return;
			}
			const isVisible = gifPicker.style.display === "block";
			gifPicker.style.display = isVisible ? "none" : "block";
			if (!isVisible) {
				gifSearchInput.focus();
				if (gifResults.children.length === 0) {
					gifResults.innerHTML = "";
				}
			}
		});

		gifPickerClose.addEventListener("click", () => {
			gifPicker.style.display = "none";
		});

		const searchGifs = async (q) => {
			if (!q || q.trim().length === 0) {
				gifResults.innerHTML = "";
				return;
			}

			gifResults.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path><path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="currentColor"></path></svg>
        </div>
      `;

			try {
				const { results, error } = await query(
					`/tenor/search?q=${encodeURIComponent(q)}&limit=12`,
				);

				if (error) {
					gifResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
              <p>Failed to load GIFs</p>
            </div>
          `;
					return;
				}

				if (!results || results.length === 0) {
					gifResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
              <p>No GIFs found</p>
            </div>
          `;
					return;
				}

				gifResults.innerHTML = "";
				results.forEach((gif) => {
					const gifEl = document.createElement("div");
					gifEl.className = "gif-item";
					const gifUrl =
						gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url;
					const previewUrl =
						gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url;

					gifEl.innerHTML = `<img src="${previewUrl}" alt="${gif.content_description}" loading="lazy" />`;

					gifEl.addEventListener("click", () => {
						selectedGif = gifUrl;
						pendingFiles = [];
						attachmentPreview.innerHTML = "";

						const previewEl = document.createElement("div");
						previewEl.className = "attachment-preview-item";
						previewEl.innerHTML = `
              <img src="${gifUrl}" alt="Selected GIF" />
              <button type="button" class="remove-attachment">
</button>
            `;

						previewEl
							.querySelector(".remove-attachment")
							.addEventListener("click", () => {
								selectedGif = null;
								previewEl.remove();
								updateCharacterCount();
							});

						attachmentPreview.appendChild(previewEl);
						gifPicker.style.display = "none";
						gifSearchInput.value = "";
						updateCharacterCount();
					});

					gifResults.appendChild(gifEl);
				});
			} catch (error) {
				console.error("GIF search error:", error);
				gifResults.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
            <p>Failed to load GIFs</p>
          </div>
        `;
			}
		};

		gifSearchInput.addEventListener("input", (e) => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				searchGifs(e.target.value);
			}, 500);
		});
	}

	if (unsplashBtn && unsplashPicker && unsplashSearchInput && unsplashResults && unsplashPickerClose) {
		let searchTimeout;

		unsplashBtn.addEventListener("click", () => {
			if (cardOnly) {
				toastQueue.add(
					`<h1>Photos not available</h1><p>Photos cannot be used in card composer mode</p>`,
				);
				return;
			}
			if (pendingFiles.length > 0 || selectedGif) {
				toastQueue.add(
					`<h1>Cannot add Photo</h1><p>Remove uploaded files or GIF first to select a Photo</p>`,
				);
				return;
			}
			const isVisible = unsplashPicker.style.display === "block";
			unsplashPicker.style.display = isVisible ? "none" : "block";
			if (!isVisible) {
				unsplashSearchInput.focus();
				if (unsplashResults.children.length === 0) {
					searchUnsplash("nature");
				}
			}
		});

		unsplashPickerClose.addEventListener("click", () => {
			unsplashPicker.style.display = "none";
		});

		const searchUnsplash = async (q) => {
			if (!q || q.trim().length === 0) {
				unsplashResults.innerHTML = "";
				return;
			}

			unsplashResults.innerHTML = `
				<div style="text-align: center; padding: 40px;">
					<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path><path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="currentColor"></path></svg>
				</div>
			`;

			try {
				const { results, error } = await query(
					`/unsplash/search?q=${encodeURIComponent(q)}&limit=12`,
				);

				if (error) {
					unsplashResults.innerHTML = `
						<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
							<p>Failed to load images</p>
						</div>
					`;
					return;
				}

				if (!results || results.length === 0) {
					unsplashResults.innerHTML = `
						<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
							<p>No images found</p>
						</div>
					`;
					return;
				}

				unsplashResults.innerHTML = "";
				results.forEach((img) => {
					const imgEl = document.createElement("div");
					imgEl.className = "unsplash-item";
					
					imgEl.innerHTML = `
						<img src="${img.thumb}" alt="${img.description}" loading="lazy" />
						<div class="unsplash-attribution-overlay">
							<span>Photo by ${img.user.name}</span>
						</div>
					`;

					imgEl.addEventListener("click", () => {
						selectedUnsplashImage = {
							url: img.url,
							download_location: img.download_location,
							photographer_name: img.user.name,
							photographer_username: img.user.username,
							photographer_url: img.user.link
						};
						
						pendingFiles = [];
						selectedGif = null;
						attachmentPreview.innerHTML = "";

						const previewEl = document.createElement("div");
						previewEl.className = "attachment-preview-item";
						previewEl.innerHTML = `
							<img src="${img.thumb}" alt="Selected Image" />
							<div class="unsplash-attribution-badge">
								Photo by ${img.user.name} on Unsplash
							</div>
							<button type="button" class="remove-attachment">×</button>
						`;

						previewEl
							.querySelector(".remove-attachment")
							.addEventListener("click", () => {
								selectedUnsplashImage = null;
								previewEl.remove();
								updateCharacterCount();
							});

						attachmentPreview.appendChild(previewEl);
						unsplashPicker.style.display = "none";
						unsplashSearchInput.value = "";
						updateCharacterCount();
					});

					unsplashResults.appendChild(imgEl);
				});
			} catch (error) {
				console.error("Unsplash search error:", error);
				unsplashResults.innerHTML = `
					<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
						<p>Failed to load images</p>
					</div>
				`;
			}
		};

		unsplashSearchInput.addEventListener("input", (e) => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				searchUnsplash(e.target.value);
			}, 500);
		});
	}

	if (emojiBtn) {
		emojiBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			const rect = emojiBtn.getBoundingClientRect();
			await showEmojiPickerPopup(
				(emoji) => {
					if (!emoji) return;
					const start = textarea.selectionStart;
					const end = textarea.selectionEnd;
					const text = textarea.value;
					textarea.value =
						text.substring(0, start) + emoji + text.substring(end);
					const newPos = start + emoji.length;
					textarea.selectionStart = textarea.selectionEnd = newPos;
					textarea.focus();
					updateCharacterCount();
				},
				{
					x: rect.left,
					y: rect.bottom + 8,
				},
			);
		});
	}

	const vibeBtn = element.querySelector("#vibe-btn");
	if (vibeBtn) {
		vibeBtn.style.display = "none";
		vibeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			showVibeModal();
		});
	}

	const checkForHMention = () => {
		if (!vibeBtn) return;
		const text = textarea.value;
		const hasHMention = /@h\b/i.test(text);
		vibeBtn.style.display = hasHMention ? "block" : "none";
	};

	textarea.addEventListener("input", () => {
		checkForHMention();
	});

	checkForHMention();

	if (scheduleBtn && scheduleModal && scheduleModalClose) {
		if (replyTo) {
			scheduleBtn.style.display = "none";
		} else {
			scheduleBtn.addEventListener("click", () => {
				scheduleModal.style.display = "flex";
				const now = new Date();
				now.setMinutes(now.getMinutes() + 5);
				const dateStr = now.toISOString().split("T")[0];
				const timeStr = now.toTimeString().slice(0, 5);
				scheduleDateInput.value = dateStr;
				scheduleTimeInput.value = timeStr;
			});
		}

		scheduleModalClose.addEventListener("click", () => {
			scheduleModal.style.display = "none";
		});

		confirmScheduleBtn.addEventListener("click", () => {
			const date = scheduleDateInput.value;
			const time = scheduleTimeInput.value;
			if (date && time) {
				scheduledFor = new Date(`${date}T${time}`);
				scheduleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
				scheduleBtn.style.color = "var(--primary)";
				scheduleBtn.title = `Scheduled for ${scheduledFor.toLocaleString()}`;
				scheduleModal.style.display = "none";
			}
		});

		clearScheduleBtn.addEventListener("click", () => {
			scheduledFor = null;
			scheduleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
			scheduleBtn.style.color = "";
			scheduleBtn.title = "Schedule tweet";
			scheduleModal.style.display = "none";
		});

		scheduleModal.addEventListener("click", (e) => {
			if (e.target === scheduleModal) {
				scheduleModal.style.display = "none";
			}
		});
	}

	addPollOptionBtn.addEventListener("click", () => addPollOption());

	if (replyTo) {
		replyRestrictionSelect.style.display = "none";
	}

	replyRestrictionSelect.addEventListener("change", () => {
		replyRestriction = replyRestrictionSelect.value;
	});

	let communityOnly = false;

	if (communityId) {
		const communityOnlyContainer = document.createElement("div");
		communityOnlyContainer.className = "community-only-container";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = "community-only-checkbox";
		checkbox.className = "community-only-checkbox";
		checkbox.addEventListener("change", (e) => {
			communityOnly = e.target.checked;
		});

		const label = document.createElement("label");
		label.htmlFor = "community-only-checkbox";
		label.textContent = "Only show in this community (hide from main timeline)";
		label.className = "community-only-label";

		communityOnlyContainer.appendChild(checkbox);
		communityOnlyContainer.appendChild(label);

		const composeInput = element.querySelector(".compose-input");
		composeInput.appendChild(communityOnlyContainer);
	}

	if (communitySelector) {
		const communitySelectorBtn = element.querySelector(
			"#community-selector-btn",
		);
		const communitySelectorDropdown = element.querySelector(
			"#community-selector-dropdown",
		);

		if (communitySelectorBtn && communitySelectorDropdown) {
			communitySelectorBtn.addEventListener("click", async () => {
				const isVisible = communitySelectorDropdown.style.display !== "none";
				if (isVisible) {
					communitySelectorDropdown.style.display = "none";
					return;
				}

				communitySelectorDropdown.innerHTML =
					'<div style="padding: 12px; color: var(--text-secondary);">Loading...</div>';
				communitySelectorDropdown.style.display = "block";

				try {
					const user = await getUser();
					const result = await query(
						`/users/${user.userId}/communities?limit=50`,
					);

					if (result.error) {
						communitySelectorDropdown.innerHTML = `<div style="padding: 12px; color: var(--error-color); font-size: 14px;">Error: ${result.error}</div>`;
						console.error("Communities API error:", result.error);
						return;
					}

					const communities = result.communities || [];

					if (communities.length === 0) {
						communitySelectorDropdown.innerHTML =
							'<div style="padding: 12px; color: var(--text-secondary); font-size: 14px;">No communities joined yet</div>';
						return;
					}

					communitySelectorDropdown.innerHTML = `
            <div style="padding: 8px; border-bottom: 1px solid var(--border-primary);">
              <div class="community-option" data-community-id="" style="padding: 8px; cursor: pointer; border-radius: 6px; font-size: 14px; color: var(--text-primary); font-weight: 500;">
                <strong>Everyone</strong>
              </div>
            </div>
            ${communities
							.map(
								(c) => `
              <div class="community-option" data-community-id="${
								c.id
							}" style="padding: 8px; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
                ${
									c.icon
										? `<img src="/public/shared/assets/uploads/${c.icon}" style="width: 24px; height: 24px; border-radius: 6px; object-fit: cover;" />`
										: `<div style="width: 24px; height: 24px; border-radius: 6px; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">${c.name[0].toUpperCase()}</div>`
								}
                <span style="font-size: 14px; color: var(--text-primary);">${c.name
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;")}</span>
              </div>
            `,
							)
							.join("")}
          `;

					communitySelectorDropdown
						.querySelectorAll(".community-option")
						.forEach((option) => {
							option.addEventListener("mouseenter", () => {
								option.style.background = "var(--bg-secondary)";
							});
							option.addEventListener("mouseleave", () => {
								option.style.background = "transparent";
							});
							option.addEventListener("click", () => {
								const communityId = option.dataset.communityId;
								communitySelector.selectedCommunityId = communityId || null;

								const communityName = communityId
									? communities.find((c) => c.id === communityId)?.name
									: "Everyone";
								communitySelectorBtn.title = communityId
									? `Posting to ${communityName}`
									: "Select community";

								if (communityId) {
									communitySelectorBtn.style.color = "var(--primary)";
								} else {
									communitySelectorBtn.style.color = "";
								}

								communitySelectorDropdown.style.display = "none";
							});
						});
				} catch (error) {
					communitySelectorDropdown.innerHTML = `<div style="padding: 12px; color: var(--error-color); font-size: 14px;">Failed to load: ${error.message}</div>`;
				}
			});

			document.addEventListener("click", (e) => {
				if (
					!communitySelectorBtn.contains(e.target) &&
					!communitySelectorDropdown.contains(e.target)
				) {
					communitySelectorDropdown.style.display = "none";
				}
			});
		}
	}

	if (cardToggleBtn && cardModal && cardModalClose) {
		const addCardOption = () => {
			const optionsContainer = element.querySelector("#card-options-container");
			const optionCount =
				optionsContainer.querySelectorAll(".card-option").length;
			if (optionCount >= 4) return;

			const optionDiv = document.createElement("div");
			optionDiv.className = "card-option";
			optionDiv.style.cssText =
				"margin-bottom: 12px; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary);";
			optionDiv.innerHTML = `
        <input type="text" placeholder="Post #${
					optionCount + 1
				}" maxlength="100" style="width: 100%; padding: 8px; margin-bottom: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);" class="card-option-description" />
        <textarea placeholder="Tweet text when clicked..." maxlength="280" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); min-height: 60px; resize: vertical;" class="card-option-tweet"></textarea>
        ${
					optionCount >= 2
						? '<button type="button" class="remove-card-option" style="margin-top: 8px; padding: 6px 12px; border: none; border-radius: 6px; background: var(--error-color); color: white; cursor: pointer;">Remove</button>'
						: ""
				}
      `;

			if (optionCount >= 2) {
				optionDiv
					.querySelector(".remove-card-option")
					.addEventListener("click", () => {
						optionDiv.remove();
					});
			}

			optionsContainer.appendChild(optionDiv);
		};

		if (cardOnly) {
			cardToggleBtn.style.display = "block";
			cardModal.style.display = "flex";
			const optionsContainer = element.querySelector("#card-options-container");
			if (optionsContainer.querySelectorAll(".card-option").length === 0) {
				addCardOption();
				addCardOption();
			}
		}

		cardToggleBtn.addEventListener("click", () => {
			cardModal.style.display = "flex";
			const optionsContainer = element.querySelector("#card-options-container");
			if (optionsContainer.querySelectorAll(".card-option").length === 0) {
				addCardOption();
				addCardOption();
			}
		});

		cardModalClose.addEventListener("click", () => {
			cardModal.style.display = "none";
		});

		cardModal.addEventListener("click", (e) => {
			if (e.target === cardModal) {
				cardModal.style.display = "none";
			}
		});

		const addCardOptionBtn = element.querySelector("#add-card-option");
		if (addCardOptionBtn) {
			addCardOptionBtn.addEventListener("click", addCardOption);
		}

		if (cardMediaUploadBtn && cardMediaInput) {
			cardMediaUploadBtn.addEventListener("click", () => {
				cardMediaInput.click();
			});

			cardMediaInput.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (!file) return;

				const formData = new FormData();
				formData.append("file", file);

				try {
					const result = await query("/upload", {
						method: "POST",
						body: formData,
					});

					if (result.success) {
						const preview = element.querySelector("#card-media-preview");
						const mediaType = file.type.startsWith("image/")
							? "image"
							: file.type === "video/mp4"
								? "video"
								: "gif";

						preview.innerHTML = `
              <div style="position: relative; border-radius: 8px; overflow: hidden;">
                ${
									mediaType === "image"
										? `<img src="${result.file.url}" style="width: 100%; border-radius: 8px;" />`
										: `<video src="${result.file.url}" controls style="width: 100%; border-radius: 8px;"></video>`
								}
                <button type="button" id="remove-card-media" style="position: absolute; top: 8px; right: 8px; padding: 6px 12px; border: none; border-radius: 6px; background: rgba(0,0,0,0.7); color: white; cursor: pointer;">Remove</button>
              </div>
            `;

						preview
							.querySelector("#remove-card-media")
							.addEventListener("click", () => {
								preview.innerHTML = "";
								cardMediaInput.value = "";
								interactiveCard = null;
							});

						if (!interactiveCard) {
							interactiveCard = {};
						}
						interactiveCard.media_url = result.file.url;
						interactiveCard.media_type = mediaType;
					} else {
						toastQueue.add(`<h1>Upload failed</h1><p>${result.error}</p>`);
					}
				} catch (error) {
					console.error("Media upload error:", error);
					toastQueue.add(`<h1>Upload failed</h1>`);
				}
			});
		}

		if (confirmCardBtn) {
			confirmCardBtn.addEventListener("click", () => {
				const optionsContainer = element.querySelector(
					"#card-options-container",
				);
				const optionElements =
					optionsContainer.querySelectorAll(".card-option");

				if (!interactiveCard || !interactiveCard.media_url) {
					toastQueue.add(`<h1>Please upload media for the card</h1>`);
					return;
				}

				if (optionElements.length < 2) {
					toastQueue.add(`<h1>Card must have at least 2 options</h1>`);
					return;
				}

				const options = [];
				for (const optionEl of optionElements) {
					const description = optionEl
						.querySelector(".card-option-description")
						.value.trim();
					const tweetText = optionEl
						.querySelector(".card-option-tweet")
						.value.trim();

					if (!description || !tweetText) {
						toastQueue.add(
							`<h1>All options must have description and tweet text</h1>`,
						);
						return;
					}

					options.push({ description, tweet_text: tweetText });
				}

				interactiveCard.options = options;
				cardModal.style.display = "none";
				cardToggleBtn.style.color = "var(--primary)";
				cardToggleBtn.title = "Edit interactive card";
				updateCharacterCount();
			});
		}

		if (clearCardBtn) {
			clearCardBtn.addEventListener("click", () => {
				interactiveCard = null;
				cardModal.style.display = "none";
				cardToggleBtn.style.color = "";
				cardToggleBtn.title = "Create interactive card";
				element.querySelector("#card-media-preview").innerHTML = "";
				element.querySelector("#card-media-input").value = "";
				element
					.querySelector("#card-options-container")
					.querySelectorAll(".card-option")
					.forEach((el) => {
						el.remove();
					});
				updateCharacterCount();
			});
		}
	}

	tweetButton.addEventListener("click", async () => {
		const content = textarea.value.trim();
		const hasExtras =
			(pendingFiles && pendingFiles.length > 0) ||
			!!selectedGif ||
			!!selectedUnsplashImage ||
			pollEnabled ||
			!!interactiveCard ||
			!!article;

		if ((content.length === 0 && !hasExtras) || content.length > maxChars) {
			toastQueue.add(
				`<h1>Invalid tweet</h1><p>Make sure your tweet is 1 to ${maxChars} characters long.</p>`,
			);
			return;
		}

		let poll = null;
		if (pollEnabled && pollContainer && pollDuration) {
			const pollOptions = Array.from(
				pollContainer.querySelectorAll(".poll-option input"),
			)
				.map((input) => input.value.trim())
				.filter((value) => value.length > 0);

			if (pollOptions.length < 2) {
				toastQueue.add(
					`<h1>Invalid poll</h1><p>Please provide at least 2 poll options.</p>`,
				);
				return;
			}

			poll = {
				options: pollOptions,
				duration: parseInt(pollDuration.value, 10),
			};
		}

		tweetButton.disabled = true;

		try {
			const uploadedFiles = [];
			for (const fileData of pendingFiles) {
				const formData = new FormData();
				formData.append("file", fileData.file);

				const uploadResult = await query("/upload", {
					method: "POST",
					body: formData,
				});

				if (uploadResult.success) {
					uploadedFiles.push(uploadResult.file);
				} else {
					toastQueue.add(`<h1>Upload failed</h1><p>${uploadResult.error}</p>`);
					return;
				}
			}

			if (scheduledFor) {
				const requestBody = {
					content,
					scheduled_for: scheduledFor.toISOString(),
					files: uploadedFiles,
					reply_restriction: replyRestriction,
				};

				const spoilerFlags = [];
				document
					.querySelectorAll(".attachment-preview-item")
					.forEach((el, index) => {
						if (el.dataset.isSpoiler === "true") {
							spoilerFlags.push(index);
						}
					});
				if (spoilerFlags.length > 0) {
					requestBody.spoiler_flags = spoilerFlags;
				}

				if (selectedGif) {
					requestBody.gif_url = selectedGif;
				}

				if (selectedUnsplashImage) {
					requestBody.unsplash = selectedUnsplashImage;
				}

				if (poll) {
					requestBody.poll = poll;
				}

				const { error, scheduledPost } = await query("/scheduled/", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(requestBody),
				});

				if (!scheduledPost) {
					toastQueue.add(`<h1>${error || "Failed to schedule tweet"}</h1>`);
					return;
				}

				textarea.value = "";
				charCount.textContent = "0";
				tweetButton.disabled = true;
				textarea.style.height = "25px";

				pendingFiles = [];
				selectedGif = null;
				scheduledFor = null;
				attachmentPreview.innerHTML = "";

				if (scheduleBtn) {
					scheduleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
					scheduleBtn.style.color = "";
					scheduleBtn.title = "Schedule tweet";
				}

				if (pollEnabled && pollContainer) {
					pollContainer.querySelectorAll(".poll-option").forEach((option) => {
						option.remove();
					});
					togglePoll();
				}

				toastQueue.add(
					`<h1>Tweet Scheduled!</h1><p>Your tweet will be posted at ${new Date(
						scheduledPost.scheduled_for,
					).toLocaleString()}</p>`,
				);

				return;
			}

			const requestBody = {
				content,
				reply_to: replyTo,
				quote_tweet_id: quoteTweet?.id || null,
				source: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
					? "mobile_web"
					: "desktop_web",
				files: uploadedFiles,
				reply_restriction: replyRestriction,
				article_id: article?.id || null,
				community_id: communitySelector?.selectedCommunityId || communityId,
				community_only: communityOnly,
			};

			if (content.match(/@h\b/i) && selectedVibe !== "normal") {
				requestBody.ai_vibe = selectedVibe;
			}

			const spoilerFlags = [];
			document
				.querySelectorAll(".attachment-preview-item")
				.forEach((el, index) => {
					if (el.dataset.isSpoiler === "true") {
						spoilerFlags.push(index);
					}
				});
			if (spoilerFlags.length > 0) {
				requestBody.spoiler_flags = spoilerFlags;
			}

			if (selectedGif) {
				requestBody.gif_url = selectedGif;
			}

			if (selectedUnsplashImage) {
				requestBody.unsplash = selectedUnsplashImage;
			}

			if (poll) {
				requestBody.poll = poll;
			}

			if (interactiveCard) {
				requestBody.interactive_card = interactiveCard;
			}

			const { error, tweet } = await query("/tweets/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			if (!tweet) {
				toastQueue.add(`<h1>${error || "Failed to post tweet"}</h1>`);
				return;
			}

			textarea.value = "";
			tweetButton.disabled = true;
			charCount.textContent = "0";
			textarea.style.height = "25px";

			pendingFiles = [];
			selectedGif = null;
			attachmentPreview.innerHTML = "";
			interactiveCard = null;
			selectedVibe = "normal";
			updateVibeButton();
			if (cardToggleBtn) {
				cardToggleBtn.style.color = "";
			}

			if (pollEnabled && pollContainer) {
				pollContainer.querySelectorAll(".poll-option").forEach((option) => {
					option.remove();
				});
				togglePoll();
			}

			callback(tweet);
		} catch {
			toastQueue.add(`<h1>Network error. Please try again.</h1>`);
		} finally {
			tweetButton.disabled = false;
		}
	});

	textarea.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			if (!tweetButton.disabled) {
				tweetButton.click();
			}
		}
	});

	updateCharacterCount();
};

export const createComposer = async ({
	callback = () => {},
	placeholder = "What is happening?! Did a browser just go angry?!",
	replyTo = null,
	quoteTweet = null,
	communityId = null,
	autofocus = false,
	interactiveCard = null,
	cardOnly = false,
}) => {
	const el = document.createElement("div");
	el.classList.add("compose-tweet");
	el.innerHTML = `
        <div class="compose-header">
          <img src="" alt="Your avatar" id="compose-avatar">
          <div class="compose-input">
            <textarea id="tweet-textarea" style="overflow:hidden"${
							autofocus ? "autofocus" : ""
						}></textarea>
            <div id="quoted-tweet-container"></div>
            <div id="poll-container" style="display: none;">
              <div class="poll-options"></div>
              <button type="button" id="add-poll-option">Add another option</button>
              <div class="poll-settings">
                <label for="poll-duration">Poll duration:</label>
                <select id="poll-duration">
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="360">6 hours</option>
                  <option value="720">12 hours</option>
                  <option value="1440" selected>1 day</option>
                  <option value="4320">3 days</option>
                  <option value="10080">7 days</option>
                </select>
              </div>
            </div>
                  <select id="reply-restriction-select">
                    <option value="everyone">Everyone can reply</option>
                    <option value="following">People you follow</option>
                    <option value="followers">Your followers</option>
                    <option value="verified">Verified accounts</option>
                  </select>
            <div class="compose-footer">
              <div class="compose-actions">
                <button type="button" id="file-upload-btn">
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true"><path d="M9.38759 8.53403C10.0712 8.43795 10.7036 8.91485 10.7997 9.59849C10.8956 10.2819 10.4195 10.9133 9.73622 11.0096C9.05259 11.1057 8.4202 10.6298 8.32411 9.94614C8.22804 9.26258 8.70407 8.63022 9.38759 8.53403Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M10.3886 5.58677C10.8476 5.5681 11.2608 5.5975 11.6581 5.74204L11.8895 5.83677C12.4185 6.07813 12.8721 6.46152 13.1991 6.94614L13.2831 7.07993C13.4673 7.39617 13.5758 7.74677 13.6571 8.14048C13.7484 8.58274 13.8154 9.13563 13.8993 9.81919L14.245 12.6317L14.3554 13.5624C14.3852 13.8423 14.4067 14.0936 14.4159 14.3192C14.4322 14.7209 14.4118 15.0879 14.3095 15.4393L14.2606 15.5887C14.0606 16.138 13.7126 16.6202 13.2577 16.9823L13.0565 17.1297C12.7061 17.366 12.312 17.4948 11.8622 17.5877C11.6411 17.6334 11.3919 17.673 11.1132 17.7118L10.1835 17.8299L7.37098 18.1756C6.68748 18.2596 6.13466 18.3282 5.68348 18.3465C5.28176 18.3628 4.9148 18.3424 4.56337 18.2401L4.41395 18.1913C3.86454 17.9912 3.38258 17.6432 3.0204 17.1883L2.87294 16.9872C2.63655 16.6367 2.50788 16.2427 2.41493 15.7928C2.36926 15.5717 2.32964 15.3226 2.29091 15.0438L2.17274 14.1141L1.82704 11.3016C1.74311 10.6181 1.67455 10.0653 1.65614 9.61411C1.63747 9.15518 1.66697 8.74175 1.81141 8.34458L1.90614 8.11313C2.14741 7.58441 2.53115 7.13051 3.01552 6.80356L3.1493 6.71958C3.46543 6.53545 3.8163 6.42688 4.20985 6.34556C4.65206 6.25423 5.20506 6.18729 5.88856 6.10337L8.70106 5.75767L9.63173 5.64731C9.91161 5.61744 10.163 5.59597 10.3886 5.58677ZM6.75673 13.0594C6.39143 12.978 6.00943 13.0106 5.66298 13.1522C5.5038 13.2173 5.32863 13.3345 5.06923 13.5829C4.80403 13.8368 4.49151 14.1871 4.04091 14.6932L3.64833 15.1327C3.67072 15.2763 3.69325 15.4061 3.71766 15.5243C3.79389 15.893 3.87637 16.0961 3.97548 16.243L4.06141 16.3602C4.27134 16.6237 4.5507 16.8253 4.86903 16.9413L5.00477 16.9813C5.1536 17.0148 5.34659 17.0289 5.6288 17.0174C6.01317 17.0018 6.50346 16.9419 7.20888 16.8553L10.0214 16.5106L10.9306 16.3944C11.0173 16.3824 11.0997 16.3693 11.1776 16.3573L8.61513 14.3065C8.08582 13.8831 7.71807 13.5905 7.41395 13.3846C7.19112 13.2338 7.02727 13.1469 6.88856 13.0975L6.75673 13.0594ZM10.4432 6.91587C10.2511 6.9237 10.0319 6.94288 9.77333 6.97056L8.86317 7.07798L6.05067 7.42271C5.34527 7.50932 4.85514 7.57047 4.47841 7.64829C4.20174 7.70549 4.01803 7.76626 3.88173 7.83481L3.75966 7.9061C3.47871 8.09575 3.25597 8.35913 3.1161 8.66587L3.06141 8.79966C3.00092 8.96619 2.96997 9.18338 2.98524 9.55942C3.00091 9.94382 3.06074 10.4341 3.14735 11.1395L3.42274 13.3895L3.64442 13.1434C3.82631 12.9454 3.99306 12.7715 4.1493 12.6219C4.46768 12.3171 4.78299 12.0748 5.16005 11.9208L5.38661 11.8377C5.92148 11.6655 6.49448 11.6387 7.04579 11.7616L7.19325 11.7987C7.53151 11.897 7.8399 12.067 8.15907 12.2831C8.51737 12.5256 8.9325 12.8582 9.4452 13.2684L12.5966 15.7889C12.7786 15.6032 12.9206 15.3806 13.0106 15.1336L13.0507 14.9979C13.0842 14.8491 13.0982 14.6561 13.0868 14.3739C13.079 14.1817 13.0598 13.9625 13.0321 13.704L12.9247 12.7938L12.58 9.9813C12.4933 9.27584 12.4322 8.78581 12.3544 8.40903C12.2972 8.13219 12.2364 7.94873 12.1679 7.81235L12.0966 7.69028C11.9069 7.40908 11.6437 7.18669 11.3368 7.04673L11.203 6.99204C11.0364 6.93147 10.8195 6.90059 10.4432 6.91587Z"></path><path d="M9.72841 1.5897C10.1797 1.60809 10.7322 1.67665 11.4159 1.7606L14.2284 2.1063L15.1581 2.22446C15.4371 2.26322 15.6859 2.3028 15.9071 2.34849C16.3571 2.44144 16.7509 2.57006 17.1015 2.80649L17.3026 2.95396C17.7576 3.31618 18.1055 3.79802 18.3056 4.34751L18.3544 4.49692C18.4567 4.84845 18.4772 5.21519 18.4608 5.61704C18.4516 5.84273 18.4292 6.09381 18.3993 6.37388L18.2899 7.30454L17.9442 10.117C17.8603 10.8007 17.7934 11.3535 17.702 11.7958C17.6207 12.1895 17.5122 12.5401 17.328 12.8563L17.244 12.9901C17.0958 13.2098 16.921 13.4086 16.7255 13.5829L16.6171 13.662C16.3496 13.8174 16.0009 13.769 15.787 13.5292C15.5427 13.255 15.5666 12.834 15.8407 12.5897L16.0018 12.4276C16.0519 12.3703 16.0986 12.3095 16.1415 12.2459L16.2128 12.1239C16.2813 11.9875 16.3421 11.8041 16.3993 11.5272C16.4771 11.1504 16.5383 10.6605 16.6249 9.95493L16.9696 7.14243L17.077 6.23228C17.1047 5.97357 17.1239 5.7546 17.1317 5.56235C17.1432 5.27997 17.1291 5.08722 17.0956 4.93833L17.0556 4.80259C16.9396 4.4842 16.7381 4.20493 16.4745 3.99497L16.3573 3.90903C16.2103 3.80991 16.0075 3.72745 15.6386 3.65122C15.4502 3.61231 15.2331 3.57756 14.9755 3.54185L14.0663 3.42563L11.2538 3.08091C10.5481 2.99426 10.0582 2.93444 9.67372 2.9188C9.39129 2.90732 9.19861 2.92142 9.0497 2.95493L8.91395 2.99497C8.59536 3.11093 8.31538 3.31224 8.10536 3.57603L8.0204 3.69321C7.95293 3.79324 7.89287 3.91951 7.83778 4.10532L7.787 4.23032C7.64153 4.50308 7.31955 4.64552 7.01161 4.55454C6.65948 4.45019 6.45804 4.07952 6.56239 3.72739L6.63075 3.52036C6.70469 3.31761 6.79738 3.12769 6.91786 2.94907L7.06532 2.7479C7.42756 2.29294 7.90937 1.94497 8.45888 1.74497L8.60829 1.69614C8.95981 1.59385 9.32655 1.57335 9.72841 1.5897Z"></path></svg>
                </button>
                <input type="file" id="file-input" multiple accept="image/png,image/webp,image/avif,image/jpeg,image/jpg,image/gif,video/mp4" style="display: none;" title="Images: max 10MB, Videos: max 100MB (auto-compressed if needed)">
                <button type="button" id="gif-btn" title="Add GIF">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M144,72V184a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm88-8H176a8,8,0,0,0-8,8V184a8,8,0,0,0,16,0V136h40a8,8,0,0,0,0-16H184V80h48a8,8,0,0,0,0-16ZM96,120H72a8,8,0,0,0,0,16H88v16a24,24,0,0,1-48,0V104A24,24,0,0,1,64,80c11.19,0,21.61,7.74,24.25,18a8,8,0,0,0,15.5-4C99.27,76.62,82.56,64,64,64a40,40,0,0,0-40,40v48a40,40,0,0,0,80,0V128A8,8,0,0,0,96,120Z"></path></svg>
                </button>
                <button type="button" id="unsplash-btn" title="Add Photo from Unsplash">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <button type="button" id="emoji-btn" title="Add emoji">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>
                </button>
                <button type="button" id="poll-toggle"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-bar-big-icon lucide-chart-bar-big"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><rect x="7" y="13" width="9" height="4" rx="1"></rect><rect x="7" y="5" width="12" height="4" rx="1"></rect></svg></button>
                <button type="button" id="card-toggle" title="Create interactive card" style="display: none;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                    <path d="M7 7h10"/>
                    <path d="M7 12h10"/>
                    <path d="M7 17h10"/>
                  </svg>
                </button>
                <button type="button" id="schedule-btn" title="Schedule tweet">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </button>
                <button type="button" id="vibe-btn" class="vibe-selector-btn" title="Choose @h's vibe">
                  🤖 Normal vibe
                </button>
              </div>
              <div class="compose-submit">
                <div class="character-counter">
                  <span id="char-count">0</span>/400
                </div>
                <button id="tweet-button" disabled="">Tweet</button>
              </div>
            </div>
            <div id="attachment-preview"></div>
            <div id="gif-picker" style="display: none;">
              <div class="gif-picker-header">
                <input type="text" id="gif-search-input" placeholder="Search Tenor…" />
                <button type="button" id="gif-picker-close">×</button>
              </div>
              <div id="gif-results"></div>
            </div>
            <div id="unsplash-picker" style="display: none;">
              <div class="unsplash-picker-header">
                <input type="text" id="unsplash-search-input" placeholder="Search Unsplash…" />
                <button type="button" id="unsplash-picker-close">×</button>
              </div>
              <div id="unsplash-results"></div>
            </div>
            <div id="schedule-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
              <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                  <h3 style="margin: 0; font-size: 20px;">Schedule Tweet</h3>
                  <button type="button" id="schedule-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                  <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Date</label>
                    <input type="date" id="schedule-date" style="width: 100%; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);" />
                  </div>
                  <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Time</label>
                    <input type="time" id="schedule-time" style="width: 100%; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);" />
                  </div>
                  <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <button type="button" id="clear-schedule-btn" style="flex: 1; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-weight: 500;">Clear</button>
                    <button type="button" id="confirm-schedule-btn" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: var(--primary); color: white; cursor: pointer; font-weight: 500;">Schedule</button>
                  </div>
                </div>
              </div>
            </div>
            <div id="card-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
              <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                  <h3 style="margin: 0; font-size: 20px;">Create Interactive Card</h3>
                  <button type="button" id="card-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                  <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Card Media (Image, Video, or GIF)</label>
                    <button type="button" id="card-media-upload-btn" style="width: 100%; padding: 12px; border: 2px dashed var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;">Upload Media</button>
                    <input type="file" id="card-media-input" accept="image/*,video/mp4" style="display: none;" />
                    <div id="card-media-preview" style="margin-top: 12px;"></div>
                  </div>
                  <div id="card-options-container">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Options (2-4)</label>
                  </div>
                  <button type="button" id="add-card-option" style="width: 100%; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;">+ Add Option</button>
                  <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <button type="button" id="clear-card-btn" style="flex: 1; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-weight: 500;">Clear</button>
                    <button type="button" id="confirm-card-btn" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: var(--primary); color: white; cursor: pointer; font-weight: 500;">Save Card</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
	el.querySelector("#tweet-textarea").placeholder = placeholder;

	if (quoteTweet) {
		const { createTweetElement } = await import("./tweets.js");
		const quotedTweetEl = createTweetElement(quoteTweet, {
			clickToOpen: false,
			showTopReply: false,
			isTopReply: false,
			size: "preview",
		});
		el.querySelector("#quoted-tweet-container").appendChild(quotedTweetEl);
	}

	try {
		const user = await getUser();
		const avatarImg = el.querySelector(".compose-header img");
		avatarImg.src = user?.avatar || "/public/shared/assets/default-avatar.svg";

		const radius = user?.avatar_radius ?? (user?.gold ? 4 : 50);
		avatarImg.style.borderRadius = `${radius}%`;
	} catch (error) {
		console.error("Error loading user avatar:", error);
		const avatarImg = el.querySelector(".compose-header img");
		avatarImg.src = "/public/shared/assets/default-avatar.svg";
		avatarImg.style.borderRadius = "50%";
	}

	try {
		const user = await getUser();

		if (user?.restricted) {
			el.style.display = "none";
			return el;
		}

		const maxChars =
			user?.character_limit !== null && user?.character_limit !== undefined
				? user.character_limit
				: user?.gold
					? 16500
					: user?.verified
						? 5500
						: 400;

		const counter = el.querySelector(".character-counter");
		if (counter) {
			counter.innerHTML = `<span id="char-count">0</span>/${maxChars}`;
		}

		if (maxChars > 999999) {
			counter.style.display = "none";
		}

		const textareaEl = el.querySelector("#tweet-textarea");
		if (textareaEl) textareaEl.setAttribute("maxlength", String(maxChars));

		const cardToggleBtn = el.querySelector("#card-toggle");
		if (cardToggleBtn && cardOnly) {
			cardToggleBtn.style.display = "block";
		}

		const communitySelector = communityId
			? null
			: { selectedCommunityId: null };
		useComposer(el, callback, {
			replyTo,
			quoteTweet,
			maxChars,
			communityId,
			communitySelector,
			interactiveCard,
			cardOnly,
		});
	} catch {
		const communitySelector = communityId
			? null
			: { selectedCommunityId: null };
		useComposer(el, callback, {
			replyTo,
			quoteTweet,
			communityId,
			communitySelector,
			interactiveCard,
			cardOnly,
		});
	}

	return el;
};
