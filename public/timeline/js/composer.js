import { showEmojiPickerPopup } from "../../shared/emoji-picker.js";
import { isConvertibleImage } from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import getUser from "./auth.js";

export const useComposer = (
  element,
  callback,
  { replyTo = null, quoteTweet = null, article = null, maxChars = 400 } = {}
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
  const replyRestrictionBtn = element.querySelector("#reply-restriction-btn");
  const replyRestrictionSelect = element.querySelector(
    "#reply-restriction-select"
  );
  const scheduleBtn = element.querySelector("#schedule-btn");
  const scheduleModal = element.querySelector("#schedule-modal");
  const scheduleModalClose = element.querySelector("#schedule-modal-close");
  const scheduleDateInput = element.querySelector("#schedule-date");
  const scheduleTimeInput = element.querySelector("#schedule-time");
  const confirmScheduleBtn = element.querySelector("#confirm-schedule-btn");
  const clearScheduleBtn = element.querySelector("#clear-schedule-btn");
  const emojiBtn = element.querySelector("#emoji-btn");

  let pollEnabled = false;
  let pendingFiles = [];
  let replyRestriction = "everyone";
  let selectedGif = null;
  let scheduledFor = null;

  const updateCharacterCount = () => {
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
        pollEnabled ||
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

  if (emojiBtn) {
    emojiBtn.addEventListener("click", () => {
      const btnRect = emojiBtn.getBoundingClientRect();
      showEmojiPickerPopup(
        (emoji) => {
          textarea.value += emoji;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          updateCharacterCount();
        },
        {
          x: btnRect.left,
          y: btnRect.bottom + 8,
        }
      );
    });
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
                }
              );
              resolve(webpFile);
            } else {
              resolve(file);
            }

            URL.revokeObjectURL(img.src);
          },
          "image/webp",
          quality
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
          `<h1>Unsupported file type</h1><p>Only WebP images and MP4 videos are allowed</p>`
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
          }</p>`
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
      // ensure the tweet button updates immediately when files are added
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
        // update button state after removing an attachment
        updateCharacterCount();
      });

    attachmentPreview.appendChild(previewEl);
  };

  if (fileUploadBtn && fileInput) {
    fileUploadBtn.addEventListener("click", () => {
      if (selectedGif) {
        toastQueue.add(
          `<h1>Cannot add files</h1><p>Remove the GIF first to upload files</p>`
        );
        return;
      }
      fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
      if (selectedGif) {
        toastQueue.add(
          `<h1>Cannot add files</h1><p>Remove the GIF first to upload files</p>`
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

  // Mention autocomplete
  // create or reuse a single popup element appended to body so suggestions act like a popup
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
    // show 'No results' message when empty
    if (mentionCandidates.length === 0) {
      const rect = textarea.getBoundingClientRect();
      mentionBox.style.left = `${rect.left + window.scrollX}px`;
      mentionBox.style.top = `${rect.bottom + window.scrollY + 6}px`;
      mentionBox.style.minWidth = `${Math.max(220, rect.width)}px`;
      mentionBox.innerHTML = `<div class="no-results">No users found</div>`;
      mentionBox.style.display = "block";
      return;
    }
    // position popup near textarea
    const rect = textarea.getBoundingClientRect();
    mentionBox.style.left = `${rect.left + window.scrollX}px`;
    mentionBox.style.top = `${rect.bottom + window.scrollY + 6}px`;
    mentionBox.style.minWidth = `${Math.max(220, rect.width)}px`;
    mentionBox.style.maxWidth = `420px`;
    mentionBox.innerHTML = "";
    mentionCandidates.forEach((user, i) => {
      const div = document.createElement("button");
      div.type = "button";
      div.className =
        "mention-suggestion" + (i === mentionIndex ? " selected" : "");
      div.innerHTML = `
        <img class="mention-avatar" src="${
          user.avatar || "/public/shared/default-avatar.png"
        }" alt="" />
        <div class="mention-info">
          <div class="mention-name">${user.name}</div>
          <div class="mention-username">@${user.username}</div>
        </div>
      `;
      div.addEventListener("mousedown", (ev) => {
        // prevent blur on textarea
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

    // replace the @query at the caret with the full handle
    const value = textarea.value;
    const selStart = textarea.selectionStart;
    // find the last '@' before selStart that starts a mention
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

    // call existing query helper for /search/users?q=
    try {
      const { users, error } = await query(
        `/search/users?q=${encodeURIComponent(q)}`
      );
      if (error) {
        mentionCandidates = [];
      } else {
        // filter by prefix match on username or name starting with q (case-insensitive)
        const lower = q.toLowerCase();
        const filtered = (users || []).filter((u) => {
          if (!u) return false;
          // exclude suspended accounts
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
      // if mention visible, select
      if (mentionCandidates.length > 0) {
        e.preventDefault();
        selectMention(mentionIndex >= 0 ? mentionIndex : 0);
      }
    } else if (e.key === "Escape") {
      closeMentions();
    }
  });

  // click outside to close
  document.addEventListener("click", (e) => {
    if (!mentionBox) return;
    if (!element.contains(e.target) && e.target !== mentionBox) {
      closeMentions();
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
      (file) => isConvertibleImage(file) || file.type === "video/mp4"
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
      if (pendingFiles.length > 0) {
        toastQueue.add(
          `<h1>Cannot add GIF</h1><p>Remove uploaded files first to select a GIF</p>`
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
          <div class="spinner"></div>
        </div>
      `;

      try {
        const { results, error } = await query(
          `/tenor/search?q=${encodeURIComponent(q)}&limit=12`
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
                // update button state after removing the GIF
                updateCharacterCount();
              });

            attachmentPreview.appendChild(previewEl);
            gifPicker.style.display = "none";
            gifSearchInput.value = "";
            // update button state after selecting a GIF
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

  if (scheduleBtn && scheduleModal && scheduleModalClose) {
    scheduleBtn.addEventListener("click", () => {
      scheduleModal.style.display = "flex";
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().slice(0, 5);
      scheduleDateInput.value = dateStr;
      scheduleTimeInput.value = timeStr;
    });

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

      const restrictionTexts = {
        everyone: "Everyone can reply",
        following: "People you follow can reply",
        followers: "Your followers can reply",
        verified: "Verified accounts can reply",
      };
      replyRestrictionBtn.title = restrictionTexts[replyRestriction];
    });

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
    const hasExtras =
      (pendingFiles && pendingFiles.length > 0) ||
      !!selectedGif ||
      pollEnabled ||
      !!article;

    if ((content.length === 0 && !hasExtras) || content.length > maxChars) {
      toastQueue.add(
        `<h1>Invalid tweet</h1><p>Make sure your tweet is 1 to ${maxChars} characters long.</p>`
      );
      return;
    }

    let poll = null;
    if (pollEnabled && pollContainer && pollDuration) {
      const pollOptions = Array.from(
        pollContainer.querySelectorAll(".poll-option input")
      )
        .map((input) => input.value.trim())
        .filter((value) => value.length > 0);

      if (pollOptions.length < 2) {
        toastQueue.add(
          `<h1>Invalid poll</h1><p>Please provide at least 2 poll options.</p>`
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

        if (selectedGif) {
          requestBody.gif_url = selectedGif;
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
          pollContainer
            .querySelectorAll(".poll-option")
            .forEach((option) => option.remove());
          togglePoll();
        }

        toastQueue.add(
          `<h1>Tweet Scheduled!</h1><p>Your tweet will be posted at ${new Date(
            scheduledPost.scheduled_for
          ).toLocaleString()}</p>`
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
      };

      if (selectedGif) {
        requestBody.gif_url = selectedGif;
      }

      if (poll) {
        requestBody.poll = poll;
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
      charCount.textContent = "0";
      textarea.style.height = "25px";

      pendingFiles = [];
      selectedGif = null;
      attachmentPreview.innerHTML = "";

      if (pollEnabled && pollContainer) {
        pollContainer
          .querySelectorAll(".poll-option")
          .forEach((option) => option.remove());
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
}) => {
  const el = document.createElement("div");
  el.classList.add("compose-tweet");
  el.innerHTML = `
        <div class="compose-header">
          <img src="" alt="Your avatar" id="compose-avatar">
          <div class="compose-input">
            <textarea id="tweet-textarea" style="overflow:hidden"></textarea>
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
                <button type="button" id="file-upload-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </button>
                <input type="file" id="file-input" multiple accept="image/png,image/webp,image/avif,image/jpeg,image/jpg,image/gif,video/mp4" style="display: none;" title="Images: max 10MB, Videos: max 100MB (auto-compressed if needed)">
                <button type="button" id="gif-btn" title="Add GIF">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M144,72V184a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm88-8H176a8,8,0,0,0-8,8V184a8,8,0,0,0,16,0V136h40a8,8,0,0,0,0-16H184V80h48a8,8,0,0,0,0-16ZM96,120H72a8,8,0,0,0,0,16H88v16a24,24,0,0,1-48,0V104A24,24,0,0,1,64,80c11.19,0,21.61,7.74,24.25,18a8,8,0,0,0,15.5-4C99.27,76.62,82.56,64,64,64a40,40,0,0,0-40,40v48a40,40,0,0,0,80,0V128A8,8,0,0,0,96,120Z"></path></svg>
                </button>
                <button type="button" id="poll-toggle"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-bar-big-icon lucide-chart-bar-big"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><rect x="7" y="13" width="9" height="4" rx="1"></rect><rect x="7" y="5" width="12" height="4" rx="1"></rect></svg></button>
                <button type="button" id="emoji-btn" title="Add emoji">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button type="button" id="schedule-btn" title="Schedule tweet">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </button>
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
            <div id="gif-picker" style="display: none;">
              <div class="gif-picker-header">
                <input type="text" id="gif-search-input" placeholder="Search Tenor…" />
                <button type="button" id="gif-picker-close">×</button>
              </div>
              <div id="gif-results"></div>
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
    avatarImg.src = user?.avatar || "/public/shared/default-avatar.png";

    const radius = user?.avatar_radius ?? (user?.gold ? 4 : 50);
    avatarImg.style.borderRadius = `${radius}%`;
  } catch (error) {
    console.error("Error loading user avatar:", error);
    const avatarImg = el.querySelector(".compose-header img");
    avatarImg.src = "/public/shared/default-avatar.png";
    avatarImg.style.borderRadius = "50%";
  }

  // Determine max characters based on user's character_limit or tier
  try {
    const user = await getUser();
    const maxChars =
      user?.character_limit !== null && user?.character_limit !== undefined
        ? user.character_limit
        : user?.gold
        ? 16500
        : user?.verified
        ? 5500
        : 400;

    // update the counter display to show the right max
    const counter = el.querySelector(".character-counter");
    if (counter) {
      counter.innerHTML = `<span id="char-count">0</span>/${maxChars}`;
    }

    const textareaEl = el.querySelector("#tweet-textarea");
    if (textareaEl) textareaEl.setAttribute("maxlength", String(maxChars));

    useComposer(el, callback, { replyTo, quoteTweet, maxChars });
  } catch {
    useComposer(el, callback, { replyTo, quoteTweet });
  }

  return el;
};
