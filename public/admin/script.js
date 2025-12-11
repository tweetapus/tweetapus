class AdminPanel {
	constructor() {
		this.token = localStorage.getItem("authToken");
		this.currentUser = null;
		this.isSuperAdmin = false;
		this.isImpersonating = false;
		this.userCache = new Map();
		this.currentPage = {
			users: 1,
			posts: 1,
			communities: 1,
			suspensions: 1,
			dms: 1,
			moderationLogs: 1,
			blocks: 1,
		};
		this.emojiProcessedFile = null;
		this.emojiPreviewUrl = null;
		this.pendingEmojiFile = null;
		this.emojiCropper = null;
		this.emojiCropModal = null;
		this.emojiCropperInitialized = false;
		this.previousEmojiFile = null;
		this.supportedEmojiTypes = new Set([
			"image/webp",
			"image/png",
			"image/jpeg",
			"image/jpg",
			"image/gif",
			"image/bmp",
			"image/svg+xml",
			"image/heic",
			"image/heif",
			"image/avif",
			"image/tiff",
			"image/tuff",
		]);
		this.selectedUsers = new Set();
		this.bulkModal = null;
		this.bulkEditOrder = [];
		this.customNotificationIcon = null;
		this.customNotificationPreviewUrl = null;
		this.customNotificationIconPreviewEl = null;
		this.customNotificationIconClearBtn = null;
		this.customNotificationSvgEditor = null;
		this.customNotificationSvgInput = null;
		this.fakeNotificationPreviewSetup = false;
		this.reportsCache = [];
		this.reportsById = new Map();
		this.reportDetailsModal = null;
		this.reportDetailsModalEl = null;
		this.extensionsSectionInitialized = false;
		this.extensionsData = [];
		this.extensionConfirmModal = null;
		this.extensionConfirmResolver = null;
		this.editPostSaveListenerAttached = false;
		this.postsTableListenerAttached = false;
		this.massEngageListenersAttached = false;
		this.leafletLoadingPromise = null;
		this.leafletLoaded = false;
		this.locationPickerModalInstance = null;
		this.locationPickerMap = null;
		this.locationPickerMarker = null;
		this.locationPickerSummaryEl = null;
		this.locationPickerStatusEl = null;
		this.locationPickerApplyBtn = null;
		this.locationPickerSearchInput = null;
		this.locationPickerSearchResultsEl = null;
		this.locationPickerSearchTimeout = null;
		this.locationPickerSearchAbortController = null;
		this.locationPickerContext = null;
		this.activeLocationSelection = null;
		this.locationPickerSelectionToken = 0;
		this.locationPickerTileLayer = null;
		this.timezoneCache = new Map();
		this.locationFieldMap = {
			login: {
				country: "editProfileLoginCountry",
				timezone: "editProfileLoginTimezone",
				tor: "editProfileLoginTor",
			},
			creation: {
				country: "editProfileCreationCountry",
				timezone: "editProfileCreationTimezone",
				tor: "editProfileCreationTor",
			},
			createCreation: {
				country: "createCreationCountry",
				timezone: "createCreationTimezone",
				tor: "createCreationTor",
			},
			createLogin: {
				country: "createLoginCountry",
				timezone: "createLoginTimezone",
				tor: "createLoginTor",
			},
		};

		this.init();
	}

	escapeHtml(text) {
		if (!text) return "";
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	isFlagSet(value) {
		return value === true || value === 1 || value === "1" || value === "true";
	}

	async init() {
		if (!this.token) {
			location.href = "/";
			this.redirectToLogin();
			return;
		}

		// admin init: validate and continue

		try {
			const user = await this.getCurrentUser();
			if (!user || !user.admin) {
				location.href = "/";
				return;
			}

			this.currentUser = user;
			this.isSuperAdmin = !!user.superadmin;
			if (!this.isSuperAdmin) {
				document.getElementById("bulkTweetBtn")?.classList.add("d-none");
			} else {
				document
					.getElementById("globalMassDeleteBtn")
					?.style.removeProperty("display");
			}
			this.setupEventListeners();
			this.updateBulkEditControls();
			this.loadDashboard();
			try {
				this.setupCloneForm();
			} catch (_e) {}
			try {
				this.setupFakeNotificationForm();
			} catch (_e) {}
		} catch {
			location.href = "/";
		}
	}

	setupEventListeners() {
		document.querySelectorAll(".nav-link[data-section]").forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const section = e.target.dataset.section;
				this.showSection(section);
				this.updateActiveNav(e.target);
			});
		});

		document.getElementById("userSearch").addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				this.searchUsers();
			}
		});

		document.getElementById("postSearch").addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				this.searchPosts();
			}
		});

		document.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				this.searchDMs();
			}
		});

		document
			.getElementById("moderationLogSearch")
			.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					this.searchModerationLogs();
				}
			});
	}

	ensureExtensionConfirmModal() {
		if (this.extensionConfirmModal) return;
		const wrapper = document.createElement("div");
		wrapper.id = "extension-delete-confirm";
		wrapper.className =
			"position-fixed top-0 start-0 w-100 h-100 d-none align-items-center justify-content-center";
		wrapper.style.zIndex = 10500;
		wrapper.innerHTML = `
			<div class="modal-backdrop show" style="position:absolute;inset:0;background:rgba(0,0,0,.6);"></div>
			<div class="card bg-dark text-light shadow" style="z-index:10001;max-width:520px;width:90%;">
				<div class="card-body">
					<h5 class="card-title mb-2">Confirm Action</h5>
					<p class="card-text text-muted mb-3">Are you sure?</p>
					<div class="d-flex justify-content-end gap-2">
						<button type="button" data-action="cancel" class="btn btn-outline-secondary">Cancel</button>
						<button type="button" data-action="deimport" class="btn btn-warning">De-Import</button>
						<button type="button" data-action="confirm" class="btn btn-danger">Delete</button>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(wrapper);
		this.extensionConfirmModal = wrapper;
		this.extensionConfirmTitle = wrapper.querySelector(".card-title");
		this.extensionConfirmMessage = wrapper.querySelector(".card-text");
		wrapper.addEventListener("click", (event) => {
			const action = event.target?.closest("[data-action]");
			if (!action) {
				if (event.target === wrapper) {
					this.hideExtensionConfirmModal("cancel");
				}
				return;
			}
			const type = action.dataset.action;
			if (type === "cancel") {
				this.hideExtensionConfirmModal("cancel");
			} else if (type === "deimport") {
				this.hideExtensionConfirmModal("deimport");
			} else if (type === "confirm") {
				this.hideExtensionConfirmModal("confirm");
			}
		});
	}

	getExtensionSettingsModal() {
		if (this.extensionSettingsModal?._ready) {
			return this.extensionSettingsModal;
		}
		const modalEl = document.getElementById("extensionSettingsModal");
		if (!modalEl) return null;
		this.extensionSettingsModal = modalEl;
		this.extensionSettingsModal._ready = true;
		this.extensionSettingsModalTitle = document.getElementById(
			"extensionSettingsTitle",
		);
		this.extensionSettingsModalSubtitle = document.getElementById(
			"extensionSettingsSubtitle",
		);
		this.extensionSettingsForm = document.getElementById(
			"extensionSettingsForm",
		);
		this.extensionSettingsFields = document.getElementById(
			"extensionSettingsFields",
		);
		this.extensionSettingsEmpty = document.getElementById(
			"extensionSettingsEmpty",
		);
		this.extensionSettingsAlert = document.getElementById(
			"extensionSettingsAlert",
		);
		this.extensionSettingsStatus = document.getElementById(
			"extensionSettingsStatus",
		);
		this.extensionSettingsSaveBtn = document.getElementById(
			"extensionSettingsSaveBtn",
		);
		if (this.extensionSettingsSaveBtn) {
			this.extensionSettingsSaveBtn.addEventListener("click", () => {
				if (this.currentExtensionSettingsId) {
					this.saveExtensionSettings(this.currentExtensionSettingsId);
				}
			});
		}
		return modalEl;
	}

	showExtensionDeleteConfirm({ title, message }) {
		this.ensureExtensionConfirmModal();
		if (this.extensionConfirmTitle)
			this.extensionConfirmTitle.textContent = title;
		if (this.extensionConfirmMessage)
			this.extensionConfirmMessage.textContent =
				message ||
				"Delete this extension? Choose De-Import to keep the files on disk.";
		const overlay = this.extensionConfirmModal;
		overlay.classList.remove("d-none");
		overlay.classList.add("d-flex");
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";
		return new Promise((resolve) => {
			this.extensionConfirmResolver = resolve;
		});
	}

	hideExtensionConfirmModal(result) {
		if (!this.extensionConfirmModal) return;
		this.extensionConfirmModal.classList.remove("d-flex");
		this.extensionConfirmModal.classList.add("d-none");
		if (typeof this.extensionConfirmResolver !== "function") return;
		if (result === "deimport") {
			this.extensionConfirmResolver("deimport");
		} else if (result === "confirm") {
			this.extensionConfirmResolver("delete");
		} else {
			this.extensionConfirmResolver("cancel");
		}
		this.extensionConfirmResolver = null;
	}

	updateActiveNav(activeLink) {
		document.querySelectorAll(".nav-link").forEach((link) => {
			link.classList.remove("active");
		});
		activeLink.classList.add("active");
	}

	showSection(sectionName) {
		document.querySelectorAll(".section").forEach((section) => {
			section.classList.add("d-none");
		});

		const targetSection = document.getElementById(`${sectionName}-section`);
		if (targetSection) {
			targetSection.classList.remove("d-none");
		}

		switch (sectionName) {
			case "dashboard":
				this.loadDashboard();
				break;
			case "users":
				this.loadUsers();
				break;
			case "posts":
				this.loadPosts();
				break;
			case "communities":
				this.loadCommunities();
				break;
			case "suspensions":
				this.loadSuspensions();
				break;
			case "reports":
				this.loadReports();
				break;
			case "dms":
				this.loadDMs();
				break;
			case "moderation-logs":
				this.loadModerationLogs();
				break;
			case "emojis":
				this.loadEmojis();
				break;
			case "extensions":
				this.loadExtensionsManager();
				break;
			case "badges":
				this.loadBadgesManager();
				break;
			case "blocks":
				this.loadBlocks();
				break;
		}
	}

	async loadEmojis() {
		try {
			const data = await this.apiCall("/api/admin/emojis");
			const emojis = data.emojis || [];
			this.renderEmojisList(emojis);
			this.setupEmojiForm();
		} catch (_err) {
			this.showError("Failed to load emojis");
		}
	}

	renderEmojisList(emojis) {
		const container = document.getElementById("emojisList");
		if (!container) return;
		if (!emojis || emojis.length === 0) {
			container.innerHTML =
				'<p class="text-muted">No custom emojis uploaded yet.</p>';
			return;
		}

		container.innerHTML = `
      <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 g-3">
        ${emojis
					.map(
						(e) => `
          <div class="col">
            <div class="card p-2">
              <div class="d-flex align-items-center gap-3">
                <img src="${this.escapeHtml(
									e.file_url,
								)}" alt="${this.escapeHtml(
									e.name,
								)}" style="width:48px;height:48px;object-fit:contain" />
                <div>
                  <strong>${this.escapeHtml(e.name)}</strong>
                  <div class="text-muted" style="font-size:12px">${this.formatDate(
										e.created_at,
									)}</div>
                </div>
                <div class="ms-auto">
                  <button class="btn btn-sm btn-outline-danger" onclick="adminPanel.deleteEmoji('${
										e.id
									}')">Delete</button>
                </div>
              </div>
            </div>
          </div>
        `,
					)
					.join("")}
      </div>
    `;
	}

	setupEmojiForm() {
		const form = document.getElementById("emojiUploadForm");
		if (!form || form._emojiSetup) return;
		form._emojiSetup = true;

		const fileInput = document.getElementById("emojiFileInput");
		const preview = document.getElementById("emojiPreview");
		this.emojiFileInput = fileInput;
		this.emojiPreviewEl = preview;
		this.initEmojiCropper();

		form.addEventListener("reset", () => {
			this.clearEmojiSelection();
		});

		if (fileInput) {
			fileInput.addEventListener("change", (e) => {
				const f = e.target?.files?.[0];
				this.handleEmojiFileSelection(f);
			});
		}

		this.emojiFileInitiallyRequired = !!fileInput?.hasAttribute?.("required");

		form.addEventListener("submit", async (ev) => {
			ev.preventDefault();
			const name = document.getElementById("emojiName")?.value?.trim();
			const file = this.emojiProcessedFile;
			if (!name) {
				this.showError("Emoji name is required");
				return;
			}
			if (!file) {
				this.showError("Please select and crop an image before uploading");
				return;
			}

			try {
				const fd = new FormData();
				fd.append("file", file, file.name);

				const uploadRespRaw = await fetch("/api/upload", {
					method: "POST",
					headers: { Authorization: `Bearer ${this.token}` },
					body: fd,
				});
				const uploadResp = await uploadRespRaw.json();
				if (!uploadRespRaw.ok || uploadResp?.error) {
					this.showError(uploadResp?.error || "Failed to upload image");
					return;
				}

				const createResp = await this.apiCall("/api/admin/emojis", {
					method: "POST",
					body: JSON.stringify({
						name,
						file_hash: uploadResp.file.hash,
						file_url: uploadResp.file.url,
					}),
				});

				if (createResp.error) {
					this.showError(createResp.error);
					return;
				}

				this.showSuccess("Emoji uploaded");
				form.reset();
				this.clearEmojiSelection();
				await this.loadEmojis();
			} catch (_err) {
				console.error(_err);
				this.showError("Failed to upload emoji");
			}
		});
	}

	initEmojiCropper() {
		if (this.emojiCropperInitialized) return;
		const modalEl = document.getElementById("emojiCropModal");
		const canvas = document.getElementById("emojiCropCanvas");
		const zoom = document.getElementById("emojiCropZoom");
		const applyBtn = document.getElementById("emojiCropApply");
		const cancelBtn = document.getElementById("emojiCropCancel");
		const resetBtn = document.getElementById("emojiCropReset");
		if (!modalEl || !canvas || !zoom || !applyBtn || !cancelBtn) return;

		this.emojiCropperInitialized = true;
		const ratio = window.devicePixelRatio || 1;
		const size = 300;
		canvas.width = size * ratio;
		canvas.height = size * ratio;
		canvas.style.width = `${size}px`;
		canvas.style.height = `${size}px`;

		this.emojiCropper = {
			canvas,
			ctx: canvas.getContext("2d"),
			zoom,
			applyBtn,
			cancelBtn,
			resetBtn,
			modalEl,
			size,
			ratio,
			image: null,
			scale: 1,
			minScale: 1,
			maxScale: 4,
			baseScale: 1,
			zoomRelative: 0,
			zoomMaxRelative: 4,
			offsetX: 0,
			offsetY: 0,
			isDragging: false,
			lastClientX: 0,
			lastClientY: 0,
		};

		this.emojiCropModal = new bootstrap.Modal(modalEl, {
			backdrop: "static",
			keyboard: false,
		});

		zoom.addEventListener("input", (event) => {
			const value = parseFloat(event.target.value);
			if (!Number.isFinite(value)) return;
			this.updateEmojiScale(value);
		});

		applyBtn.addEventListener("click", () => {
			this.applyEmojiCrop();
		});

		cancelBtn.addEventListener("click", () => {
			this.cancelEmojiCrop();
		});

		if (resetBtn) {
			resetBtn.addEventListener("click", () => {
				if (!this.emojiCropper?.zoom) return;
				this.emojiCropper.zoom.value = "0";
				this.updateEmojiScale(0);
			});
			resetBtn.disabled = true;
		}

		modalEl.addEventListener("hidden.bs.modal", () => {
			if (this.emojiCropper) {
				this.emojiCropper.image = null;
				this.emojiCropper.isDragging = false;
				this.emojiCropper.zoomRelative = 0;
			}
			if (this.emojiCropper?.zoom) {
				this.emojiCropper.zoom.value = "0";
			}
			if (this.emojiCropper?.resetBtn) {
				this.emojiCropper.resetBtn.disabled = true;
			}
			this.pendingEmojiFile = null;
		});

		canvas.addEventListener("pointerdown", (event) =>
			this.startEmojiDrag(event),
		);
		window.addEventListener(
			"pointermove",
			(event) => this.moveEmojiDrag(event),
			{
				passive: false,
			},
		);
		window.addEventListener("pointerup", () => this.endEmojiDrag());
		window.addEventListener("pointercancel", () => this.endEmojiDrag());
	}

	handleEmojiFileSelection(file) {
		if (!this.emojiCropperInitialized) this.initEmojiCropper();
		if (!this.emojiCropper || !this.emojiCropModal) {
			this.showError("Emoji cropping is unavailable right now");
			if (this.emojiFileInput) this.emojiFileInput.value = "";
			return;
		}
		this.previousEmojiFile = this.emojiProcessedFile;
		if (this.emojiPreviewUrl) {
			URL.revokeObjectURL(this.emojiPreviewUrl);
			this.emojiPreviewUrl = null;
		}
		if (this.emojiPreviewEl) {
			this.emojiPreviewEl.src = "";
			this.emojiPreviewEl.style.display = "none";
		}
		this.emojiProcessedFile = null;
		if (!file) {
			this.pendingEmojiFile = null;
			return;
		}

		const type = file.type?.toLowerCase();
		if (!type || !this.supportedEmojiTypes.has(type)) {
			this.showError(
				"Unsupported image type. Please select PNG, JPG, WebP, or a similar format.",
			);
			if (this.emojiFileInput) this.emojiFileInput.value = "";
			this.pendingEmojiFile = null;
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			this.showError("Image too large. Maximum size is 5MB.");
			if (this.emojiFileInput) this.emojiFileInput.value = "";
			this.pendingEmojiFile = null;
			return;
		}

		this.pendingEmojiFile = file;
		this.openEmojiCropper(file);
	}

	openEmojiCropper(file) {
		if (!this.emojiCropper || !this.emojiCropModal) return;
		const objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(objectUrl);
			const crop = this.emojiCropper;
			crop.image = img;
			const canvasSize = crop.size * crop.ratio;
			const containScale = Math.min(
				canvasSize / img.width,
				canvasSize / img.height,
			);
			let baseScale = containScale > 0 ? containScale : 1;
			if (baseScale > 1) baseScale = 1;
			if (baseScale <= 0) baseScale = 0.01;
			const maxScale = Math.max(baseScale * 4, 6);
			crop.baseScale = baseScale;
			crop.minScale = baseScale;
			crop.maxScale = maxScale;
			crop.scale = baseScale;
			crop.zoomRelative = 0;
			crop.zoomMaxRelative = Math.max(0, maxScale / baseScale - 1);
			crop.offsetX = (canvasSize - img.width * crop.scale) / 2;
			crop.offsetY = (canvasSize - img.height * crop.scale) / 2;
			if (crop.zoom) {
				crop.zoom.min = "0";
				crop.zoom.max = `${crop.zoomMaxRelative}`;
				crop.zoom.step = "0.01";
				crop.zoom.value = "0";
			}
			if (crop.resetBtn) {
				crop.resetBtn.disabled = false;
			}
			this.updateEmojiScale(0);
			this.emojiCropModal.show();
		};
		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			this.showError("Failed to load image for cropping");
			if (this.emojiFileInput) this.emojiFileInput.value = "";
			this.pendingEmojiFile = null;
		};
		img.src = objectUrl;
	}

	updateEmojiScale(relativeValue) {
		const crop = this.emojiCropper;
		if (!crop || !crop.image) return;
		const relativeNumber = Number(relativeValue);
		if (!Number.isFinite(relativeNumber)) return;
		const baseScale = crop.baseScale || crop.scale || 1;
		const maxRelative =
			typeof crop.zoomMaxRelative === "number"
				? crop.zoomMaxRelative
				: Math.max(0, (crop.maxScale || baseScale) / baseScale - 1);
		const clampedRelative = Math.max(0, Math.min(maxRelative, relativeNumber));
		const previousScale = crop.scale || baseScale;
		const targetScale = Math.max(
			crop.minScale || 0.01,
			Math.min(crop.maxScale, baseScale * (1 + clampedRelative)),
		);
		const canvasSize = crop.size * crop.ratio;
		const centerX = canvasSize / 2;
		const centerY = canvasSize / 2;
		const relX = centerX - crop.offsetX;
		const relY = centerY - crop.offsetY;
		const ratio = targetScale / (previousScale || baseScale);
		crop.offsetX = centerX - relX * ratio;
		crop.offsetY = centerY - relY * ratio;
		crop.scale = targetScale;
		const adjustedRelative = Math.max(
			0,
			Math.min(maxRelative, targetScale / baseScale - 1),
		);
		crop.zoomRelative = adjustedRelative;
		if (crop.zoom) {
			crop.zoom.value = `${adjustedRelative}`;
		}
		this.constrainEmojiOffsets();
		this.drawEmojiCrop();
	}

	startEmojiDrag(event) {
		const crop = this.emojiCropper;
		if (!crop || !crop.image) return;
		crop.isDragging = true;
		crop.lastClientX = event.clientX;
		crop.lastClientY = event.clientY;
		event.preventDefault();
	}

	moveEmojiDrag(event) {
		const crop = this.emojiCropper;
		if (!crop || !crop.image || !crop.isDragging) return;
		const deltaX = (event.clientX - crop.lastClientX) * crop.ratio;
		const deltaY = (event.clientY - crop.lastClientY) * crop.ratio;
		crop.lastClientX = event.clientX;
		crop.lastClientY = event.clientY;
		crop.offsetX += deltaX;
		crop.offsetY += deltaY;
		this.constrainEmojiOffsets();
		this.drawEmojiCrop();
		event.preventDefault();
	}

	endEmojiDrag() {
		const crop = this.emojiCropper;
		if (!crop) return;
		crop.isDragging = false;
	}

	constrainEmojiOffsets() {
		const crop = this.emojiCropper;
		if (!crop || !crop.image) return;
		const canvasSize = crop.size * crop.ratio;
		const scaledWidth = crop.image.width * crop.scale;
		const scaledHeight = crop.image.height * crop.scale;
		const minX = Math.min(0, canvasSize - scaledWidth);
		const minY = Math.min(0, canvasSize - scaledHeight);

		if (scaledWidth <= canvasSize) {
			crop.offsetX = (canvasSize - scaledWidth) / 2;
		} else if (crop.offsetX > 0) {
			crop.offsetX = 0;
		} else if (crop.offsetX < minX) {
			crop.offsetX = minX;
		}

		if (scaledHeight <= canvasSize) {
			crop.offsetY = (canvasSize - scaledHeight) / 2;
		} else if (crop.offsetY > 0) {
			crop.offsetY = 0;
		} else if (crop.offsetY < minY) {
			crop.offsetY = minY;
		}
	}

	drawEmojiCrop() {
		const crop = this.emojiCropper;
		if (!crop || !crop.image) return;
		const { ctx, canvas } = crop;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "#1f1f1f";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(
			crop.image,
			crop.offsetX,
			crop.offsetY,
			crop.image.width * crop.scale,
			crop.image.height * crop.scale,
		);
	}

	applyEmojiCrop() {
		const crop = this.emojiCropper;
		if (!crop || !crop.image || !this.pendingEmojiFile) return;
		crop.applyBtn.disabled = true;
		const exportCanvas = document.createElement("canvas");
		exportCanvas.width = crop.size;
		exportCanvas.height = crop.size;
		const exportCtx = exportCanvas.getContext("2d");
		exportCtx.imageSmoothingEnabled = true;
		exportCtx.imageSmoothingQuality = "high";
		const scaleAdjustment = crop.scale / crop.ratio;
		exportCtx.drawImage(
			crop.image,
			crop.offsetX / crop.ratio,
			crop.offsetY / crop.ratio,
			crop.image.width * scaleAdjustment,
			crop.image.height * scaleAdjustment,
		);

		exportCanvas.toBlob(
			(blob) => {
				crop.applyBtn.disabled = false;
				if (!blob) {
					this.showError("Failed to generate cropped image");
					return;
				}
				const base = this.pendingEmojiFile.name
					?.replace(/\.[^/.]+$/, "")
					?.replace(/[^a-z0-9_-]+/gi, "")
					?.toLowerCase();
				const fileName =
					base && base.length > 0 ? `${base}.webp` : `emoji-${Date.now()}.webp`;
				const webpFile = new File([blob], fileName, {
					type: "image/webp",
					lastModified: Date.now(),
				});
				this.emojiProcessedFile = webpFile;
				this.previousEmojiFile = null;
				this.updateEmojiPreview(webpFile);
				if (this.emojiCropModal) this.emojiCropModal.hide();
				this.pendingEmojiFile = null;
				if (this.emojiFileInput) {
					this.emojiFileInput.value = "";
					if (this.emojiFileInitiallyRequired)
						this.emojiFileInput.removeAttribute("required");
				}
			},
			"image/webp",
			0.9,
		);
	}

	cancelEmojiCrop() {
		if (this.emojiCropModal) this.emojiCropModal.hide();
		if (this.emojiCropper) this.emojiCropper.applyBtn.disabled = false;
		if (this.emojiFileInput) {
			this.emojiFileInput.value = "";
		}
		this.pendingEmojiFile = null;
		if (this.previousEmojiFile) {
			this.emojiProcessedFile = this.previousEmojiFile;
			this.previousEmojiFile = null;
			this.updateEmojiPreview(this.emojiProcessedFile);
			if (this.emojiFileInput && this.emojiFileInitiallyRequired)
				this.emojiFileInput.removeAttribute("required");
		} else {
			if (this.emojiFileInput && this.emojiFileInitiallyRequired)
				this.emojiFileInput.setAttribute("required", "");
		}
	}

	updateEmojiPreview(file) {
		if (!this.emojiPreviewEl) return;
		if (this.emojiPreviewUrl) {
			URL.revokeObjectURL(this.emojiPreviewUrl);
		}
		const url = URL.createObjectURL(file);
		this.emojiPreviewUrl = url;
		this.emojiPreviewEl.src = url;
		this.emojiPreviewEl.style.display = "";
	}

	clearEmojiSelection() {
		this.emojiProcessedFile = null;
		this.pendingEmojiFile = null;
		this.previousEmojiFile = null;
		if (this.emojiPreviewUrl) {
			URL.revokeObjectURL(this.emojiPreviewUrl);
			this.emojiPreviewUrl = null;
		}
		if (this.emojiPreviewEl) {
			this.emojiPreviewEl.src = "";
			this.emojiPreviewEl.style.display = "none";
		}
		if (this.emojiFileInput) {
			this.emojiFileInput.value = "";
			if (this.emojiFileInitiallyRequired)
				this.emojiFileInput.setAttribute("required", "");
		}
	}

	async deleteEmoji(id) {
		if (!confirm("Delete this emoji?")) return;
		try {
			await this.apiCall(`/api/admin/emojis/${id}`, { method: "DELETE" });
			this.showSuccess("Emoji deleted");
			this.loadEmojis();
		} catch (_err) {
			this.showError("Failed to delete emoji");
		}
	}

	async getCurrentUser() {
		const response = await fetch("/api/auth/me", {
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (!response.ok) throw new Error("Failed to get user");

		const data = await response.json();
		return data.user;
	}

	async apiCall(endpoint, options = {}) {
		const headers = {
			Authorization: `Bearer ${this.token}`,
			...options.headers,
		};

		if (options.body && !headers["Content-Type"]) {
			headers["Content-Type"] = "application/json";
		}

		const response = await fetch(endpoint, { ...options, headers });
		const text = await response.text();

		let data;
		try {
			data = JSON.parse(text);
		} catch {
			throw new Error(text || "Failed to parse response");
		}

		if (!response.ok) {
			throw new Error(data.error || "API call failed");
		}

		return data;
	}

	async loadDashboard() {
		try {
			const stats = await this.apiCall("/api/admin/stats");
			this.renderStats(stats.stats);
			this.renderRecentActivity(stats.recentActivity);
		} catch {
			location.href = "/";
		}
	}

	renderStats(stats) {
		const container = document.getElementById("statsCards");
		container.innerHTML = `
      <div class="col-md-3">
        <div class="card stat-card">
          <div class="card-body text-center">
            <i class="bi bi-people-fill fs-1"></i>
            <h3>${stats.users.total}</h3>
            <p class="mb-0">Users</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card stat-card success">
          <div class="card-body text-center">
            <i class="bi bi-chat-left-text-fill fs-1"></i>
            <h3>${stats.posts.total}</h3>
            <p class="mb-0">Posts</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card stat-card warning">
          <div class="card-body text-center">
            <i class="bi bi-exclamation-triangle-fill fs-1"></i>
            <h3>${stats.suspensions.active}</h3>
            <p class="mb-0">Suspensions (${stats.users.suspended})</p>
          </div>
        </div>
      </div>
			<div class="col-md-3">
				<div class="card stat-card danger">
					<div class="card-body text-center">
						<i class="bi bi-shield-lock-fill fs-1"></i>
						<h3>${stats.users.restricted || 0}</h3>
						<p class="mb-0">Restricted users</p>
					</div>
				</div>
			</div>
      <div class="col-md-3">
        <div class="card stat-card">
          <div class="card-body text-center">
            <i class="bi bi-clipboard-check-fill fs-1"></i>
            <h3>${stats.users.verified}</h3>
            <p class="mb-0">Verified users</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card stat-card">
          <div class="card-body text-center">
            <i class="bi bi-check-circle-fill fs-1"></i>
            <h3>${stats.users.gray || 0}</h3>
            <p class="mb-0">Gray check users</p>
          </div>
        </div>
      </div>
    `;
	}

	renderRecentActivity(activity) {
		const usersContainer = document.getElementById("recentUsers");
		const suspensionsContainer = document.getElementById("recentSuspensions");

		usersContainer.innerHTML = activity.users
			.map(
				(user) => `
      <div class="d-flex align-items-center mb-2">
        <strong style="cursor: pointer; color: #0d6efd;" onclick="adminPanel.findAndViewUser('${this.escapeHtml(
					user.username,
				)}')">@${this.escapeHtml(user.username)}</strong>
        <small class="text-muted ms-auto">${this.formatDate(
					user.created_at,
				)}</small>
      </div>
    `,
			)
			.join("");

		suspensionsContainer.innerHTML = activity.suspensions.length
			? activity.suspensions
					.map(
						(suspension) => `
        <div class="d-flex align-items-center mb-2">
          <span style="cursor: pointer; color: #0d6efd;" onclick="adminPanel.findAndViewUser('${this.escapeHtml(
						suspension.username,
					)}')">@${this.escapeHtml(suspension.username)}</span>
          <small class="text-muted ms-auto">${this.formatDate(
						suspension.created_at,
					)}</small>
        </div>
      `,
					)
					.join("")
			: '<p class="text-muted">No recent suspensions</p>';
	}

	async loadUsers(page = 1, search = "") {
		try {
			const params = new URLSearchParams({ page, limit: 20 });
			if (search) params.append("search", search);

			const data = await this.apiCall(`/api/admin/users?${params}`);
			this.renderUsersTable(data.users);
			this.renderPagination("users", data.pagination);
			this.currentPage.users = page;
		} catch {
			this.showError("Failed to load users");
		}
	}

	renderUsersTable(users) {
		const container = document.getElementById("usersTable");

		container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th style="width: 60px;">Select</th>
              <th>User</th>
              <th>Stats</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users
							.map(
								(user) => `
              <tr>
                <td>
                  <input type="checkbox" class="form-check-input bulk-user-checkbox" value="${
										user.id
									}" onchange="adminPanel.toggleUserSelection('${
										user.id
									}', this.checked)">
                </td>
                <td>
                  <div class="d-flex align-items-center">
                    ${
											user.avatar
												? (
														() => {
															const radius =
																user.avatar_radius !== null &&
																user.avatar_radius !== undefined
																	? `${user.avatar_radius}px`
																	: user.gold
																		? `4px`
																		: `50px`;
															return `<img src="${user.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
														}
													)()
												: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center">
                          <i class="bi bi-person text-white"></i>
                        </div>`
										}
                    <div>
                      <strong>@${user.username}</strong>
                      ${
												user.name
													? `<br><small class="text-muted">${user.name
															.replaceAll("<", "&lt;")
															.replaceAll(">", "&gt;")}</small>`
													: ""
											}
                    </div>
                  </div>
                </td>
                                <td>
                  <small>
                    Posts: ${user.actual_post_count}<br>
                    Followers: ${user.actual_follower_count}<br>
                    Following: ${user.actual_following_count}
                  </small>
                </td>
                <td>
                  <div class="d-flex flex-column gap-1">
                      ${
												this.isFlagSet(user.verified)
													? '<span class="badge bg-success">Verified</span>'
													: ""
											}
                    ${
											user.admin
												? '<span class="badge bg-primary">Admin</span>'
												: ""
										}
                    ${
											this.isFlagSet(user.gold)
												? '<span class="badge bg-warning">Gold</span>'
												: ""
										}
                    ${
											this.isFlagSet(user.gray)
												? '<span class="badge bg-secondary">Gray</span>'
												: ""
										}
					${
						(
							user.suspended
								? '<span class="badge bg-danger">Suspended</span>'
								: ""
						) +
						(
							user.restricted
								? '<span class="badge bg-warning">Restricted</span>'
								: ""
						) +
						(user.shadowbanned
							? '<span class="badge bg-secondary">Shadowbanned</span>'
							: "")
					}
                  </div>
                </td>
                <td>
                  <small>${this.formatDate(user.created_at)}</small>
                </td>
                <td>
                  <div class="btn-group-vertical btn-group-sm">
										<button class="btn btn-outline-primary btn-sm" data-user-id="${
											user.id
										}" onclick="adminPanel.showUserModal('${
											user.id
										}')" onpointerdown="adminPanel.prefetchUser('${
											user.id
										}')" onmouseenter="adminPanel.prefetchUser('${user.id}')">
											<i class="bi bi-eye"></i> View / Edit
										</button>
                    <button class="btn btn-outline-info btn-sm" onclick="adminPanel.tweetOnBehalf('${
											user.id
										}')">
                      <i class="bi bi-chat-text"></i> Tweet As
                    </button>
											<button class="btn btn-outline-danger btn-sm" onclick="adminPanel.showSuspensionModal('${user.id}')">
												<i class="bi bi-exclamation-triangle"></i> Moderate
											</button>
                  
                      <button class="btn btn-outline-info btn-sm" onclick="adminPanel.impersonateUser('${
												user.id
											}')">
                        <i class="bi bi-person-fill-gear"></i> Impersonate
                      </button>
                  </div>
                </td>
              </tr>
            `,
							)
							.join("")}
          </tbody>
        </table>
      </div>
    `;

		this.syncSelectedUserCheckboxes();
		this.updateBulkEditControls();
	}

	toggleUserSelection(userId, checked) {
		if (!userId) return;
		if (checked) {
			this.selectedUsers.add(userId);
		} else {
			this.selectedUsers.delete(userId);
		}
		document.querySelectorAll(".bulk-user-checkbox").forEach((checkbox) => {
			if (checkbox.value === userId) {
				checkbox.checked = this.selectedUsers.has(userId);
			}
		});
		this.updateBulkEditControls();
	}

	syncSelectedUserCheckboxes() {
		document.querySelectorAll(".bulk-user-checkbox").forEach((checkbox) => {
			checkbox.checked = this.selectedUsers.has(checkbox.value);
		});
	}

	updateBulkEditControls() {
		const btn = document.getElementById("bulkEditBtn");
		const countBadge = document.getElementById("bulkEditCount");
		const count = this.selectedUsers.size;
		if (btn) {
			btn.disabled = count === 0;
		}
		const tweetBtn = document.getElementById("bulkTweetBtn");
		if (tweetBtn) {
			tweetBtn.disabled = count === 0 || !this.isSuperAdmin;
			tweetBtn.title = this.isSuperAdmin ? "" : "SuperAdmin access required";
		}
		if (countBadge) {
			countBadge.textContent = String(count);
		}
	}

	async showBulkTweetModal() {
		if (!this.isSuperAdmin) {
			this.showError("SuperAdmin access required");
			return;
		}
		if (!this.selectedUsers.size) {
			this.showError("Select at least one user to mass tweet as");
			return;
		}

		const modalEl = document.getElementById("bulkTweetModal");
		const selectedList = document.getElementById("bulkTweetSelectedUsers");
		if (!modalEl || !selectedList) return;

		const usernames = [];
		for (const id of this.selectedUsers) {
			let cached = this.userCache.get(id);
			let username = id;
			try {
				if (cached && typeof cached.then === "function") {
					cached = await cached;
				}
				if (cached?.user?.username) username = cached.user.username;
			} catch {
				// fallback to id if error
			}
			usernames.push(username);
		}
		selectedList.textContent = usernames.join(", ") || "None selected";

		new bootstrap.Modal(modalEl).show();
	}

	async postBulkTweets() {
		if (!this.isSuperAdmin) {
			this.showError("SuperAdmin access required");
			return;
		}
		const content = document.getElementById("bulkTweetContent")?.value || "";
		const trimmedContent = content.trim();
		if (!trimmedContent) {
			this.showError("Content is required");
			return;
		}

		const replyToInput = document
			.getElementById("bulkTweetReplyTo")
			?.value?.trim();
		const replyTo = replyToInput ? replyToInput : undefined;
		const source =
			document.getElementById("bulkTweetSource")?.value?.trim() || null;
		let createdAt = null;
		const createdAtInput = document.getElementById("bulkTweetCreatedAt");
		if (createdAtInput?.value) {
			try {
				const d = new Date(createdAtInput.value);
				if (!Number.isNaN(d.getTime())) createdAt = d.toISOString();
			} catch (_err) {}
		}

		if (
			!confirm(
				`Send this message as ${this.selectedUsers.size} selected user(s)?`,
			)
		)
			return;

		const total = this.selectedUsers.size;
		let successCount = 0;
		const results = [];

		for (const id of Array.from(this.selectedUsers)) {
			try {
				const payload = {
					userId: id,
					content: trimmedContent,
					noCharLimit: true,
					massTweet: true,
				};
				if (replyTo) payload.replyTo = replyTo;
				if (createdAt) payload.created_at = createdAt;
				if (source) payload.source = source;
				await this.apiCall(`/api/admin/tweets`, {
					method: "POST",
					body: JSON.stringify(payload),
				});
				successCount++;
				results.push({ id, ok: true });
			} catch (err) {
				results.push({ id, ok: false, error: err.message });
			}
		}

		new bootstrap.Modal(document.getElementById("bulkTweetModal")).hide();
		const form = document.getElementById("bulkTweetForm");
		if (form) form.reset();
		this.selectedUsers.clear();
		this.syncSelectedUserCheckboxes();
		this.updateBulkEditControls();
		const selectedList = document.getElementById("bulkTweetSelectedUsers");
		if (selectedList) selectedList.textContent = "None selected";
		this.loadUsers(this.currentPage.users);
		this.showSuccess(`Mass tweet completed: ${successCount}/${total} success`);
		if (successCount !== total) {
			console.warn(
				"Bulk tweet errors:",
				results.filter((r) => !r.ok),
			);
		}
	}

	async searchUsers() {
		const search = document.getElementById("userSearch").value;
		this.loadUsers(1, search);
	}

	async loadPosts(page = 1, search = "") {
		try {
			const params = new URLSearchParams({ page, limit: 20 });
			if (search) params.append("search", search);

			const data = await this.apiCall(`/api/admin/posts?${params}`);
			this.renderPostsTable(data.posts);
			this.renderPagination("posts", data.pagination);
			this.currentPage.posts = page;
		} catch {
			this.showError("Failed to load posts");
		}
	}

	renderPostsTable(posts) {
		const container = document.getElementById("postsTable");

		container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Author</th>
              <th>Content</th>
              <th>Stats</th>
              <th>Posted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${posts
							.map(
								(post) => `
              <tr>
                <td>
                  <div class="d-flex align-items-center">
                    ${
											post.avatar
												? (
														() => {
															const radius =
																post.avatar_radius !== null &&
																post.avatar_radius !== undefined
																	? `${post.avatar_radius}px`
																	: post.gold
																		? `4px`
																		: `50px`;
															return `<img src="${post.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
														}
													)()
												: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center">
                        <i class="bi bi-person text-white"></i>
                      </div>`
										}
                    <div>
                      <strong>@${post.username}</strong>
                      ${
												this.isFlagSet(post.verified)
													? '<i class="bi bi-patch-check-fill text-primary"></i>'
													: ""
											}
                    </div>
                  </div>
                </td>
                <td>
                  <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                    ${
											post.is_article && post.article_title
												? `<strong>[Article]</strong> ${this.escapeHtml(
														post.article_title,
													)}`
												: post.content.length > 100
													? `${post.content
															.replaceAll("<", "&lt;")
															.replaceAll(">", "&gt;")
															.substring(0, 100)}…`
													: post.content
															.replaceAll("<", "&lt;")
															.replaceAll(">", "&gt;")
										}
                  </div>
                </td>
                <td>
                  <small>
                    Likes: ${post.like_count}<br>
                    Retweets: ${post.retweet_count}<br>
                    Replies: ${post.reply_count}
                  </small>
                </td>
                <td>
                  <small>${this.formatDate(post.created_at)}</small>
                </td>
                <td>
                  <div class="btn-group-vertical btn-group-sm">
                    <button class="btn btn-outline-primary btn-sm edit-post-btn" data-post-id="${
											post.id
										}">
                      <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn ${post.super_tweet ? "btn-warning" : "btn-outline-secondary"} btn-sm toggle-super-tweet-btn" data-post-id="${
											post.id
										}" data-super-tweet="${!!post.super_tweet}">
                      <i class="bi bi-star-fill"></i> ${post.super_tweet ? "Remove SuperTweeta" : "Make SuperTweeta"}
                    </button>
                    <button class="btn btn-outline-warning btn-sm add-factcheck-btn" data-post-id="${
											post.id
										}">
                      <i class="bi bi-exclamation-triangle"></i> Fact-Check
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-post-btn" data-post-id="${
											post.id
										}">
                      <i class="bi bi-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            `,
							)
							.join("")}
          </tbody>
        </table>
      </div>
    `;

		this.ensurePostsTableListener();
	}

	ensurePostsTableListener() {
		if (this.postsTableListenerAttached) return;
		const container = document.getElementById("postsTable");
		if (!container) return;
		container.addEventListener("click", (event) => {
			const button = event.target.closest(
				".edit-post-btn, .delete-post-btn, .add-factcheck-btn, .toggle-super-tweet-btn",
			);
			if (!button) return;
			const postId = button.dataset.postId;
			if (!postId) return;
			if (button.classList.contains("edit-post-btn")) {
				this.editPost(postId);
				return;
			}
			if (button.classList.contains("delete-post-btn")) {
				this.deletePost(postId);
				return;
			}
			if (button.classList.contains("add-factcheck-btn")) {
				this.addFactCheck(postId);
				return;
			}
			if (button.classList.contains("toggle-super-tweet-btn")) {
				this.toggleSuperTweet(postId, button.dataset.superTweet === "true");
			}
		});
		this.postsTableListenerAttached = true;
	}

	async searchPosts() {
		const search = document.getElementById("postSearch").value;
		this.loadPosts(1, search);
	}

	async loadSuspensions(page = 1) {
		try {
			const params = new URLSearchParams({ page, limit: 20 });
			const data = await this.apiCall(`/api/admin/suspensions?${params}`);
			this.renderSuspensionsTable(data.suspensions);
			this.renderPagination("suspensions", data.pagination);
			this.currentPage.suspensions = page;
		} catch {
			this.showError("Failed to load suspensions");
		}
	}

	renderSuspensionsTable(suspensions) {
		const container = document.getElementById("suspensionsTable");

		if (suspensions.length === 0) {
			container.innerHTML =
				'<p class="text-muted text-center">No active suspensions</p>';
			return;
		}

		container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>User</th>
              <th>Reason</th>
			  <th>Action</th>
              <th>By</th>
              <th>Date</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            ${suspensions
							.map(
								(suspension) => `
              <tr>
                <td>
                  <div class="d-flex align-items-center">
                    ${
											suspension.avatar
												? (
														() => {
															const radius =
																suspension.avatar_radius !== null &&
																suspension.avatar_radius !== undefined
																	? `${suspension.avatar_radius}px`
																	: suspension.gold
																		? `4px`
																		: `50px`;
															return `<img src="${suspension.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
														}
													)()
												: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center">
                        <i class="bi bi-person text-white"></i>
                      </div>`
										}
                    <div>
                      <strong>@${suspension.username}</strong>
                      ${
												suspension.name
													? `<br><small class="text-muted">${suspension.name
															.replaceAll("<", "&lt;")
															.replaceAll(">", "&gt;")}</small>`
													: ""
											}
                    </div>
                  </div>
                </td>
                <td>
                  <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;">
                    ${suspension.reason
											.replaceAll("<", "&lt;")
											.replaceAll(">", "&gt;")}
                  </div>
                  ${
										suspension.notes
											? `<small class="text-muted">Notes: ${suspension.notes
													.replaceAll("<", "&lt;")
													.replaceAll(">", "&gt;")}</small>`
											: ""
									}
                </td>
								<td>
									${
										suspension.action === "suspend"
											? '<span class="badge bg-danger">Suspended</span>'
											: suspension.action === "restrict"
												? '<span class="badge bg-warning">Restricted</span>'
												: `<span class="badge bg-secondary">${this.escapeHtml(suspension.action || "unknown")}</span>`
									}
								</td>
                <td>
                  <small>@${suspension.suspended_by_username}</small>
                </td>
                <td>
                  <small>${this.formatDate(suspension.created_at)}</small>
                </td>
                <td>
                  <small>${
										suspension.expires_at
											? this.formatDate(suspension.expires_at)
											: "Permanent"
									}</small>
                </td>
								<td>
									<button class="btn btn-outline-success btn-sm" onclick="adminPanel.showLiftModal('${
										suspension.user_id
									}', ['${suspension.action}'])">
										<i class="bi bi-check-circle"></i> Lift
									</button>
								</td>
              </tr>
            `,
							)
							.join("")}
          </tbody>
        </table>
      </div>
    `;
	}

	async loadBlocks(page = 1) {
		try {
			const params = new URLSearchParams({ page, limit: 50 });
			const data = await this.apiCall(`/api/admin/blocks?${params}`);
			this.renderBlocksTable(data.blocks);
			this.renderPagination("blocks", data.pagination);
			this.currentPage.blocks = page;
		} catch {
			this.showError("Failed to load blocks");
		}
	}

	renderBlocksTable(blocks) {
		const container = document.getElementById("blocksTable");

		if (blocks.length === 0) {
			container.innerHTML =
				'<p class="text-muted text-center">No active blocks</p>';
			return;
		}

		container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Blocker</th>
              <th>Blocked User</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${blocks
							.map(
								(block) => `
              <tr>
                <td>
                  <div class="d-flex align-items-center">
                    ${
											block.blocker_avatar
												? `<img src="${block.blocker_avatar}" class="user-avatar me-2" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">`
												: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                        <i class="bi bi-person text-white"></i>
                      </div>`
										}
                    <div>
                      <strong>@${block.blocker_username}</strong>
                      ${
												block.blocker_name
													? `<br><small class="text-muted">${this.escapeHtml(
															block.blocker_name,
														)}</small>`
													: ""
											}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="d-flex align-items-center">
                    ${
											block.blocked_avatar
												? `<img src="${block.blocked_avatar}" class="user-avatar me-2" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">`
												: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                        <i class="bi bi-person text-white"></i>
                      </div>`
										}
                    <div>
                      <strong>@${block.blocked_username}</strong>
                      ${
												block.blocked_name
													? `<br><small class="text-muted">${this.escapeHtml(
															block.blocked_name,
														)}</small>`
													: ""
											}
                    </div>
                  </div>
                </td>
                <td>
                  <small>${this.formatDate(block.created_at)}</small>
                </td>
              </tr>
            `,
							)
							.join("")}
          </tbody>
        </table>
      </div>
    `;
	}

	renderPagination(target, pagination, onPageChange) {
		if (!pagination) return;

		const totalPages = Math.max(1, Number(pagination.pages) || 1);
		let currentPage = Number(pagination.page) || 1;
		currentPage = Math.max(1, Math.min(totalPages, currentPage));

		const containerId =
			typeof onPageChange === "function" ? target : `${target}Pagination`;
		const container = document.getElementById(containerId);
		if (!container) return;

		container.innerHTML = "";
		if (totalPages <= 1) return;

		const triggerLoad = (page) => {
			const numeric = Number(page);
			if (!Number.isFinite(numeric)) return;
			const clamped = Math.max(1, Math.min(totalPages, Math.floor(numeric)));
			if (clamped === currentPage) return;

			currentPage = clamped;

			if (typeof onPageChange === "function") {
				onPageChange(clamped);
			} else if (typeof target === "string") {
				const methodName = `load${
					target.charAt(0).toUpperCase() + target.slice(1)
				}`;
				if (typeof this[methodName] === "function") {
					this[methodName](clamped);
				}
			}
		};

		const list = document.createElement("ul");
		list.className = "pagination justify-content-center align-items-center";

		const prevItem = document.createElement("li");
		prevItem.className = "page-item";
		if (currentPage === 1) prevItem.classList.add("disabled");
		const prevButton = document.createElement("button");
		prevButton.type = "button";
		prevButton.className = "page-link";
		prevButton.textContent = "Previous";
		prevButton.disabled = currentPage === 1;
		prevButton.addEventListener("click", () => {
			if (currentPage > 1) triggerLoad(currentPage - 1);
		});
		prevItem.appendChild(prevButton);
		list.appendChild(prevItem);

		const statusItem = document.createElement("li");
		statusItem.className = "page-item";
		const statusWrapper = document.createElement("div");
		statusWrapper.className =
			"page-link bg-light d-flex align-items-center gap-2";
		const label = document.createElement("span");
		label.textContent = "Page";
		const input = document.createElement("input");
		input.type = "number";
		input.min = "1";
		input.max = `${totalPages}`;
		input.value = `${currentPage}`;
		input.style.width = "60px";
		input.style.border = "1px solid #ccc";
		input.style.textAlign = "center";
		input.style.margin = "0 5px";
		input.addEventListener("change", () => triggerLoad(input.value));
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				triggerLoad(input.value);
			}
		});
		const totalText = document.createElement("span");
		totalText.textContent = `of ${totalPages}`;
		statusWrapper.appendChild(label);
		statusWrapper.appendChild(input);
		statusWrapper.appendChild(totalText);
		statusItem.appendChild(statusWrapper);
		list.appendChild(statusItem);

		const nextItem = document.createElement("li");
		nextItem.className = "page-item";
		if (currentPage === totalPages) nextItem.classList.add("disabled");
		const nextButton = document.createElement("button");
		nextButton.type = "button";
		nextButton.className = "page-link";
		nextButton.textContent = "Next";
		nextButton.disabled = currentPage === totalPages;
		nextButton.addEventListener("click", () => {
			if (currentPage < totalPages) triggerLoad(currentPage + 1);
		});
		nextItem.appendChild(nextButton);
		list.appendChild(nextItem);

		container.appendChild(list);
	}

	async showUserModal(userId) {
		try {
			const cached = this.userCache.get(userId);

			document.getElementById("userModalBody").innerHTML =
				`<div class="text-center py-5"><div class="spinner-border text-primary" role="status" style="border-radius:5000px"></div><div class="mt-2 text-muted">Loading user...</div></div>`;
			document.getElementById("userModalFooter").innerHTML =
				``;
			const modal = new bootstrap.Modal(document.getElementById("userModal"));
			modal.show();

			let userData;
			if (cached) {
				userData = await cached;
			} else {
				userData = await this.apiCall(`/api/admin/users/${userId}`);
			}

			if (userData.error) {
				throw new Error(userData.error);
			}

			const [blocksData, blockedByData] = await Promise.all([
				this.apiCall(`/api/admin/users/${userId}/blocks`).catch(() => ({
					blocks: [],
				})),
				this.apiCall(`/api/admin/users/${userId}/blocked-by`).catch(() => ({
					blockedBy: [],
				})),
			]);

			const { user, suspensions, recentPosts, affiliate } = userData;

			let creationTransparency = null;
			try {
				creationTransparency = user.account_creation_transparency
					? JSON.parse(user.account_creation_transparency)
					: null;
			} catch (_err) {
				creationTransparency = null;
			}
			let loginTransparency = null;
			try {
				loginTransparency = user.account_login_transparency
					? JSON.parse(user.account_login_transparency)
					: null;
			} catch (_err) {
				loginTransparency = null;
			}

			const creationTorFlag = creationTransparency?.country === "T1";
			const loginTorFlag = loginTransparency?.country === "T1";
			const loginCityValue = loginTorFlag ? "" : loginTransparency?.city || "";
			const loginCountryValue = loginTorFlag
				? ""
				: loginTransparency?.country || "";
			const loginLatitudeValue = loginTorFlag
				? ""
				: loginTransparency?.latitude || "";
			const loginLongitudeValue = loginTorFlag
				? ""
				: loginTransparency?.longitude || "";
			const loginTimezoneValue = loginTransparency?.timezone || "";
			const creationCityValue = creationTorFlag
				? ""
				: creationTransparency?.city || "";
			const creationCountryValue = creationTorFlag
				? ""
				: creationTransparency?.country || "";
			const creationLatitudeValue = creationTorFlag
				? ""
				: creationTransparency?.latitude || "";
			const creationLongitudeValue = creationTorFlag
				? ""
				: creationTransparency?.longitude || "";
			const creationTimezoneValue = creationTransparency?.timezone || "";
			const loginDatacenterWarningEnabled = !!loginTransparency?.vpn;
			const loginPreserveOverride = !!loginTransparency?.preserve_override;
			const creationDatacenterWarningEnabled = !!creationTransparency?.vpn;

			document.getElementById("userModalBody").innerHTML = `
        <div class="row">
          <div class="col-md-4 text-center">
            <img src="${
							user.avatar || "/public/shared/assets/default-avatar.svg"
						}" class="img-fluid mb-3" id="editProfileAvatarPreview" style="max-width: 150px; border-radius: ${
							user.avatar_radius !== null && user.avatar_radius !== undefined
								? `${user.avatar_radius}px`
								: user.gold
									? "4px"
									: "50%"
						};" alt="Avatar">
            <div class="mb-3">
              <label class="form-label">Change Avatar</label>
              <input type="file" class="form-control form-control-sm" id="editProfileAvatarFile" accept="image/*">
              <div class="d-flex gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-danger" id="editProfileAvatarRemoveBtn">Remove</button>
              </div>
            </div>
            <h4>
              ${this.escapeHtml(user.name || "")}
              ${
								!user.suspended
									? `${
											this.isFlagSet(user.verified)
												? '<i class="bi bi-patch-check-fill text-primary ms-2" title="Verified"></i>'
												: ""
										}${
											this.isFlagSet(user.gold)
												? '<i class="bi bi-patch-check-fill text-warning ms-1" title="Gold"></i>'
												: ""
										}${
											this.isFlagSet(user.gray)
												? '<i class="bi bi-patch-check-fill text-secondary ms-1" title="Gray Check"></i>'
												: ""
										}`
									: ""
							}
            </h4>
            <p class="text-muted">@${user.username}</p>
            <div class="d-flex justify-content-center gap-2 mb-3">
							${user.admin ? '<span class="badge bg-primary">Admin</span>' : ""}
							${
								(
									user.suspended
										? '<span class="badge bg-danger">Suspended</span>'
										: ""
								) +
								(
									user.restricted
										? '<span class="badge bg-warning">Restricted</span>'
										: ""
								) +
								(user.shadowbanned
									? '<span class="badge bg-secondary">Shadowbanned</span>'
									: "")
							}
            </div>
            <div class="mb-3">
              <label class="form-label">Banner</label>
              <img src="${user.banner || ""}" class="img-fluid mb-2 w-100" id="editProfileBannerPreview" style="max-height: 100px; object-fit: cover; ${user.banner ? "" : "display: none;"}">
              <input type="file" class="form-control form-control-sm" id="editProfileBannerFile" accept="image/*">
              <div class="d-flex gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-danger" id="editProfileBannerRemoveBtn">Remove</button>
              </div>
            </div>
          </div>
          <div class="col-md-8">
            <form id="editProfileForm">
              <input type="hidden" id="editProfileId" value="${user.id}">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Username</label>
                  <input type="text" class="form-control" id="editProfileUsername" value="${
										user.username
									}" readonly>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Display Name</label>
                  <input type="text" class="form-control" id="editProfileName" value="${
										user.name || ""
									}" readonly>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Bio</label>
                <textarea class="form-control" id="editProfileBio" rows="3" readonly>${
									user.bio || ""
								}</textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">Account Created</label>
                <input type="datetime-local" class="form-control" id="editProfileCreatedAt" value="" readonly />
                <small class="text-muted">Edit account creation date/time</small>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Real Followers</label>
                  <input type="number" class="form-control" value="${
										user.actual_follower_count
									}" readonly>
                  <small class="text-muted">Actual follows (read-only)</small>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Ghost Followers</label>
                  <input type="number" class="form-control" id="editProfileGhostFollowers" value="${
										user.ghost_follower_count || 0
									}" min="0">
                  <small class="text-muted">Current invisible ghost followers</small>
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Real Following</label>
                  <input type="number" class="form-control" value="${
										user.actual_following_count
									}" readonly>
                  <small class="text-muted">Actual follows (read-only)</small>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Ghost Following</label>
                  <input type="number" class="form-control" id="editProfileGhostFollowing" value="${
										user.ghost_following_count || 0
									}" min="0">
                  <small class="text-muted">Current invisible ghost following</small>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Users to Follow This User (comma-separated usernames)</label>
                <input type="text" class="form-control" id="editProfileForceFollow" placeholder="user1,user2,user3">
                <small class="text-muted">Make specified users automatically follow this user (creates real follows, works even if target doesn't exist yet)</small>
              </div>
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileVerified" ${
									this.isFlagSet(user.verified) ? "checked" : ""
								}>
                <label class="form-check-label">Verified</label>
              </div>
               <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileGold" ${
									this.isFlagSet(user.gold) ? "checked" : ""
								}>
                <label class="form-check-label">Gold</label>
              </div>
               <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileGray" ${
									this.isFlagSet(user.gray) ? "checked" : ""
								}>
                <label class="form-check-label">Gray</label>
              </div>
              <div class="mb-3" id="grayOutlinesSection">
                <label class="form-label">Checkmark Outline (CSS color/gradient)</label>
                <input type="text" class="form-control mb-2" id="editProfileCheckmarkOutline" value="${
									user.checkmark_outline || ""
								}" placeholder="e.g. red, #ff0000, linear-gradient(...)">
                <label class="form-label">Avatar Outline (CSS color/gradient)</label>
                <input type="text" class="form-control" id="editProfileAvatarOutline" value="${
									user.avatar_outline || ""
								}" placeholder="e.g. blue, #0000ff, linear-gradient(...)">
                <small class="text-muted">Outline colors or gradients (mainly for gray check users, but can be set for any user)</small>
              </div>
               <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileAdmin" ${
									user.admin ? "checked" : ""
								}>
                <label class="form-check-label">Admin</label>
              </div>
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileAffiliate" ${
									this.isFlagSet(user.affiliate) ? "checked" : ""
								}>
                <label class="form-check-label">Affiliate Badge</label>
              </div>
              <div class="mb-3" id="affiliateWithSection" style="${
								this.isFlagSet(user.affiliate) && user.affiliate_with
									? ""
									: "display: none;"
							}">
                <label class="form-label">Affiliated With Username</label>
                <input type="text" class="form-control" id="editProfileAffiliateWith" value="${
									user.affiliate_with_username || ""
								}" placeholder="Enter username">
                <small class="text-muted">The user this account is affiliated with</small>
              </div>
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="editProfileSuperTweeter" ${
									user.super_tweeter ? "checked" : ""
								}>
                <label class="form-check-label">SuperTweeter</label>
              </div>
              <div class="mb-3" id="superTweeterBoostSection" style="${
								user.super_tweeter ? "" : "display: none;"
							}">
                <label class="form-label">SuperTweeter Boost Multiplier</label>
                <input type="number" class="form-control" id="editProfileSuperTweeterBoost" value="${
									user.super_tweeter_boost || 50.0
								}" min="1" max="1000" step="0.1">
                <small class="text-muted">Visibility boost multiplier (1-1000x, default: 50)</small>
              </div>
              <div class="mb-3">
                <label class="form-label">Character Limit Override</label>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                  Current: ${
										user.character_limit ||
										(user.gray
											? "37,500 (Gray Default)"
											: user.gold
												? "16,500 (Gold Default)"
												: user.verified
													? "5,500 (Verified Default)"
													: "400 (Standard Default)")
									}
                </p>
                <input type="number" class="form-control" id="editProfileCharacterLimit" value="${
									user.character_limit || ""
								}" placeholder="Leave empty to use tier default" min="1">
                <small style="color: var(--text-secondary);">Tier defaults: 400 (Standard) | 5,500 (Verified) | 16,500 (Gold)</small>
              </div>
              
              <div class="card bg-body border-0 mt-4">
                <div class="card-body">
                  <h5 class="card-title mb-3">Permissions</h5>
                  <p class="text-muted small mb-3">Fine-grained feature access controls</p>
                  <div id="permissionsContainer">
                    <div class="form-check form-switch mb-2">
                      <input class="form-check-input permission-toggle" type="checkbox" id="perm_gif_avatar" data-permission="gif_avatar">
                      <label class="form-check-label" for="perm_gif_avatar">Allow GIF Avatars</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                      <input class="form-check-input permission-toggle" type="checkbox" id="perm_custom_outlines" data-permission="custom_outlines">
                      <label class="form-check-label" for="perm_custom_outlines">Allow Custom Outlines</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                      <input class="form-check-input permission-toggle" type="checkbox" id="perm_corner_radius" data-permission="corner_radius">
                      <label class="form-check-label" for="perm_corner_radius">Allow Custom Corner Radius</label>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="card bg-body border-0 mt-4">
                <div class="card-body">
                  <h5 class="card-title mb-3">Custom Badges</h5>
                  <p class="text-muted small mb-3">Assign or remove custom badges</p>
                  <div id="userBadgesContainer" class="mb-3"></div>
                  <div class="d-flex gap-2 align-items-center">
                    <select class="form-select form-select-sm" id="badgeSelector" style="max-width: 200px;">
                      <option value="">Select badge...</option>
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" id="assignBadgeBtn">Assign</button>
                  </div>
                </div>
              </div>

			  <div class="card bg-body border-0 mt-4">
				<div class="card-body">
				  <h5 class="card-title mb-3">Transparency Overrides</h5>
				  <div class="row g-4">
					<div class="col-md-6">
					  <h6 class="fw-bold">Last Login</h6>
					  <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
						<button type="button" class="btn btn-outline-primary btn-sm location-picker-btn" data-location-picker="login" data-location-control="true">
						  <i class="bi bi-map"></i>
						  Pick via Leaflet Maps
						</button>
						<button type="button" class="btn btn-outline-secondary btn-sm location-clear-btn" data-location-clear="login" data-location-control="true">
						  Clear
						</button>
					  </div>
					  <div class="mb-3">
						<div class="small text-muted" id="loginLocationPreview"></div>
					  </div>
					  <div class="mb-3">
						<label class="form-label">City</label>
						<input type="text" class="form-control" id="editProfileLoginCity" value="${this.escapeHtml(
							loginCityValue,
						)}">
					  </div>
					  <div class="mb-3">
						<label class="form-label">Country / Region</label>
						<input type="text" class="form-control" id="editProfileLoginCountry" value="${this.escapeHtml(
							loginCountryValue,
						)}">
					  </div>
					  <div class="row">
						<div class="col-md-6 mb-3">
						  <label class="form-label">Latitude</label>
						  <input type="text" class="form-control" id="editProfileLoginLatitude" value="${this.escapeHtml(
								loginLatitudeValue,
							)}">
						</div>
						<div class="col-md-6 mb-3">
						  <label class="form-label">Longitude</label>
						  <input type="text" class="form-control" id="editProfileLoginLongitude" value="${this.escapeHtml(
								loginLongitudeValue,
							)}">
						</div>
					  </div>
					  <div class="mb-3">
						<label class="form-label">Timezone</label>
						<input type="text" class="form-control" id="editProfileLoginTimezone" value="${this.escapeHtml(
							loginTimezoneValue,
						)}" placeholder="e.g. America/New_York">
					  </div>
					  <div class="form-check form-switch mb-1">
						<input class="form-check-input" type="checkbox" id="editProfileLoginTor" ${
							loginTorFlag ? "checked" : ""
						}>
						<label class="form-check-label">Last login via Tor</label>
					  </div>
					<div class="form-check form-switch mb-1">
						<input class="form-check-input" type="checkbox" id="editProfileLoginDatacenterWarning" ${
							loginDatacenterWarningEnabled ? "checked" : ""
						}>
						<label class="form-check-label">Datacenter warning</label>
					</div>
					  <div class="form-check form-switch mb-1">
						<input class="form-check-input" type="checkbox" id="editProfileLoginPreserveOverride" ${
							loginPreserveOverride ? "checked" : ""
						}>
						<label class="form-check-label">Preserve overrides across logins</label>
					  </div>
					  <small class="text-muted">Update login transparency data that appears on the user's profile.</small>
					</div>
					<div class="col-md-6">
					  <h6 class="fw-bold">Account Creation</h6>
					  <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
						<button type="button" class="btn btn-outline-primary btn-sm location-picker-btn" data-location-picker="creation" data-location-control="true">
						  <i class="bi bi-map"></i>
						  Pick via Leaflet Maps
						</button>
						<button type="button" class="btn btn-outline-secondary btn-sm location-clear-btn" data-location-clear="creation" data-location-control="true">
						  Clear
						</button>
					  </div>
					  <div class="mb-3">
						<div class="small text-muted" id="creationLocationPreview"></div>
					  </div>
					  <div class="mb-3">
						<label class="form-label">City</label>
						<input type="text" class="form-control" id="editProfileCreationCity" value="${this.escapeHtml(
							creationCityValue,
						)}">
					  </div>
					  <div class="mb-3">
						<label class="form-label">Country / Region</label>
						<input type="text" class="form-control" id="editProfileCreationCountry" value="${this.escapeHtml(
							creationCountryValue,
						)}">
					  </div>
					  <div class="row">
						<div class="col-md-6 mb-3">
						  <label class="form-label">Latitude</label>
						  <input type="text" class="form-control" id="editProfileCreationLatitude" value="${this.escapeHtml(
								creationLatitudeValue,
							)}">
						</div>
						<div class="col-md-6 mb-3">
						  <label class="form-label">Longitude</label>
						  <input type="text" class="form-control" id="editProfileCreationLongitude" value="${this.escapeHtml(
								creationLongitudeValue,
							)}">
						</div>
					  </div>
					  <div class="mb-3">
						<label class="form-label">Timezone</label>
						<input type="text" class="form-control" id="editProfileCreationTimezone" value="${this.escapeHtml(
							creationTimezoneValue,
						)}" placeholder="e.g. UTC">
					  </div>
					  <div class="form-check form-switch mb-1">
						<input class="form-check-input" type="checkbox" id="editProfileCreationTor" ${
							creationTorFlag ? "checked" : ""
						}>
						<label class="form-check-label">Created via Tor</label>
					  </div>
					<div class="form-check form-switch mb-1">
						<input class="form-check-input" type="checkbox" id="editProfileCreationDatacenterWarning" ${
							creationDatacenterWarningEnabled ? "checked" : ""
						}>
						<label class="form-check-label">Datacenter warning</label>
					</div>
					  <small class="text-muted">Control the origin data shown in transparency modals.</small>
					</div>
				  </div>
				</div>
			  </div>
            </form>

            <div class="mt-4">
              <h5>Affiliate Management</h5>
              <div class="mb-3">
                <label class="form-label">Send Affiliate Request</label>
                <div class="input-group">
                  <span class="input-group-text">@</span>
                  <input type="text" class="form-control" id="affiliateRequestTarget" placeholder="target username">
                  <button class="btn btn-outline-primary" type="button" onclick="adminPanel.sendAffiliateRequest('${
										user.id
									}')">Send</button>
                </div>
              </div>
              <div id="affiliateRequestsList">
                ${this.buildAffiliateRequestHtml(affiliate, user.id)}
              </div>
            </div>
            
            <h5>Recent Posts</h5>
            <div class="mb-3" style="max-height: 200px; overflow-y: auto;">
              ${
								recentPosts?.length
									? recentPosts
											.map(
												(post) => `
                <div class="border-bottom pb-2 mb-2">
                  <small class="text-muted">${this.formatDate(
										post.created_at,
									)}</small>
                  <p class="mb-1">${post.content
										.replaceAll("<", "&lt;")
										.replaceAll(">", "&gt;")}</p>
                  <small>Likes: ${post.like_count} | Retweets: ${
										post.retweet_count
									} | Replies: ${post.reply_count}</small>
                </div>
              `,
											)
											.join("")
									: '<p class="text-muted">No recent posts</p>'
							}
            </div>

            ${
							suspensions?.length
								? `
              <h5>Suspension History</h5>
              <div style="max-height: 200px; overflow-y: auto;">
                ${suspensions
									.map(
										(suspension) => `
                  <div class="border-bottom pb-2 mb-2">
                    <div class="d-flex justify-content-between">
					  <strong>${this.escapeHtml(suspension.action === "suspend" ? "Suspended" : suspension.action === "restrict" ? "Restricted" : suspension.action || "Unknown")}</strong>
                      <span class="badge ${
												suspension.status === "active"
													? "bg-danger"
													: suspension.status === "lifted"
														? "bg-success"
														: "bg-secondary"
											}">
                        ${suspension.status}
                      </span>
                    </div>
                    <p class="mb-1">${suspension.reason}</p>
                    <small class="text-muted">
                      ${this.formatDate(suspension.created_at)} by ${
												suspension.suspended_by_username || "Unknown"
											}
                      ${
												suspension.expires_at
													? ` | Expires: ${this.formatDate(
															suspension.expires_at,
														)}`
													: " | Permanent"
											}
                    </small>
                  </div>
                `,
									)
									.join("")}
              </div>
            `
								: ""
						}

            ${
							userData.ipHistory?.length
								? `
              <h5 class="mt-4">IP History</h5>
              <div style="max-height: 200px; overflow-y: auto;">
                <table class="table table-sm table-striped">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Use Count</th>
                      <th>Last Used</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${userData.ipHistory
											.map(
												(ip) => `
                      <tr>
                        <td><a href="https://ipinfo.io/${this.escapeHtml(ip.ip_address)}" target="_blank"><code>${this.escapeHtml(ip.ip_address)}</code></a></td>
                        <td>${ip.use_count}</td>
                        <td>${this.formatDate(ip.last_used_at)}</td>
                        <td>
                          <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-danger" onclick="adminPanel.banIpAddress('${ip.ip_address}', 'delete')">Preview & Ban IP (Delete Users)</button>
                            <button class="btn btn-outline-warning" onclick="adminPanel.banIpAddress('${ip.ip_address}', 'suspend')">Preview & Ban IP (Suspend Users)</button>
                          </div>
                        </td>
                      </tr>
                    `,
											)
											.join("")}
                  </tbody>
                </table>
              </div>
            `
								: ""
						}
						
            ${
							blocksData?.blocks?.length || blockedByData?.blockedBy?.length
								? `
              <h5 class="mt-4">Blocking Information</h5>
              ${
								blocksData?.blocks?.length
									? `
                <h6>Users Blocked by @${this.escapeHtml(user.username)} (${blocksData.blocks.length})</h6>
                <div style="max-height: 200px; overflow-y: auto;" class="mb-3">
                  ${blocksData.blocks
										.map(
											(b) => `
                    <div class="d-flex align-items-center mb-2 border-bottom pb-2">
                      ${
												b.avatar
													? `<img src="${b.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: 50%; width: 32px; height: 32px;">`
													: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;"><i class="bi bi-person text-white"></i></div>`
											}
                      <div>
                        <strong style="cursor: pointer; color: #0d6efd;" onclick="adminPanel.findAndViewUser('${this.escapeHtml(
													b.username,
												)}')">@${this.escapeHtml(b.username)}</strong>
                        ${b.name ? `<br><small class="text-muted">${this.escapeHtml(b.name)}</small>` : ""}
                        <br><small class="text-muted">Blocked ${this.formatDate(b.created_at)}</small>
                      </div>
                    </div>
                  `,
										)
										.join("")}
                </div>
              `
									: ""
							}
              ${
								blockedByData?.blockedBy?.length
									? `
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <h6 class="mb-0">Users Who Blocked @${this.escapeHtml(user.username)} (${blockedByData.blockedBy.length})</h6>
                  <button type="button" class="btn btn-danger btn-sm" id="massDeleteBlockersBtn" disabled onclick="adminPanel.massDeleteBlockers('${user.id}')">
                    <i class="bi bi-trash"></i> Delete Selected (<span id="blockerDeleteCount">0</span>)
                  </button>
                </div>
                <div style="max-height: 200px; overflow-y: auto;">
                  ${blockedByData.blockedBy
										.map(
											(b) => `
                    <div class="d-flex align-items-center mb-2 border-bottom pb-2">
                      <input type="checkbox" class="form-check-input me-2 blocker-checkbox" value="${b.user_id}" onchange="adminPanel.updateBlockerDeleteCount()">
                      ${
												b.avatar
													? `<img src="${b.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: 50%; width: 32px; height: 32px;">`
													: `<div class="user-avatar me-2 bg-secondary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;"><i class="bi bi-person text-white"></i></div>`
											}
                      <div>
                        <strong style="cursor: pointer; color: #0d6efd;" onclick="adminPanel.findAndViewUser('${this.escapeHtml(
													b.username,
												)}')">@${this.escapeHtml(b.username)}</strong>
                        ${b.name ? `<br><small class="text-muted">${this.escapeHtml(b.name)}</small>` : ""}
                        <br><small class="text-muted">Blocked ${this.formatDate(b.created_at)}</small>
                      </div>
                    </div>
                  `,
										)
										.join("")}
                </div>
              `
									: ""
							}
            `
								: ""
						}
          </div>
        </div>
      `;

			document.getElementById("userModalFooter").innerHTML = `
        <button type="button" class="btn btn-primary" id="editProfileBtn" onclick="adminPanel.toggleEditMode(true)">Edit Profile</button>
        <button type="button" class="btn btn-success d-none" id="saveProfileBtn" onclick="adminPanel.saveProfile('${
					user.id
				}')">Save Changes</button>
        <div class="btn-group">
          <button type="button" class="btn btn-warning dropdown-toggle" data-bs-toggle="dropdown">
            Actions
          </button>
					<ul class="dropdown-menu dropdown-menu-end">
						    <li><a class="dropdown-item" href="#" onclick="adminPanel.showSuspensionModal('${user.id}')">Moderate User</a></li>
						    ${user.suspended || user.restricted || user.shadowbanned ? `<li><a class="dropdown-item" href="#" onclick="adminPanel.showLiftModal('${user.id}')">Lift (Unsuspend/Unrestrict/Unshadowban)</a></li>` : ``}
            <li><a class="dropdown-item text-danger" href="#" onclick="adminPanel.deleteUser('${
							user.id
						}', '@${user.username}')">Delete User</a></li>
          </ul>
        </div>
      `;

			this.toggleEditMode(false);

			const createdInput = document.getElementById("editProfileCreatedAt");
			if (createdInput) {
				try {
					const d = new Date(user.created_at);
					const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
						.toISOString()
						.slice(0, 16);
					createdInput.value = isoLocal;
				} catch (_err) {
					createdInput.value = "";
				}
			}

			const verifiedCheckbox = document.getElementById("editProfileVerified");
			const goldCheckbox = document.getElementById("editProfileGold");
			const grayCheckboxEl = document.getElementById("editProfileGray");

			if (verifiedCheckbox && goldCheckbox && grayCheckboxEl) {
				const newVerified = verifiedCheckbox.cloneNode(true);
				verifiedCheckbox.parentNode.replaceChild(newVerified, verifiedCheckbox);

				const newGold = goldCheckbox.cloneNode(true);
				goldCheckbox.parentNode.replaceChild(newGold, goldCheckbox);

				const newGrayEl = grayCheckboxEl.cloneNode(true);
				grayCheckboxEl.parentNode.replaceChild(newGrayEl, grayCheckboxEl);

				const vCheckbox = document.getElementById("editProfileVerified");
				const gCheckbox = document.getElementById("editProfileGold");
				const grCheckbox = document.getElementById("editProfileGray");

				vCheckbox.addEventListener("change", () => {
					if (vCheckbox.checked) {
						gCheckbox.checked = false;
						grCheckbox.checked = false;
					}
				});

				gCheckbox.addEventListener("change", () => {
					if (gCheckbox.checked) {
						vCheckbox.checked = false;
						grCheckbox.checked = false;
					}
				});

				grCheckbox.addEventListener("change", () => {
					if (grCheckbox.checked) {
						vCheckbox.checked = false;
						gCheckbox.checked = false;
					}
				});
			}

			const affiliateCheckbox = document.getElementById("editProfileAffiliate");
			const affiliateWithSection = document.getElementById(
				"affiliateWithSection",
			);

			if (affiliateCheckbox && affiliateWithSection) {
				const newAffiliate = affiliateCheckbox.cloneNode(true);
				affiliateCheckbox.parentNode.replaceChild(
					newAffiliate,
					affiliateCheckbox,
				);

				const aCheckbox = document.getElementById("editProfileAffiliate");

				aCheckbox.addEventListener("change", () => {
					const section = document.getElementById("affiliateWithSection");
					if (aCheckbox.checked) {
						section.style.display = "block";
					} else {
						section.style.display = "none";
						const affiliateWithInput = document.getElementById(
							"editProfileAffiliateWith",
						);
						if (affiliateWithInput) affiliateWithInput.value = "";
					}
				});
			}

			const grayCheckbox = document.getElementById("editProfileGray");
			const grayOutlinesSection = document.getElementById(
				"grayOutlinesSection",
			);

			if (
				grayCheckbox &&
				grayOutlinesSection &&
				!grayCheckbox._grayListenerAttached
			) {
				grayCheckbox._grayListenerAttached = true;
			}

			const superTweeterCheckbox = document.getElementById(
				"editProfileSuperTweeter",
			);
			const superTweeterBoostSection = document.getElementById(
				"superTweeterBoostSection",
			);

			if (superTweeterCheckbox && superTweeterBoostSection) {
				const newSuperTweeter = superTweeterCheckbox.cloneNode(true);
				superTweeterCheckbox.parentNode.replaceChild(
					newSuperTweeter,
					superTweeterCheckbox,
				);

				const stCheckbox = document.getElementById("editProfileSuperTweeter");

				stCheckbox.addEventListener("change", () => {
					const section = document.getElementById("superTweeterBoostSection");
					if (stCheckbox.checked) {
						section.style.display = "block";
					} else {
						section.style.display = "none";
					}
				});
			}

			this.setupLocationPickerControls();
			this.syncLocationPreview("login");
			this.syncLocationPreview("creation");

			await this.loadUserPermissions(userId);
			await this.loadUserBadges(userId);
			await this.loadBadgeSelector();
			this.setupBadgeAssignButton(userId);
			this.setupAvatarBannerControls(userId);
		} catch (err) {
			console.error("showUserModal error:", err);
			this.showError(err.message || "Failed to load user details");
		}
	}

	setupAvatarBannerControls(userId) {
		const avatarRemoveBtn = document.getElementById(
			"editProfileAvatarRemoveBtn",
		);
		const avatarFileInput = document.getElementById("editProfileAvatarFile");
		const avatarPreview = document.getElementById("editProfileAvatarPreview");

		const bannerRemoveBtn = document.getElementById(
			"editProfileBannerRemoveBtn",
		);
		const bannerFileInput = document.getElementById("editProfileBannerFile");
		const bannerPreview = document.getElementById("editProfileBannerPreview");

		if (avatarFileInput) {
			avatarFileInput.addEventListener("change", async () => {
				const file = avatarFileInput?.files?.[0];
				if (!file) return;
				try {
					const cropped = await window.openImageCropper(file, {
						aspect: 1,
						size: 250,
					});
					if (cropped === window.CROP_CANCELLED) {
						avatarFileInput.value = "";
						return;
					}
					const formData = new FormData();
					formData.append("avatar", cropped);
					const result = await this.apiCallFormData(
						`/api/admin/users/${userId}/avatar`,
						formData,
					);
					if (result.error) throw new Error(result.error);
					if (result.avatar && avatarPreview) avatarPreview.src = result.avatar;
					this.showSuccess("Avatar updated");
				} catch (err) {
					this.showError(err.message || "Failed to upload avatar");
				} finally {
					avatarFileInput.value = "";
				}
			});
		}

		if (avatarRemoveBtn) {
			avatarRemoveBtn.addEventListener("click", async () => {
				if (!confirm("Remove avatar?")) return;
				try {
					const result = await this.apiCall(
						`/api/admin/users/${userId}/avatar`,
						{ method: "DELETE" },
					);
					if (result.error) throw new Error(result.error);
					if (avatarPreview)
						avatarPreview.src = "/public/shared/assets/default-avatar.svg";
					this.showSuccess("Avatar removed");
				} catch (err) {
					this.showError(err.message || "Failed to remove avatar");
				}
			});
		}

		if (bannerFileInput) {
			bannerFileInput.addEventListener("change", async () => {
				const file = bannerFileInput?.files?.[0];
				if (!file) return;
				try {
					const cropped = await window.openImageCropper(file, {
						aspect: 3,
						size: 1500,
					});
					if (cropped === window.CROP_CANCELLED) {
						bannerFileInput.value = "";
						return;
					}
					const formData = new FormData();
					formData.append("banner", cropped);
					const result = await this.apiCallFormData(
						`/api/admin/users/${userId}/banner`,
						formData,
					);
					if (result.error) throw new Error(result.error);
					if (result.banner && bannerPreview) {
						bannerPreview.src = result.banner;
						bannerPreview.style.display = "";
					}
					this.showSuccess("Banner updated");
				} catch (err) {
					this.showError(err.message || "Failed to upload banner");
				} finally {
					bannerFileInput.value = "";
				}
			});
		}

		if (bannerRemoveBtn) {
			bannerRemoveBtn.addEventListener("click", async () => {
				if (!confirm("Remove banner?")) return;
				try {
					const result = await this.apiCall(
						`/api/admin/users/${userId}/banner`,
						{ method: "DELETE" },
					);
					if (result.error) throw new Error(result.error);
					if (bannerPreview) {
						bannerPreview.src = "";
						bannerPreview.style.display = "none";
					}
					this.showSuccess("Banner removed");
				} catch (err) {
					this.showError(err.message || "Failed to remove banner");
				}
			});
		}
	}

	async apiCallFormData(endpoint, formData) {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
			body: formData,
		});
		const text = await response.text();
		let data;
		try {
			data = JSON.parse(text);
		} catch {
			throw new Error(text || "Failed to parse response");
		}
		if (!response.ok) {
			throw new Error(data.error || "Request failed");
		}
		return data;
	}

	async loadUserPermissions(userId) {
		try {
			const data = await this.apiCall(`/api/admin/users/${userId}/permissions`);
			const permissions = data.permissions || {};
			document.querySelectorAll(".permission-toggle").forEach((toggle) => {
				const perm = toggle.dataset.permission;
				toggle.checked = !!permissions[perm];
			});
		} catch (e) {
			console.error("Failed to load permissions:", e);
		}
	}

	async saveUserPermissions(userId) {
		const permissions = {};
		document.querySelectorAll(".permission-toggle").forEach((toggle) => {
			permissions[toggle.dataset.permission] = toggle.checked;
		});
		try {
			await this.apiCall(`/api/admin/users/${userId}/permissions`, {
				method: "PATCH",
				body: JSON.stringify({ permissions }),
			});
		} catch (e) {
			console.error("Failed to save permissions:", e);
		}
	}

	async loadBadgeSelector() {
		try {
			const data = await this.apiCall("/api/admin/badges");
			const selector = document.getElementById("badgeSelector");
			if (!selector) return;
			selector.innerHTML = '<option value="">Select badge...</option>';
			for (const badge of data.badges || []) {
				const opt = document.createElement("option");
				opt.value = badge.id;
				opt.textContent = badge.name;
				selector.appendChild(opt);
			}
		} catch (e) {
			console.error("Failed to load badges:", e);
		}
	}

	async loadUserBadges(userId) {
		try {
			const data = await this.apiCall(`/api/admin/users/${userId}/badges`);
			const container = document.getElementById("userBadgesContainer");
			if (!container) return;
			container.innerHTML = "";
			const badges = data.badges || [];
			if (badges.length === 0) {
				container.innerHTML =
					'<p class="text-muted small">No badges assigned</p>';
				return;
			}
			for (const badge of badges) {
				const badgeEl = document.createElement("div");
				badgeEl.className =
					"d-inline-flex align-items-center gap-2 badge bg-secondary me-2 mb-2 p-2";
				badgeEl.innerHTML = `
					<span style="width:16px;height:16px;display:inline-flex;">${badge.svg_content || ""}</span>
					<span>${this.escapeHtml(badge.name)}</span>
					<button type="button" class="btn-close btn-close-white" style="font-size: 0.6rem;" data-badge-id="${badge.badge_id}"></button>
				`;
				badgeEl
					.querySelector(".btn-close")
					.addEventListener("click", async (e) => {
						e.preventDefault();
						const badgeId = e.target.dataset.badgeId;
						await this.removeUserBadge(userId, badgeId);
					});
				container.appendChild(badgeEl);
			}
		} catch (e) {
			console.error("Failed to load user badges:", e);
		}
	}

	setupBadgeAssignButton(userId) {
		const btn = document.getElementById("assignBadgeBtn");
		if (!btn) return;
		const newBtn = btn.cloneNode(true);
		btn.parentNode.replaceChild(newBtn, btn);
		newBtn.addEventListener("click", async () => {
			const selector = document.getElementById("badgeSelector");
			if (!selector) return;
			const selected = Array.from(selector.selectedOptions)
				.map((opt) => opt.value)
				.filter(Boolean);
			if (selected.length === 0) return;
			let count = 0;
			for (const badgeId of selected) {
				try {
					await this.apiCall(`/api/admin/users/${userId}/badges`, {
						method: "POST",
						body: JSON.stringify({ badge_id: badgeId }),
					});
					count++;
				} catch {}
			}
			if (count > 0) {
				this.showSuccess(`Assigned ${count} badge(s)`);
				await this.loadUserBadges(userId);
			} else {
				this.showError("No badges assigned");
			}
			for (const opt of selector.options) opt.selected = false;
		});
	}

	async removeUserBadge(userId, badgeId) {
		if (!confirm("Remove this badge from the user?")) return;
		try {
			await this.apiCall(`/api/admin/users/${userId}/badges/${badgeId}`, {
				method: "DELETE",
			});
			this.showSuccess("Badge removed");
			this.userCache.delete(userId);
			await this.showUserModal(userId);
		} catch {
			this.showError("Failed to remove badge");
		}
	}

	async prefetchUser(userId) {
		if (!userId) return;
		if (this.userCache.has(userId)) return;

		const fetchPromise = (async () => {
			try {
				const data = await this.apiCall(`/api/admin/users/${userId}`);
				this.userCache.set(userId, data);
				return data;
			} catch {
				this.userCache.delete(userId);
				return null;
			}
		})();

		this.userCache.set(userId, fetchPromise);
	}

	setupLocationPickerControls() {
		const form = document.getElementById("editProfileForm");
		if (!form) return;
		form.querySelectorAll(".location-picker-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const target = btn.dataset.locationPicker;
				if (!target) return;
				this.openLocationPicker(target);
			});
		});
		form.querySelectorAll(".location-clear-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const target = btn.dataset.locationClear;
				if (!target) return;
				this.clearLocationInputs(target, true);
			});
		});
		for (const [key, fields] of Object.entries(this.locationFieldMap)) {
			const ids = [
				fields.city,
				fields.country,
				fields.latitude,
				fields.longitude,
				fields.timezone,
			];
			ids.forEach((id) => {
				const el = document.getElementById(id);
				if (!el) return;
				el.addEventListener("input", () => this.syncLocationPreview(key));
			});
			const torToggle = document.getElementById(fields.tor);
			if (torToggle) {
				torToggle.addEventListener("change", () =>
					this.syncLocationPreview(key),
				);
			}
		}
		form.querySelectorAll("[data-location-control]").forEach((btn) => {
			btn.disabled = !this.profileEditEnabled;
		});
	}

	syncLocationPreview(type) {
		const fields = this.locationFieldMap[type];
		if (!fields) return;
		const preview = document.getElementById(fields.preview);
		if (!preview) return;
		const city = document.getElementById(fields.city)?.value?.trim();
		const country = document.getElementById(fields.country)?.value?.trim();
		const lat = document.getElementById(fields.latitude)?.value?.trim();
		const lon = document.getElementById(fields.longitude)?.value?.trim();
		const tor = document.getElementById(fields.tor)?.checked;
		let summary = "No transparency override set.";
		if (tor) {
			summary = "Marked as Tor/hidden.";
		} else if (city || country) {
			summary = [city, country].filter(Boolean).join(", ");
		} else if (lat && lon) {
			summary = `Lat ${lat}, Lng ${lon}`;
		}
		preview.textContent = summary || "No transparency override set.";
	}

	clearLocationInputs(type, syncPreview = false) {
		const fields = this.locationFieldMap[type];
		if (!fields) return;
		[
			fields.city,
			fields.country,
			fields.latitude,
			fields.longitude,
			fields.timezone,
		].forEach((id) => {
			const el = document.getElementById(id);
			if (el) el.value = "";
		});
		const torToggle = document.getElementById(fields.tor);
		if (torToggle) torToggle.checked = false;
		if (syncPreview) this.syncLocationPreview(type);
	}

	setLocationInputs(type, data) {
		const fields = this.locationFieldMap[type];
		if (!fields) return;
		const cityInput = document.getElementById(fields.city);
		if (cityInput && data.city !== undefined) cityInput.value = data.city || "";
		const countryInput = document.getElementById(fields.country);
		if (countryInput && data.country !== undefined)
			countryInput.value = data.country || "";
		const latInput = document.getElementById(fields.latitude);
		if (latInput && data.latitude !== undefined)
			latInput.value = data.latitude || "";
		const lonInput = document.getElementById(fields.longitude);
		if (lonInput && data.longitude !== undefined)
			lonInput.value = data.longitude || "";
		const tzInput = document.getElementById(fields.timezone);
		if (tzInput && data.timezone !== undefined)
			tzInput.value = data.timezone || "";
		const torToggle = document.getElementById(fields.tor);
		if (torToggle && data.clearTor) torToggle.checked = false;
	}

	async ensureLeaflet() {
		if (this.leafletLoaded && window.L) return window.L;
		if (this.leafletLoadingPromise) return this.leafletLoadingPromise;
		const loader = (async () => {
			const cssUrls = [
				"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
				"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
			];
			const jsUrls = [
				"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
				"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
			];
			if (!document.querySelector("link[data-leaflet='1']")) {
				let cssLoaded = false;
				for (const url of cssUrls) {
					try {
						await this.loadStylesheet(url, { "data-leaflet": "1" });
						cssLoaded = true;
						break;
					} catch (_e) {}
				}
				if (!cssLoaded) {
					// Last-resort: try unpkg and await
					try {
						await this.loadStylesheet(cssUrls[1], { "data-leaflet": "1" });
						cssLoaded = true;
					} catch (_e) {}
				}
			}
			if (!window.L) {
				let jsLoaded = false;
				for (const url of jsUrls) {
					try {
						await this.loadScript(url, { "data-leaflet": "1" });
						jsLoaded = true;
						break;
					} catch (_e) {}
				}
				if (!jsLoaded) {
					// Last-resort: try unpkg and await
					try {
						await this.loadScript(jsUrls[1], { "data-leaflet": "1" });
						jsLoaded = true;
					} catch (_e) {}
				}
			}
			if (!window.L) throw new Error("Leaflet failed to initialize");
			this.leafletLoaded = true;
			return window.L;
		})();
		this.leafletLoadingPromise = loader;
		try {
			return await loader;
		} finally {
			if (this.leafletLoadingPromise === loader) {
				this.leafletLoadingPromise = null;
			}
		}
	}

	loadScript(src, attributes = {}) {
		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = src;
			script.async = true;
			script.defer = true;
			Object.entries(attributes).forEach(([key, value]) => {
				script.setAttribute(key, value);
			});
			script.addEventListener("load", () => resolve());
			script.addEventListener("error", () => {
				script.remove();
				reject(new Error(`Failed to load script: ${src}`));
			});
			document.head.appendChild(script);
		});
	}

	loadStylesheet(href, attributes = {}) {
		return new Promise((resolve, reject) => {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			Object.entries(attributes).forEach(([key, value]) => {
				link.setAttribute(key, value);
			});
			link.addEventListener("load", () => resolve());
			link.addEventListener("error", () => {
				link.remove();
				reject(new Error(`Failed to load stylesheet: ${href}`));
			});
			document.head.appendChild(link);
		});
	}

	prepareLocationPickerModal() {
		if (this.locationPickerModalInstance) return;
		const modalEl = document.getElementById("locationPickerModal");
		if (!modalEl) return;
		this.locationPickerModalInstance = new bootstrap.Modal(modalEl, {
			backdrop: "static",
		});
		this.locationPickerSummaryEl = document.getElementById(
			"locationPickerSummary",
		);
		this.locationPickerStatusEl = document.getElementById(
			"locationPickerStatus",
		);
		this.locationPickerApplyBtn = document.getElementById(
			"locationPickerApplyBtn",
		);
		this.locationPickerSearchInput = document.getElementById(
			"locationPickerSearch",
		);
		this.locationPickerSearchResultsEl = document.getElementById(
			"locationPickerResults",
		);
		if (this.locationPickerApplyBtn) {
			this.locationPickerApplyBtn.addEventListener("click", () =>
				this.applyLocationPickerSelection(),
			);
		}
		if (this.locationPickerSearchInput) {
			this.locationPickerSearchInput.addEventListener("input", (event) =>
				this.handleLocationSearchInput(event.target.value),
			);
			this.locationPickerSearchInput.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					this.handleLocationSearchInput(
						this.locationPickerSearchInput.value,
						true,
					);
				}
			});
		}
		modalEl.addEventListener("shown.bs.modal", () => {
			if (!this.locationPickerContext) return;
			this.initializeLocationPickerMap(this.locationPickerContext);
			if (this.locationPickerMap) {
				this.locationPickerMap.invalidateSize();
				setTimeout(() => {
					try {
						this.locationPickerMap.invalidateSize();
					} catch {}
				}, 120);
				if (this.activeLocationSelection) {
					this.locationPickerMap.setView(
						[
							this.activeLocationSelection.latitude,
							this.activeLocationSelection.longitude,
						],
						Math.max(this.locationPickerMap.getZoom() || 2, 4),
					);
				}
			}
			if (this.locationPickerSearchInput)
				this.locationPickerSearchInput.focus();
		});
		modalEl.addEventListener("hidden.bs.modal", () => {
			this.activeLocationSelection = null;
			this.locationPickerContext = null;
			if (this.locationPickerApplyBtn)
				this.locationPickerApplyBtn.disabled = true;
			if (this.locationPickerSummaryEl)
				this.locationPickerSummaryEl.textContent =
					"Click on the map or use the search box to choose a location.";
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = "";
			if (this.locationPickerSearchInput)
				this.locationPickerSearchInput.value = "";
			this.clearLocationSearchResults();
			this.abortLocationSearch();
			if (this.locationPickerMarker) {
				this.locationPickerMarker.remove?.();
				this.locationPickerMarker = null;
			}
		});
	}

	async openLocationPicker(type) {
		const fields = this.locationFieldMap[type];
		if (!fields) return;
		this.prepareLocationPickerModal();
		if (!this.locationPickerModalInstance) {
			this.showError("Location picker is unavailable right now");
			return;
		}
		try {
			await this.ensureLeaflet();
		} catch (err) {
			this.showError(err?.message || "Leaflet is unavailable right now");
			return;
		}
		const titleEl = document.getElementById("locationPickerTitle");
		if (titleEl) {
			titleEl.textContent =
				type === "login"
					? "Select Last Login Location"
					: "Select Account Creation Location";
		}
		if (this.locationPickerApplyBtn)
			this.locationPickerApplyBtn.disabled = true;
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "";
		if (this.locationPickerSummaryEl)
			this.locationPickerSummaryEl.textContent =
				"Click on the map or use the search box to choose a location.";
		if (this.locationPickerSearchInput)
			this.locationPickerSearchInput.value = "";
		this.clearLocationSearchResults();
		this.abortLocationSearch();
		this.locationPickerContext = type;
		this.locationPickerModalInstance.show();
	}

	initializeLocationPickerMap(type) {
		const leaflet = window.L;
		if (!leaflet) return;
		const mapEl = document.getElementById("locationPickerMap");
		if (!mapEl) return;
		if (!this.locationPickerMap) {
			this.locationPickerMap = leaflet.map(mapEl, {
				center: [20, 0],
				zoom: 2,
				zoomControl: true,
				attributionControl: true,
			});
			const tileLayers = [
				"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
				"https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
				"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
			];
			let tileLayerAdded = false;
			for (const url of tileLayers) {
				try {
					this.locationPickerTileLayer = leaflet.tileLayer(url, {
						maxZoom: 19,
						attribution:
							'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
					});
					this.locationPickerTileLayer.addTo(this.locationPickerMap);
					tileLayerAdded = true;
					break;
				} catch (_err) {}
			}
			if (!tileLayerAdded) {
				try {
					this.locationPickerTileLayer = leaflet
						.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
							maxZoom: 19,
							attribution:
								'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
						})
						.addTo(this.locationPickerMap);
				} catch {}
			}
			this.locationPickerMap.on("click", (event) => {
				if (!event?.latlng) return;
				this.handleLatLngSelection(event.latlng).catch(() => {});
			});
		} else {
			try {
				this.locationPickerMap.invalidateSize();
			} catch {}
		}
		const fields = this.locationFieldMap[type];
		const lat = parseFloat(document.getElementById(fields.latitude)?.value);
		const lng = parseFloat(document.getElementById(fields.longitude)?.value);
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			this.locationPickerMap.setView([lat, lng], 6);
			if (!this.locationPickerMarker) {
				this.locationPickerMarker = leaflet.marker([lat, lng]);
				this.locationPickerMarker.addTo(this.locationPickerMap);
			} else {
				this.locationPickerMarker.setLatLng([lat, lng]);
				if (!this.locationPickerMarker.getElement()) {
					this.locationPickerMarker.addTo(this.locationPickerMap);
				}
			}
		} else {
			this.locationPickerMap.setView([20, 0], 2);
			this.locationPickerMarker?.remove?.();
		}
	}

	async handleLatLngSelection(latLng, details = null) {
		const normalized = this.normalizeLatLng(latLng);
		if (!normalized) {
			this.showError("Unable to determine coordinates for that selection");
			return;
		}
		const token = ++this.locationPickerSelectionToken;
		const selection = {
			latitude: normalized.lat,
			longitude: normalized.lng,
			formattedAddress:
				details?.formattedAddress ||
				this.formatLatLngSummary(normalized.lat, normalized.lng),
			city: details?.city || null,
			country: details?.country || null,
			timezone: details?.timezone || null,
		};
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "Resolving location…";
		let resolved = null;
		try {
			resolved = await this.reverseGeocode(
				selection.latitude,
				selection.longitude,
			);
		} catch (_err) {}
		if (token !== this.locationPickerSelectionToken) return;
		if (resolved) {
			selection.formattedAddress =
				resolved.formattedAddress || selection.formattedAddress;
			selection.city = resolved.city || selection.city;
			selection.country = resolved.country || selection.country;
		}
		if (!selection.city || !selection.country) {
			const formattedParts = (selection.formattedAddress || "")
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean);
			if (!selection.city && formattedParts.length) {
				selection.city = formattedParts[0];
			}
			if (!selection.country && formattedParts.length) {
				selection.country = formattedParts[formattedParts.length - 1];
			}
		}
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "Resolving timezone…";
		if (
			Number.isFinite(selection.latitude) &&
			Number.isFinite(selection.longitude)
		) {
			try {
				const tzGuess = await this.lookupTimezone(
					selection.latitude,
					selection.longitude,
				);
				if (token !== this.locationPickerSelectionToken) return;
				if (tzGuess) selection.timezone = tzGuess;
			} catch (_err) {}
		}
		if (token !== this.locationPickerSelectionToken) return;
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "";
		this.setLocationPickerSelection(selection);
	}

	setLocationPickerSelection(selection) {
		this.activeLocationSelection = selection;
		if (selection && this.locationPickerMap) {
			if (!this.locationPickerMarker && window.L) {
				this.locationPickerMarker = window.L.marker([
					selection.latitude,
					selection.longitude,
				]);
			}
			if (this.locationPickerMarker) {
				this.locationPickerMarker.setLatLng([
					selection.latitude,
					selection.longitude,
				]);
				if (!this.locationPickerMarker.getElement()) {
					this.locationPickerMarker.addTo(this.locationPickerMap);
				}
			}
			this.locationPickerMap.panTo([selection.latitude, selection.longitude]);
			if (this.locationPickerMap.getZoom() < 6) {
				this.locationPickerMap.setZoom(6);
			}
		}
		if (this.locationPickerApplyBtn)
			this.locationPickerApplyBtn.disabled = false;
		this.updateLocationPickerSummary(
			selection?.formattedAddress ||
				this.formatLatLngSummary(selection.latitude, selection.longitude),
		);
	}

	updateLocationPickerSummary(text) {
		if (this.locationPickerSummaryEl)
			this.locationPickerSummaryEl.textContent = text;
	}

	formatLatLngSummary(lat, lng) {
		if (!Number.isFinite(lat) || !Number.isFinite(lng))
			return "Coordinates unavailable";
		return `Lat ${lat.toFixed(3)}, Lng ${lng.toFixed(3)}`;
	}

	async applyLocationPickerSelection() {
		if (!this.locationPickerContext || !this.activeLocationSelection) {
			this.showError("Select a location first");
			return;
		}
		if (this.locationPickerApplyBtn)
			this.locationPickerApplyBtn.disabled = true;
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "Applying selection…";
		try {
			let timezone = this.activeLocationSelection.timezone || null;
			if (
				!timezone &&
				Number.isFinite(this.activeLocationSelection.latitude) &&
				Number.isFinite(this.activeLocationSelection.longitude)
			) {
				timezone = await this.lookupTimezone(
					this.activeLocationSelection.latitude,
					this.activeLocationSelection.longitude,
				);
				this.activeLocationSelection.timezone = timezone || null;
			}
			const latString = Number.isFinite(this.activeLocationSelection.latitude)
				? this.activeLocationSelection.latitude.toFixed(6)
				: "";
			const lngString = Number.isFinite(this.activeLocationSelection.longitude)
				? this.activeLocationSelection.longitude.toFixed(6)
				: "";
			this.setLocationInputs(this.locationPickerContext, {
				city: this.activeLocationSelection.city,
				country: this.activeLocationSelection.country,
				latitude: latString,
				longitude: lngString,
				timezone: timezone || undefined,
				clearTor: true,
			});
			this.syncLocationPreview(this.locationPickerContext);
			this.locationPickerModalInstance?.hide();
		} catch (err) {
			this.showError(err?.message || "Failed to apply location");
		} finally {
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = "";
			if (this.locationPickerApplyBtn)
				this.locationPickerApplyBtn.disabled = false;
		}
	}

	normalizeLatLng(latLng) {
		if (!latLng) return null;
		if (typeof latLng.lat === "function" && typeof latLng.lng === "function") {
			return { lat: latLng.lat(), lng: latLng.lng() };
		}
		if (typeof latLng.lat === "number" && typeof latLng.lng === "number") {
			return { lat: latLng.lat, lng: latLng.lng };
		}
		if (
			typeof latLng.latitude === "number" &&
			typeof latLng.longitude === "number"
		) {
			return { lat: latLng.latitude, lng: latLng.longitude };
		}
		if (Array.isArray(latLng) && latLng.length === 2) {
			const [lat, lng] = latLng;
			if (Number.isFinite(lat) && Number.isFinite(lng)) {
				return { lat, lng };
			}
		}
		return null;
	}

	abortLocationSearch() {
		if (this.locationPickerSearchAbortController) {
			this.locationPickerSearchAbortController.abort();
			this.locationPickerSearchAbortController = null;
		}
		if (this.locationPickerSearchTimeout) {
			clearTimeout(this.locationPickerSearchTimeout);
			this.locationPickerSearchTimeout = null;
		}
	}

	handleLocationSearchInput(query, immediate = false) {
		const text = query?.trim() || "";
		if (text.length === 0) {
			this.abortLocationSearch();
			this.clearLocationSearchResults();
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = "";
			return;
		}
		if (text.length < 3) {
			this.abortLocationSearch();
			this.clearLocationSearchResults("Type at least 3 characters to search.");
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = "";
			return;
		}
		if (this.locationPickerSearchTimeout) {
			clearTimeout(this.locationPickerSearchTimeout);
		}
		const trigger = () => {
			this.runLocationSearch(text);
		};
		if (immediate) {
			trigger();
		} else {
			this.locationPickerSearchTimeout = setTimeout(trigger, 450);
		}
	}

	async runLocationSearch(query) {
		this.abortLocationSearch();
		if (this.locationPickerStatusEl)
			this.locationPickerStatusEl.textContent = "Searching…";
		const controller = new AbortController();
		this.locationPickerSearchAbortController = controller;
		try {
			const results = await this.performLocationSearch(query, controller);
			if (controller.signal.aborted) return;
			this.renderLocationSearchResults(results);
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = results.length
					? ""
					: "No matches found.";
		} catch (err) {
			if (controller.signal.aborted) return;
			this.showError(err?.message || "Location search failed");
			this.clearLocationSearchResults();
			if (this.locationPickerStatusEl)
				this.locationPickerStatusEl.textContent = "";
		} finally {
			if (this.locationPickerSearchAbortController === controller) {
				this.locationPickerSearchAbortController = null;
			}
		}
	}

	async performLocationSearch(query, controller) {
		const url = new URL("https://nominatim.openstreetmap.org/search");
		url.searchParams.set("format", "jsonv2");
		url.searchParams.set("limit", "5");
		url.searchParams.set("addressdetails", "1");
		url.searchParams.set("q", query);
		url.searchParams.set("email", "support@tweetapus.com");
		const response = await fetch(url.toString(), {
			headers: { Accept: "application/json" },
			signal: controller?.signal,
		});
		if (!response.ok) throw new Error("Search request failed");
		const data = await response.json();
		if (!Array.isArray(data)) return [];
		return data;
	}

	clearLocationSearchResults(message = "") {
		if (!this.locationPickerSearchResultsEl) return;
		this.locationPickerSearchResultsEl.innerHTML = "";
		if (message) {
			const note = document.createElement("div");
			note.className = "text-muted small";
			note.textContent = message;
			this.locationPickerSearchResultsEl.appendChild(note);
		}
	}

	renderLocationSearchResults(results) {
		if (!this.locationPickerSearchResultsEl) return;
		this.locationPickerSearchResultsEl.innerHTML = "";
		if (!results.length) return;
		results.forEach((entry) => {
			const latValue = Number.parseFloat(entry.lat);
			const lngValue = Number.parseFloat(entry.lon);
			if (!Number.isFinite(latValue) || !Number.isFinite(lngValue)) return;
			const button = document.createElement("button");
			button.type = "button";
			button.className =
				"btn btn-outline-light btn-sm w-100 text-start mb-2 location-search-result";
			const title = document.createElement("div");
			title.className = "fw-semibold";
			title.textContent = entry.display_name || "Unknown";
			const meta = document.createElement("div");
			meta.className = "small text-muted";
			const cityCandidate =
				entry.address?.city ||
				entry.address?.town ||
				entry.address?.village ||
				entry.address?.state ||
				"";
			const countryCandidate = entry.address?.country || "";
			meta.textContent = [cityCandidate, countryCandidate]
				.filter(Boolean)
				.join(" · ");
			button.appendChild(title);
			if (meta.textContent) button.appendChild(meta);
			button.addEventListener("click", () => {
				this.handleLatLngSelection(
					{ lat: latValue, lng: lngValue },
					{
						formattedAddress: entry.display_name,
						city: cityCandidate || null,
						country: countryCandidate || null,
					},
				).catch(() => {});
				if (this.locationPickerSearchInput)
					this.locationPickerSearchInput.value = entry.display_name || "";
			});
			this.locationPickerSearchResultsEl.appendChild(button);
		});
	}

	async reverseGeocode(lat, lng) {
		try {
			const cloudUrl = new URL(
				"https://api.bigdatacloud.net/data/reverse-geocode-client",
			);
			cloudUrl.searchParams.set("latitude", lat.toString());
			cloudUrl.searchParams.set("longitude", lng.toString());
			cloudUrl.searchParams.set("localityLanguage", "en");
			const response = await fetch(cloudUrl.toString(), {
				headers: { Accept: "application/json" },
			});
			if (response.ok) {
				const data = await response.json();
				if (data) {
					const formattedParts = [
						data.city || data.locality,
						data.principalSubdivision,
						data.countryName,
					]
						.filter(Boolean)
						.map((part) => part.trim());
					return {
						formattedAddress: formattedParts.length
							? formattedParts.join(", ")
							: null,
						city:
							data.city || data.locality || data.principalSubdivision || null,
						country: data.countryCode || data.countryName || null,
					};
				}
			}
		} catch (_err) {}
		try {
			const url = new URL("https://nominatim.openstreetmap.org/reverse");
			url.searchParams.set("format", "jsonv2");
			url.searchParams.set("lat", lat.toString());
			url.searchParams.set("lon", lng.toString());
			url.searchParams.set("zoom", "14");
			url.searchParams.set("addressdetails", "1");
			url.searchParams.set("email", "support@tweetapus.com");
			const response = await fetch(url.toString(), {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) return null;
			const data = await response.json();
			if (!data) return null;
			return {
				formattedAddress: data.display_name || null,
				city:
					data.address?.city ||
					data.address?.town ||
					data.address?.village ||
					data.address?.state ||
					null,
				country: data.address?.country || data.address?.country_code || null,
			};
		} catch {
			return null;
		}
	}

	async lookupTimezone(lat, lng) {
		const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
		if (this.timezoneCache.has(key)) return this.timezoneCache.get(key);
		const storeTimezone = (value) => {
			if (!value || typeof value !== "string") return null;
			const trimmed = value.trim();
			if (!trimmed) return null;
			this.timezoneCache.set(key, trimmed);
			return trimmed;
		};
		const attempts = [
			async () => {
				const url = new URL("https://api.open-meteo.com/v1/forecast");
				url.searchParams.set("latitude", lat.toString());
				url.searchParams.set("longitude", lng.toString());
				url.searchParams.set("timezone", "auto");
				url.searchParams.set("forecast_days", "1");
				url.searchParams.set("hourly", "temperature_2m");
				url.searchParams.set("past_days", "0");
				const response = await fetch(url.toString());
				if (!response.ok) return null;
				const data = await response.json();
				return data?.timezone || null;
			},
			async () => {
				const url = new URL("https://timeapi.io/api/TimeZone/coordinate");
				url.searchParams.set("latitude", lat.toString());
				url.searchParams.set("longitude", lng.toString());
				const response = await fetch(url.toString(), {
					headers: { Accept: "application/json" },
				});
				if (!response.ok) return null;
				const data = await response.json();
				return (
					data?.timeZone ||
					data?.timezone ||
					data?.timeZoneId ||
					data?.timeZoneName ||
					null
				);
			},
			async () => {
				const url = new URL("https://api.geonames.org/timezoneJSON");
				url.searchParams.set("lat", lat.toString());
				url.searchParams.set("lng", lng.toString());
				url.searchParams.set("username", "demo");
				const response = await fetch(url.toString(), {
					headers: { Accept: "application/json" },
				});
				if (!response.ok) return null;
				const data = await response.json();
				return data?.timezoneId || data?.timeZoneId || null;
			},
		];
		for (const attempt of attempts) {
			try {
				const candidate = await attempt();
				const stored = storeTimezone(candidate);
				if (stored) return stored;
			} catch (_err) {}
		}
		return null;
	}

	toggleEditMode(enable) {
		const form = document.getElementById("editProfileForm");
		if (!form) return;
		this.profileEditEnabled = enable;

		const controls = form.querySelectorAll("input, textarea, select");
		controls.forEach((field) => {
			if (field.id === "editProfileId" || field.type === "hidden") return;

			if (field.tagName === "BUTTON") return;

			if (
				field.tagName === "INPUT" &&
				["button", "submit", "reset", "file"].includes(field.type)
			)
				return;

			field.disabled = !enable;

			if (field.type === "checkbox") {
				if (!enable) {
					field.disabled = false;
					field.style.pointerEvents = "none";
					field.style.opacity = "0.6";
				} else {
					field.style.pointerEvents = "";
					field.style.opacity = "";
				}
			}

			if (field.id === "editProfileCreatedAt") {
				field.readOnly = !enable;
				field.disabled = !enable;
			}

			if (
				field.tagName === "TEXTAREA" ||
				(field.tagName === "INPUT" &&
					["text", "number", "email", "tel", "password"].includes(field.type))
			) {
				field.readOnly = !enable;
			}
		});

		const editBtn = document.getElementById("editProfileBtn");
		const saveBtn = document.getElementById("saveProfileBtn");
		if (editBtn) editBtn.classList.toggle("d-none", enable);
		if (saveBtn) saveBtn.classList.toggle("d-none", !enable);

		form.querySelectorAll("[data-location-control]").forEach((btn) => {
			btn.disabled = !enable;
		});

		if (enable) {
			const firstEditable = form.querySelector(
				"input:not([disabled]):not([type=hidden]), textarea:not([disabled])",
			);
			if (firstEditable) firstEditable.focus();
		}
	}

	async saveProfile(userId) {
		const usernameInput = document.getElementById("editProfileUsername");
		const nameInput = document.getElementById("editProfileName");
		const bioInput = document.getElementById("editProfileBio");
		const verifiedInput = document.getElementById("editProfileVerified");
		const goldInput = document.getElementById("editProfileGold");
		const grayInput = document.getElementById("editProfileGray");
		const adminInput = document.getElementById("editProfileAdmin");
		const affiliateInput = document.getElementById("editProfileAffiliate");

		const username = usernameInput?.value?.trim() || "";
		if (!username) {
			this.showError("Username cannot be empty");
			return;
		}
		if (/\s/.test(username)) {
			this.showError("Username cannot contain spaces");
			return;
		}
		if (usernameInput) usernameInput.value = username;

		const nameValue = nameInput?.value?.trim() || "";
		if (nameInput) nameInput.value = nameValue;

		const bioValue = bioInput?.value?.trim() || "";
		if (bioInput) bioInput.value = bioValue;

		const payload = {
			username,
			name: nameValue.length ? nameValue : null,
			bio: bioValue.length ? bioValue : null,
			verified: !!verifiedInput?.checked,
			gold: !!goldInput?.checked,
			gray: !!grayInput?.checked,
			admin: !!adminInput?.checked,
			affiliate: !!affiliateInput?.checked,
		};

		const checkmarkOutlineInput = document.getElementById(
			"editProfileCheckmarkOutline",
		);
		const avatarOutlineInput = document.getElementById(
			"editProfileAvatarOutline",
		);
		if (payload.gray) {
			payload.checkmark_outline = checkmarkOutlineInput?.value?.trim() || null;
			payload.avatar_outline = avatarOutlineInput?.value?.trim() || null;
		}

		const affiliateWithInput = document.getElementById(
			"editProfileAffiliateWith",
		);
		if (payload.affiliate && affiliateWithInput?.value) {
			const affiliateUsername = affiliateWithInput.value.trim();
			if (affiliateUsername) {
				payload.affiliate_with_username = affiliateUsername;
				affiliateWithInput.value = affiliateUsername;
			}
		}

		const ghostFollowersInput = document.getElementById(
			"editProfileGhostFollowers",
		);
		if (ghostFollowersInput?.value) {
			const count = parseInt(ghostFollowersInput.value) || 0;
			if (count > 0) {
				payload.ghost_followers = count;
			}
		}

		const ghostFollowingInput = document.getElementById(
			"editProfileGhostFollowing",
		);
		if (ghostFollowingInput?.value) {
			const count = parseInt(ghostFollowingInput.value) || 0;
			if (count > 0) {
				payload.ghost_following = count;
			}
		}

		const characterLimitInput = document.getElementById(
			"editProfileCharacterLimit",
		);
		if (characterLimitInput?.value?.trim()) {
			const charLimit = parseInt(characterLimitInput.value);
			if (!Number.isNaN(charLimit) && charLimit > 0) {
				payload.character_limit = charLimit;
			}
		} else {
			payload.character_limit = null;
		}

		const forceFollowInput = document.getElementById("editProfileForceFollow");
		if (forceFollowInput?.value?.trim()) {
			const usernames = forceFollowInput.value
				.split(",")
				.map((u) => u.trim())
				.filter((u) => u.length > 0);
			if (usernames.length > 0) {
				payload.force_follow_usernames = usernames;
			}
		}

		const loginCityInput = document.getElementById("editProfileLoginCity");
		if (loginCityInput) {
			const value = loginCityInput.value.trim();
			payload.login_city = value.length ? value : null;
			loginCityInput.value = value;
		}
		const loginCountryInput = document.getElementById(
			"editProfileLoginCountry",
		);
		if (loginCountryInput) {
			const value = loginCountryInput.value.trim();
			payload.login_country = value.length ? value : null;
			loginCountryInput.value = value;
		}
		const loginLatitudeInput = document.getElementById(
			"editProfileLoginLatitude",
		);
		if (loginLatitudeInput) {
			const value = loginLatitudeInput.value.trim();
			payload.login_latitude = value.length ? value : null;
			loginLatitudeInput.value = value;
		}
		const loginLongitudeInput = document.getElementById(
			"editProfileLoginLongitude",
		);
		if (loginLongitudeInput) {
			const value = loginLongitudeInput.value.trim();
			payload.login_longitude = value.length ? value : null;
			loginLongitudeInput.value = value;
		}
		const loginTimezoneInput = document.getElementById(
			"editProfileLoginTimezone",
		);
		if (loginTimezoneInput) {
			const value = loginTimezoneInput.value.trim();
			payload.login_timezone = value.length ? value : null;
			loginTimezoneInput.value = value;
		}
		const loginTorInput = document.getElementById("editProfileLoginTor");
		if (loginTorInput) {
			payload.login_tor = !!loginTorInput.checked;
		}
		const loginWarningInput = document.getElementById(
			"editProfileLoginDatacenterWarning",
		);
		if (loginWarningInput) {
			payload.login_datacenter_warning = !!loginWarningInput.checked;
		}
		const loginPreserveOverrideInput = document.getElementById(
			"editProfileLoginPreserveOverride",
		);
		if (loginPreserveOverrideInput) {
			payload.login_preserve_override = !!loginPreserveOverrideInput.checked;
		}

		const creationCityInput = document.getElementById(
			"editProfileCreationCity",
		);
		if (creationCityInput) {
			const value = creationCityInput.value.trim();
			payload.creation_city = value.length ? value : null;
			creationCityInput.value = value;
		}
		const creationCountryInput = document.getElementById(
			"editProfileCreationCountry",
		);
		if (creationCountryInput) {
			const value = creationCountryInput.value.trim();
			payload.creation_country = value.length ? value : null;
			creationCountryInput.value = value;
		}
		const creationLatitudeInput = document.getElementById(
			"editProfileCreationLatitude",
		);
		if (creationLatitudeInput) {
			const value = creationLatitudeInput.value.trim();
			payload.creation_latitude = value.length ? value : null;
			creationLatitudeInput.value = value;
		}
		const creationLongitudeInput = document.getElementById(
			"editProfileCreationLongitude",
		);
		if (creationLongitudeInput) {
			const value = creationLongitudeInput.value.trim();
			payload.creation_longitude = value.length ? value : null;
			creationLongitudeInput.value = value;
		}
		const creationTimezoneInput = document.getElementById(
			"editProfileCreationTimezone",
		);
		if (creationTimezoneInput) {
			const value = creationTimezoneInput.value.trim();
			payload.creation_timezone = value.length ? value : null;
			creationTimezoneInput.value = value;
		}
		const creationTorInput = document.getElementById("editProfileCreationTor");
		if (creationTorInput) {
			payload.creation_tor = !!creationTorInput.checked;
		}
		const creationWarningInput = document.getElementById(
			"editProfileCreationDatacenterWarning",
		);
		if (creationWarningInput) {
			payload.creation_datacenter_warning = !!creationWarningInput.checked;
		}

		try {
			const createdInput = document.getElementById("editProfileCreatedAt");
			if (createdInput?.value) {
				const local = new Date(createdInput.value);
				payload.created_at = local.toISOString();
			}

			const result = await this.apiCall(`/api/admin/users/${userId}`, {
				method: "PATCH",
				body: JSON.stringify(payload),
			});

			const superTweeterInput = document.getElementById(
				"editProfileSuperTweeter",
			);
			const superTweeterBoostInput = document.getElementById(
				"editProfileSuperTweeterBoost",
			);
			if (superTweeterInput) {
				const isSuperTweeter = !!superTweeterInput.checked;
				const boost = parseFloat(superTweeterBoostInput?.value) || 50.0;
				await this.apiCall(`/api/admin/users/${userId}/super-tweeter`, {
					method: "PATCH",
					body: JSON.stringify({
						super_tweeter: isSuperTweeter,
						boost: boost,
					}),
				});
			}

			await this.saveUserPermissions(userId);

			if (result?.token) {
				localStorage.setItem("authToken", result.token);
				this.token = result.token;
			}

			if (result?.updatedUser) {
				this.currentUser = {
					...(this.currentUser || {}),
					...result.updatedUser,
				};
				if (result.updatedUser.username && usernameInput) {
					usernameInput.value = result.updatedUser.username;
				}
				if (result.updatedUser.name !== undefined && nameInput) {
					nameInput.value = result.updatedUser.name || "";
				}
				if (result.updatedUser.bio !== undefined && bioInput) {
					bioInput.value = result.updatedUser.bio || "";
				}
			}

			try {
				this.userCache.delete(userId);
			} catch {}

			this.showSuccess("Profile updated successfully");
			this.toggleEditMode(false);
			this.loadUsers(this.currentPage.users);
			bootstrap.Modal.getInstance(document.getElementById("userModal")).hide();
		} catch (error) {
			this.showError(error.message);
		}
	}

	async showSuspensionModal(
		userId,
		defaultAction = "suspend",
		liftDefaults = null,
	) {
		document.getElementById("suspendUserId").value = userId;
		const form = document.getElementById("suspensionForm");
		if (form) form.reset();
		// Prefill action and disable options that represent already-applied statuses
		try {
			const cached = this.userCache.get(userId);
			let userData;
			if (cached && typeof cached.then === "function") {
				userData = await cached;
			} else if (cached) {
				userData = cached;
			} else {
				userData = await this.apiCall(`/api/admin/users/${userId}`);
			}
			const user = userData?.user || {};

			const actionSelect = document.getElementById("suspensionAction");
			if (actionSelect) {
				// Reset all options: we will disable ones that are already active
				for (const opt of Array.from(actionSelect.options)) {
					opt.disabled = false;
				}
				// Cannot re-apply the same active state
				if (user.suspended || user.restricted || user.shadowbanned) {
					const opt = actionSelect.querySelector("option[value='suspend']");
					if (opt) {
						opt.disabled = true;
						opt.title = "Cannot suspend while restricted or shadowbanned";
					}
				}
				if (user.restricted) {
					const opt = actionSelect.querySelector("option[value='restrict']");
					if (opt) opt.disabled = true;
				}
				if (user.shadowbanned) {
					const opt = actionSelect.querySelector("option[value='shadowban']");
					if (opt) opt.disabled = true;
				}
				// If the default action is disabled, fall back to 'suspend' or first available
				let toSet = defaultAction;
				const selectedOpt = actionSelect.querySelector(
					`option[value='${toSet}']`,
				);
				if (!selectedOpt || selectedOpt.disabled) {
					// pick first non-disabled option
					const available = Array.from(actionSelect.options).find(
						(o) => !o.disabled,
					);
					toSet = available ? available.value : defaultAction;
				}
				actionSelect.value = toSet;
				// Update modal title/button now
				this.updateSuspensionModalForAction(toSet);
				// Update on change
				actionSelect.onchange = (e) => {
					const v = e.target.value;
					this.updateSuspensionModalForAction(v);
				};
				// Pre-populate lift checkboxes (if present) based on user state
				const liftSuspendCb = document.getElementById("liftSuspendCheckbox");
				const liftRestrictCb = document.getElementById("liftRestrictCheckbox");
				const liftShadowbanCb = document.getElementById(
					"liftShadowbanCheckbox",
				);
				if (liftSuspendCb) {
					liftSuspendCb.checked = Array.isArray(liftDefaults)
						? liftDefaults.includes("suspend")
						: !!user.suspended;
					// Allow admin to click lift checkboxes; server will validate
					// and only apply lifts that actually affect the user.
					liftSuspendCb.disabled = false;
				}
				if (liftRestrictCb) {
					liftRestrictCb.checked = Array.isArray(liftDefaults)
						? liftDefaults.includes("restrict")
						: !!user.restricted;
					liftRestrictCb.disabled = false;
				}
				if (liftShadowbanCb) {
					liftShadowbanCb.checked = Array.isArray(liftDefaults)
						? liftDefaults.includes("shadowban")
						: !!user.shadowbanned;
					liftShadowbanCb.disabled = false;
				}
			}
		} catch {
			// If we failed to fetch user, just reset and allow default
		}

		new bootstrap.Modal(document.getElementById("suspensionModal")).show();
	}

	updateSuspensionModalForAction(action) {
		const titleEl = document.getElementById("suspensionModalTitle");
		const submitBtn = document.getElementById("suspensionSubmitBtn");
		const reasonEl = document.getElementById("suspensionReason");
		const durationEl = document.getElementById("suspensionDuration");

		if (!titleEl || !submitBtn) return;

		const map = {
			suspend: {
				title: "Suspend User",
				btnClass: "btn-danger",
				icon: "bi bi-exclamation-triangle",
				text: "Suspend User",
				reasonRequired: true,
				showDuration: true,
			},
			restrict: {
				title: "Restrict User",
				btnClass: "btn-warning",
				icon: "bi bi-eye-slash",
				text: "Restrict User",
				reasonRequired: true,
				showDuration: true,
			},
			shadowban: {
				title: "Shadowban User",
				btnClass: "btn-secondary",
				icon: "bi bi-person-dash",
				text: "Shadowban User",
				reasonRequired: true,
				showDuration: true,
			},
			lift: {
				title: "Lift Suspensions",
				btnClass: "btn-success",
				icon: "bi bi-check-circle",
				text: "Lift",
				reasonRequired: false,
				showDuration: false,
			},
		};

		const cfg = map[action] || map.suspend;
		titleEl.textContent = cfg.title;

		// update submit button classes
		submitBtn.classList.remove(
			"btn-danger",
			"btn-warning",
			"btn-secondary",
			"btn-success",
		);
		submitBtn.classList.add(cfg.btnClass);
		submitBtn.innerHTML = `<i class="${cfg.icon}"></i> ${cfg.text}`;

		if (reasonEl) {
			if (cfg.reasonRequired) {
				reasonEl.setAttribute("required", "");
				reasonEl.placeholder = "Enter the reason for action...";
			} else {
				reasonEl.removeAttribute("required");
				reasonEl.placeholder = "Optional reason for lifting...";
			}
		}

		if (durationEl) {
			if (cfg.showDuration) {
				durationEl.closest(".mb-3").style.display = "";
			} else {
				durationEl.closest(".mb-3").style.display = "none";
			}
		}

		// Lift checkboxes shown only for lift action
		const liftOptionsEl = document.getElementById("liftOptions");
		if (liftOptionsEl) {
			if (action === "lift") {
				liftOptionsEl.style.display = "";
			} else {
				liftOptionsEl.style.display = "none";
			}
		}
	}

	// showShadowbanModal removed; use showSuspensionModal(userId, 'shadowban') instead

	async submitSuspension() {
		const userId = document.getElementById("suspendUserId").value;
		let reason = document.getElementById("suspensionReason").value;
		// severity removed for suspensions; admin may choose an action only
		const actionSelectEl = document.getElementById("suspensionAction");
		const action = actionSelectEl?.value || "suspend";

		// Prevent submitting an action that's disabled (already applied)
		if (actionSelectEl) {
			const selectedOpt = actionSelectEl.querySelector(
				`option[value='${action}']`,
			);
			if (!selectedOpt || selectedOpt.disabled) {
				this.showError("This action is already applied to the user");
				return;
			}
		}
		const duration = document.getElementById("suspensionDuration").value;
		const notes = document.getElementById("suspensionNotes").value;

		if (action !== "lift" && !reason.trim()) {
			reason =
				"No reason provided. Tweetapus reserves the right to suspend users at our discretion without notice.";
		}

		const payload = {
			reason: reason.trim(),
			action,
		};

		if (duration?.trim()) {
			payload.duration = parseInt(duration);
		}
		if (notes?.trim()) {
			payload.notes = notes.trim();
		}

		if (action === "lift") {
			const lifts = [];
			const liftSuspendCb = document.getElementById("liftSuspendCheckbox");
			const liftRestrictCb = document.getElementById("liftRestrictCheckbox");
			const liftShadowbanCb = document.getElementById("liftShadowbanCheckbox");
			if (liftSuspendCb?.checked) lifts.push("suspend");
			if (liftRestrictCb?.checked) lifts.push("restrict");
			if (liftShadowbanCb?.checked) lifts.push("shadowban");

			if (!lifts.length) {
				this.showError("Please select at least one action to lift");
				return;
			}
			payload.lift = lifts;
		}

		try {
			await this.apiCall(`/api/admin/users/${userId}/suspend`, {
				method: "POST",
				body: JSON.stringify(payload),
			});

			bootstrap.Modal.getInstance(
				document.getElementById("suspensionModal"),
			).hide();
			const successMessage =
				action === "lift"
					? "User unsuspended successfully"
					: action === "shadowban"
						? "User shadowbanned"
						: action === "restrict"
							? "User restricted"
							: "User suspended successfully";
			this.showSuccess(successMessage);
			this.loadUsers(this.currentPage.users);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async unsuspendUser(userId) {
		// Unified 'lift' action: open the same suspension modal prefilled with 'lift' action
		// default to lifting 'suspend' only
		this.showLiftModal(userId, ["suspend"]);
	}

	showLiftModal(userId, liftDefaults = null) {
		// Reuse suspension modal; preselect 'lift' and optionally check defaults
		this.showSuspensionModal(userId, "lift", liftDefaults);
	}

	async impersonateUser(userId) {
		try {
			const { error, copyLink } = await this.apiCall(
				`/api/admin/impersonate/${userId}`,
				{
					method: "POST",
				},
			);

			if (error) {
				this.showError(error);
				return;
			}

			navigator.clipboard.writeText(`${copyLink}`);

			this.showSuccess(
				`Impersonation link copied, paste it into a new incognito window`,
			);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async deleteUser(userId, username) {
		const confirmation = prompt(`Type "${username}" to confirm deletion:`);
		if (confirmation !== username) {
			this.showError("Username confirmation did not match");
			return;
		}
		try {
			await this.apiCall(`/api/admin/users/${userId}`, {
				method: "DELETE",
			});

			this.showSuccess("User deleted successfully");
			if (this.selectedUsers.has(userId)) {
				this.selectedUsers.delete(userId);
				this.updateBulkEditControls();
			}
			this.loadUsers(this.currentPage.users);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async banIpAddress(ipAddress, action) {
		const actionText =
			action === "delete" ? "delete all accounts" : "suspend all accounts";

		try {
			// Fetch users associated with this IP
			const usersData = await this.apiCall(`/api/admin/ip/${ipAddress}/users`);
			const users = usersData.users || [];

			const modalEl = document.getElementById("ipBanConfirmModal");
			const messageEl = document.getElementById("ipBanConfirmMessage");
			const listEl = document.getElementById("ipBanUsersList");
			const confirmBtn = document.getElementById("ipBanConfirmBtn");

			if (!modalEl || !messageEl || !listEl || !confirmBtn) {
				// Fallback to simple confirm if modal elements are missing
				if (
					!confirm(
						`This will ban IP ${ipAddress} and ${actionText} associated with it. This action cannot be undone. Continue?`,
					)
				) {
					return;
				}
				this.executeIpBan(ipAddress, action);
				return;
			}

			messageEl.textContent = `This will ban IP ${ipAddress} and ${actionText} associated with it. Are you sure?`;

			if (users.length > 0) {
				listEl.innerHTML = users
					.map(
						(u) => `
					<div class="list-group-item d-flex align-items-center gap-2">
						${
							u.avatar
								? `<img src="${u.avatar}" class="rounded-circle" width="24" height="24">`
								: `<div class="rounded-circle bg-secondary d-flex align-items-center justify-content-center" style="width:24px;height:24px"><i class="bi bi-person text-white" style="font-size:12px"></i></div>`
						}
						<span>@${this.escapeHtml(u.username)}</span>
						${u.suspended ? '<span class="badge bg-danger ms-auto">Suspended</span>' : ""}
					</div>
				`,
					)
					.join("");
			} else {
				listEl.innerHTML =
					'<div class="list-group-item text-muted">No users currently associated with this IP.</div>';
			}

			const modal = new bootstrap.Modal(modalEl);

			// Remove previous event listeners to avoid multiple calls
			const newConfirmBtn = confirmBtn.cloneNode(true);
			confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

			newConfirmBtn.addEventListener("click", () => {
				modal.hide();
				this.executeIpBan(ipAddress, action);
			});

			modal.show();
		} catch (error) {
			this.showError("Failed to fetch users for this IP: " + error.message);
		}
	}

	async executeIpBan(ipAddress, action) {
		try {
			const response = await this.apiCall("/api/admin/ip-bans", {
				method: "POST",
				body: JSON.stringify({
					ip_address: ipAddress,
					action: action,
					reason: `Banned via admin panel with ${action} action`,
				}),
			});

			if (response.error) {
				this.showError(response.error);
				return;
			}

			this.showSuccess(
				`IP ${ipAddress} banned successfully. ${response.affectedUsers || 0} user(s) ${action === "delete" ? "deleted" : "suspended"}.`,
			);

			const modal = bootstrap.Modal.getInstance(
				document.getElementById("userModal"),
			);
			if (modal) {
				modal.hide();
			}
		} catch (error) {
			this.showError(error.message || "Failed to ban IP address");
		}
	}

	async showBulkEditModal() {
		if (!this.selectedUsers.size) {
			this.showError("Select at least one user to bulk edit");
			return;
		}

		const modalElement = document.getElementById("bulkUserModal");
		const bodyElement = document.getElementById("bulkUserModalBody");
		const saveButton = document.getElementById("bulkUserSaveBtn");
		if (!modalElement || !bodyElement || !saveButton) return;

		bodyElement.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-2 text-muted">Loading selection...</div>
      </div>
    `;
		saveButton.disabled = true;

		if (!this.bulkModal) {
			this.bulkModal = new bootstrap.Modal(modalElement, {
				backdrop: "static",
			});
		}
		this.bulkModal.show();

		const loadedUsers = [];
		for (const userId of this.selectedUsers) {
			try {
				const data = await this.apiCall(`/api/admin/users/${userId}`);
				if (data?.user) {
					loadedUsers.push(data.user);
				}
			} catch (error) {
				console.error("Failed to load user for bulk edit", userId, error);
			}
		}

		if (!loadedUsers.length) {
			bodyElement.innerHTML =
				'<div class="alert alert-danger mb-0">Failed to load selected users.</div>';
			return;
		}

		this.bulkEditOrder = loadedUsers.map((user) => user.id);
		bodyElement.innerHTML = loadedUsers
			.map((user) => this.renderBulkUserCard(user))
			.join("");
		for (const user of loadedUsers) {
			this.setupBulkFormInteractions(user);
		}
		saveButton.disabled = false;
	}

	renderBulkUserCard(user) {
		const prefix = `bulk-${user.id}`;
		const safeUsername = this.escapeHtml(user.username);
		const safeName = user.name ? this.escapeHtml(user.name) : "";
		const safeBio = user.bio ? this.escapeHtml(user.bio) : "";
		const verifiedChecked = this.isFlagSet(user.verified) ? "checked" : "";
		const goldChecked = this.isFlagSet(user.gold) ? "checked" : "";
		const adminChecked = user.admin ? "checked" : "";
		const affiliateChecked = this.isFlagSet(user.affiliate) ? "checked" : "";
		const ghostFollowers = user.ghost_follower_count || 0;
		const ghostFollowing = user.ghost_following_count || 0;
		const characterLimitValue =
			user.character_limit !== null && user.character_limit !== undefined
				? user.character_limit
				: "";
		let createdAtValue = "";
		if (user.created_at) {
			try {
				const parsed = new Date(user.created_at);
				if (!Number.isNaN(parsed.getTime())) {
					createdAtValue = new Date(
						parsed.getTime() - parsed.getTimezoneOffset() * 60000,
					)
						.toISOString()
						.slice(0, 16);
				}
			} catch {}
		}
		const affiliateWithValue = user.affiliate_with_username
			? this.escapeHtml(user.affiliate_with_username)
			: "";
		const affiliateSectionStyle = this.isFlagSet(user.affiliate)
			? ""
			: "display: none;";
		const idPreview = this.escapeHtml(user.id.slice(0, 8));
		const currentLimitLabel = user.character_limit
			? user.character_limit
			: this.isFlagSet(user.gold)
				? "16,500 (Gold Default)"
				: this.isFlagSet(user.verified)
					? "5,500 (Verified Default)"
					: "400 (Standard Default)";

		return `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div>
            <strong>@${safeUsername}</strong>
            ${
							safeName ? `<span class="text-muted ms-2">${safeName}</span>` : ""
						}
          </div>
          <span class="badge bg-secondary">ID ${idPreview}...</span>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Username</label>
              <input type="text" class="form-control" id="${prefix}-username" value="${safeUsername}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Display Name</label>
              <input type="text" class="form-control" id="${prefix}-name" value="${safeName}">
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Bio</label>
            <textarea class="form-control" id="${prefix}-bio" rows="3">${safeBio}</textarea>
          </div>
          <div class="row">
            <div class="col-md-3 mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="${prefix}-verified" ${verifiedChecked}>
                <label class="form-check-label">Verified</label>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="${prefix}-gold" ${goldChecked}>
                <label class="form-check-label">Gold</label>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="${prefix}-admin" ${adminChecked}>
                <label class="form-check-label">Admin</label>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="${prefix}-affiliate" ${affiliateChecked}>
                <label class="form-check-label">Affiliate Badge</label>
              </div>
            </div>
          </div>
          <div class="mb-3" id="${prefix}-affiliate-with-section" style="${affiliateSectionStyle}">
            <label class="form-label">Affiliated With Username</label>
            <input type="text" class="form-control" id="${prefix}-affiliate-with" value="${affiliateWithValue}">
            <small class="text-muted">User this account is affiliated with</small>
          </div>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Ghost Followers</label>
              <input type="number" class="form-control" id="${prefix}-ghost-followers" min="0" value="${ghostFollowers}">
              <small class="text-muted">Current invisible followers</small>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Ghost Following</label>
              <input type="number" class="form-control" id="${prefix}-ghost-following" min="0" value="${ghostFollowing}">
              <small class="text-muted">Current invisible following</small>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Character Limit Override</label>
            <input type="number" class="form-control" id="${prefix}-character-limit" min="1" value="${characterLimitValue}">
            <small class="text-muted">Current: ${currentLimitLabel}. Tier defaults: 400 (Standard) | 5,500 (Verified) | 16,500 (Gold)</small>
          </div>
          <div class="mb-3">
            <label class="form-label">Users to Follow This User (comma-separated usernames)</label>
            <input type="text" class="form-control" id="${prefix}-force-follow" placeholder="user1,user2">
          </div>
          <div class="mb-3">
            <label class="form-label">Account Created</label>
            <input type="datetime-local" class="form-control" id="${prefix}-created-at" value="${createdAtValue}">
            <small class="text-muted">Edit account creation date and time</small>
          </div>
        </div>
      </div>
    `;
	}

	setupBulkFormInteractions(user) {
		const prefix = `bulk-${user.id}`;
		const verified = document.getElementById(`${prefix}-verified`);
		const gold = document.getElementById(`${prefix}-gold`);
		if (verified && gold) {
			verified.addEventListener("change", () => {
				if (verified.checked) gold.checked = false;
			});
			gold.addEventListener("change", () => {
				if (gold.checked) verified.checked = false;
			});
		}

		const affiliateCheckbox = document.getElementById(`${prefix}-affiliate`);
		const affiliateSection = document.getElementById(
			`${prefix}-affiliate-with-section`,
		);
		if (affiliateCheckbox && affiliateSection) {
			affiliateCheckbox.addEventListener("change", () => {
				if (affiliateCheckbox.checked) {
					affiliateSection.style.display = "block";
				} else {
					affiliateSection.style.display = "none";
					const affiliateInput = document.getElementById(
						`${prefix}-affiliate-with`,
					);
					if (affiliateInput) affiliateInput.value = "";
				}
			});
		}
	}

	buildAffiliateRequestHtml(affiliateData, userId) {
		if (!affiliateData) {
			return '<p class="text-muted mb-0">No affiliate activity.</p>';
		}

		const safeUserId = this.escapeHtml(userId);
		const statusBadge = (status) => {
			const normalized = (status || "").toLowerCase();
			const classes =
				normalized === "pending"
					? "bg-warning text-dark"
					: normalized === "approved"
						? "bg-success"
						: "bg-secondary";
			return `<span class="badge ${classes}">${this.escapeHtml(
				normalized.toUpperCase(),
			)}</span>`;
		};

		const incoming = Array.isArray(affiliateData.incoming)
			? affiliateData.incoming
			: [];
		const outgoing = Array.isArray(affiliateData.outgoing)
			? affiliateData.outgoing
			: [];
		const managed = Array.isArray(affiliateData.managed)
			? affiliateData.managed
			: [];

		const incomingBlock = incoming.length
			? `
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">Incoming Requests</h6>
          ${incoming
						.map((request) => {
							const username = request.requester_username
								? this.escapeHtml(request.requester_username)
								: "unknown";
							const name = request.requester_name
								? this.escapeHtml(request.requester_name)
								: "";
							const timestamp = this.formatDate(request.created_at);
							const pending = request.status === "pending";
							const actions = pending
								? `
                    <button class="btn btn-sm btn-success" onclick="adminPanel.forceAcceptAffiliateRequest('${request.id}', '${safeUserId}')">Force Accept</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="adminPanel.forceRejectAffiliateRequest('${request.id}', '${safeUserId}')">Force Reject</button>
                  `
								: statusBadge(request.status);
							return `
                <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center">
                  <div>
                    <strong>@${username}</strong>
                    ${name ? `<div class="text-muted small">${name}</div>` : ""}
                    <div class="text-muted small">${timestamp}</div>
                  </div>
                  <div class="d-flex gap-2">${actions}</div>
                </div>
              `;
						})
						.join("")}
        </div>
      `
			: "";

		const outgoingBlock = outgoing.length
			? `
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">Outgoing Requests</h6>
          ${outgoing
						.map((request) => {
							const username = request.target_username
								? this.escapeHtml(request.target_username)
								: "unknown";
							const name = request.target_name
								? this.escapeHtml(request.target_name)
								: "";
							const timestamp = this.formatDate(request.created_at);
							const pending = request.status === "pending";
							const actions = pending
								? `
                    <button class="btn btn-sm btn-success" onclick="adminPanel.forceAcceptAffiliateRequest('${request.id}', '${safeUserId}')">Force Accept</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="adminPanel.forceRejectAffiliateRequest('${request.id}', '${safeUserId}')">Force Reject</button>
                  `
								: statusBadge(request.status);
							return `
                <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center">
                  <div>
                    <strong>@${username}</strong>
                    ${name ? `<div class="text-muted small">${name}</div>` : ""}
                    <div class="text-muted small">${timestamp}</div>
                  </div>
                  <div class="d-flex gap-2">${actions}</div>
                </div>
              `;
						})
						.join("")}
        </div>
      `
			: "";

		const managedBlock = managed.length
			? `
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">Active Affiliates</h6>
          <div class="d-flex flex-wrap gap-2">
            ${managed
							.map((item) => {
								const username = this.escapeHtml(item.username);
								const name = item.name ? this.escapeHtml(item.name) : "";
								return `
                  <a class="btn btn-sm btn-outline-light" href="/@${username}" target="_blank" rel="noopener noreferrer">
                    @${username}${name ? ` • ${name}` : ""}
                  </a>
                `;
							})
							.join("")}
          </div>
        </div>
      `
			: "";

		const combined = `${incomingBlock}${outgoingBlock}${managedBlock}`.trim();
		if (!combined) {
			return '<p class="text-muted mb-0">No affiliate requests or affiliates.</p>';
		}
		return combined;
	}

	buildUserBadgesHtml(userBadges, userId) {
		const safeUserId = this.escapeHtml(userId);
		let html = "";

		if (userBadges && userBadges.length > 0) {
			html +=
				'<div class="mb-3"><h6 class="text-uppercase text-muted">Current Badges</h6><div class="d-flex flex-wrap gap-2">';
			for (const badge of userBadges) {
				const safeBadgeId = this.escapeHtml(badge.badge_id);
				const safeName = this.escapeHtml(badge.name || "");
				const svgContent = badge.svg_content
					? DOMPurify.sanitize(badge.svg_content, {
							USE_PROFILES: { svg: true, svgFilters: true },
						})
					: "";
				html += `
					<div class="badge bg-secondary d-flex align-items-center gap-1 p-2">
						<span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;">${svgContent}</span>
						<span>${safeName}</span>
						<button class="btn btn-sm btn-close btn-close-white ms-1" style="font-size:8px;" title="Remove badge" onclick="adminPanel.removeUserBadge('${safeUserId}', '${safeBadgeId}')"></button>
					</div>
				`;
			}
			html += "</div></div>";
		} else {
			html += '<p class="text-muted small mb-2">No custom badges assigned.</p>';
		}

		html += `
			<div class="mt-2">
				<label class="form-label small">Assign Badge</label>
				<div class="input-group">
					<select class="form-select" id="assignBadgeSelect_${safeUserId}">
						<option value="">Select a badge...</option>
					</select>
					<button class="btn btn-outline-primary" type="button" onclick="adminPanel.assignUserBadge('${safeUserId}')">Assign</button>
				</div>
			</div>
		`;

		setTimeout(() => this.loadBadgeOptionsForUser(safeUserId), 0);

		return html;
	}

	async loadBadgeOptionsForUser(userId) {
		const select = document.getElementById(`assignBadgeSelect_${userId}`);
		if (!select) return;
		try {
			const data = await this.apiCall("/api/admin/badges");
			const badges = data.badges || [];
			select.innerHTML = '<option value="">Select a badge...</option>';
			for (const badge of badges) {
				const option = document.createElement("option");
				option.value = badge.id;
				option.textContent = badge.name;
				select.appendChild(option);
			}
		} catch {
			select.innerHTML = '<option value="">Failed to load badges</option>';
		}
	}

	async assignUserBadge(userId) {
		const select = document.getElementById(`assignBadgeSelect_${userId}`);
		const badgeId = select?.value;
		if (!badgeId) {
			this.showError("Please select a badge to assign");
			return;
		}
		try {
			await this.apiCall(`/api/admin/users/${userId}/badges`, {
				method: "POST",
				body: JSON.stringify({ badge_id: badgeId }),
			});
			this.showSuccess("Badge assigned");
			this.userCache.delete(userId);
			await this.showUserModal(userId);
		} catch (err) {
			this.showError(err.message || "Failed to assign badge");
		}
	}

	async sendAffiliateRequest(userId) {
		const input = document.getElementById("affiliateRequestTarget");
		const target = input?.value?.trim();
		if (!target) {
			this.showError("Target username is required");
			return;
		}

		try {
			await this.apiCall(`/api/admin/users/${userId}/affiliate-requests`, {
				method: "POST",
				body: JSON.stringify({ target_username: target }),
			});
			if (input) input.value = "";
			this.showSuccess("Affiliate request sent");
			this.userCache.delete(userId);
			await this.showUserModal(userId);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async forceAcceptAffiliateRequest(requestId, userId) {
		try {
			await this.apiCall(`/api/admin/affiliate-requests/${requestId}/approve`, {
				method: "POST",
			});
			this.showSuccess("Affiliate request approved");
			this.userCache.delete(userId);
			await this.showUserModal(userId);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async forceRejectAffiliateRequest(requestId, userId) {
		try {
			await this.apiCall(`/api/admin/affiliate-requests/${requestId}/deny`, {
				method: "POST",
			});
			this.showSuccess("Affiliate request rejected");
			this.userCache.delete(userId);
			await this.showUserModal(userId);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async saveBulkProfiles() {
		if (!this.selectedUsers.size) {
			this.showError("No users selected");
			return;
		}

		const saveButton = document.getElementById("bulkUserSaveBtn");
		if (saveButton) saveButton.disabled = true;

		const order = this.bulkEditOrder.length
			? [...this.bulkEditOrder]
			: Array.from(this.selectedUsers);

		for (const userId of order) {
			const prefix = `bulk-${userId}`;
			const usernameInput = document.getElementById(`${prefix}-username`);
			if (!usernameInput) continue;
			const username = usernameInput.value.trim();
			if (!username) {
				this.showError("Username is required");
				if (saveButton) saveButton.disabled = false;
				return;
			}

			const payload = {
				username,
				name: document.getElementById(`${prefix}-name`)?.value || "",
				bio: document.getElementById(`${prefix}-bio`)?.value || "",
				verified:
					document.getElementById(`${prefix}-verified`)?.checked || false,
				gold: document.getElementById(`${prefix}-gold`)?.checked || false,
				admin: document.getElementById(`${prefix}-admin`)?.checked || false,
				affiliate:
					document.getElementById(`${prefix}-affiliate`)?.checked || false,
			};

			const affiliateWithInput = document.getElementById(
				`${prefix}-affiliate-with`,
			);
			if (payload.affiliate && affiliateWithInput?.value?.trim()) {
				payload.affiliate_with_username = affiliateWithInput.value.trim();
			}

			const ghostFollowersInput = document.getElementById(
				`${prefix}-ghost-followers`,
			);
			if (ghostFollowersInput?.value) {
				const count = parseInt(ghostFollowersInput.value, 10) || 0;
				if (count > 0) {
					payload.ghost_followers = count;
				}
			}

			const ghostFollowingInput = document.getElementById(
				`${prefix}-ghost-following`,
			);
			if (ghostFollowingInput?.value) {
				const count = parseInt(ghostFollowingInput.value, 10) || 0;
				if (count > 0) {
					payload.ghost_following = count;
				}
			}

			const characterLimitInput = document.getElementById(
				`${prefix}-character-limit`,
			);
			if (characterLimitInput?.value?.trim()) {
				const charLimit = parseInt(characterLimitInput.value, 10);
				if (!Number.isNaN(charLimit) && charLimit > 0) {
					payload.character_limit = charLimit;
				}
			} else {
				payload.character_limit = null;
			}

			const createdInput = document.getElementById(`${prefix}-created-at`);
			if (createdInput?.value) {
				const local = new Date(createdInput.value);
				if (Number.isNaN(local.getTime())) {
					this.showError("Invalid created_at value provided");
					if (saveButton) saveButton.disabled = false;
					return;
				}
				payload.created_at = local.toISOString();
			}

			const forceFollowInput = document.getElementById(
				`${prefix}-force-follow`,
			);
			if (forceFollowInput?.value?.trim()) {
				const usernames = forceFollowInput.value
					.split(",")
					.map((value) => value.trim())
					.filter((value) => value.length > 0);
				if (usernames.length) {
					payload.force_follow_usernames = usernames;
				}
			}

			try {
				await this.apiCall(`/api/admin/users/${userId}`, {
					method: "PATCH",
					body: JSON.stringify(payload),
				});
				this.userCache.delete(userId);
			} catch (error) {
				this.showError(error.message || "Failed to save bulk changes");
				if (saveButton) saveButton.disabled = false;
				return;
			}
		}

		if (saveButton) saveButton.disabled = false;
		if (this.bulkModal) this.bulkModal.hide();

		this.showSuccess(
			`Updated ${order.length} user${order.length === 1 ? "" : "s"}`,
		);
		this.selectedUsers.clear();
		this.bulkEditOrder = [];
		this.updateBulkEditControls();
		this.syncSelectedUserCheckboxes();
		this.loadUsers(this.currentPage.users || 1);
	}
	async deletePost(postId) {
		if (!confirm("Are you sure you want to delete this post?")) return;

		try {
			await this.apiCall(`/api/admin/posts/${postId}`, {
				method: "DELETE",
			});

			this.showSuccess("Post deleted successfully");
			this.loadPosts(this.currentPage.posts);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async toggleSuperTweet(postId, currentStatus) {
		const newStatus = !currentStatus;

		let boost = 50.0;
		if (newStatus) {
			const boostInput = prompt(
				"Enter boost multiplier (1-1000, default 50):",
				"50",
			);
			if (boostInput === null) return;
			const parsedBoost = parseFloat(boostInput);
			if (Number.isNaN(parsedBoost) || parsedBoost < 1 || parsedBoost > 1000) {
				this.showError("Invalid boost value. Must be between 1 and 1000.");
				return;
			}
			boost = parsedBoost;
		}

		try {
			const response = await this.apiCall(
				`/api/admin/posts/${postId}/super-tweet`,
				{
					method: "PATCH",
					body: JSON.stringify({ super_tweet: newStatus, boost: boost }),
				},
			);

			if (response.success) {
				this.showSuccess(
					`SuperTweeta status ${newStatus ? "enabled (" + boost + "x boost)" : "disabled"} successfully`,
				);
				this.loadPosts(this.currentPage.posts);
			} else {
				this.showError(response.error || "Failed to update SuperTweeta status");
			}
		} catch (error) {
			this.showError(error.message);
		}
	}

	async addFactCheck(postId) {
		this.currentFactCheckPostId = postId;

		try {
			const response = await this.apiCall(`/api/admin/fact-check/${postId}`);

			const existingDiv = document.getElementById("factCheckExisting");
			const noteTextarea = document.getElementById("factCheckNote");
			const severitySelect = document.getElementById("factCheckSeverity");

			if (response.factCheck) {
				this.currentFactCheckId = response.factCheck.id;
				document.getElementById("factCheckExistingNote").textContent =
					response.factCheck.note;
				document.getElementById("factCheckExistingSeverity").textContent =
					response.factCheck.severity;
				existingDiv.style.display = "block";
				noteTextarea.value = "";
				severitySelect.value = "warning";
				noteTextarea.disabled = true;
				severitySelect.disabled = true;
			} else {
				this.currentFactCheckId = null;
				existingDiv.style.display = "none";
				noteTextarea.value = "";
				severitySelect.value = "warning";
				noteTextarea.disabled = false;
				severitySelect.disabled = false;
			}

			const modal = new bootstrap.Modal(
				document.getElementById("factCheckModal"),
			);
			modal.show();
		} catch (error) {
			this.showError(`Failed to load fact-check data: ${error.message}`);
		}
	}

	editExistingFactCheck() {
		document.getElementById("factCheckNote").disabled = false;
		document.getElementById("factCheckSeverity").disabled = false;
		document.getElementById("factCheckExisting").style.display = "none";
	}

	async removeExistingFactCheck() {
		if (!confirm("Are you sure you want to remove this fact-check?")) return;

		try {
			const response = await this.apiCall(
				`/api/admin/fact-check/${this.currentFactCheckId}`,
				{
					method: "DELETE",
				},
			);

			if (response.success) {
				this.showSuccess("Fact-check removed successfully");
				bootstrap.Modal.getInstance(
					document.getElementById("factCheckModal"),
				).hide();
				this.loadPosts(this.currentPage.posts);
			} else {
				this.showError(response.error || "Failed to remove fact-check");
			}
		} catch (error) {
			this.showError(error.message);
		}
	}

	async submitFactCheck() {
		const note = document.getElementById("factCheckNote").value.trim();
		const severity = document.getElementById("factCheckSeverity").value;

		if (!note) {
			this.showError("Please enter a fact-check note");
			return;
		}

		try {
			let response;

			if (this.currentFactCheckId) {
				response = await this.apiCall(
					`/api/admin/fact-check/${this.currentFactCheckId}`,
					{
						method: "DELETE",
					},
				);

				if (!response.success) {
					this.showError("Failed to update fact-check");
					return;
				}
			}

			response = await this.apiCall(
				`/api/admin/fact-check/${this.currentFactCheckPostId}`,
				{
					method: "POST",
					body: JSON.stringify({ note, severity }),
				},
			);

			if (response.success) {
				this.showSuccess(
					"Fact-check added successfully. Notifications sent to all users who interacted with this post.",
				);
				bootstrap.Modal.getInstance(
					document.getElementById("factCheckModal"),
				).hide();
				this.loadPosts(this.currentPage.posts);
			} else {
				this.showError(response.error || "Failed to add fact-check");
			}
		} catch (error) {
			this.showError(error.message);
		}
	}

	formatDate(dateInput) {
		const d = this.parseUtcDate(dateInput);
		if (Number.isNaN(d.getTime())) return "";
		if (d.getFullYear() < 1926) {
			return d.toLocaleString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "numeric",
				second: "numeric",
			});
		}
		return d.toLocaleString();
	}

	// Parse an incoming date string or value and treat ambiguous timestamps as UTC.
	// This helps when backend stores UTC timestamps without timezone indicator, e.g. "YYYY-MM-DD HH:MM:SS".
	parseUtcDate(dateInput) {
		if (dateInput instanceof Date) return dateInput;
		if (dateInput === undefined || dateInput === null)
			return new Date(dateInput);
		if (typeof dateInput === "number") return new Date(dateInput);
		const s = String(dateInput);
		// If string contains timezone or 'T' assume it has explicit timezone information.
		if (s.includes("T") || /[Zz]|[+-]\d{2}:\d{2}$/.test(s)) {
			return new Date(s);
		}
		// Convert 'YYYY-MM-DD HH:MM:SS' or similar to 'YYYY-MM-DDTHH:MM:SSZ' (UTC) for correct parsing.
		const normalized = s.replace(" ", "T") + "Z";
		return new Date(normalized);
	}

	formatDateOnly(dateInput) {
		const d = this.parseUtcDate(dateInput);
		if (Number.isNaN(d.getTime())) return "";
		if (d.getFullYear() < 1926) {
			return d.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		}
		return d.toLocaleDateString();
	}

	findAndViewUser(username) {
		document.getElementById("users-nav").click();

		const searchInput = document.getElementById("userSearch");
		searchInput.value = username;
		searchInput.focus();

		this.searchUsers();
	}

	async editPost(postId) {
		try {
			const post = await this.apiCall(`/api/admin/posts/${postId}`);

			document.getElementById("editPostId").value = post.id;
			const newIdInput = document.getElementById("editPostNewId");
			if (newIdInput) newIdInput.value = post.id;
			document.getElementById("editPostContent").value = post.content;
			document.getElementById("editPostLikes").value = post.like_count || 0;
			document.getElementById("editPostRetweets").value =
				post.retweet_count || 0;
			document.getElementById("editPostReplies").value = post.reply_count || 0;
			document.getElementById("editPostViews").value = post.view_count || 0;
			const createdInput = document.getElementById("editPostCreatedAt");
			if (createdInput) {
				try {
					const d = new Date(post.created_at);
					const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
						.toISOString()
						.slice(0, 16);
					createdInput.value = isoLocal;
				} catch (_err) {
					createdInput.value = "";
				}
			}

			const modal = new bootstrap.Modal(
				document.getElementById("editPostModal"),
			);
			modal.show();
			if (!this.editPostSaveListenerAttached) {
				const saveBtn = document.getElementById("editPostSaveBtn");
				if (saveBtn) {
					saveBtn.addEventListener("click", () => this.savePostEdit());
					this.editPostSaveListenerAttached = true;
				}
			}
			this.setupMassEngageListeners();
		} catch (err) {
			console.error("Failed to load post details", err);
			this.showError(err?.message || "Failed to load post details");
		}
	}

	setupMassEngageListeners() {
		if (this.massEngageListenersAttached) return;
		this.massEngageListenersAttached = true;

		const actionSelect = document.getElementById("massEngageAction");
		const commentsSection = document.getElementById(
			"massEngageCommentsSection",
		);
		const executeBtn = document.getElementById("massEngageBtn");

		if (actionSelect && commentsSection) {
			actionSelect.addEventListener("change", () => {
				const showComments =
					actionSelect.value === "quote" || actionSelect.value === "comment";
				commentsSection.style.display = showComments ? "block" : "none";
			});
		}

		if (executeBtn) {
			executeBtn.addEventListener("click", () => this.executeMassEngage());
		}
	}

	async executeMassEngage() {
		const postId = document.getElementById("editPostId").value;
		const action = document.getElementById("massEngageAction").value;
		const percentage =
			parseInt(document.getElementById("massEngagePercent").value, 10) || 0;
		const commentsRaw = document.getElementById("massEngageComments").value;

		if (percentage <= 0 || percentage > 100) {
			this.showError("Percentage must be between 1 and 100");
			return;
		}

		const comments = commentsRaw
			.split("\n")
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		if ((action === "quote" || action === "comment") && comments.length === 0) {
			this.showError(
				"Please enter at least one comment for quote/comment actions",
			);
			return;
		}

		const confirmMsg = `Execute ${action} action with ${percentage}% of userbase?`;
		if (!confirm(confirmMsg)) return;

		const progressDiv = document.getElementById("massEngageProgress");
		const progressBar = document.getElementById("massEngageProgressBar");
		const statusDiv = document.getElementById("massEngageStatus");
		const executeBtn = document.getElementById("massEngageBtn");

		progressDiv.style.display = "block";
		progressBar.style.width = "0%";
		statusDiv.textContent = "Starting...";
		executeBtn.disabled = true;

		try {
			progressBar.style.width = "30%";
			statusDiv.textContent = "Processing...";

			const response = await this.apiCall(
				`/api/admin/posts/${postId}/mass-engage`,
				{
					method: "POST",
					body: JSON.stringify({ action, percentage, comments }),
				},
			);

			progressBar.style.width = "100%";
			progressBar.classList.remove("progress-bar-animated");

			if (response.success) {
				statusDiv.textContent = `Completed: ${response.successCount}/${response.targetCount} users (${response.action})`;
				progressBar.classList.add("bg-success");
				this.showSuccess(
					`Mass ${action} completed: ${response.successCount}/${response.targetCount} users`,
				);
			} else {
				statusDiv.textContent = response.error || "Failed";
				progressBar.classList.add("bg-danger");
				this.showError(response.error || "Mass engage failed");
			}
		} catch (err) {
			progressBar.style.width = "100%";
			progressBar.classList.remove("progress-bar-animated");
			progressBar.classList.add("bg-danger");
			statusDiv.textContent = err.message || "Error";
			this.showError(err.message || "Mass engage failed");
		} finally {
			executeBtn.disabled = false;
			setTimeout(() => {
				progressDiv.style.display = "none";
				progressBar.style.width = "0%";
				progressBar.classList.remove("bg-success", "bg-danger");
				progressBar.classList.add("progress-bar-animated");
				statusDiv.textContent = "";
			}, 5000);
		}
	}

	async savePostEdit() {
		const postId = document.getElementById("editPostId").value;
		const content = document.getElementById("editPostContent").value;
		const likes = parseInt(document.getElementById("editPostLikes").value) || 0;
		const retweets =
			parseInt(document.getElementById("editPostRetweets").value) || 0;
		const replies =
			parseInt(document.getElementById("editPostReplies").value) || 0;
		const views = parseInt(document.getElementById("editPostViews").value) || 0;
		const newIdRaw = document.getElementById("editPostNewId")?.value?.trim();

		if (!content.trim()) {
			this.showError("Post content cannot be empty");
			return;
		}

		try {
			const payload = {
				content: content.trim(),
				likes,
				retweets,
				replies,
				views,
			};
			const createdInput = document.getElementById("editPostCreatedAt");
			if (createdInput?.value) {
				const local = new Date(createdInput.value);
				payload.created_at = local.toISOString();
			}

			await this.apiCall(`/api/admin/posts/${postId}`, {
				method: "PATCH",
				body: JSON.stringify(payload),
			});

			if (newIdRaw && newIdRaw !== postId) {
				await this.apiCall(`/api/admin/posts/${postId}/id`, {
					method: "PATCH",
					body: JSON.stringify({ new_id: newIdRaw }),
				});
			}

			bootstrap.Modal.getInstance(
				document.getElementById("editPostModal"),
			).hide();
			this.showSuccess("Post updated successfully");
			await this.loadPosts(this.currentPage.posts);
		} catch (error) {
			this.showError(error.message);
		}
	}

	async tweetOnBehalf(userId) {
		try {
			const userData = await this.apiCall(`/api/admin/users/${userId}`);
			const user = userData.user;

			document.getElementById("tweetUserId").value = user.id;
			document.getElementById("tweetUserDisplay").textContent =
				`@${user.username}`;
			document.getElementById("tweetContent").value = "";

			const modal = new bootstrap.Modal(
				document.getElementById("tweetOnBehalfModal"),
			);
			modal.show();
			this.updateTweetCharCount();
			const textarea = document.getElementById("tweetContent");
			if (textarea) {
				textarea.addEventListener("input", () => this.updateTweetCharCount());
			}
		} catch (error) {
			console.error(error);
			this.showError("Failed to load user details");
		}
	}

	async postTweetOnBehalf() {
		const userId = document.getElementById("tweetUserId").value;
		const content = document.getElementById("tweetContent").value;
		const replyToRaw = document.getElementById("tweetReplyTo")?.value;
		const replyTo = replyToRaw?.trim() ? replyToRaw.trim() : undefined;
		const source =
			document.getElementById("tweetSource")?.value?.trim() || null;
		const noCharLimit = true;

		if (!content.trim()) {
			this.showError("Tweet content cannot be empty");
			return;
		}

		try {
			const payload = {
				content: content.trim(),
				userId,
				noCharLimit,
			};
			const tweetCreatedInput = document.getElementById("tweetCreatedAt");
			if (tweetCreatedInput?.value) {
				payload.created_at = new Date(tweetCreatedInput.value).toISOString();
			}
			if (replyTo !== undefined) payload.replyTo = replyTo;
			if (source) payload.source = source;

			await this.apiCall("/api/admin/tweets", {
				method: "POST",
				body: JSON.stringify(payload),
			});

			bootstrap.Modal.getInstance(
				document.getElementById("tweetOnBehalfModal"),
			).hide();

			await this.loadPosts(this.currentPage.posts);
		} catch (error) {
			this.showError(error.message);
		}
	}

	updateTweetCharCount() {
		const textarea = document.getElementById("tweetContent");
		const countEl = document.getElementById("charCount");
		const limitEl = document.getElementById("charLimitDisplay");
		if (!textarea || !countEl || !limitEl) return;
		countEl.textContent = textarea.value.length;
	}

	showError(message) {
		this.showToast(message, "danger");
	}

	showSuccess(message, duration = 3000) {
		this.showToast(message, "Success", duration);
	}

	showToast(message, type, duration = 3000) {
		const toastContainer =
			document.getElementById("toastContainer") || this.createToastContainer();

		const toast = document.createElement("div");
		toast.className = `toast align-items-center text-white bg-${type} border-0`;
		toast.setAttribute("role", "alert");
		toast.setAttribute("data-bs-delay", duration);
		toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

		toastContainer.appendChild(toast);
		const bsToast = new bootstrap.Toast(toast);
		bsToast.show();

		toast.addEventListener("hidden.bs.toast", () => {
			toast.remove();
		});
	}

	setupFakeNotificationForm() {
		const form = document.getElementById("fakeNotificationForm");
		if (!form) return;

		this.bindNotificationTypeOptions();
		this.initCustomNotificationIconControls();
		this.setupFakeNotificationPreview();

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			this.sendFakeNotification();
		});
	}

	bindNotificationTypeOptions() {
		const select = document.getElementById("notifType");
		if (!select) return;

		const refreshPreview = () => this.updateFakeNotificationPreview();

		const fallbackTypes = [
			"default",
			"reaction",
			"like",
			"retweet",
			"reply",
			"follow",
			"quote",
			"mention",
			"community_join_request",
			"affiliate_request",
			"community_join_approved",
			"community_join_rejected",
			"community_role_change",
			"community_ban",
			"community_unban",
		];

		const applyOptions = (types) => {
			const previousValue = select.value;
			while (select.firstChild) select.removeChild(select.firstChild);
			const uniqueTypes = Array.from(new Set(types));
			uniqueTypes.forEach((type) => {
				const option = document.createElement("option");
				option.value = type;
				option.textContent = type;
				select.appendChild(option);
			});
			if (uniqueTypes.includes(previousValue)) {
				select.value = previousValue;
			}
			refreshPreview();
		};

		const hasWindowTypes = () =>
			Array.isArray(window.NOTIFICATION_ICON_TYPES) &&
			window.NOTIFICATION_ICON_TYPES.length > 0;

		if (hasWindowTypes()) {
			applyOptions(window.NOTIFICATION_ICON_TYPES);
		} else {
			applyOptions(fallbackTypes);
			window.addEventListener(
				"notification-icons-ready",
				() => {
					if (hasWindowTypes()) {
						applyOptions(window.NOTIFICATION_ICON_TYPES);
					}
				},
				{ once: true },
			);
		}
	}

	initCustomNotificationIconControls() {
		const uploadBtn = document.getElementById("notifIconUpload");
		const svgBtn = document.getElementById("notifIconSvg");
		const clearBtn = document.getElementById("notifIconClear");
		const previewEl = document.getElementById("notifIconPreview");
		const fileInput = document.getElementById("notifIconFile");
		const svgEditor = document.getElementById("notifSvgEditor");
		const svgInput = document.getElementById("notifIconSvgInput");
		const applySvgBtn = document.getElementById("notifIconApplySvg");
		const cancelSvgBtn = document.getElementById("notifIconCancelSvg");

		if (
			!uploadBtn ||
			!svgBtn ||
			!clearBtn ||
			!previewEl ||
			!fileInput ||
			!svgEditor ||
			!svgInput ||
			!applySvgBtn ||
			!cancelSvgBtn
		)
			return;

		this.customNotificationIconPreviewEl = previewEl;
		this.customNotificationIconClearBtn = clearBtn;
		this.customNotificationSvgEditor = svgEditor;
		this.customNotificationSvgInput = svgInput;

		uploadBtn.addEventListener("click", () => fileInput.click());

		fileInput.addEventListener("change", async (event) => {
			const file = event.target?.files?.[0];
			if (!file) return;
			if (!file.type || !file.type.startsWith("image/")) {
				this.showError("Please choose an image file");
				fileInput.value = "";
				return;
			}

			try {
				const cropperModule = await import("../shared/image-cropper.js");
				const cropperFn =
					cropperModule.openImageCropper || cropperModule.default;
				if (typeof cropperFn !== "function") {
					throw new Error("Image cropper unavailable");
				}
				const cropped = await cropperFn(file, { aspect: 1, size: 256 });
				const cancelToken = cropperModule.CROP_CANCELLED;
				if (cancelToken && cropped === cancelToken) return;

				this.clearCustomNotificationIcon();
				this.customNotificationIcon = { kind: "image", file: cropped };
				if (this.customNotificationIconClearBtn)
					this.customNotificationIconClearBtn.classList.remove("d-none");
				this.updateCustomNotificationPreview();
			} catch (err) {
				console.error(err);
				this.showError("Failed to process image");
			} finally {
				fileInput.value = "";
			}
		});

		svgBtn.addEventListener("click", () => {
			svgEditor.classList.remove("d-none");
			svgInput.focus();
		});

		cancelSvgBtn.addEventListener("click", () => {
			svgEditor.classList.add("d-none");
			svgInput.value = "";
		});

		applySvgBtn.addEventListener("click", () => this.applyCustomSvg());
		clearBtn.addEventListener("click", () =>
			this.clearCustomNotificationIcon(),
		);
	}

	setupFakeNotificationPreview() {
		if (this.fakeNotificationPreviewSetup) {
			this.updateFakeNotificationPreview();
			return;
		}

		const typeField = document.getElementById("notifType");
		const titleField = document.getElementById("notifTitle");
		const subtitleField = document.getElementById("notifSubtitle");
		const messageField = document.getElementById("notifMessage");
		const urlField = document.getElementById("notifUrl");

		const update = () => this.updateFakeNotificationPreview();

		typeField?.addEventListener("change", update);
		titleField?.addEventListener("input", update);
		subtitleField?.addEventListener("input", update);
		messageField?.addEventListener("input", update);
		urlField?.addEventListener("input", update);
		if (typeof window !== "undefined") {
			window.addEventListener("notification-icons-ready", update, {
				once: true,
			});
		}

		this.fakeNotificationPreviewSetup = true;
		this.updateFakeNotificationPreview();
	}

	updateFakeNotificationPreview() {
		const container = document.getElementById("notifPreview");
		if (!container) return;

		container.textContent = "";

		const wrapper = document.createElement("div");
		wrapper.style.display = "flex";
		wrapper.style.alignItems = "flex-start";
		wrapper.style.gap = "12px";

		const iconBox = document.createElement("div");
		iconBox.style.width = "48px";
		iconBox.style.height = "48px";
		iconBox.style.flexShrink = "0";
		iconBox.style.borderRadius = "14px";
		iconBox.style.display = "flex";
		iconBox.style.alignItems = "center";
		iconBox.style.justifyContent = "center";
		iconBox.style.backgroundColor = "rgba(0, 0, 0, 0.06)";

		const typeValue = document.getElementById("notifType")?.value || "default";
		const iconData = this.customNotificationIcon;

		if (iconData?.kind === "image" && this.customNotificationPreviewUrl) {
			const img = document.createElement("img");
			img.src = this.customNotificationPreviewUrl;
			img.alt = "";
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.objectFit = "cover";
			img.style.borderRadius = "inherit";
			iconBox.appendChild(img);
		} else if (iconData?.kind === "svg" && iconData.previewDataUri) {
			const img = document.createElement("img");
			img.src = iconData.previewDataUri;
			img.alt = "";
			img.style.width = "70%";
			img.style.height = "70%";
			iconBox.appendChild(img);
		} else {
			const iconMap =
				typeof window !== "undefined" && window.NOTIFICATION_ICON_MAP
					? window.NOTIFICATION_ICON_MAP
					: {};
			const svgMarkup = iconMap[typeValue] || iconMap.default || "";
			if (svgMarkup) {
				const holder = document.createElement("span");
				holder.style.display = "inline-flex";
				holder.style.alignItems = "center";
				holder.style.justifyContent = "center";
				holder.style.width = "32px";
				holder.style.height = "32px";
				holder.innerHTML = svgMarkup;
				iconBox.appendChild(holder);
			} else {
				const fallback = document.createElement("span");
				fallback.style.fontSize = "11px";
				fallback.style.fontWeight = "600";
				fallback.style.color = "#6c757d";
				fallback.style.letterSpacing = "0.04em";
				fallback.textContent = typeValue.toUpperCase();
				iconBox.appendChild(fallback);
			}
		}

		const textBox = document.createElement("div");
		textBox.style.flex = "1";
		textBox.style.minWidth = "0";

		const titleValue = document.getElementById("notifTitle")?.value?.trim();
		const subtitleValue = document
			.getElementById("notifSubtitle")
			?.value?.trim();
		const messageValue = document.getElementById("notifMessage")?.value?.trim();
		const urlValue = document.getElementById("notifUrl")?.value?.trim();

		const primaryText =
			titleValue ||
			subtitleValue ||
			messageValue ||
			"Notification title will appear here.";

		const secondaryCandidates = [];
		if (subtitleValue && subtitleValue !== primaryText)
			secondaryCandidates.push(subtitleValue);
		if (messageValue && messageValue !== primaryText)
			secondaryCandidates.push(messageValue);
		const secondaryText = secondaryCandidates[0] || "";

		const primaryEl = document.createElement("div");
		primaryEl.style.fontWeight = "600";
		primaryEl.style.fontSize = "16px";
		primaryEl.style.color = "#212529";
		primaryEl.textContent = primaryText;
		textBox.appendChild(primaryEl);

		if (secondaryText) {
			const secondaryEl = document.createElement("div");
			secondaryEl.style.marginTop = "4px";
			secondaryEl.style.fontSize = "14px";
			secondaryEl.style.color = "#495057";
			secondaryEl.textContent = secondaryText;
			textBox.appendChild(secondaryEl);
		}

		const metaLine = document.createElement("div");
		metaLine.style.marginTop = secondaryText ? "8px" : "12px";
		metaLine.style.fontSize = "12px";
		metaLine.style.color = "#adb5bd";
		metaLine.textContent = `Type: ${typeValue}`;
		textBox.appendChild(metaLine);

		if (urlValue) {
			const urlLine = document.createElement("div");
			urlLine.style.marginTop = "4px";
			urlLine.style.fontSize = "12px";
			urlLine.style.color = "#0d6efd";
			urlLine.style.textDecoration = "underline";
			urlLine.textContent = urlValue;
			textBox.appendChild(urlLine);
		}

		wrapper.appendChild(iconBox);
		wrapper.appendChild(textBox);

		container.appendChild(wrapper);
	}

	clearCustomNotificationIcon() {
		if (this.customNotificationPreviewUrl) {
			try {
				URL.revokeObjectURL(this.customNotificationPreviewUrl);
			} catch (_err) {}
			this.customNotificationPreviewUrl = null;
		}
		this.customNotificationIcon = null;
		if (this.customNotificationIconPreviewEl)
			this.customNotificationIconPreviewEl.innerHTML = "";
		if (this.customNotificationIconClearBtn)
			this.customNotificationIconClearBtn.classList.add("d-none");
		if (this.customNotificationSvgEditor)
			this.customNotificationSvgEditor.classList.add("d-none");
		if (this.customNotificationSvgInput)
			this.customNotificationSvgInput.value = "";
		this.updateFakeNotificationPreview();
	}

	updateCustomNotificationPreview() {
		if (!this.customNotificationIconPreviewEl) return;
		if (this.customNotificationPreviewUrl) {
			try {
				URL.revokeObjectURL(this.customNotificationPreviewUrl);
			} catch (_err) {}
			this.customNotificationPreviewUrl = null;
		}
		this.customNotificationIconPreviewEl.innerHTML = "";
		const icon = this.customNotificationIcon;
		if (!icon) return;

		const img = document.createElement("img");
		img.alt = "";
		img.style.width = "40px";
		img.style.height = "40px";
		img.style.borderRadius = "8px";
		img.style.objectFit = "contain";

		if (icon.kind === "image" && icon.file instanceof File) {
			const blobUrl = URL.createObjectURL(icon.file);
			this.customNotificationPreviewUrl = blobUrl;
			img.src = blobUrl;
		} else if (icon.kind === "svg" && icon.previewDataUri) {
			img.src = icon.previewDataUri;
		} else {
			return;
		}

		this.customNotificationIconPreviewEl.appendChild(img);
		this.updateFakeNotificationPreview();
	}

	applyCustomSvg() {
		if (!this.customNotificationSvgInput) return;
		const raw = this.customNotificationSvgInput.value.trim();
		if (!raw) {
			this.showError("SVG markup is required");
			return;
		}

		if (this.customNotificationPreviewUrl) {
			try {
				URL.revokeObjectURL(this.customNotificationPreviewUrl);
			} catch (_err) {}
			this.customNotificationPreviewUrl = null;
		}

		this.customNotificationIcon = {
			kind: "svg",
			svg: raw,
			previewDataUri: this.buildSvgDataUri(raw),
		};

		if (this.customNotificationIconClearBtn)
			this.customNotificationIconClearBtn.classList.remove("d-none");
		if (this.customNotificationSvgEditor)
			this.customNotificationSvgEditor.classList.add("d-none");
		this.customNotificationSvgInput.value = "";
		this.updateCustomNotificationPreview();
	}

	buildSvgDataUri(markup) {
		const encoder = new TextEncoder();
		const bytes = encoder.encode(markup);
		let binary = "";
		bytes.forEach((byte) => {
			binary += String.fromCharCode(byte);
		});
		return `data:image/svg+xml;base64,${btoa(binary)}`;
	}

	async resolveCustomNotificationIcon() {
		if (!this.customNotificationIcon) return null;

		if (this.customNotificationIcon.kind === "image") {
			const file = this.customNotificationIcon.file;
			if (!(file instanceof File)) {
				throw new Error("Icon file missing");
			}

			const formData = new FormData();
			formData.append("file", file, file.name || "icon.webp");

			const response = await fetch("/api/upload", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
				body: formData,
			});
			const data = await response.json();
			if (!response.ok || data?.error) {
				throw new Error(data?.error || "Failed to upload icon");
			}

			const uploaded = data?.file || {};
			if (!uploaded.hash) {
				throw new Error("Upload response missing hash");
			}

			return {
				kind: "image",
				hash: uploaded.hash,
				url: uploaded.url || null,
			};
		}

		if (this.customNotificationIcon.kind === "svg") {
			const svg = this.customNotificationIcon.svg;
			if (!svg) {
				throw new Error("SVG markup missing");
			}
			return {
				kind: "svg",
				markup: svg,
			};
		}

		return null;
	}

	async sendFakeNotification() {
		const targetRaw = document.getElementById("notifTarget")?.value?.trim();
		const title = document.getElementById("notifTitle")?.value?.trim();
		const type = document.getElementById("notifType")?.value || "default";
		const subtitle = document.getElementById("notifSubtitle")?.value?.trim();
		const message = document.getElementById("notifMessage")?.value?.trim();
		const url = document.getElementById("notifUrl")?.value?.trim();
		const resultEl = document.getElementById("fakeNotifResult");

		if (!targetRaw) {
			if (resultEl)
				resultEl.innerHTML =
					'<div class="alert alert-warning">Please specify a target (username(s) or "all").</div>';
			return;
		}

		if (!title && !subtitle && !message) {
			if (resultEl)
				resultEl.innerHTML =
					'<div class="alert alert-warning">Please provide a title, subtitle, or message for the notification.</div>';
			return;
		}

		let target;
		if (targetRaw.toLowerCase() === "all") {
			target = "all";
		} else {
			target = targetRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}

		const payload = {
			target,
			type: type || "default",
			title: title || null,
		};
		if (message) payload.message = message;
		if (subtitle) payload.subtitle = subtitle;
		if (url) payload.url = url;

		const sendBtn = document.querySelector(
			"#fakeNotificationForm button.btn-primary",
		);

		try {
			const iconPayload = await this.resolveCustomNotificationIcon();
			if (iconPayload) payload.customIcon = iconPayload;
		} catch (iconError) {
			const messageText = iconError?.message || "Failed to prepare custom icon";
			if (resultEl) {
				resultEl.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(
					messageText,
				)}</div>`;
			} else {
				this.showError(messageText);
			}
			return;
		}

		try {
			if (sendBtn) sendBtn.disabled = true;

			await this.apiCall("/api/admin/fake-notification", {
				method: "POST",
				body: JSON.stringify(payload),
			});

			if (resultEl)
				resultEl.innerHTML =
					'<div class="alert alert-success">Notification sent (or queued) successfully.</div>';
			const titleEl = document.getElementById("notifTitle");
			if (titleEl) titleEl.value = "";
			const subtitleEl = document.getElementById("notifSubtitle");
			if (subtitleEl) subtitleEl.value = "";
			const msgEl = document.getElementById("notifMessage");
			if (msgEl) msgEl.value = "";
			const urlEl = document.getElementById("notifUrl");
			if (urlEl) urlEl.value = "";
			this.clearCustomNotificationIcon();
		} catch (err) {
			const msg = err?.message || "Failed to send notification";
			if (resultEl)
				resultEl.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(
					msg,
				)}</div>`;
			else this.showError(msg);
		} finally {
			if (sendBtn) sendBtn.disabled = false;
		}
	}

	async loadDMs(page = 1) {
		try {
			const data = await this.apiCall(`/api/admin/dms?page=${page}&limit=20`);
			this.currentPage.dms = page;
			this.renderDMsTable(data.conversations);
			this.renderDMsPagination(data.pagination);
		} catch {
			this.showError("Failed to load DMs");
		}
	}

	async searchDMs() {
		const username = document.getElementById("dmSearchInput").value.trim();
		if (!username) {
			this.loadDMs();
			return;
		}

		try {
			const data = await this.apiCall(
				`/api/admin/dms/search?username=${encodeURIComponent(username)}`,
			);
			this.renderDMsTable(data.conversations);
			document.getElementById("dmsPagination").innerHTML = "";
		} catch {
			this.showError("Failed to search DMs");
		}
	}

	showGlobalMassDeleteModal() {
		const modal = new bootstrap.Modal(
			document.getElementById("globalMassDeleteModal"),
		);
		document.getElementById("globalMassDeleteDate").value = "";
		document.getElementById("globalMassDeleteConfirm").value = "";
		document.getElementById("globalMassDeleteProgress").style.display = "none";
		modal.show();
	}

	async executeGlobalMassDelete() {
		const dateInput = document.getElementById("globalMassDeleteDate").value;
		const confirmInput = document
			.getElementById("globalMassDeleteConfirm")
			.value.trim();

		if (!dateInput) {
			this.showError("Please select a date");
			return;
		}

		if (confirmInput !== "DELETE ALL") {
			this.showError('Please type "DELETE ALL" to confirm');
			return;
		}

		const selectedDate = new Date(dateInput);
		if (!Number.isFinite(selectedDate.getTime())) {
			this.showError("Invalid date");
			return;
		}

		const progressDiv = document.getElementById("globalMassDeleteProgress");
		const progressBar = document.getElementById("globalMassDeleteProgressBar");
		const statusDiv = document.getElementById("globalMassDeleteStatus");
		const executeBtn = document.getElementById("globalMassDeleteExecuteBtn");
		const cancelBtn = document.getElementById("globalMassDeleteCancelBtn");

		progressDiv.style.display = "block";
		progressBar.style.width = "0%";
		statusDiv.textContent = "Starting...";
		executeBtn.disabled = true;
		cancelBtn.disabled = true;

		try {
			progressBar.style.width = "30%";
			statusDiv.textContent = "Deleting tweets...";

			const response = await this.apiCall("/api/admin/posts/mass-delete", {
				method: "POST",
				body: JSON.stringify({ after_date: selectedDate.toISOString() }),
			});

			progressBar.style.width = "100%";
			progressBar.classList.remove("progress-bar-animated");

			if (response.success) {
				statusDiv.textContent = `Deleted ${response.deletedCount} tweets`;
				progressBar.classList.add("bg-success");
				this.showSuccess(
					`Successfully deleted ${response.deletedCount} tweets after ${new Date(response.after_date).toLocaleString()}`,
				);

				setTimeout(() => {
					const modal = bootstrap.Modal.getInstance(
						document.getElementById("globalMassDeleteModal"),
					);
					modal?.hide();
					this.loadPosts();
				}, 2000);
			} else {
				statusDiv.textContent = response.error || "Failed";
				progressBar.classList.add("bg-danger");
				this.showError(response.error || "Mass delete failed");
			}
		} catch (err) {
			progressBar.style.width = "100%";
			progressBar.classList.remove("progress-bar-animated");
			progressBar.classList.add("bg-danger");
			statusDiv.textContent = err.message || "Error";
			this.showError(err.message || "Mass delete failed");
		} finally {
			executeBtn.disabled = false;
			cancelBtn.disabled = false;
			setTimeout(() => {
				progressDiv.style.display = "none";
				progressBar.style.width = "0%";
				progressBar.classList.remove("bg-success", "bg-danger");
				progressBar.classList.add("progress-bar-animated");
				statusDiv.textContent = "";
			}, 5000);
		}
	}

	renderDMsTable(conversations) {
		const tableHtml = `
			<div class="table-responsive">
				<table class="table table-striped">
					<thead>
						<tr>
							<th>Conversation ID</th>
							<th>Participants</th>
							<th>Messages</th>
							<th>Last Activity</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						${conversations
							.map(
								(conv) => `
								<tr>
									<td>
										<code class="text-muted">${conv.id.slice(0, 8)}...</code>
									</td>
									<td>
										<span class="badge bg-primary">${conv.participant_count} users</span>
									</td>
									<td>
										<span class="text-muted">${conv.message_count} messages</span>
									</td>
									<td>
										${conv.last_message_at ? this.formatDate(conv.last_message_at) : "No messages"}
									</td>
									<td>
										<button class="btn btn-sm btn-outline-primary" onclick="viewConversation('${
											conv.id
										}')">
											<i class="bi bi-eye"></i>
											View
										</button>
										<button class="btn btn-sm btn-outline-danger" onclick="deleteConversationAdmin('${
											conv.id
										}')">
											<i class="bi bi-trash"></i>
											Delete
										</button>
									</td>
								</tr>
							`,
							)
							.join("")}
					</tbody>
				</table>
			</div>
		`;

		document.getElementById("dmsTable").innerHTML = tableHtml;
	}

	renderDMsPagination(pagination) {
		if (!pagination || pagination.pages <= 1) {
			document.getElementById("dmsPagination").innerHTML = "";
			return;
		}

		const currentPage = pagination.page;
		const totalPages = pagination.pages;
		let paginationHtml = '<ul class="pagination">';

		if (currentPage > 1) {
			paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="adminPanel.loadDMs(${
				currentPage - 1
			})">Previous</a></li>`;
		}

		const startPage = Math.max(1, currentPage - 2);
		const endPage = Math.min(totalPages, currentPage + 2);

		for (let i = startPage; i <= endPage; i++) {
			const activeClass = i === currentPage ? "active" : "";
			paginationHtml += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="adminPanel.loadDMs(${i})">${i}</a></li>`;
		}

		if (currentPage < totalPages) {
			paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="adminPanel.loadDMs(${
				currentPage + 1
			})">Next</a></li>`;
		}

		paginationHtml += "</ul>";
		document.getElementById("dmsPagination").innerHTML = paginationHtml;
	}

	async viewConversation(conversationId) {
		try {
			const [conversationData, messagesData] = await Promise.all([
				this.apiCall(`/api/admin/dms/${conversationId}`),
				this.apiCall(
					`/api/admin/dms/${conversationId}/messages?page=1&limit=50`,
				),
			]);

			this.currentConversationId = conversationId;
			this.renderConversationModal(
				conversationData.conversation,
				messagesData.messages,
				messagesData.pagination,
			);

			const modal = new bootstrap.Modal(document.getElementById("dmModal"));
			modal.show();
		} catch {
			this.showError("Failed to load conversation");
		}
	}

	renderConversationModal(conversation, messages, pagination) {
		const infoHtml = `
			<div class="row">
				<div class="col-md-6">
					<h6>Conversation ID</h6>
					<code>${conversation.id}</code>
				</div>
				<div class="col-md-6">
					<h6>Participants</h6>
					<p>${conversation.participants}</p>
				</div>
			</div>
			<div class="row">
        <div class="col-md-6">
          <h6>Created</h6>
          <p>${this.formatDate(conversation.created_at)}</p>
        </div>
				<div class="col-md-6">
					<h6>Participant Names</h6>
					<p>${conversation.participant_names}</p>
				</div>
			</div>
		`;

		document.getElementById("dmConversationInfo").innerHTML = infoHtml;

		const messagesHtml = messages.length
			? messages
					.map(
						(message) => `
			<div class="card mb-2">
				<div class="card-body">
					<div class="d-flex justify-content-between align-items-start">
						<div class="d-flex align-items-center">
							${
								message.avatar
									? `<img src="/api/uploads/${message.avatar}" class="user-avatar me-2" alt="Avatar">`
									: `<div class="user-avatar me-2 bg-secondary d-flex align-items-center justify-content-center text-white">
									${message.name ? message.name.charAt(0).toUpperCase() : "?"}
								</div>`
							}
							<div>
								<strong>${this.escapeHtml(message.name || "Unknown User")}</strong>
								<small class="text-muted">@${this.escapeHtml(message.username)}</small>
							</div>
						</div>
						<div class="text-end">
                            <small class="text-muted">${this.formatDate(
															message.created_at,
														)}</small>
							<br>
							<button class="btn btn-sm btn-outline-danger" onclick="deleteMessage('${
								message.id
							}')">
								<i class="bi bi-trash"></i>
							</button>
						</div>
					</div>
					<div class="mt-2">
						<p class="mb-1">${this.escapeHtml(message.content)}</p>
						${
							message.attachments?.length
								? message.attachments
										.map(
											(att) => `
								<div class="mt-2">
									<img src="/api/uploads/${att.file_hash}" class="img-thumbnail" style="max-width: 200px;" alt="${att.filename}">
									<br><small class="text-muted">${att.filename}</small>
								</div>
							`,
										)
										.join("")
								: ""
						}
					</div>
				</div>
			</div>
		`,
					)
					.join("")
			: '<p class="text-muted">No messages in this conversation.</p>';

		document.getElementById("dmMessages").innerHTML = messagesHtml;

		if (pagination && pagination.pages > 1) {
			let paginationHtml = '<ul class="pagination pagination-sm">';

			if (pagination.page > 1) {
				paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadConversationMessages(${
					pagination.page - 1
				})">Previous</a></li>`;
			}

			const startPage = Math.max(1, pagination.page - 2);
			const endPage = Math.min(pagination.pages, pagination.page + 2);

			for (let i = startPage; i <= endPage; i++) {
				const activeClass = i === pagination.page ? "active" : "";
				paginationHtml += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="loadConversationMessages(${i})">${i}</a></li>`;
			}

			if (pagination.page < pagination.pages) {
				paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadConversationMessages(${
					pagination.page + 1
				})">Next</a></li>`;
			}

			paginationHtml += "</ul>";
			document.getElementById("dmMessagesPagination").innerHTML =
				paginationHtml;
		} else {
			document.getElementById("dmMessagesPagination").innerHTML = "";
		}
	}

	async deleteConversationAdmin(conversationId) {
		if (
			!confirm(
				"Are you sure you want to delete this conversation? This action cannot be undone.",
			)
		) {
			return;
		}

		try {
			await this.apiCall(`/api/admin/dms/${conversationId}`, {
				method: "DELETE",
			});
			this.showSuccess("Conversation deleted successfully");
			this.loadDMs(this.currentPage.dms || 1);
		} catch {
			this.showError("Failed to delete conversation");
		}
	}

	async deleteMessageAdmin(messageId) {
		if (
			!confirm(
				"Are you sure you want to delete this message? This action cannot be undone.",
			)
		) {
			return;
		}

		try {
			await this.apiCall(`/api/admin/dms/messages/${messageId}`, {
				method: "DELETE",
			});
			this.showSuccess("Message deleted successfully");
			if (this.currentConversationId) {
				this.viewConversation(this.currentConversationId);
			}
		} catch {
			this.showError("Failed to delete message");
		}
	}

	async loadConversationMessages(page) {
		if (!this.currentConversationId) return;

		try {
			const messagesData = await this.apiCall(
				`/api/admin/dms/${this.currentConversationId}/messages?page=${page}&limit=50`,
			);
			this.renderConversationModal(
				conversationData.conversation,
				messagesData.messages,
				messagesData.pagination,
			);
		} catch {
			this.showError("Failed to load messages");
		}
	}

	createToastContainer() {
		const container = document.createElement("div");
		container.id = "toastContainer";
		container.className = "toast-container position-fixed top-0 end-0 p-3";
		container.style.zIndex = "9999";
		document.body.appendChild(container);
		return container;
	}

	showCreateUserModal() {
		document.getElementById("createUserForm").reset();
		document.getElementById("createAffiliateWithSection").style.display =
			"none";
		document.getElementById("createSuperTweeterBoostSection").style.display =
			"none";
		const selectedBadgesContainer = document.getElementById(
			"createSelectedBadges",
		);
		if (selectedBadgesContainer) selectedBadgesContainer.innerHTML = "";
		this.createUserSelectedBadges = [];

		this.loadBadgesForCreateUser();

		const modal = new bootstrap.Modal(
			document.getElementById("createUserModal"),
		);
		modal.show();

		const verifiedCheckbox = document.getElementById("createVerified");
		const goldCheckbox = document.getElementById("createGold");
		const grayCheckbox = document.getElementById("createGray");

		const setupCheckboxes = () => {
			const vEl = document.getElementById("createVerified");
			const gEl = document.getElementById("createGold");
			const grEl = document.getElementById("createGray");

			if (vEl) {
				vEl.addEventListener("change", () => {
					if (vEl.checked) {
						if (gEl) gEl.checked = false;
						if (grEl) grEl.checked = false;
					}
				});
			}
			if (gEl) {
				gEl.addEventListener("change", () => {
					if (gEl.checked) {
						if (vEl) vEl.checked = false;
						if (grEl) grEl.checked = false;
					}
				});
			}
			if (grEl) {
				grEl.addEventListener("change", () => {
					if (grEl.checked) {
						if (gEl) gEl.checked = false;
						if (vEl) vEl.checked = false;
					}
				});
			}
		};

		if (verifiedCheckbox && goldCheckbox) {
			const newVerified = verifiedCheckbox.cloneNode(true);
			verifiedCheckbox.parentNode.replaceChild(newVerified, verifiedCheckbox);

			const newGold = goldCheckbox.cloneNode(true);
			goldCheckbox.parentNode.replaceChild(newGold, goldCheckbox);

			if (grayCheckbox) {
				const newGray = grayCheckbox.cloneNode(true);
				grayCheckbox.parentNode.replaceChild(newGray, grayCheckbox);
			}

			setupCheckboxes();
		}

		const affiliateCheckbox = document.getElementById("createAffiliate");
		if (affiliateCheckbox) {
			const newAffiliate = affiliateCheckbox.cloneNode(true);
			affiliateCheckbox.parentNode.replaceChild(
				newAffiliate,
				affiliateCheckbox,
			);
			document
				.getElementById("createAffiliate")
				.addEventListener("change", (e) => {
					document.getElementById("createAffiliateWithSection").style.display =
						e.target.checked ? "" : "none";
				});
		}

		const superTweeterCheckbox = document.getElementById("createSuperTweeter");
		if (superTweeterCheckbox) {
			const newST = superTweeterCheckbox.cloneNode(true);
			superTweeterCheckbox.parentNode.replaceChild(newST, superTweeterCheckbox);
			document
				.getElementById("createSuperTweeter")
				.addEventListener("change", (e) => {
					document.getElementById(
						"createSuperTweeterBoostSection",
					).style.display = e.target.checked ? "" : "none";
				});
		}

		const addBadgeBtn = document.getElementById("createAddBadgeBtn");
		if (addBadgeBtn) {
			const newBtn = addBadgeBtn.cloneNode(true);
			addBadgeBtn.parentNode.replaceChild(newBtn, addBadgeBtn);
			document
				.getElementById("createAddBadgeBtn")
				.addEventListener("click", () => this.addBadgeToCreateUser());
		}

		this.setupCreateUserLocationControls();
	}

	setupCreateUserLocationControls() {
		const modal = document.getElementById("createUserModal");
		if (!modal) return;
		modal.querySelectorAll(".create-location-picker-btn").forEach((btn) => {
			const newBtn = btn.cloneNode(true);
			btn.parentNode.replaceChild(newBtn, btn);
		});
		modal.querySelectorAll(".create-location-clear-btn").forEach((btn) => {
			const newBtn = btn.cloneNode(true);
			btn.parentNode.replaceChild(newBtn, btn);
		});
		modal.querySelectorAll(".create-location-picker-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const target = btn.dataset.locationPicker;
				if (!target) return;
				this.openLocationPicker(target);
			});
		});
		modal.querySelectorAll(".create-location-clear-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const target = btn.dataset.locationClear;
				if (!target) return;
				this.clearLocationInputs(target, true);
			});
		});
		["createCreation", "createLogin"].forEach((key) => {
			const fields = this.locationFieldMap[key];
			if (!fields) return;
			const ids = [
				fields.city,
				fields.country,
				fields.latitude,
				fields.longitude,
				fields.timezone,
			];
			ids.forEach((id) => {
				const el = document.getElementById(id);
				if (!el) return;
				const newEl = el.cloneNode(true);
				el.parentNode.replaceChild(newEl, el);
			});
			ids.forEach((id) => {
				const el = document.getElementById(id);
				if (!el) return;
				el.addEventListener("input", () => this.syncLocationPreview(key));
			});
			const torToggle = document.getElementById(fields.tor);
			if (torToggle) {
				const newTor = torToggle.cloneNode(true);
				torToggle.parentNode.replaceChild(newTor, torToggle);
				document
					.getElementById(fields.tor)
					?.addEventListener("change", () => this.syncLocationPreview(key));
			}
			this.syncLocationPreview(key);
		});
	}

	async loadBadgesForCreateUser() {
		try {
			const data = await this.apiCall("/api/admin/badges");
			const selector = document.getElementById("createBadgeSelector");
			if (!selector) return;
			selector.innerHTML = '<option value="">Select badge...</option>';
			for (const badge of data.badges || []) {
				const opt = document.createElement("option");
				opt.value = badge.id;
				opt.textContent = badge.name;
				selector.appendChild(opt);
			}
		} catch {}
	}

	addBadgeToCreateUser() {
		const selector = document.getElementById("createBadgeSelector");
		const container = document.getElementById("createSelectedBadges");
		if (!selector || !container) return;
		const badgeId = selector.value;
		if (!badgeId) return;
		const badgeName = selector.options[selector.selectedIndex].text;
		if (!this.createUserSelectedBadges) this.createUserSelectedBadges = [];
		if (this.createUserSelectedBadges.includes(badgeId)) return;
		this.createUserSelectedBadges.push(badgeId);
		const badgeEl = document.createElement("span");
		badgeEl.className = "badge bg-primary d-flex align-items-center gap-1";
		badgeEl.dataset.badgeId = badgeId;
		badgeEl.textContent = badgeName;
		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "btn-close btn-close-white ms-1";
		removeBtn.style.fontSize = "0.6rem";
		removeBtn.addEventListener("click", () => {
			this.createUserSelectedBadges = this.createUserSelectedBadges.filter(
				(id) => id !== badgeId,
			);
			badgeEl.remove();
		});
		badgeEl.appendChild(removeBtn);
		container.appendChild(badgeEl);
		selector.value = "";
	}

	async createUser() {
		const username = document.getElementById("createUsername").value.trim();
		const name = document.getElementById("createName").value.trim();
		const bio = document.getElementById("createBio").value.trim();
		const verified = document.getElementById("createVerified").checked;
		const gold = document.getElementById("createGold")?.checked || false;
		const gray = document.getElementById("createGray")?.checked || false;
		const isAdmin = document.getElementById("createAdmin").checked;
		const affiliate =
			document.getElementById("createAffiliate")?.checked || false;
		const affiliateWith =
			document.getElementById("createAffiliateWith")?.value.trim() || null;
		const superTweeter =
			document.getElementById("createSuperTweeter")?.checked || false;
		const superTweeterBoost =
			parseFloat(document.getElementById("createSuperTweeterBoost")?.value) ||
			50;

		const creationCity =
			document.getElementById("createCreationCity")?.value.trim() || null;
		const creationCountry =
			document.getElementById("createCreationCountry")?.value.trim() || null;
		const creationLatitude =
			document.getElementById("createCreationLatitude")?.value.trim() || null;
		const creationLongitude =
			document.getElementById("createCreationLongitude")?.value.trim() || null;
		const creationTimezone =
			document.getElementById("createCreationTimezone")?.value.trim() || null;
		const creationTor =
			document.getElementById("createCreationTor")?.checked || false;
		const creationDatacenterWarning =
			document.getElementById("createCreationDatacenterWarning")?.checked ||
			false;

		const loginCity =
			document.getElementById("createLoginCity")?.value.trim() || null;
		const loginCountry =
			document.getElementById("createLoginCountry")?.value.trim() || null;
		const loginLatitude =
			document.getElementById("createLoginLatitude")?.value.trim() || null;
		const loginLongitude =
			document.getElementById("createLoginLongitude")?.value.trim() || null;
		const loginTimezone =
			document.getElementById("createLoginTimezone")?.value.trim() || null;
		const loginTor =
			document.getElementById("createLoginTor")?.checked || false;
		const loginDatacenterWarning =
			document.getElementById("createLoginDatacenterWarning")?.checked || false;
		const loginPreserveOverride =
			document.getElementById("createLoginPreserveOverride")?.checked || false;

		const badges = this.createUserSelectedBadges || [];

		if (!username) {
			this.showError("Username is required");
			return;
		}

		let accountCreationTransparency = null;
		if (
			creationCity ||
			creationCountry ||
			creationLatitude ||
			creationLongitude ||
			creationTimezone ||
			creationTor ||
			creationDatacenterWarning
		) {
			accountCreationTransparency = {
				city: creationCity,
				country: creationCountry,
				latitude: creationLatitude ? parseFloat(creationLatitude) : null,
				longitude: creationLongitude ? parseFloat(creationLongitude) : null,
				timezone: creationTimezone,
				tor: creationTor,
				datacenterWarning: creationDatacenterWarning,
			};
		}

		let accountLoginTransparency = null;
		if (
			loginCity ||
			loginCountry ||
			loginLatitude ||
			loginLongitude ||
			loginTimezone ||
			loginTor ||
			loginDatacenterWarning ||
			loginPreserveOverride
		) {
			accountLoginTransparency = {
				city: loginCity,
				country: loginCountry,
				latitude: loginLatitude ? parseFloat(loginLatitude) : null,
				longitude: loginLongitude ? parseFloat(loginLongitude) : null,
				timezone: loginTimezone,
				tor: loginTor,
				datacenterWarning: loginDatacenterWarning,
				preserveOverride: loginPreserveOverride,
			};
		}

		try {
			await this.apiCall("/api/admin/users", {
				method: "POST",
				body: JSON.stringify({
					username,
					name,
					bio,
					verified,
					gold,
					gray,
					admin: isAdmin,
					affiliate,
					affiliateWith: affiliate ? affiliateWith : null,
					superTweeter,
					superTweeterBoost: superTweeter ? superTweeterBoost : null,
					badges,
					accountCreationTransparency,
					accountLoginTransparency,
				}),
			});

			bootstrap.Modal.getInstance(
				document.getElementById("createUserModal"),
			).hide();
			this.showSuccess("User created successfully");
			this.loadUsers(this.currentPage.users || 1);
		} catch (err) {
			this.showError(err.message || "Failed to create user");
		}
	}

	setupCloneForm() {
		const form = document.getElementById("cloneForm");
		if (!form) return;

		form.addEventListener("submit", async (e) => {
			e.preventDefault();

			const sourceId = document.getElementById("sourceId")?.value?.trim();
			const username = document.getElementById("newUsername")?.value?.trim();
			const name = document.getElementById("newDisplayName")?.value?.trim();
			const cloneRelations =
				!!document.getElementById("cloneRelations")?.checked;
			const cloneGhosts = !!document.getElementById("cloneGhosts")?.checked;
			const cloneTweets = !!document.getElementById("cloneTweets")?.checked;
			const cloneReplies = !!document.getElementById("cloneReplies")?.checked;
			const cloneRetweets = !!document.getElementById("cloneRetweets")?.checked;
			const cloneReactions =
				!!document.getElementById("cloneReactions")?.checked;
			const cloneCommunities =
				!!document.getElementById("cloneCommunities")?.checked;
			const cloneMedia = !!document.getElementById("cloneMedia")?.checked;
			const cloneAffiliate =
				!!document.getElementById("cloneAffiliate")?.checked;
			const resultEl = document.getElementById("result");

			if (!sourceId) {
				if (resultEl) resultEl.textContent = "Source username is required";
				return;
			}
			if (!username) {
				if (resultEl) resultEl.textContent = "New username is required";
				return;
			}

			if (!this.isSuperAdmin) {
				try {
					const sourceLookup = await this.apiCall(
						`/api/admin/users/${encodeURIComponent(sourceId)}`,
					);
					const sourceUser = sourceLookup?.user;
					if (sourceUser?.superadmin) {
						if (resultEl) {
							resultEl.className = "error";
							resultEl.textContent =
								"Only SuperAdmins can clone SuperAdmin accounts.";
						} else {
							this.showError("Only SuperAdmins can clone SuperAdmin accounts.");
						}
						return;
					}
				} catch (lookupErr) {
					if (resultEl) {
						resultEl.className = "error";
						resultEl.textContent =
							lookupErr?.message || "Source user not found";
					} else {
						this.showError(lookupErr?.message || "Source user not found");
					}
					return;
				}
			}

			try {
				const payload = { username };
				if (name) payload.name = name;
				payload.cloneRelations = cloneRelations;
				payload.cloneGhosts = cloneGhosts;
				payload.cloneTweets = cloneTweets;
				payload.cloneReplies = cloneReplies;
				payload.cloneRetweets = cloneRetweets;
				payload.cloneReactions = cloneReactions;
				payload.cloneCommunities = cloneCommunities;
				payload.cloneMedia = cloneMedia;
				payload.cloneAffiliate = cloneAffiliate;

				const data = await this.apiCall(
					`/api/admin/users/${encodeURIComponent(sourceId)}/clone`,
					{
						method: "POST",
						body: JSON.stringify(payload),
					},
				);

				if (resultEl) {
					resultEl.className = "success";
					const createdUsername = data?.username || username || data?.id || "";
					resultEl.textContent = `Cloned user created: @${createdUsername}`;
					const a = document.createElement("a");
					a.href = `/@${encodeURIComponent(createdUsername)}`;
					a.textContent = " Open profile";
					a.style.marginLeft = "8px";
					resultEl.appendChild(a);
				}
			} catch (err) {
				if (resultEl) {
					resultEl.className = "error";
					resultEl.textContent = err?.message || "Failed to clone user";
				} else {
					this.showError(err?.message || "Failed to clone user");
				}
			}
		});
	}

	async loadModerationLogs(page = 1) {
		const searchInput = document.getElementById("moderationLogSearch");
		const searchQuery = searchInput ? searchInput.value.trim() : "";
		let url = `/api/admin/moderation-logs?page=${page}&limit=50`;
		if (searchQuery) {
			url += `&search=${encodeURIComponent(searchQuery)}`;
		}

		const data = await this.apiCall(url);
		this.currentPage.moderationLogs = page;
		this.renderModerationLogs(data.logs, data.pagination);
	}

	searchModerationLogs() {
		this.loadModerationLogs(1);
	}

	renderModerationLogs(logs, pagination) {
		const container = document.getElementById("moderationLogsTable");

		if (!logs || logs.length === 0) {
			container.innerHTML = `
        <div class="alert alert-info">
          <i class="bi bi-info-circle"></i> No moderation logs found.
        </div>
      `;
			return;
		}

		const actionIcons = {
			verify_user: "✓",
			unverify_user: "✗",
			suspend_user: "🚫",
			restrict_user: "⚠️",
			shadowban_user: "👻",
			unsuspend_user: "✓",
			unrestrict_user: "✓",
			delete_user: "🗑️",
			delete_post: "🗑️",
			edit_post: "✏️",
			create_post_as_user: "📝",
			edit_user_profile: "✏️",
			delete_conversation: "🗑️",
			delete_message: "🗑️",
			send_affiliate_request: "🤝",
			force_accept_affiliate: "✅",
			force_reject_affiliate: "⛔",
		};

		const actionColors = {
			verify_user: "success",
			unverify_user: "warning",
			suspend_user: "danger",
			restrict_user: "warning",
			shadowban_user: "secondary",
			unsuspend_user: "success",
			unrestrict_user: "success",
			delete_user: "danger",
			delete_post: "danger",
			edit_post: "info",
			create_post_as_user: "primary",
			edit_user_profile: "info",
			delete_conversation: "danger",
			delete_message: "warning",
			send_affiliate_request: "primary",
			force_accept_affiliate: "success",
			force_reject_affiliate: "danger",
		};

		const actionLabels = {
			verify_user: "Verified User",
			unverify_user: "Unverified User",
			suspend_user: "Suspended User",
			restrict_user: "Restricted User",
			shadowban_user: "Shadowbanned User",
			unsuspend_user: "Unsuspended User",
			unrestrict_user: "Unrestricted User",
			delete_user: "Deleted User",
			delete_post: "Deleted Post",
			edit_post: "Edited Post",
			create_post_as_user: "Created Post As User",
			edit_user_profile: "Edited User Profile",
			delete_conversation: "Deleted Conversation",
			delete_message: "Deleted Message",
			send_affiliate_request: "Sent Affiliate Request",
			force_accept_affiliate: "Force Accepted Affiliate",
			force_reject_affiliate: "Force Rejected Affiliate",
		};

		container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Moderator</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs
							.map((log) => {
								const formattedDate = this.formatDate(log.created_at);
								const icon = actionIcons[log.action] || "•";
								const color = actionColors[log.action] || "secondary";
								const label = actionLabels[log.action] || log.action;

								let detailsHtml = "";
								if (log.details) {
									const details = log.details;
									if (details.username) {
										detailsHtml += `<strong>User:</strong> @${this.escapeHtml(
											details.username,
										)}<br>`;
									}
									if (details.reason) {
										detailsHtml += `<strong>Reason:</strong> ${this.escapeHtml(
											details.reason,
										)}<br>`;
									}
									if (details.changes) {
										detailsHtml += "<strong>Changes:</strong><br>";
										for (const [key, value] of Object.entries(
											details.changes,
										)) {
											if (value.old !== undefined && value.new !== undefined) {
												detailsHtml += `&nbsp;&nbsp;${key}: ${this.escapeHtml(
													String(value.old),
												)} → ${this.escapeHtml(String(value.new))}<br>`;
											}
										}
									}
									if (details.content) {
										detailsHtml += `<strong>Content:</strong> ${this.escapeHtml(
											details.content,
										)}<br>`;
									}
									if (details.targetUser) {
										detailsHtml += `<strong>Target User:</strong> @${this.escapeHtml(
											details.targetUser,
										)}<br>`;
									}
									if (details.author) {
										detailsHtml += `<strong>Author:</strong> @${this.escapeHtml(
											details.author,
										)}<br>`;
									}
									if (details.action) {
										detailsHtml += `<strong>Action:</strong> ${details.action}<br>`;
									}
									if (details.severity) {
										detailsHtml += `<strong>Severity:</strong> ${details.severity}<br>`;
									}
									if (details.duration) {
										detailsHtml += `<strong>Duration:</strong> ${details.duration} minutes<br>`;
									}
								}

								return `
                <tr>
                  <td>
                    <small class="text-muted">${formattedDate}</small>
                  </td>
                  <td>
                    <strong>@${this.escapeHtml(log.moderator_username)}</strong>
                    ${
											log.moderator_name
												? `<br><small class="text-muted">${this.escapeHtml(
														log.moderator_name,
													)}</small>`
												: ""
										}
                  </td>
                  <td>
                    <span class="badge bg-${color}">
                      ${icon} ${label}
                    </span>
                  </td>
                  <td>
                    <span class="badge bg-secondary">${this.escapeHtml(
											log.target_type,
										)}</span>
                    <br><small class="text-muted font-monospace">${this.escapeHtml(
											log.target_id.substring(0, 8),
										)}...</small>
                  </td>
                  <td>
                    <small>${
											detailsHtml || '<em class="text-muted">No details</em>'
										}</small>
                  </td>
                </tr>
              `;
							})
							.join("")}
          </tbody>
        </table>
      </div>
    `;

		this.renderPagination("moderationLogsPagination", pagination, (page) =>
			this.loadModerationLogs(page),
		);
	}

	cacheReports(reports) {
		if (!Array.isArray(reports)) {
			this.reportsCache = [];
			this.reportsById = new Map();
			return;
		}

		this.reportsCache = reports.slice();
		const map = new Map();
		for (const report of this.reportsCache) {
			if (report?.id) {
				map.set(report.id, report);
			}
		}
		this.reportsById = map;
	}

	async getReportById(reportId) {
		if (!reportId) return null;

		const cached = this.reportsById?.get(reportId);
		if (cached) return cached;

		try {
			const response = await fetch(`/api/admin/reports?limit=200`, {
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) return null;
			const data = await response.json();
			this.cacheReports(data.reports || []);
			return this.reportsById?.get(reportId) || null;
		} catch (error) {
			console.error("Error fetching report by id:", error);
			return null;
		}
	}

	async loadReports(page = 1) {
		const limit = 50;
		const offset = (page - 1) * limit;
		this.currentPage.reports = page;

		try {
			const response = await fetch(
				`/api/admin/reports?limit=${limit}&offset=${offset}`,
				{
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
				},
			);

			if (!response.ok) throw new Error("Failed to load reports");

			const data = await response.json();
			const rawTotal =
				typeof data.total === "number"
					? data.total
					: Array.isArray(data.reports)
						? data.reports.length
						: 0;
			const total = rawTotal > 0 ? rawTotal : 0;
			const pages = total === 0 ? 1 : Math.ceil(total / limit);

			this.cacheReports(data.reports || []);
			this.displayReports(data.reports || [], {
				page,
				pages,
				total,
			});
		} catch (error) {
			console.error("Error loading reports:", error);
			document.getElementById("reportsTable").innerHTML = `
        <div class="alert alert-danger">Failed to load reports: ${error.message}</div>
      `;
		}
	}

	displayReports(reports, pagination) {
		const tableContainer = document.getElementById("reportsTable");

		if (!reports || reports.length === 0) {
			tableContainer.innerHTML = `
        <div class="alert alert-info">No reports found</div>
      `;
			this.renderPagination("reports", { page: 1, pages: 1 });
			return;
		}

		const pager = {
			page:
				(pagination && (pagination.page || pagination.currentPage)) !==
				undefined
					? pagination.page || pagination.currentPage
					: 1,
			pages:
				(pagination && (pagination.pages || pagination.totalPages)) !==
				undefined
					? pagination.pages || pagination.totalPages
					: 1,
		};

		const pendingReports = reports.filter((r) => r.status === "pending");
		const resolvedReports = reports.filter((r) => r.status === "resolved");

		let html = `<div class="table-responsive">`;

		if (pendingReports.length > 0) {
			html += `
        <h5 class="mt-3 mb-3">Pending Reports (${pendingReports.length})</h5>
        <table class="table table-dark table-striped">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Type</th>
              <th>Reported</th>
              <th>Reason</th>
              <th>Details</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pendingReports
							.map((report) => this.renderReportRow(report))
							.join("")}
          </tbody>
        </table>
      `;
		}

		if (resolvedReports.length > 0) {
			html += `
        <h5 class="mt-4 mb-3">Resolved Reports (${resolvedReports.length})</h5>
        <table class="table table-dark table-striped">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Type</th>
              <th>Reported</th>
              <th>Reason</th>
              <th>Resolution</th>
              <th>Resolved By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${resolvedReports
							.map((report) => this.renderReportRow(report, true))
							.join("")}
          </tbody>
        </table>
      `;
		}

		html += `</div>`;
		tableContainer.innerHTML = html;

		this.renderPagination("reportsPagination", pager, (nextPage) =>
			this.loadReports(nextPage),
		);
	}

	renderReportRow(report, isResolved = false) {
		const reporterLink = report.reporter
			? `<a href="/@${
					report.reporter.username
				}" target="_blank">@${this.escapeHtml(report.reporter.username)}</a>`
			: "Unknown";

		let reportedContent = "";
		if (report.reported_type === "user" && report.reported) {
			reportedContent = `<a href="/@${
				report.reported.username
			}" target="_blank">@${this.escapeHtml(report.reported.username)}</a>`;
		} else if (report.reported_type === "post" && report.reported) {
			reportedContent = `<a href="/tweet/${
				report.reported.id
			}" target="_blank">Tweet</a><br><small class="text-muted">${this.escapeHtml(
				report.reported.content?.substring(0, 50) || "",
			)}...</small>`;
		} else {
			reportedContent = "Deleted";
		}

		const reasonLabels = {
			spam: "Spam",
			harassment: "Harassment",
			hate_speech: "Hate Speech",
			violence: "Violence",
			nsfw: "NSFW",
			impersonation: "Impersonation",
			misinformation: "Misinformation",
			illegal: "Illegal",
			other: "Other",
		};

		if (isResolved) {
			const resolutionLabels = {
				ignored: "Ignored",
				banned_reporter: "Reporter Banned",
				ban_user: "User Banned",
				delete_post: "Post Deleted",
				fact_check: "Fact-Checked",
			};

			return `
        <tr>
          <td>${reporterLink}</td>
          <td><span class="badge bg-secondary">${
						report.reported_type
					}</span></td>
          <td>${reportedContent}</td>
          <td><span class="badge bg-warning">${
						reasonLabels[report.reason] || report.reason
					}</span></td>
          <td><span class="badge bg-success">${
						resolutionLabels[report.resolution_action] ||
						report.resolution_action
					}</span></td>
          <td>${report.resolved_by || "N/A"}</td>
          <td><small>${new Date(
						report.resolved_at,
					).toLocaleString()}</small></td>
        </tr>
      `;
		}

		return `
      <tr>
        <td>${reporterLink}</td>
        <td><span class="badge bg-secondary">${report.reported_type}</span></td>
        <td>${reportedContent}</td>
        <td><span class="badge bg-warning">${
					reasonLabels[report.reason] || report.reason
				}</span></td>
        <td>
          <button class="btn btn-sm btn-info" onclick="adminPanel.showReportDetails('${
						report.id
					}')">
            <i class="bi bi-info-circle"></i>
          </button>
        </td>
        <td><small>${new Date(report.created_at).toLocaleString()}</small></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="adminPanel.showReportActionModal('${
						report.id
					}')">
            <i class="bi bi-gavel"></i> Resolve
          </button>
        </td>
      </tr>
    `;
	}

	async showReportDetails(reportId) {
		const report = await this.getReportById(reportId);
		if (!report) {
			alert("Report not found");
			return;
		}

		if (!this.reportDetailsModalEl) {
			const modalEl = document.createElement("div");
			modalEl.className = "modal fade";
			modalEl.id = "reportDetailsModal";
			modalEl.tabIndex = -1;
			modalEl.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Report Details</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      `;
			document.body.appendChild(modalEl);
			this.reportDetailsModalEl = modalEl;
			this.reportDetailsModal = new bootstrap.Modal(modalEl);
		}

		const reasonLabels = {
			spam: "Spam",
			harassment: "Harassment",
			hate_speech: "Hate Speech",
			violence: "Violence",
			nsfw: "NSFW",
			impersonation: "Impersonation",
			misinformation: "Misinformation",
			illegal: "Illegal",
			other: "Other",
		};

		const resolutionLabels = {
			ignored: "Ignored",
			ban_reporter: "Reporter Banned",
			ban_user: "User Banned",
			delete_post: "Post Deleted",
			fact_check: "Fact-Checked",
		};

		const reporterUsername = report.reporter?.username
			? `@${this.escapeHtml(String(report.reporter.username))}`
			: "Unknown";
		const reporterLink = report.reporter?.username
			? `<a href="/@${this.escapeHtml(
					String(report.reporter.username),
				)}" target="_blank">${reporterUsername}</a>`
			: reporterUsername;
		const reporterName = report.reporter?.name
			? `<br><small class="text-muted">${this.escapeHtml(
					String(report.reporter.name),
				)}</small>`
			: "";

		let reportedInfo = "Deleted";
		if (report.reported_type === "user" && report.reported) {
			const reportedUsername = String(report.reported.username || "");
			reportedInfo = `<a href="/@${this.escapeHtml(
				reportedUsername,
			)}" target="_blank">@${this.escapeHtml(reportedUsername)}</a>`;
			if (report.reported.name) {
				reportedInfo += `<br><small class="text-muted">${this.escapeHtml(
					String(report.reported.name),
				)}</small>`;
			}
		} else if (report.reported_type === "post" && report.reported) {
			const reportedId = String(report.reported.id || "");
			reportedInfo = `<a href="/tweet/${this.escapeHtml(
				reportedId,
			)}" target="_blank">Tweet</a>`;
			if (report.reported.content) {
				const reportedSnippet = String(report.reported.content);
				const truncatedSnippet =
					reportedSnippet.length > 140
						? `${reportedSnippet.slice(0, 140)}...`
						: reportedSnippet;
				reportedInfo += `<br><small class="text-muted">${this.escapeHtml(
					truncatedSnippet,
				)}</small>`;
			}
		}

		const reasonLabel =
			reasonLabels[report.reason] || report.reason || "Unknown";
		const additionalInfo = this.escapeHtml(report.additional_info || "None");
		const createdAt = report.created_at
			? new Date(report.created_at).toLocaleString()
			: "Unknown";
		const statusBadge =
			report.status === "resolved"
				? '<span class="badge bg-success">Resolved</span>'
				: '<span class="badge bg-warning text-dark">Pending</span>';

		let resolutionSection = "<em>Not resolved yet.</em>";
		if (report.status === "resolved") {
			const resolutionLabel =
				resolutionLabels[report.resolution_action] ||
				report.resolution_action ||
				"Unknown";
			const resolvedBy = this.escapeHtml(report.resolved_by || "Unknown");
			const resolvedAt = report.resolved_at
				? new Date(report.resolved_at).toLocaleString()
				: "Unknown";
			resolutionSection = `
        <div class="d-flex flex-column gap-1">
          <div><strong>Resolution:</strong> ${this.escapeHtml(
						resolutionLabel,
					)}</div>
          <div><strong>Resolved By:</strong> ${resolvedBy}</div>
          <div><strong>Resolved At:</strong> ${this.escapeHtml(
						resolvedAt,
					)}</div>
        </div>
      `;
		}

		const modalBody = this.reportDetailsModalEl.querySelector(".modal-body");
		if (!modalBody) return;
		const reportIdValue = report.id != null ? String(report.id) : "";
		const shortId = reportIdValue
			? `${this.escapeHtml(reportIdValue.slice(0, 8))}...`
			: "";
		const modalTitle = this.reportDetailsModalEl.querySelector(".modal-title");
		if (modalTitle) {
			modalTitle.textContent = `Report ${shortId || "Details"}`;
		}

		modalBody.innerHTML = `
      <div class="d-flex flex-column gap-3">
        <div>
          <strong>Report ID:</strong>
          <span class="font-monospace">${this.escapeHtml(reportIdValue)}</span>
        </div>
        <div><strong>Status:</strong> ${statusBadge}</div>
        <div><strong>Reporter:</strong> ${reporterLink}${reporterName}</div>
        <div><strong>Reported:</strong> ${reportedInfo}</div>
        <div>
          <strong>Reason:</strong>
          <span class="badge bg-warning text-dark">${this.escapeHtml(
						reasonLabel,
					)}</span>
        </div>
        <div>
          <strong>Additional Info:</strong><br>
          <span class="text-muted">${additionalInfo}</span>
        </div>
        <div><strong>Created:</strong> ${this.escapeHtml(createdAt)}</div>
        <div>
          <strong>Resolution Details:</strong><br>
          ${resolutionSection}
        </div>
      </div>
    `;

		this.reportDetailsModal.show();
	}

	findReportById(reportId) {
		if (!reportId) return null;
		return this.reportsById?.get(reportId) || null;
	}

	async showReportActionModal(reportId) {
		try {
			const response = await fetch(`/api/admin/reports?limit=200`, {
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) throw new Error("Failed to load report");

			const data = await response.json();
			const report = data.reports.find((r) => r.id === reportId);

			if (!report) {
				alert("Report not found");
				return;
			}

			document.getElementById("reportActionId").value = reportId;

			const reasonLabels = {
				spam: "Spam",
				harassment: "Harassment",
				hate_speech: "Hate Speech",
				violence: "Violence",
				nsfw: "NSFW",
				impersonation: "Impersonation",
				misinformation: "Misinformation",
				illegal: "Illegal",
				other: "Other",
			};

			let reportedInfo = "";
			if (report.reported_type === "user" && report.reported) {
				reportedInfo = `User: @${this.escapeHtml(report.reported.username)}`;
			} else if (report.reported_type === "post" && report.reported) {
				reportedInfo = `Tweet: ${this.escapeHtml(
					report.reported.content?.substring(0, 100) || "",
				)}...`;
			}

			document.getElementById("reportActionDetails").innerHTML = `
        <div class="alert alert-secondary">
          <strong>Report Type:</strong> ${report.reported_type}<br>
          <strong>Reported:</strong> ${reportedInfo}<br>
          <strong>Reason:</strong> ${
						reasonLabels[report.reason] || report.reason
					}<br>
          <strong>Additional Info:</strong> ${this.escapeHtml(
						report.additional_info || "None",
					)}<br>
          <strong>Reporter:</strong> @${this.escapeHtml(
						report.reporter?.username || "Unknown",
					)}
        </div>
      `;

			const actionSelect = document.getElementById("reportAction");
			actionSelect.value = "";
			document.getElementById("reportActionFields").innerHTML = "";

			actionSelect.onchange = () => {
				const action = actionSelect.value;
				const fieldsContainer = document.getElementById("reportActionFields");

				if (action === "ban_user") {
					fieldsContainer.innerHTML = `
            <div class="mb-3">
              <label class="form-label">Duration (hours, leave empty for permanent)</label>
              <input type="number" id="banDuration" class="form-control" min="1" placeholder="e.g., 24">
            </div>
						<div class="mb-3">
							<label class="form-label">Action</label>
							<select id="banAction" class="form-select">
								<option value="suspend" selected>Suspend</option>
								<option value="restrict">Restrict (browse-only)</option>
							</select>
						</div>
						<!-- Severity removed for bans -->
          `;
				} else if (action === "fact_check") {
					fieldsContainer.innerHTML = `
            <div class="mb-3">
              <label class="form-label">Fact-Check Note *</label>
              <textarea id="factCheckNoteReport" class="form-control" rows="3" required></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Severity</label>
              <select id="factCheckSeverityReport" class="form-select">
                <option value="info">Info</option>
                <option value="warning" selected>Warning</option>
                <option value="danger">Danger</option>
              </select>
            </div>
          `;
				} else {
					fieldsContainer.innerHTML = "";
				}
			};

			const modal = new bootstrap.Modal(
				document.getElementById("reportActionModal"),
			);
			modal.show();
		} catch (error) {
			console.error("Error loading report:", error);
			alert("Failed to load report details");
		}
	}

	async submitReportAction() {
		const reportId = document.getElementById("reportActionId").value;
		const action = document.getElementById("reportAction").value;

		if (!action) {
			alert("Please select an action");
			return;
		}

		const body = { action };

		if (action === "ban_user") {
			const duration = document.getElementById("banDuration")?.value;
			const banAction = document.getElementById("banAction")?.value;
			if (duration) body.duration = Number.parseInt(duration);
			if (banAction) body.banAction = banAction;
		} else if (action === "fact_check") {
			const note = document.getElementById("factCheckNoteReport")?.value;
			const severity = document.getElementById(
				"factCheckSeverityReport",
			)?.value;
			if (!note) {
				alert("Please provide a fact-check note");
				return;
			}
			body.note = note;
			body.severity = severity;
		}

		try {
			const response = await fetch(`/api/admin/reports/${reportId}/resolve`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.error || "Failed to resolve report");
			}

			alert("Report resolved successfully");
			bootstrap.Modal.getInstance(
				document.getElementById("reportActionModal"),
			).hide();
			this.loadReports(this.currentPage.reports || 1);
		} catch (error) {
			console.error("Error resolving report:", error);
			alert(`Failed to resolve report: ${error.message}`);
		}
	}

	async loadCommunities(page = 1) {
		const limit = 20;
		const offset = (page - 1) * limit;

		try {
			const response = await fetch(
				`/api/communities?limit=${limit}&offset=${offset}`,
				{
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
				},
			);

			if (!response.ok) throw new Error("Failed to load communities");

			const data = await response.json();
			this.currentPage.communities = page;
			this.displayCommunities(data.communities || [], {
				currentPage: page,
				totalPages: Math.ceil((data.communities?.length || 0) / limit),
				totalItems: data.communities?.length || 0,
			});
		} catch (error) {
			console.error("Error loading communities:", error);
			document.getElementById("communitiesTable").innerHTML = `
        <div class="alert alert-danger">Failed to load communities: ${error.message}</div>
      `;
		}
	}

	displayCommunities(communities, pagination) {
		const tableContainer = document.getElementById("communitiesTable");

		if (!communities || communities.length === 0) {
			tableContainer.innerHTML = `
        <div class="alert alert-info">No communities found</div>
      `;
			return;
		}

		tableContainer.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-success" onclick="adminPanel.showCreateCommunityModal()">
          <i class="bi bi-plus-circle"></i> Create Community
        </button>
      </div>
      <div class="table-responsive">
        <table class="table table-dark table-striped">
          <thead>
            <tr>
              <th>Community</th>
              <th>Description</th>
              <th>Access</th>
              <th>Members</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${communities
							.map((community) => {
								const accessIcon =
									community.access_mode === "locked" ? "🔒" : "🔓";
								return `
                <tr>
                  <td>
                    <div class="d-flex align-items-center">
                      ${
												community.icon
													? `<img src="/api/uploads/${community.icon}.webp" width="40" height="40" class="rounded me-2" />`
													: `<div style="width:40px;height:40px;background:#495057;display:flex;align-items:center;justify-content:center;border-radius:50%;margin-right:8px;font-weight:bold;">${community.name[0].toUpperCase()}</div>`
											}
                      <div>
                        <strong>${this.escapeHtml(community.name)}</strong>
                        <br>
                        <small class="text-muted font-monospace">${this.escapeHtml(
													community.id.substring(0, 8),
												)}...</small>
                      </div>
                    </div>
                  </td>
                  <td style="max-width: 200px;">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${this.escapeHtml(
												community.description || "No description",
											)}
                    </div>
                  </td>
                  <td>
                    ${accessIcon} ${
											community.access_mode === "locked" ? "Locked" : "Open"
										}
                  </td>
                  <td>${community.member_count || 0}</td>
                  <td>
                    <small>${this.formatDateOnly(community.created_at)}</small>
                  </td>
                  <td>
                    <button class="btn btn-sm btn-info" onclick="adminPanel.viewCommunity('${
											community.id
										}')">
                      <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="adminPanel.showEditCommunityModal('${
											community.id
										}')">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="adminPanel.manageCommunityMembers('${
											community.id
										}')">
                      <i class="bi bi-people"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteCommunity('${
											community.id
										}')">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              `;
							})
							.join("")}
          </tbody>
        </table>
      </div>
    `;

		if (pagination && pagination.totalPages > 1) {
			this.renderPagination("communitiesPagination", pagination, (page) =>
				this.loadCommunities(page),
			);
		} else {
			document.getElementById("communitiesPagination").innerHTML = "";
		}
	}

	async viewCommunity(communityId) {
		window.open(`/communities/${communityId}`, "_blank");
	}

	async deleteCommunity(communityId) {
		if (
			!confirm(
				"Are you sure you want to delete this community? This action cannot be undone.",
			)
		)
			return;

		try {
			const response = await fetch(`/api/communities/${communityId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) throw new Error("Failed to delete community");

			alert("Community deleted successfully");
			this.loadCommunities(this.currentPage.communities || 1);
		} catch (error) {
			console.error("Error deleting community:", error);
			alert("Failed to delete community");
		}
	}

	showCreateCommunityModal() {
		const modalHTML = `
      <div class="modal fade show d-block" style="background: rgba(0,0,0,0.5);" id="createCommunityAdminModal">
        <div class="modal-dialog">
          <div class="modal-content bg-dark text-light">
            <div class="modal-header">
              <h5 class="modal-title">Create Community</h5>
              <button type="button" class="btn-close btn-close-white" onclick="document.getElementById('createCommunityAdminModal').remove()"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Community Name *</label>
                <input type="text" class="form-control" id="adminCommunityName" maxlength="50" required />
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea class="form-control" id="adminCommunityDescription" rows="3"></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">Rules</label>
                <textarea class="form-control" id="adminCommunityRules" rows="3"></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">Access Mode</label>
                <select class="form-select" id="adminAccessMode">
                  <option value="open">Open - Anyone can join instantly</option>
                  <option value="locked">Locked - Requires approval</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Owner Username (optional)</label>
                <input type="text" class="form-control" id="adminCommunityOwner" placeholder="Leave empty for no owner" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('createCommunityAdminModal').remove()">Cancel</button>
              <button type="button" class="btn btn-primary" onclick="adminPanel.createCommunity()">Create</button>
            </div>
          </div>
        </div>
      </div>
    `;
		document.body.insertAdjacentHTML("beforeend", modalHTML);
	}

	async createCommunity() {
		const name = document.getElementById("adminCommunityName").value.trim();
		const description = document
			.getElementById("adminCommunityDescription")
			.value.trim();
		const rules = document.getElementById("adminCommunityRules").value.trim();
		const accessMode = document.getElementById("adminAccessMode").value;
		const ownerUsername = document
			.getElementById("adminCommunityOwner")
			.value.trim();

		if (!name) {
			alert("Community name is required");
			return;
		}

		try {
			const response = await fetch("/api/communities", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify({
					name,
					description,
					rules,
					access_mode: accessMode,
					owner_username: ownerUsername || null,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to create community");
			}

			alert("Community created successfully");
			document.getElementById("createCommunityAdminModal").remove();
			this.loadCommunities(1);
		} catch (error) {
			console.error("Error creating community:", error);
			alert(`Failed to create community: ${error.message}`);
		}
	}

	async showEditCommunityModal(communityId) {
		try {
			const response = await fetch(`/api/communities/${communityId}`, {
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) throw new Error("Failed to fetch community");

			const data = await response.json();
			const community = data.community;

			const modalHTML = `
        <div class="modal fade show d-block" style="background: rgba(0,0,0,0.5);" id="editCommunityAdminModal">
          <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
              <div class="modal-header">
                <h5 class="modal-title">Edit Community</h5>
                <button type="button" class="btn-close btn-close-white" onclick="document.getElementById('editCommunityAdminModal').remove()"></button>
              </div>
              <div class="modal-body">
                <div class="mb-3">
                  <label class="form-label">Community Name *</label>
                  <input type="text" class="form-control" id="adminEditCommunityName" maxlength="50" value="${this.escapeHtml(
										community.name,
									)}" required />
                </div>
                <div class="mb-3">
                  <label class="form-label">Description</label>
                  <textarea class="form-control" id="adminEditCommunityDescription" rows="3">${this.escapeHtml(
										community.description || "",
									)}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Rules</label>
                  <textarea class="form-control" id="adminEditCommunityRules" rows="3">${this.escapeHtml(
										community.rules || "",
									)}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Access Mode</label>
                  <select class="form-select" id="adminEditAccessMode">
                    <option value="open" ${
											community.access_mode === "open" ? "selected" : ""
										}>Open - Anyone can join instantly</option>
                    <option value="locked" ${
											community.access_mode === "locked" ? "selected" : ""
										}>Locked - Requires approval</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('editCommunityAdminModal').remove()">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="adminPanel.updateCommunity('${communityId}')">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      `;
			document.body.insertAdjacentHTML("beforeend", modalHTML);
		} catch (error) {
			console.error("Error loading community:", error);
			alert("Failed to load community details");
		}
	}

	async updateCommunity(communityId) {
		const name = document.getElementById("adminEditCommunityName").value.trim();
		const description = document
			.getElementById("adminEditCommunityDescription")
			.value.trim();
		const rules = document
			.getElementById("adminEditCommunityRules")
			.value.trim();
		const accessMode = document.getElementById("adminEditAccessMode").value;

		if (!name) {
			alert("Community name is required");
			return;
		}

		try {
			const response = await fetch(`/api/communities/${communityId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify({
					name,
					description,
					rules,
					access_mode: accessMode,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to update community");
			}

			alert("Community updated successfully");
			document.getElementById("editCommunityAdminModal").remove();
			this.loadCommunities(this.currentPage.communities || 1);
		} catch (error) {
			console.error("Error updating community:", error);
			alert(`Failed to update community: ${error.message}`);
		}
	}

	async manageCommunityMembers(communityId) {
		try {
			const response = await fetch(`/api/communities/${communityId}/members`, {
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) throw new Error("Failed to fetch members");

			const data = await response.json();
			const members = data.members || [];

			const modalHTML = `
        <div class="modal fade show d-block" style="background: rgba(0,0,0,0.5);" id="manageMembersModal">
          <div class="modal-dialog modal-lg">
            <div class="modal-content bg-dark text-light">
              <div class="modal-header">
                <h5 class="modal-title">Manage Community Members</h5>
                <button type="button" class="btn-close btn-close-white" onclick="document.getElementById('manageMembersModal').remove()"></button>
              </div>
              <div class="modal-body">
                <table class="table table-dark table-sm">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${members
											.map(
												(m) => `
                      <tr>
                        <td>${this.escapeHtml(m.username)}</td>
                        <td>
                          <span class="badge bg-${
														m.role === "owner"
															? "warning"
															: m.role === "admin"
																? "info"
																: m.role === "mod"
																	? "success"
																	: "secondary"
													}">${m.role}</span>
                        </td>
                        <td><small>${this.formatDateOnly(
													m.joined_at,
												)}</small></td>
                        <td>
                          ${
														m.role !== "owner"
															? `
                            <button class="btn btn-sm btn-danger" onclick="adminPanel.removeCommunityMember('${communityId}', '${m.user_id}')">
                              <i class="bi bi-trash"></i>
                            </button>
                          `
															: '<span class="text-muted">Owner</span>'
													}
                        </td>
                      </tr>
                    `,
											)
											.join("")}
                  </tbody>
                </table>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('manageMembersModal').remove()">Close</button>
              </div>
            </div>
          </div>
        </div>
      `;
			document.body.insertAdjacentHTML("beforeend", modalHTML);
		} catch (error) {
			console.error("Error loading members:", error);
			alert("Failed to load community members");
		}
	}

	async removeCommunityMember(communityId, userId) {
		if (!confirm("Remove this member from the community?")) return;

		try {
			const response = await fetch(
				`/api/communities/${communityId}/members/${userId}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
				},
			);

			if (!response.ok) throw new Error("Failed to remove member");

			alert("Member removed successfully");
			document.getElementById("manageMembersModal").remove();
			this.manageCommunityMembers(communityId);
		} catch (error) {
			console.error("Error removing member:", error);
			alert("Failed to remove member");
		}
	}

	async loadExtensionsManager() {
		try {
			if (!this.extensionsSectionInitialized) {
				this.setupExtensionsForm();
				this.extensionsSectionInitialized = true;
			}
			let list = [];
			try {
				const data = await this.apiCall("/api/admin/extensions");
				list = Array.isArray(data.extensions) ? data.extensions : [];
			} catch {
				// ignore — we'll attempt fallback below
			}

			// If admin returned nothing, also try the public list (or merge both)
			if (!list || list.length === 0) {
				try {
					const resp = await fetch("/api/extensions", { cache: "no-store" });
					if (resp.ok) {
						const pub = await resp.json();
						const pubList = Array.isArray(pub.extensions) ? pub.extensions : [];
						// Normalize public entries into admin-style records
						list = pubList.map((e) => ({
							id: e.id,
							name: e.name || e.title || "Untitled",
							version: e.version || "0.0.0",
							author: e.author || null,
							summary: e.summary || null,
							description: e.description || null,
							website: e.website || null,
							changelog_url: e.changelogUrl || e.changelog_url || null,
							root_file: e.rootFile || e.root_file || null,
							entry_type: e.entryType || e.entry_type || "module",
							styles: e.styles || [],
							capabilities: e.capabilities || [],
							targets: e.targets || [],
							bundle_hash: e.bundleHash || e.bundle_hash || null,
							enabled: !!e.enabled,
							settings_schema: e.settingsSchema || e.settings_schema || [],
							managed: false,
							install_dir: e.installDir || e.install_dir || null,
						}));
					}
				} catch (err2) {
					console.error("Fallback public extensions fetch failed", err2);
				}
			}
			list = (list || []).map((e) => ({
				...e,
				managed: !!e.managed,
				enabled: !!e.enabled,
			}));
			this.extensionsData = list;
			this.renderExtensionsList(list);
		} catch (error) {
			console.error("Failed to load extensions", error);
			this.showError("Failed to load extensions");
		}
	}

	buildSettingsField(field, values) {
		const existing = typeof values === "object" && values ? values : {};
		const wrapper = document.createElement("div");
		wrapper.className = "settings-field";
		const label = document.createElement("label");
		label.className = "form-label fw-semibold";
		label.textContent = field.label || field.key;
		label.htmlFor = `extension-setting-${field.key}`;
		wrapper.appendChild(label);
		if (field.description) {
			const description = document.createElement("div");
			description.className = "form-text mb-2";
			description.textContent = field.description;
			wrapper.appendChild(description);
		}
		let control;
		const currentValue = existing[field.key] ?? field.default;
		if (field.type === "textarea") {
			control = document.createElement("textarea");
			control.rows = 3;
			if (field.maxLength) control.maxLength = field.maxLength;
		} else if (field.type === "number") {
			control = document.createElement("input");
			control.type = "number";
			if (Number.isFinite(field.min)) control.min = field.min;
			if (Number.isFinite(field.max)) control.max = field.max;
			if (Number.isFinite(field.step)) control.step = field.step;
		} else if (field.type === "select") {
			control = document.createElement("select");
			for (const option of field.options || []) {
				const opt = document.createElement("option");
				opt.value = option.value;
				opt.textContent = option.label;
				if (option.value === currentValue) {
					opt.selected = true;
				}
				control.appendChild(opt);
			}
		} else if (field.type === "toggle") {
			control = document.createElement("div");
			control.className = "form-check form-switch";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.className = "form-check-input";
			input.id = `extension-setting-${field.key}`;
			input.checked = currentValue === true;
			control.appendChild(input);
			wrapper.appendChild(control);
			return wrapper;
		} else {
			control = document.createElement("input");
			control.type = "text";
			if (field.maxLength) control.maxLength = field.maxLength;
		}
		if (field.placeholder) {
			control.placeholder = field.placeholder;
		}
		control.className = "form-control";
		control.id = `extension-setting-${field.key}`;
		if (field.type !== "toggle" && currentValue !== undefined) {
			control.value = currentValue;
		}
		control.dataset.settingKey = field.key;
		control.dataset.settingType = field.type;
		wrapper.appendChild(control);
		return wrapper;
	}

	readSettingsFormValues() {
		if (!this.extensionSettingsFields) return {};
		const values = {};
		this.extensionSettingsFields
			.querySelectorAll("[data-setting-key]")
			.forEach((input) => {
				const key = input.dataset.settingKey;
				const type = input.dataset.settingType;
				if (!key) return;
				if (type === "toggle") {
					values[key] = input.checked;
				} else if (type === "number") {
					const parsed = Number(input.value);
					if (Number.isFinite(parsed)) {
						values[key] = parsed;
					}
				} else {
					values[key] = input.value;
				}
			});
		return values;
	}

	async showExtensionSettings(extensionId) {
		const modal = this.getExtensionSettingsModal();
		if (!modal) return;
		const extension = (this.extensionsData || []).find((ext) => {
			return ext.id === extensionId;
		});
		if (!extension) {
			this.showError("Extension not found");
			return;
		}
		const schema = Array.isArray(extension.settings_schema)
			? extension.settings_schema
			: Array.isArray(extension.settingsSchema)
				? extension.settingsSchema
				: [];
		if (schema.length === 0) {
			this.showError("This extension does not expose settings");
			return;
		}
		this.currentExtensionSettingsId = extensionId;
		if (this.extensionSettingsTitle) {
			this.extensionSettingsTitle.textContent =
				extension.name || "Extension Settings";
		}
		if (this.extensionSettingsSubtitle) {
			this.extensionSettingsSubtitle.textContent = `v${extension.version || "0.0.0"}`;
		}
		if (this.extensionSettingsStatus) {
			this.extensionSettingsStatus.textContent = "";
		}
		if (this.extensionSettingsAlert) {
			this.extensionSettingsAlert.classList.add("d-none");
			this.extensionSettingsAlert.textContent = "";
		}
		if (this.extensionSettingsFields) {
			this.extensionSettingsFields.innerHTML = "";
		}
		if (this.extensionSettingsEmpty) {
			this.extensionSettingsEmpty.classList.add("d-none");
		}
		if (this.extensionSettingsSaveBtn) {
			this.extensionSettingsSaveBtn.disabled = true;
		}
		const bootstrapModal = window.bootstrap
			? window.bootstrap.Modal.getOrCreateInstance(modal)
			: null;
		bootstrapModal?.show();
		try {
			const response = await this.apiCall(
				`/api/admin/extensions/${encodeURIComponent(extensionId)}/settings`,
			);
			const values = response?.settings || {};
			if (!this.extensionSettingsFields) return;
			if (!schema.length) {
				this.extensionSettingsEmpty?.classList.remove("d-none");
				return;
			}
			schema.forEach((field) => {
				const fieldNode = this.buildSettingsField(field, values);
				this.extensionSettingsFields.appendChild(fieldNode);
			});
			if (this.extensionSettingsSaveBtn) {
				this.extensionSettingsSaveBtn.disabled = false;
			}
		} catch (error) {
			console.error("Failed to load extension settings", error);
			if (this.extensionSettingsAlert) {
				this.extensionSettingsAlert.textContent =
					error.message || "Failed to load settings";
				this.extensionSettingsAlert.classList.remove("d-none", "alert-success");
				this.extensionSettingsAlert.classList.add("alert-danger");
			}
		}
	}

	async saveExtensionSettings(extensionId) {
		if (!extensionId) return;
		const modal = this.getExtensionSettingsModal();
		if (!modal || !this.extensionSettingsSaveBtn) return;
		const payload = this.readSettingsFormValues();
		this.extensionSettingsSaveBtn.disabled = true;
		this.extensionSettingsSaveBtn.textContent = "Saving...";
		try {
			await this.apiCall(
				`/api/admin/extensions/${encodeURIComponent(extensionId)}/settings`,
				{
					method: "PUT",
					body: JSON.stringify(payload),
				},
			);
			if (this.extensionSettingsAlert) {
				this.extensionSettingsAlert.textContent = "Settings saved.";
				this.extensionSettingsAlert.classList.remove("d-none", "alert-danger");
				this.extensionSettingsAlert.classList.add("alert-success");
			}
			if (this.extensionSettingsStatus) {
				const timestamp = new Date().toLocaleTimeString();
				this.extensionSettingsStatus.textContent = `Saved at ${timestamp}`;
			}
		} catch (error) {
			console.error("Failed to save extension settings", error);
			if (this.extensionSettingsAlert) {
				this.extensionSettingsAlert.textContent =
					error.message || "Failed to save settings";
				this.extensionSettingsAlert.classList.remove("d-none", "alert-success");
				this.extensionSettingsAlert.classList.add("alert-danger");
			}
		} finally {
			this.extensionSettingsSaveBtn.disabled = false;
			this.extensionSettingsSaveBtn.textContent = "Save Settings";
			if (typeof window.adminPanel?.currentExtensionSettingsId === "string") {
				const modal = this.getExtensionSettingsModal();
				if (modal && window.bootstrap) {
					const instance = window.bootstrap.Modal.getOrCreateInstance(modal);
					instance.hide();
				}
			}
		}
	}

	setupExtensionsForm() {
		const form = document.getElementById("extensionUploadForm");
		if (!form || form._extensionsReady) return;
		form._extensionsReady = true;
		const fileInput = document.getElementById("extensionFileInput");
		const submitBtn = form.querySelector("button[type=submit]");
		const defaultLabel = submitBtn?.textContent || "Upload Extension";

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const file = fileInput?.files?.[0];
			if (!file) {
				this.showError("Please select a .tweeta file");
				return;
			}
			if (!file.name?.toLowerCase?.().endsWith?.(".tweeta")) {
				this.showError("Package must end with .tweeta");
				return;
			}
			if (submitBtn) {
				submitBtn.textContent = "Uploading...";
				submitBtn.disabled = true;
			}
			try {
				const formData = new FormData();
				formData.append("package", file, file.name);
				const response = await fetch("/api/admin/extensions", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
					body: formData,
				});
				const result = await response.json();
				if (!response.ok || result?.error) {
					throw new Error(result?.error || "Failed to install extension");
				}
				this.showSuccess("Extension installed successfully");
				form.reset();
				this.loadExtensionsManager();
			} catch (error) {
				console.error("Failed to upload extension", error);
				this.showError(error.message || "Failed to upload extension");
			} finally {
				if (submitBtn) {
					submitBtn.textContent = defaultLabel;
					submitBtn.disabled = false;
				}
			}
		});
	}

	renderExtensionsList(extensions) {
		const container = document.getElementById("extensionsList");
		if (!container) return;
		if (!extensions || extensions.length === 0) {
			container.innerHTML =
				'<p class="text-muted mb-0">No extensions installed yet.</p>';
			return;
		}

		container.innerHTML = extensions
			.map((ext) => {
				const safeName = this.escapeHtml(ext.name || "Untitled");
				const safeVersion = this.escapeHtml(ext.version || "0.0.0");
				const safeAuthor = this.escapeHtml(ext.author || "Unknown");
				const summary = ext.summary
					? `<p class="mb-2 mt-2">${this.escapeHtml(ext.summary)}</p>`
					: "";
				const infoChips = [];
				const rootFile = this.escapeHtml(
					ext.root_file || ext.rootFile || "src/main.js",
				);
				infoChips.push(
					`<span class="badge bg-light text-dark border">Entry: ${rootFile}</span>`,
				);
				infoChips.push(
					`<span class="badge bg-light text-dark border">Mode: ${this.escapeHtml(ext.entry_type || ext.entryType || "module")}</span>`,
				);
				const caps = Array.isArray(ext.capabilities) ? ext.capabilities : [];
				const targets = Array.isArray(ext.targets) ? ext.targets : [];
				const capabilityBadges = caps.length
					? `<div class="d-flex flex-wrap gap-1 mt-2">${caps
							.slice(0, 4)
							.map(
								(cap) =>
									`<span class="badge bg-secondary text-uppercase">${this.escapeHtml(cap)}</span>`,
							)
							.join("")}</div>`
					: "";
				const targetBadges = targets.length
					? `<div class="d-flex flex-wrap gap-1 mt-2">${targets
							.slice(0, 4)
							.map(
								(target) =>
									`<span class="badge bg-dark">${this.escapeHtml(target)}</span>`,
							)
							.join("")}</div>`
					: "";
				const websiteUrl =
					typeof ext.website === "string" && /^https?:\/\//i.test(ext.website)
						? ext.website
						: null;
				const changelogUrl =
					typeof (ext.changelog_url || ext.changelogUrl) === "string" &&
					/^https?:\/\//i.test(ext.changelog_url || ext.changelogUrl)
						? ext.changelog_url || ext.changelogUrl
						: null;
				const websiteLink = websiteUrl
					? `<a href="${this.escapeHtml(websiteUrl)}" target="_blank" rel="noopener" class="me-2">Website</a>`
					: "";
				const changelogLink = changelogUrl
					? `<a href="${this.escapeHtml(changelogUrl)}" target="_blank" rel="noopener">Changelog</a>`
					: "";
				const statusBadge = ext.enabled
					? '<span class="badge bg-success">Enabled</span>'
					: '<span class="badge bg-secondary">Disabled</span>';

				const schema = Array.isArray(ext.settings_schema)
					? ext.settings_schema
					: Array.isArray(ext.settingsSchema)
						? ext.settingsSchema
						: [];
				const settingsButton = schema.length
					? `<button type="button" class="btn btn-sm btn-outline-info" data-extension-action="settings" data-extension-id="${ext.id}">Settings</button>`
					: "";
				return `
          <div class="border rounded p-3 mb-3">
            <div class="d-flex align-items-start justify-content-between">
              <div>
                <h5 class="mb-1">${safeName} <span class="badge bg-dark text-white">v${safeVersion}</span></h5>
                <div class="text-muted">by ${safeAuthor}</div>
              </div>
              ${statusBadge}
            </div>
            ${summary}
            <div class="d-flex flex-wrap gap-2 small text-muted">
              ${infoChips.join("")}
            </div>
            <div class="d-flex flex-wrap gap-3 small mt-2">
              ${websiteLink}
              ${changelogLink}
            </div>
            ${capabilityBadges}
            ${targetBadges}
				<div class="d-flex flex-wrap gap-2 mt-3">
					${
						ext.managed === false
							? `<button type="button" class="btn btn-sm btn-outline-primary" data-extension-action="import" data-extension-id="${ext.id}">Import</button>
								 <button type="button" class="btn btn-sm btn-outline-secondary" data-extension-action="export" data-extension-id="${ext.id}">Convert to .tweeta</button>`
							: `<button type="button" class="btn btn-sm ${ext.enabled ? "btn-outline-warning" : "btn-outline-success"}" data-extension-action="toggle" data-extension-id="${ext.id}" data-extension-enabled="${ext.enabled ? "true" : "false"}">${ext.enabled ? "Disable" : "Enable"}</button>
								 <button type="button" class="btn btn-sm btn-outline-secondary" data-extension-action="export" data-extension-id="${ext.id}">Convert to .tweeta</button>
								 <button type="button" class="btn btn-sm btn-outline-danger" data-extension-action="delete" data-extension-id="${ext.id}">Delete</button>`
					}
					${settingsButton}
				</div>
          </div>
        `;
			})
			.join("");

		container.querySelectorAll("[data-extension-action]").forEach((btn) => {
			btn.addEventListener("click", (event) => {
				const target = event.currentTarget;
				const extensionId = target.getAttribute("data-extension-id");
				const action = target.getAttribute("data-extension-action");
				if (!extensionId || !action) return;
				if (action === "toggle") {
					const enabled =
						target.getAttribute("data-extension-enabled") === "true";
					this.toggleExtension(extensionId, !enabled);
				} else if (action === "delete") {
					this.deleteExtension(extensionId);
				} else if (action === "import") {
					this.importExtension(extensionId);
				} else if (action === "export") {
					this.exportExtension(extensionId);
				} else if (action === "settings") {
					this.showExtensionSettings(extensionId);
				}
			});
		});
	}

	async toggleExtension(extensionId, enabled) {
		if (!extensionId) return;
		try {
			await this.apiCall(`/api/admin/extensions/${extensionId}`, {
				method: "PATCH",
				body: JSON.stringify({ enabled }),
			});
			this.showSuccess(enabled ? "Extension enabled" : "Extension disabled");
			this.loadExtensionsManager();
		} catch (error) {
			console.error("Failed to toggle extension", error);
			this.showError(error.message || "Failed to toggle extension");
		}
	}

	async deleteExtension(extensionId) {
		if (!extensionId) return;
		const targetExtension = this.extensionsData?.find(
			(ext) => ext.id === extensionId,
		);
		const targetLabel = targetExtension?.name
			? ` "${targetExtension.name}"`
			: "";
		const choice = await this.showExtensionDeleteConfirm({
			title: `Delete extension${targetLabel}?`,
			message: `Delete extension${targetLabel}? Choose De-Import to keep files for future import or Delete to remove everything.`,
		});
		if (!choice || choice === "cancel") return;
		const removeFilesFlag = choice === "delete";
		try {
			const url = `/api/admin/extensions/${encodeURIComponent(
				extensionId,
			)}${removeFilesFlag ? "?remove_files=1" : ""}`;
			const result = await this.apiCall(url, { method: "DELETE" });
			this.showSuccess(
				removeFilesFlag ? "Extension deleted" : "Extension de-imported",
			);
			if (!removeFilesFlag && result?.manual) {
				this.extensionsData = [
					result.manual,
					...(this.extensionsData || []).filter((ext) => {
						if (ext.id === extensionId) return false;
						if (
							ext.install_dir &&
							ext.install_dir === result.manual.install_dir
						)
							return false;
						return true;
					}),
				];
				this.renderExtensionsList(this.extensionsData);
			} else {
				this.loadExtensionsManager();
			}
		} catch (error) {
			console.error("Failed to delete extension", error);
			this.showError(error.message || "Failed to delete extension");
		}
	}

	async importExtension(dirName) {
		if (!dirName) return;
		try {
			const result = await this.apiCall("/api/admin/extensions/import", {
				method: "POST",
				body: JSON.stringify({ dir: dirName }),
			});
			this.showSuccess("Extension imported");
			// Replace the manual entry in-place so the UI shows the managed record
			// immediately (without waiting for a full reload).
			if (result?.extension) {
				const imported = result.extension;
				// Find manual entry matching the directory name and replace it
				this.extensionsData = (this.extensionsData || []).map((e) => {
					if (
						(e.install_dir === dirName || e.id === dirName) &&
						e.managed === false
					) {
						return { ...imported, managed: true };
					}
					return e;
				});
				this.renderExtensionsList(this.extensionsData);
			} else {
				// fallback: reload list from server
				this.loadExtensionsManager();
			}
		} catch (error) {
			console.error("Failed to import extension", error);
			this.showError(error.message || "Failed to import extension");
		}
	}

	async exportExtension(idOrDir) {
		if (!idOrDir) return;
		try {
			const url = `/api/admin/extensions/${encodeURIComponent(idOrDir)}/export`;
			const resp = await fetch(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${this.token}` },
				credentials: "same-origin",
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err?.error || "Failed to export extension");
			}
			const blob = await resp.blob();
			// Quick check: ensure the response looks like a ZIP (content-type or magic)
			const ct = resp.headers.get("content-type") || "";
			if (!ct.includes("zip") && blob.size >= 4) {
				const probe = await blob.slice(0, 4).arrayBuffer();
				const bytes = new Uint8Array(probe);
				if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
					// Not a ZIP — try to show server response for debugging
					const txt = await blob.text().catch(() => null);
					console.error("Export endpoint returned non-zip data", {
						ct,
						sample: txt?.slice(0, 200),
					});
					throw new Error(
						"Export failed: server returned non-zip data (check server logs)",
					);
				}
			}
			const disposition = resp.headers.get("content-disposition") || "";
			let filename = "extension.tweeta";
			const m = /filename="?([^";]+)"?/.exec(disposition);
			if (m?.[1]) filename = m[1];
			const urlObj = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = urlObj;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(urlObj);
			this.showSuccess("Download started");
		} catch (error) {
			console.error("Export failed", error);
			this.showError(error.message || "Failed to export extension");
		}
	}

	async loadBadgesManager() {
		try {
			const data = await this.apiCall("/api/admin/badges");
			this.renderBadgesList(data.badges || []);
			this.setupBadgeForm();
		} catch {
			this.showError("Failed to load badges");
		}
	}

	renderBadgesList(badges) {
		const container = document.getElementById("badgesList");
		if (!container) return;
		if (!badges || badges.length === 0) {
			container.innerHTML = '<p class="text-muted">No badges created yet.</p>';
			return;
		}
		container.innerHTML = "";
		for (const badge of badges) {
			const card = document.createElement("div");
			card.className = "card mb-2";
			const iconHTML = badge.svg_content
				? badge.svg_content
				: badge.image_url
					? `<img src="${this.escapeHtml(badge.image_url)}" width="24" height="24" alt="badge">`
					: "";
			const actionLabel =
				badge.action_type && badge.action_type !== "none"
					? ` [${badge.action_type}]`
					: "";
			card.innerHTML = `
				<div class="card-body d-flex align-items-center gap-3">
					<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${iconHTML}</div>
					<div class="flex-grow-1">
						<strong>${this.escapeHtml(badge.name)}</strong>${actionLabel}
						<div class="small text-muted">${this.escapeHtml(badge.description || "")}</div>
					</div>
					<button class="btn btn-sm btn-outline-primary me-2 edit-badge-btn">Edit</button>
					<button class="btn btn-sm btn-outline-danger delete-badge-btn">Delete</button>
				</div>
			`;
			card.querySelector(".edit-badge-btn").addEventListener("click", () => {
				this.openEditBadgeModal(badge);
			});
			card
				.querySelector(".delete-badge-btn")
				.addEventListener("click", async () => {
					if (confirm(`Delete badge "${badge.name}"?`)) {
						await this.deleteBadge(badge.id);
					}
				});
			container.appendChild(card);
		}
	}

	setupBadgeForm() {
		const form = document.getElementById("createBadgeForm");
		if (!form || form._badgeSetup) return;
		form._badgeSetup = true;
		const svgInput = document.getElementById("badgeSvgContent");
		const preview = document.getElementById("badgeSvgPreview");
		if (svgInput && preview) {
			svgInput.addEventListener("input", () => {
				preview.innerHTML = DOMPurify.sanitize(svgInput.value, {
					USE_PROFILES: { svg: true, svgFilters: true },
				});
			});
		}

		const actionTypeSelect = document.getElementById("badgeActionType");
		const urlSection = document.getElementById("badgeActionUrlSection");
		const modalSection = document.getElementById("badgeActionModalSection");
		const popupSection = document.getElementById("badgeActionPopupSection");
		const jsSection = document.getElementById("badgeActionJsSection");
		const addPopupEntryBtn = document.getElementById("badgeAddPopupEntry");
		const popupEntriesContainer = document.getElementById("badgePopupEntries");

		if (actionTypeSelect) {
			actionTypeSelect.addEventListener("change", () => {
				const val = actionTypeSelect.value;
				urlSection?.classList.toggle("d-none", val !== "url");
				modalSection?.classList.toggle("d-none", val !== "modal");
				popupSection?.classList.toggle("d-none", val !== "popup");
				jsSection?.classList.toggle("d-none", val !== "client_js");
			});
		}

		if (addPopupEntryBtn && popupEntriesContainer) {
			addPopupEntryBtn.addEventListener("click", () => {
				this.addBadgePopupEntry(popupEntriesContainer);
			});
		}

		const imageFileInput = document.getElementById("badgeImageFile");
		const imageUrlInput = document.getElementById("badgeImageUrl");
		const chooseBtn = document.getElementById("badgeImageChooseBtn");
		const clearBtn = document.getElementById("badgeImageClearBtn");
		const previewContainer = document.getElementById(
			"badgeImagePreviewContainer",
		);
		const previewImg = document.getElementById("badgeImagePreview");

		if (chooseBtn && imageFileInput) {
			chooseBtn.addEventListener("click", () => imageFileInput.click());
			imageFileInput.addEventListener("change", async () => {
				const file = imageFileInput.files?.[0];
				if (!file) return;
				try {
					const cropped = await window.openImageCropper(file, {
						aspect: 1,
						size: 128,
						transparent: true,
					});
					if (cropped === window.CROP_CANCELLED) {
						imageFileInput.value = "";
						return;
					}
					const fd = new FormData();
					fd.append("file", cropped, cropped.name);
					const uploadResp = await fetch("/api/upload", {
						method: "POST",
						headers: { Authorization: `Bearer ${this.token}` },
						body: fd,
					});
					const uploadData = await uploadResp.json();
					if (!uploadResp.ok || uploadData?.error) {
						this.showError(uploadData?.error || "Failed to upload image");
						imageFileInput.value = "";
						return;
					}
					imageUrlInput.value = uploadData.file.url;
					if (previewImg) previewImg.src = uploadData.file.url;
					if (previewContainer) previewContainer.classList.remove("d-none");
					if (clearBtn) clearBtn.classList.remove("d-none");
				} catch (err) {
					this.showError(err.message || "Failed to process image");
				} finally {
					imageFileInput.value = "";
				}
			});
		}

		if (clearBtn) {
			clearBtn.addEventListener("click", () => {
				if (imageUrlInput) imageUrlInput.value = "";
				if (previewImg) previewImg.src = "";
				if (previewContainer) previewContainer.classList.add("d-none");
				clearBtn.classList.add("d-none");
			});
		}

		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			const name = document.getElementById("badgeName").value.trim();
			const description = document
				.getElementById("badgeDescription")
				.value.trim();
			const svgContent = document
				.getElementById("badgeSvgContent")
				.value.trim();
			const imageUrl =
				document.getElementById("badgeImageUrl")?.value.trim() || "";
			const actionType =
				document.getElementById("badgeActionType")?.value || "none";
			const actionValue = this.collectBadgeActionValue(actionType, "");
			const allowRawHtml =
				document.getElementById("badgeAllowRawHtml")?.checked || false;
			if (!name || (!svgContent && !imageUrl)) return;
			try {
				await this.apiCall("/api/admin/badges", {
					method: "POST",
					body: JSON.stringify({
						name,
						description,
						svg_content: svgContent || null,
						image_url: imageUrl || null,
						action_type: actionType,
						action_value: actionValue || null,
						allow_raw_html: allowRawHtml,
					}),
				});
				this.showSuccess("Badge created");
				form.reset();
				preview.innerHTML = "";
				if (imageUrlInput) imageUrlInput.value = "";
				if (previewImg) previewImg.src = "";
				if (previewContainer) previewContainer.classList.add("d-none");
				if (clearBtn) clearBtn.classList.add("d-none");
				urlSection?.classList.add("d-none");
				modalSection?.classList.add("d-none");
				popupSection?.classList.add("d-none");
				jsSection?.classList.add("d-none");
				if (popupEntriesContainer) popupEntriesContainer.innerHTML = "";
				await this.loadBadgesManager();
			} catch (err) {
				this.showError(err.message || "Failed to create badge");
			}
		});
	}

	addBadgePopupEntry(container, entry = {}) {
		const row = document.createElement("div");
		row.className = "badge-popup-entry d-flex gap-2 mb-2 align-items-start";
		row.innerHTML = `
			<input type="text" class="form-control form-control-sm popup-entry-label" placeholder="Label" value="${this.escapeHtml(entry.label || "")}">
			<input type="text" class="form-control form-control-sm popup-entry-icon" placeholder="bi-star" value="${this.escapeHtml(entry.icon || "")}" style="width: 100px;">
			<select class="form-select form-select-sm popup-entry-type" style="width: 100px;">
				<option value="url" ${entry.type === "url" || !entry.type ? "selected" : ""}>URL</option>
				<option value="js" ${entry.type === "js" ? "selected" : ""}>JS</option>
			</select>
			<textarea class="form-control form-control-sm popup-entry-value" rows="3" placeholder="https:// or JS code"></textarea>
			<button type="button" class="btn btn-outline-danger btn-sm popup-entry-remove"><i class="bi bi-x"></i></button>
		`;
		row
			.querySelector(".popup-entry-remove")
			.addEventListener("click", () => row.remove());
		// set textarea value programmatically so multi-line JS is preserved
		const valueEl = row.querySelector(".popup-entry-value");
		if (valueEl) valueEl.value = entry.value || "";
		container.appendChild(row);
	}

	collectBadgePopupEntries(prefix = "") {
		const B = prefix ? "B" : "b";
		const container = document.getElementById(`${prefix}${B}adgePopupEntries`);
		if (!container) return [];
		const entries = [];
		container.querySelectorAll(".badge-popup-entry").forEach((row) => {
			const label = row.querySelector(".popup-entry-label")?.value.trim() || "";
			const icon = row.querySelector(".popup-entry-icon")?.value.trim() || "";
			const type = row.querySelector(".popup-entry-type")?.value || "url";
			const value = row.querySelector(".popup-entry-value")?.value || "";
			if (label || value) {
				entries.push({ label, icon, type, value });
			}
		});
		return entries;
	}

	collectBadgeActionValue(actionType, prefix = "") {
		const B = prefix ? "B" : "b";
		if (actionType === "url") {
			return (
				document.getElementById(`${prefix}${B}adgeActionUrl`)?.value.trim() ||
				""
			);
		}
		if (actionType === "modal") {
			return JSON.stringify({
				title:
					document
						.getElementById(`${prefix}${B}adgeModalTitle`)
						?.value.trim() || "",
				content:
					document.getElementById(`${prefix}${B}adgeModalContent`)?.value || "",
				css: document.getElementById(`${prefix}${B}adgeModalCss`)?.value || "",
				js: document.getElementById(`${prefix}${B}adgeModalJs`)?.value || "",
			});
		}
		if (actionType === "popup") {
			return JSON.stringify({
				title:
					document
						.getElementById(`${prefix}${B}adgePopupTitle`)
						?.value.trim() || "",
				entries: this.collectBadgePopupEntries(prefix),
			});
		}
		if (actionType === "client_js") {
			return document.getElementById(`${prefix}${B}adgeActionJs`)?.value || "";
		}
		return "";
	}

	populateBadgeActionFields(actionType, actionValue, prefix = "") {
		const B = prefix ? "B" : "b";
		const urlSection = document.getElementById(
			`${prefix}${B}adgeActionUrlSection`,
		);
		const modalSection = document.getElementById(
			`${prefix}${B}adgeActionModalSection`,
		);
		const popupSection = document.getElementById(
			`${prefix}${B}adgeActionPopupSection`,
		);
		const jsSection = document.getElementById(
			`${prefix}${B}adgeActionJsSection`,
		);

		urlSection?.classList.toggle("d-none", actionType !== "url");
		modalSection?.classList.toggle("d-none", actionType !== "modal");
		popupSection?.classList.toggle("d-none", actionType !== "popup");
		jsSection?.classList.toggle("d-none", actionType !== "client_js");

		if (actionType === "url") {
			const urlInput = document.getElementById(`${prefix}${B}adgeActionUrl`);
			if (urlInput) urlInput.value = actionValue || "";
		} else if (actionType === "modal") {
			let parsed = {};
			try {
				parsed = JSON.parse(actionValue || "{}");
			} catch {}
			const titleInput = document.getElementById(`${prefix}${B}adgeModalTitle`);
			const contentInput = document.getElementById(
				`${prefix}${B}adgeModalContent`,
			);
			const cssInput = document.getElementById(`${prefix}${B}adgeModalCss`);
			const jsInput = document.getElementById(`${prefix}${B}adgeModalJs`);
			if (titleInput) titleInput.value = parsed.title || "";
			if (contentInput) contentInput.value = parsed.content || "";
			if (cssInput) cssInput.value = parsed.css || "";
			if (jsInput) jsInput.value = parsed.js || "";
		} else if (actionType === "popup") {
			let parsed = {};
			try {
				parsed = JSON.parse(actionValue || "{}");
			} catch {}
			const titleInput = document.getElementById(`${prefix}${B}adgePopupTitle`);
			if (titleInput) titleInput.value = parsed.title || "";
			const container = document.getElementById(
				`${prefix}${B}adgePopupEntries`,
			);
			if (container) {
				container.innerHTML = "";
				for (const entry of parsed.entries || []) {
					this.addBadgePopupEntry(container, entry);
				}
			}
		} else if (actionType === "client_js") {
			const jsInput = document.getElementById(`${prefix}${B}adgeActionJs`);
			if (jsInput) jsInput.value = actionValue || "";
		}
	}

	async deleteBadge(badgeId) {
		try {
			await this.apiCall(`/api/admin/badges/${badgeId}`, { method: "DELETE" });
			this.showSuccess("Badge deleted");
			await this.loadBadgesManager();
		} catch (err) {
			this.showError(err.message || "Failed to delete badge");
		}
	}

	openEditBadgeModal(badge) {
		let modal = document.getElementById("editBadgeModal");
		if (!modal) {
			modal = document.createElement("div");
			modal.id = "editBadgeModal";
			modal.className = "modal fade";
			modal.tabIndex = -1;
			modal.innerHTML = `
				<div class="modal-dialog modal-lg">
					<div class="modal-content">
						<div class="modal-header"><h5 class="modal-title">Edit Badge</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
						<div class="modal-body">
							<div class="mb-3"><label class="form-label">Name</label><input type="text" class="form-control" id="editBadgeName"></div>
							<div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="editBadgeDescription" rows="2"></textarea></div>
							<div class="mb-3"><label class="form-label">SVG Content</label><textarea class="form-control font-monospace" id="editBadgeSvgContent" rows="3"></textarea></div>
							<div class="mb-3">
								<label class="form-label">Badge Image</label>
								<input type="file" class="form-control" id="editBadgeImageFile" accept="image/*" style="display: none;">
								<input type="hidden" id="editBadgeImageUrl">
								<div class="d-flex align-items-center gap-2">
									<button type="button" class="btn btn-outline-secondary btn-sm" id="editBadgeImageChooseBtn"><i class="bi bi-image"></i> Choose Image</button>
									<button type="button" class="btn btn-outline-danger btn-sm d-none" id="editBadgeImageClearBtn"><i class="bi bi-x"></i> Clear</button>
								</div>
								<div id="editBadgeImagePreviewContainer" class="mt-2 d-none">
									<img id="editBadgeImagePreview" src="" alt="Badge preview" style="max-width: 64px; max-height: 64px; border-radius: 4px;">
								</div>
							</div>
							<div class="mb-3">
								<label class="form-label">Click Action</label>
								<select class="form-select" id="editBadgeActionType">
									<option value="none">None</option>
									<option value="url">Open URL</option>
									<option value="modal">Open custom modal</option>
									<option value="popup">Show popup menu</option>
									<option value="client_js">Run client JS</option>
								</select>
							</div>
							<div id="editBadgeActionUrlSection" class="mb-3 d-none">
								<label class="form-label">URL</label>
								<input type="text" class="form-control" id="editBadgeActionUrl" placeholder="https://example.com">
							</div>
							<div id="editBadgeActionModalSection" class="mb-3 d-none">
								<div class="card bg-body-secondary border-0">
									<div class="card-body">
										<h6 class="card-title mb-3"><i class="bi bi-window-stack"></i> Modal Configuration</h6>
										<div class="mb-3"><label class="form-label">Modal Title</label><input type="text" class="form-control" id="editBadgeModalTitle" placeholder="Badge Info"></div>
										<div class="mb-3"><label class="form-label">Modal Content (Markdown supported)</label><textarea class="form-control" id="editBadgeModalContent" rows="5" placeholder="**Bold**, *italic*, [links](url)"></textarea></div>
										<div class="mb-3"><label class="form-label">Custom CSS (optional)</label><textarea class="form-control font-monospace" id="editBadgeModalCss" rows="3" placeholder=".badge-modal-content { color: gold; }"></textarea></div>
										<div class="mb-3"><label class="form-label">Custom JS (optional)</label><textarea class="form-control font-monospace" id="editBadgeModalJs" rows="4" placeholder="// Runs when modal opens"></textarea></div>
										<div class="mb-3 form-check"><input type="checkbox" class="form-check-input" id="editBadgeAllowRawHtml"><label class="form-check-label" for="editBadgeAllowRawHtml">Allow raw HTML (bypass sanitization)</label><div class="form-text text-warning">⚠️ Only enable for trusted content.</div></div>
									</div>
								</div>
							</div>
							<div id="editBadgeActionPopupSection" class="mb-3 d-none">
								<div class="card bg-body-secondary border-0">
									<div class="card-body">
										<h6 class="card-title mb-3"><i class="bi bi-list-ul"></i> Popup Menu Configuration</h6>
										<div class="mb-3"><label class="form-label">Popup Title (optional)</label><input type="text" class="form-control" id="editBadgePopupTitle" placeholder="Options"></div>
										<div class="mb-3"><label class="form-label">Menu Entries</label><div id="editBadgePopupEntries"></div><button type="button" class="btn btn-outline-primary btn-sm mt-2" id="editBadgeAddPopupEntry"><i class="bi bi-plus"></i> Add Entry</button></div>
									</div>
								</div>
							</div>
							<div id="editBadgeActionJsSection" class="mb-3 d-none">
								<div class="card bg-body-secondary border-0">
									<div class="card-body">
										<h6 class="card-title mb-3"><i class="bi bi-code-slash"></i> Client JavaScript</h6>
										<textarea class="form-control font-monospace" id="editBadgeActionJs" rows="8" placeholder="// This code runs when the badge is clicked"></textarea>
									</div>
								</div>
							</div>
						</div>
						<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" id="saveEditBadgeBtn">Save</button></div>
					</div>
				</div>
			`;
			document.body.appendChild(modal);
		}

		document.getElementById("editBadgeName").value = badge.name || "";
		document.getElementById("editBadgeDescription").value =
			badge.description || "";
		document.getElementById("editBadgeSvgContent").value =
			badge.svg_content || "";
		document.getElementById("editBadgeImageUrl").value = badge.image_url || "";
		document.getElementById("editBadgeActionType").value =
			badge.action_type || "none";
		document.getElementById("editBadgeAllowRawHtml").checked =
			!!badge.allow_raw_html;

		this.populateBadgeActionFields(
			badge.action_type || "none",
			badge.action_value || "",
			"edit",
		);

		const editActionTypeSelect = document.getElementById("editBadgeActionType");
		const newActionTypeSelect = editActionTypeSelect.cloneNode(true);
		editActionTypeSelect.parentNode.replaceChild(
			newActionTypeSelect,
			editActionTypeSelect,
		);
		newActionTypeSelect.value = badge.action_type || "none";
		newActionTypeSelect.addEventListener("change", () => {
			const val = newActionTypeSelect.value;
			document
				.getElementById("editBadgeActionUrlSection")
				?.classList.toggle("d-none", val !== "url");
			document
				.getElementById("editBadgeActionModalSection")
				?.classList.toggle("d-none", val !== "modal");
			document
				.getElementById("editBadgeActionPopupSection")
				?.classList.toggle("d-none", val !== "popup");
			document
				.getElementById("editBadgeActionJsSection")
				?.classList.toggle("d-none", val !== "client_js");
		});

		const editAddPopupEntryBtn = document.getElementById(
			"editBadgeAddPopupEntry",
		);
		if (editAddPopupEntryBtn) {
			const newAddBtn = editAddPopupEntryBtn.cloneNode(true);
			editAddPopupEntryBtn.parentNode.replaceChild(
				newAddBtn,
				editAddPopupEntryBtn,
			);
			newAddBtn.addEventListener("click", () => {
				const container = document.getElementById("editBadgePopupEntries");
				if (container) this.addBadgePopupEntry(container);
			});
		}

		const editImageFileInput = document.getElementById("editBadgeImageFile");
		const editImageUrlInput = document.getElementById("editBadgeImageUrl");
		const editChooseBtn = document.getElementById("editBadgeImageChooseBtn");
		const editClearBtn = document.getElementById("editBadgeImageClearBtn");
		const editPreviewContainer = document.getElementById(
			"editBadgeImagePreviewContainer",
		);
		const editPreviewImg = document.getElementById("editBadgeImagePreview");

		if (badge.image_url) {
			if (editPreviewImg) editPreviewImg.src = badge.image_url;
			if (editPreviewContainer) editPreviewContainer.classList.remove("d-none");
			if (editClearBtn) editClearBtn.classList.remove("d-none");
		} else {
			if (editPreviewImg) editPreviewImg.src = "";
			if (editPreviewContainer) editPreviewContainer.classList.add("d-none");
			if (editClearBtn) editClearBtn.classList.add("d-none");
		}

		const newChooseBtn = editChooseBtn.cloneNode(true);
		editChooseBtn.parentNode.replaceChild(newChooseBtn, editChooseBtn);
		const newClearBtn = editClearBtn.cloneNode(true);
		editClearBtn.parentNode.replaceChild(newClearBtn, editClearBtn);
		if (badge.image_url) newClearBtn.classList.remove("d-none");
		else newClearBtn.classList.add("d-none");

		const newFileInput = editImageFileInput.cloneNode(true);
		editImageFileInput.parentNode.replaceChild(
			newFileInput,
			editImageFileInput,
		);
		newChooseBtn.addEventListener("click", () => newFileInput.click());
		newFileInput.addEventListener("change", async () => {
			const file = newFileInput.files?.[0];
			if (!file) return;
			try {
				const cropped = await window.openImageCropper(file, {
					aspect: 1,
					size: 128,
					transparent: true,
				});
				if (cropped === window.CROP_CANCELLED) {
					newFileInput.value = "";
					return;
				}
				const fd = new FormData();
				fd.append("file", cropped, cropped.name);
				const uploadResp = await fetch("/api/upload", {
					method: "POST",
					headers: { Authorization: `Bearer ${this.token}` },
					body: fd,
				});
				const uploadData = await uploadResp.json();
				if (!uploadResp.ok || uploadData?.error) {
					this.showError(uploadData?.error || "Failed to upload image");
					newFileInput.value = "";
					return;
				}
				editImageUrlInput.value = uploadData.file.url;
				if (editPreviewImg) editPreviewImg.src = uploadData.file.url;
				if (editPreviewContainer)
					editPreviewContainer.classList.remove("d-none");
				newClearBtn.classList.remove("d-none");
			} catch (err) {
				this.showError(err.message || "Failed to process image");
			} finally {
				newFileInput.value = "";
			}
		});

		newClearBtn.addEventListener("click", () => {
			editImageUrlInput.value = "";
			if (editPreviewImg) editPreviewImg.src = "";
			if (editPreviewContainer) editPreviewContainer.classList.add("d-none");
			newClearBtn.classList.add("d-none");
		});

		const bsModal = new bootstrap.Modal(modal);
		const saveBtn = document.getElementById("saveEditBadgeBtn");
		const newSaveBtn = saveBtn.cloneNode(true);
		saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
		newSaveBtn.addEventListener("click", async () => {
			try {
				const actionType = document.getElementById("editBadgeActionType").value;
				const actionValue = this.collectBadgeActionValue(actionType, "edit");
				const allowRawHtml = document.getElementById(
					"editBadgeAllowRawHtml",
				).checked;
				await this.apiCall(`/api/admin/badges/${badge.id}`, {
					method: "PATCH",
					body: JSON.stringify({
						name: document.getElementById("editBadgeName").value.trim(),
						description: document
							.getElementById("editBadgeDescription")
							.value.trim(),
						svg_content:
							document.getElementById("editBadgeSvgContent").value.trim() ||
							null,
						image_url:
							document.getElementById("editBadgeImageUrl").value.trim() || null,
						action_type: actionType,
						action_value: actionValue || null,
						allow_raw_html: allowRawHtml,
					}),
				});
				this.showSuccess("Badge updated");
				bsModal.hide();
				await this.loadBadgesManager();
			} catch (err) {
				this.showError(err.message || "Failed to update badge");
			}
		});
		bsModal.show();
	}
}

const adminPanel = new AdminPanel();
window.adminPanel = adminPanel;

function showSection(section) {
	adminPanel.showSection(section);
}

window.showSection = showSection;

function searchUsers() {
	adminPanel.searchUsers();
}

window.searchUsers = searchUsers;

function searchPosts() {
	adminPanel.searchPosts();
}

window.searchPosts = searchPosts;

function loadUsers() {
	adminPanel.loadUsers();
}

window.loadUsers = loadUsers;

function loadPosts() {
	adminPanel.loadPosts();
}

window.loadPosts = loadPosts;

function loadCommunities() {
	adminPanel.loadCommunities();
}

window.loadCommunities = loadCommunities;

function loadSuspensions() {
	adminPanel.loadSuspensions();
}

window.loadSuspensions = loadSuspensions;

function submitSuspension() {
	adminPanel.submitSuspension();
}

window.submitSuspension = submitSuspension;

function submitPostEdit() {
	adminPanel.savePostEdit();
}

window.submitPostEdit = submitPostEdit;

function loadDMs() {
	adminPanel.loadDMs();
}

window.loadDMs = loadDMs;

function searchDMs() {
	adminPanel.searchDMs();
}

window.searchDMs = searchDMs;

function viewConversation(conversationId) {
	adminPanel.viewConversation(conversationId);
}

window.viewConversation = viewConversation;

function deleteConversationAdmin(conversationId) {
	adminPanel.deleteConversationAdmin(conversationId);
}

window.deleteConversationAdmin = deleteConversationAdmin;

function deleteMessage(messageId) {
	adminPanel.deleteMessageAdmin(messageId);
}

window.deleteMessage = deleteMessage;

function deleteConversation() {
	if (adminPanel.currentConversationId) {
		adminPanel.deleteConversationAdmin(adminPanel.currentConversationId);
		bootstrap.Modal.getInstance(document.getElementById("dmModal")).hide();
	}
}

window.deleteConversation = deleteConversation;
function loadConversationMessages(page) {
	adminPanel.loadConversationMessages(page);
}

function showLiftModal(userId) {
	adminPanel.showLiftModal(userId);
}

window.showLiftModal = showLiftModal;

window.loadConversationMessages = loadConversationMessages;
