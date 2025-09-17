import confetti from "../../shared/confetti.js";
import { isConvertibleImage } from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import getUser, { authToken } from "./auth.js";

export const useComposer = (
	element,
	callback,
	{ replyTo = null, quoteTweet = null } = {},
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
	const replyRestrictionBtn = element.querySelector("#reply-restriction-btn");
	const replyRestrictionSelect = element.querySelector(
		"#reply-restriction-select",
	);

	let pollEnabled = false;
	let pendingFiles = [];
	let replyRestriction = "everyone";

	const updateCharacterCount = () => {
		const length = textarea.value.length;
		charCount.textContent = length;

		if (length > 400) {
			charCount.parentElement.id = "over-limit";
			tweetButton.disabled = true;
		} else {
			charCount.parentElement.id = "";
			tweetButton.disabled = length === 0;
		}
	};

	const addPollOption = (text = "") => {
		if (!pollContainer) return;
		const optionIndex = pollContainer.querySelectorAll(".poll-option").length;
		if (optionIndex >= 4) return;

		const optionDiv = document.createElement("div");
		optionDiv.className = "poll-option";
		optionDiv.innerHTML = `
			<input type="text" placeholder="Choice ${optionIndex + 1}" maxlength="100" value="${text}">
			${optionIndex >= 2 ? '<button type="button" class="remove-option">×</button>' : ""}
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

	textarea.addEventListener("input", () => {
		textarea.style.height = `${Math.max(textarea.scrollHeight, 25)}px`;

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
					`<h1>File too large</h1><p>File size: ${fileSizeMB}MB. Maximum allowed: ${maxSizeMB}MB${processedFile.type === "video/mp4" ? " (videos will be compressed if needed)" : ""}</p>`,
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

		if (fileData.type.startsWith("image/")) {
			const objectUrl = URL.createObjectURL(fileData.file);
			previewEl.innerHTML = `
				<img src="${objectUrl}" alt="${fileData.name}" />
				<button type="button" class="remove-attachment">×</button>
			`;
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
			});

		attachmentPreview.appendChild(previewEl);
	};

	if (fileUploadBtn && fileInput) {
		fileUploadBtn.addEventListener("click", () => {
			fileInput.click();
		});

		fileInput.addEventListener("change", async (e) => {
			const files = Array.from(e.target.files);
			for (const file of files) {
				await processFileForUpload(file);
			}
			e.target.value = "";
		});
	}

	textarea.addEventListener("paste", async (e) => {
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

	if (addPollOptionBtn) {
		addPollOptionBtn.addEventListener("click", () => addPollOption());
	}

	// Reply restriction functionality
	if (replyRestrictionBtn && replyRestrictionSelect) {
		replyRestrictionBtn.addEventListener("click", () => {
			const isVisible = replyRestrictionSelect.style.display !== "none";
			replyRestrictionSelect.style.display = isVisible ? "none" : "block";
		});

		replyRestrictionSelect.addEventListener("change", () => {
			replyRestriction = replyRestrictionSelect.value;
			replyRestrictionSelect.style.display = "none";

			// Update button appearance based on selection
			const restrictionTexts = {
				everyone: "Everyone can reply",
				following: "People you follow can reply",
				followers: "Your followers can reply",
				verified: "Verified accounts can reply",
			};
			replyRestrictionBtn.title = restrictionTexts[replyRestriction];
		});

		// Hide when clicking outside
		document.addEventListener("click", (e) => {
			if (
				!replyRestrictionBtn.contains(e.target) &&
				!replyRestrictionSelect.contains(e.target)
			) {
				replyRestrictionSelect.style.display = "none";
			}
		});
	}

	tweetButton.addEventListener("click", async () => {
		const content = textarea.value.trim();

		if (!content || content.length > 400) {
			toastQueue.add(
				`<h1>Invalid tweet</h1><p>Make sure your tweet is 1 to 400 characters long.</p>`,
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
				duration: parseInt(pollDuration.value),
			};
		}

		tweetButton.disabled = true;

		try {
			const uploadedFiles = [];
			for (const fileData of pendingFiles) {
				const formData = new FormData();
				formData.append("file", fileData.file);

				const uploadResponse = await fetch("/api/upload/", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
					body: formData,
				});

				const uploadResult = await uploadResponse.json();
				if (uploadResult.success) {
					uploadedFiles.push(uploadResult.file);

					if (
						uploadResult.file.compressed &&
						uploadResult.file.compressionRatio > 0
					) {
						console.log(
							`Video compressed: ${uploadResult.file.compressionRatio}% size reduction`,
						);
					}
				} else {
					toastQueue.add(`<h1>Upload failed</h1><p>${uploadResult.error}</p>`);
					return;
				}
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
			};

			if (poll) {
				requestBody.poll = poll;
			}

			const { error, tweet } = await (
				await fetch("/api/tweets/", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${authToken}`,
					},
					body: JSON.stringify(requestBody),
				})
			).json();

			if (!tweet) {
				toastQueue.add(`<h1>${error || "Failed to post tweet"}</h1>`);
				return;
			}

			textarea.value = "";
			charCount.textContent = "0";
			textarea.style.height = "25px";

			pendingFiles = [];
			attachmentPreview.innerHTML = "";

			if (pollEnabled && pollContainer) {
				pollContainer
					.querySelectorAll(".poll-option")
					.forEach((option) => option.remove());
				togglePoll();
			}

			callback(tweet);

			if (!replyTo) {
				confetti(tweetButton, {
					count: 40,
					fade: true,
				});
			}

			toastQueue.add(`<h1>Tweet posted successfully!</h1>`);
		} catch (e) {
			console.log(e);
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
};

