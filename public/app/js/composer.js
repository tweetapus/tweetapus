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
	const mediaMenuBtn = element.querySelector("#media-menu-btn");
	const attachmentPreview = element.querySelector("#attachment-preview");
	const gifPicker = element.querySelector("#gif-picker");
	const gifSearchInput = element.querySelector("#gif-search-input");
	const gifResults = element.querySelector("#gif-results");
	const gifPickerClose = element.querySelector("#gif-picker-close");
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
	const selectedUnsplashImages = [];
	let emojiKitchenUrl = null;
	let scheduledFor = null;

	const CIRCLE_CIRCUMFERENCE = 87.96;

	const updateCharacterCount = () => {
		if (!textarea || !charCount || !tweetButton) return;
		const length = textarea.value.length;
		const counter = charCount.closest(".character-counter");
		const progressCircle = counter?.querySelector(".counter-progress");

		const ratio = Math.min(length / maxChars, 1);
		const offset = CIRCLE_CIRCUMFERENCE * (1 - ratio);

		if (progressCircle) {
			progressCircle.style.strokeDashoffset = offset;
		}

		if (length > maxChars) {
			counter.id = "over-limit";
			counter.classList.remove("warning");
			charCount.textContent = maxChars - length;
			tweetButton.disabled = true;
		} else if (length >= maxChars - 20) {
			counter.id = "";
			counter.classList.add("warning");
			charCount.textContent = maxChars - length;
			tweetButton.disabled = false;
			const hasExtras =
				(pendingFiles && pendingFiles.length > 0) ||
				!!selectedGif ||
				selectedUnsplashImages.length > 0 ||
				!!emojiKitchenUrl ||
				pollEnabled ||
				!!interactiveCard ||
				!!article;
			tweetButton.disabled = !hasExtras && length === 0;
		} else {
			counter.id = "";
			counter.classList.remove("warning");
			charCount.textContent = "";
			const hasExtras =
				(pendingFiles && pendingFiles.length > 0) ||
				!!selectedGif ||
				selectedUnsplashImages.length > 0 ||
				!!emojiKitchenUrl ||
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
		addPollOptionBtn.style.display = optionCount >= 8 ? "none" : "block";
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

	if (cardOnly) {
		if (mediaMenuBtn) mediaMenuBtn.style.display = "none";
		if (pollToggle) pollToggle.style.display = "none";
	}

	textarea.addEventListener("input", () => {
		updateCharacterCount();

		textarea.style.height = "0px";
		void textarea.offsetHeight;
		if (textarea.scrollHeight === 54) {
			textarea.style.height = `45px`;
		} else {
			textarea.style.height = `${Math.max(textarea.scrollHeight, 25)}px`;
		}

		if (textarea.scrollHeight < 250) {
			textarea.style.overflow = "hidden";
		} else {
			textarea.style.overflow = "auto";
		}
	});

	const beforeUnloadHandler = (e) => {
		const hasContent =
			textarea.value.trim().length > 0 ||
			pendingFiles.length > 0 ||
			selectedGif ||
			selectedUnsplashImages.length > 0 ||
			emojiKitchenUrl;

		if (hasContent) {
			e.preventDefault();
			e.returnValue = "";
			return "";
		}
	};

	window.addEventListener("beforeunload", beforeUnloadHandler);

	const cleanupBeforeUnload = () => {
		window.removeEventListener("beforeunload", beforeUnloadHandler);
	};

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

	const processFileForUpload = async (file, skipWebP = false) => {
		try {
			const processedFile = skipWebP ? file : await convertToWebP(file);

			const allowedTypes = ["image/webp", "image/png", "video/mp4"];

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

		if (fileData.isEmojiKitchen) {
			previewEl.classList.add("emoji-kitchen-preview");
		}

		if (fileData.type.startsWith("image/")) {
			const objectUrl = URL.createObjectURL(fileData.file);
			previewEl.innerHTML = `
				<img src="${objectUrl}" alt="${fileData.name}" />
				${!fileData.isEmojiKitchen ? '<button type="button" class="toggle-spoiler" title="Mark as spoiler">🚫</button>' : ""}
				<button type="button" class="remove-attachment">×</button>
			`;

			if (!fileData.isEmojiKitchen) {
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
			}
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

	if (mediaMenuBtn && fileInput) {
		mediaMenuBtn.addEventListener("click", async (e) => {
			e.stopPropagation();

			const { createPopup } = await import("../../shared/ui-utils.js");

			const menuItems = [
				{
					title: "Upload from device",
					icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
					onClick: () => {
						if (cardOnly) {
							toastQueue.add(
								`<h1>Media upload not available</h1><p>Images and videos cannot be uploaded in card composer mode</p>`,
							);
							return;
						}
						if (selectedGif || selectedUnsplashImages.length > 0) {
							toastQueue.add(
								`<h1>Cannot add files</h1><p>Remove the GIF or Photo first to upload files</p>`,
							);
							return;
						}
						fileInput.click();
					},
				},
				{
					title: "Search GIFs",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M144,72V184a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm88-8H176a8,8,0,0,0-8,8V184a8,8,0,0,0,16,0V136h40a8,8,0,0,0,0-16H184V80h48a8,8,0,0,0,0-16ZM96,120H72a8,8,0,0,0,0,16H88v16a24,24,0,0,1-48,0V104A24,24,0,0,1,64,80c11.19,0,21.61,7.74,24.25,18a8,8,0,0,0,15.5-4C99.27,76.62,82.56,64,64,64a40,40,0,0,0-40,40v48a40,40,0,0,0,80,0V128A8,8,0,0,0,96,120Z"></path></svg>`,
					onClick: () => {
						if (cardOnly) {
							toastQueue.add(
								`<h1>GIFs not available</h1><p>GIFs cannot be used in card composer mode</p>`,
							);
							return;
						}
						if (pendingFiles.length > 0 || selectedUnsplashImages.length > 0) {
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
					},
				},
				{
					title: "Search Unsplash",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
					onClick: () => {
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
								unsplashResults.innerHTML = "";
							}
						}
					},
				},
				{
					title: "Emoji Kitchen",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cat-icon lucide-cat"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/></svg>`,
					onClick: async () => {
						if (cardOnly) {
							toastQueue.add(
								`<h1>Emoji Kitchen not available</h1><p>Emoji Kitchen cannot be used in card composer mode</p>`,
							);
							return;
						}

						if (
							selectedGif ||
							selectedUnsplashImages.length > 0 ||
							pendingFiles.length > 0 ||
							emojiKitchenUrl
						) {
							toastQueue.add(
								`<h1>Cannot add Emoji Kitchen</h1><p>Remove other media first</p>`,
							);
							return;
						}

						let emoji1 = null;
						let emoji2 = null;

						const kitchenContent = document.createElement("div");
						kitchenContent.className = "emoji-kitchen-popover";

						const heading = document.createElement("div");
						heading.className = "emoji-kitchen-title";
						heading.textContent = "Emoji Kitchen";
						kitchenContent.appendChild(heading);

						const helper = document.createElement("p");
						helper.className = "emoji-kitchen-helper";
						helper.textContent = "Pick two emojis to combine";
						kitchenContent.appendChild(helper);

						const pickRow = document.createElement("div");
						pickRow.className = "emoji-kitchen-pick-row";

						const emoji1Btn = document.createElement("button");
						emoji1Btn.type = "button";
						emoji1Btn.className = "emoji-kitchen-picker";
						emoji1Btn.textContent = "?";

						const plus = document.createElement("span");
						plus.className = "emoji-kitchen-plus";
						plus.textContent = "+";

						const emoji2Btn = document.createElement("button");
						emoji2Btn.type = "button";
						emoji2Btn.className = "emoji-kitchen-picker";
						emoji2Btn.textContent = "?";

						pickRow.appendChild(emoji1Btn);
						pickRow.appendChild(plus);
						pickRow.appendChild(emoji2Btn);
						kitchenContent.appendChild(pickRow);

						const previewContainer = document.createElement("div");
						previewContainer.className = "emoji-kitchen-preview-container";
						previewContainer.style.display = "none";
						kitchenContent.appendChild(previewContainer);

						const createBtn = document.createElement("button");
						createBtn.type = "button";
						createBtn.className = "emoji-kitchen-create";
						createBtn.disabled = true;
						createBtn.textContent = "Create kitchen emoji";
						kitchenContent.appendChild(createBtn);

						const popupHandle = createPopup({
							items: [],
							triggerElement: mediaMenuBtn,
							customContent: kitchenContent,
							className: "emoji-kitchen-popup",
						});

						const updateCreateButton = async () => {
							const hasEmojis = emoji1 && emoji2;
							createBtn.disabled = !hasEmojis;

							if (hasEmojis) {
								try {
									const kitchenUrl = `https://emojik.vercel.app/s/${emoji1.replace(/\uFE0F/g, "")}_${emoji2.replace(/\uFE0F/g, "")}`;
									previewContainer.innerHTML = `<img src="${kitchenUrl}" alt="Preview" style="max-width: 150px; max-height: 150px; border-radius: 12px;" />`;
									previewContainer.style.display = "flex";
								} catch {
									previewContainer.style.display = "none";
								}
							} else {
								previewContainer.style.display = "none";
							}
						};

						emoji1Btn.addEventListener("click", async () => {
							const { showEmojiPickerPopup } = await import(
								"../../shared/emoji-picker.js"
							);
							const rect = emoji1Btn.getBoundingClientRect();
							showEmojiPickerPopup(
								(selectedEmoji) => {
									emoji1 = selectedEmoji;
									emoji1Btn.textContent = selectedEmoji;
									updateCreateButton();
								},
								{ x: rect.left, y: rect.bottom + 8 },
								true,
							);
						});

						emoji2Btn.addEventListener("click", async () => {
							const { showEmojiPickerPopup } = await import(
								"../../shared/emoji-picker.js"
							);
							const rect = emoji2Btn.getBoundingClientRect();
							showEmojiPickerPopup(
								(selectedEmoji) => {
									emoji2 = selectedEmoji;
									emoji2Btn.textContent = selectedEmoji;
									updateCreateButton();
								},
								{ x: rect.left, y: rect.bottom + 8 },
								true,
							);
						});

						createBtn.addEventListener("click", async () => {
							if (!emoji1 || !emoji2) return;

							createBtn.disabled = true;
							createBtn.textContent = "Creating...";

							try {
								const kitchenUrl = `https://emojik.vercel.app/s/${emoji1.replace(/\uFE0F/g, "")}_${emoji2.replace(/\uFE0F/g, "")}`;

								emojiKitchenUrl = kitchenUrl;

								const tempPreview = document.createElement("div");
								tempPreview.className =
									"attachment-preview-item emoji-kitchen-preview";
								tempPreview.dataset.kitchenUrl = kitchenUrl;
								tempPreview.innerHTML = `
									<img src="${kitchenUrl}" alt="Emoji Kitchen" />
									<button type="button" class="remove-attachment">×</button>
								`;

								tempPreview
									.querySelector(".remove-attachment")
									?.addEventListener("click", () => {
										emojiKitchenUrl = null;
										tempPreview.remove();
										updateCharacterCount();
									});

								attachmentPreview.appendChild(tempPreview);
								updateCharacterCount();

								if (popupHandle?.close) popupHandle.close();
							} catch (error) {
								console.error("Emoji kitchen error:", error);
								toastQueue.add(
									`<h1>Kitchen failed</h1><p>Please try again</p>`,
								);
								createBtn.disabled = false;
								createBtn.textContent = "Create Kitchen Emoji";
							}
						});
					},
				},
			];

			createPopup({
				items: menuItems,
				triggerElement: mediaMenuBtn,
			});
		});

		fileInput.addEventListener("change", async (e) => {
			if (cardOnly) {
				toastQueue.add(
					`<h1>Media upload not available</h1><p>Images and videos cannot be uploaded in card composer mode</p>`,
				);
				e.target.value = "";
				return;
			}
			if (selectedGif || selectedUnsplashImages.length > 0) {
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

		if (e.clipboardData?.items) {
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
		} else if (navigator.clipboard?.read) {
			try {
				const clipboardItems = await navigator.clipboard.read();
				for (const clipboardItem of clipboardItems) {
					for (const type of clipboardItem.types) {
						if (type.startsWith("image/")) {
							e.preventDefault();
							const blob = await clipboardItem.getType(type);
							const file = new File([blob], "pasted-image.png", { type });
							if (isConvertibleImage(file)) {
								await processFileForUpload(file);
							}
						}
					}
				}
			} catch (err) {
				console.error("Failed to read clipboard:", err);
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
		const content = document.createElement("div");
		content.className = "vibe-options-list";

		VIBES.forEach((vibe) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = `vibe-option-item${vibe.id === selectedVibe ? " selected" : ""}`;
			btn.dataset.vibe = vibe.id;

			const emoji = document.createElement("span");
			emoji.className = "vibe-emoji";
			emoji.textContent = vibe.emoji;

			const label = document.createElement("span");
			label.className = "vibe-label";
			label.textContent = vibe.label;

			btn.appendChild(emoji);
			btn.appendChild(label);
			content.appendChild(btn);
		});

		const { close } = createModal({
			title: "Choose @h's vibe",
			content,
			className: "vibe-modal",
		});

		content.querySelectorAll(".vibe-option-item").forEach((btn) => {
			btn.addEventListener("click", () => {
				selectedVibe = btn.dataset.vibe;
				updateVibeButton();
				close();
			});
		});
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

	if (gifPicker && gifSearchInput && gifResults && gifPickerClose) {
		let searchTimeout;

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

	if (
		unsplashPicker &&
		unsplashSearchInput &&
		unsplashResults &&
		unsplashPickerClose
	) {
		let searchTimeout;

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
						if (selectedUnsplashImages.length >= 4) {
							toastQueue.add(
								`<h1>Maximum images reached</h1><p>You can only add up to 4 photos</p>`,
							);
							return;
						}

						const unsplashImage = {
							url: img.url,
							download_location: img.download_location,
							photographer_name: img.user.name,
							photographer_username: img.user.username,
							photographer_url: img.user.link,
							thumb: img.thumb,
							tempId: crypto.randomUUID(),
						};

						selectedUnsplashImages.push(unsplashImage);
						selectedGif = null;

						const previewEl = document.createElement("div");
						previewEl.className = "attachment-preview-item";
						previewEl.dataset.tempId = unsplashImage.tempId;
						previewEl.innerHTML = `
							<img src="${img.thumb}" alt="Selected Image" />
							<button type="button" class="remove-attachment">×</button>
						`;

						previewEl
							.querySelector(".remove-attachment")
							.addEventListener("click", () => {
								const idx = selectedUnsplashImages.findIndex(
									(u) => u.tempId === unsplashImage.tempId,
								);
								if (idx !== -1) selectedUnsplashImages.splice(idx, 1);
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
			selectedUnsplashImages.length > 0 ||
			!!emojiKitchenUrl ||
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

				if (selectedUnsplashImages.length > 0) {
					requestBody.unsplash_images = selectedUnsplashImages;
				}

				if (emojiKitchenUrl) {
					requestBody.emoji_kitchen_url = emojiKitchenUrl;
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
				selectedUnsplashImages.length = 0;
				emojiKitchenUrl = null;
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

			if (selectedUnsplashImages.length > 0) {
				requestBody.unsplash_images = selectedUnsplashImages;
			}

			if (emojiKitchenUrl) {
				requestBody.emoji_kitchen_url = emojiKitchenUrl;
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

			cleanupBeforeUnload();

			textarea.value = "";
			tweetButton.disabled = true;
			charCount.textContent = "0";
			textarea.style.height = "25px";

			pendingFiles = [];
			selectedGif = null;
			selectedUnsplashImages.length = 0;
			emojiKitchenUrl = null;
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
			charCount.innerText = "";
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
                <button type="button" id="media-menu-btn" title="Add media">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
                <input type="file" id="file-input" multiple accept="image/png,image/webp,image/avif,image/jpeg,image/jpg,image/gif,video/mp4" style="display: none;" title="Images: max 10MB, Videos: max 100MB (auto-compressed if needed)">
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
                <div class="character-counter" data-max="400">
                  <svg viewBox="0 0 32 32">
                    <circle class="counter-bg" cx="16" cy="16" r="14"></circle>
                    <circle class="counter-progress" cx="16" cy="16" r="14" stroke-dasharray="87.96" stroke-dashoffset="87.96"></circle>
                  </svg>
                  <span class="counter-text" id="char-count"></span>
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
                    <button type="button" id="clear-schedule-btn" style="flex: 1; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-weight: 500;font-family:inherit;">Clear</button>
                    <button type="button" id="confirm-schedule-btn" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: var(--primary); color: white; cursor: pointer; font-weight: 500;color:var(--primary-fg);font-family:inherit;">Schedule</button>
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
				: user?.gray
					? 37500
					: user?.gold
						? 16500
						: user?.verified
							? 5500
							: 400;

		const counter = el.querySelector(".character-counter");
		if (counter) {
			counter.dataset.max = maxChars;
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