export const createComposer = async ({
	callback = () => {},
	placeholder = "What's happening?",
	replyTo = null,
	quoteTweet = null,
}) => {
	const el = document.createElement("div");
	el.classList.add("compose-tweet");
	el.innerHTML = `
        <div class="compose-header">
          <img src="" alt="Your avatar" id="compose-avatar">
          <div class="compose-input">
            <textarea placeholder="What's happening?" maxlength="400" id="tweet-textarea"></textarea>
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
            <div class="compose-footer">
              <div class="compose-actions">
                <button type="button" id="poll-toggle"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-column-big-icon lucide-chart-column-big"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="15" y="5" width="4" height="12" rx="1"/><rect x="7" y="8" width="4" height="9" rx="1"/></svg></button>
                <button type="button" id="file-upload-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </button>
                <input type="file" id="file-input" multiple accept="image/png,image/webp,image/avif,image/jpeg,image/jpg,image/gif,video/mp4" style="display: none;" title="Images: max 10MB, Videos: max 100MB (auto-compressed if needed)">
                <div class="reply-restriction-container">
                  <button type="button" id="reply-restriction-btn" title="Who can reply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </button>
                  <select id="reply-restriction-select" style="display: none;">
                    <option value="everyone">Everyone can reply</option>
                    <option value="following">People you follow</option>
                    <option value="followers">Your followers</option>
                    <option value="verified">Verified accounts</option>
                  </select>
                </div>
              </div>
              <div class="compose-submit">
                <div class="character-counter" id="">
                  <span id="char-count">0</span>/400
                </div>
                <button id="tweet-button" disabled="">Tweet</button>
              </div>
            </div>
            <div id="attachment-preview"></div>
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
		el.querySelector(".compose-header img").src =
			user?.avatar || "/public/shared/default-avatar.png";
	} catch (error) {
		console.error("Error loading user avatar:", error);
		el.querySelector(".compose-header img").src =
			"/public/shared/default-avatar.png";
	}

	useComposer(el, callback, { replyTo, quoteTweet });

	return el;
};
