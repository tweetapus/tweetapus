class AdminPanel {
  constructor() {
    this.token = localStorage.getItem("authToken");
    this.currentUser = null;
    this.isImpersonating = false;
    this.userCache = new Map();
    this.currentPage = {
      users: 1,
      posts: 1,
      communities: 1,
      suspensions: 1,
      dms: 1,
      moderationLogs: 1,
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

    try {
      const user = await this.getCurrentUser();
      if (!user || !user.admin) {
        location.href = "/";
        return;
      }

      this.currentUser = user;
      this.setupEventListeners();
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

    document
      .getElementById("dmSearchInput")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.searchDMs();
        }
      });
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
                  e.file_url
                )}" alt="${this.escapeHtml(
              e.name
            )}" style="width:48px;height:48px;object-fit:contain" />
                <div>
                  <strong>${this.escapeHtml(e.name)}</strong>
                  <div class="text-muted" style="font-size:12px">Uploaded: ${this.formatDate(
                    e.created_at
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
        `
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
      this.startEmojiDrag(event)
    );
    window.addEventListener(
      "pointermove",
      (event) => this.moveEmojiDrag(event),
      {
        passive: false,
      }
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
        "Unsupported image type. Please select PNG, JPG, WebP, or a similar format."
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
        canvasSize / img.height
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
      Math.min(crop.maxScale || baseScale * (1 + clampedRelative))
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
      Math.min(maxRelative, targetScale / baseScale - 1)
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
      crop.image.height * crop.scale
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
      crop.image.height * scaleAdjustment
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
      0.9
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
    const data = await response.json();

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
        <div class="card stat-card">
          <div class="card-body text-center">
            <i class="bi bi-clipboard-check-fill fs-1"></i>
            <h3>${stats.users.verified}</h3>
            <p class="mb-0">Verified users</p>
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
          user.username
        )}')">@${this.escapeHtml(user.username)}</strong>
        <small class="text-muted ms-auto">${this.formatDate(
          user.created_at
        )}</small>
      </div>
    `
      )
      .join("");

    suspensionsContainer.innerHTML = activity.suspensions.length
      ? activity.suspensions
          .map(
            (suspension) => `
        <div class="d-flex align-items-center mb-2">
          <span style="cursor: pointer; color: #0d6efd;" onclick="adminPanel.findAndViewUser('${this.escapeHtml(
            suspension.username
          )}')">@${this.escapeHtml(suspension.username)}</span>
          <small class="text-muted ms-auto">${this.formatDate(
            suspension.created_at
          )}</small>
        </div>
      `
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
                        ? (() => {
                            const radius =
                              user.avatar_radius !== null &&
                              user.avatar_radius !== undefined
                                ? `${user.avatar_radius}px`
                                : user.gold
                                ? `4px`
                                : `50px`;
                            return `<img src="${user.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
                          })()
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
                      user.suspended
                        ? '<span class="badge bg-danger">Suspended</span>'
                        : ""
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
                      ${
                        !user.suspended
                          ? `
                        <button class="btn btn-outline-danger btn-sm" onclick="adminPanel.showSuspensionModal('${user.id}')">
                          <i class="bi bi-exclamation-triangle"></i> Suspend
                        </button>
                      `
                          : `
                        <button class="btn btn-outline-success btn-sm" onclick="adminPanel.unsuspendUser('${user.id}')">
                          <i class="bi bi-check-circle"></i> Unsuspend
                        </button>
                      `
                      }
                  
                      <button class="btn btn-outline-info btn-sm" onclick="adminPanel.impersonateUser('${
                        user.id
                      }')">
                        <i class="bi bi-person-fill-gear"></i> Impersonate
                      </button>
                  </div>
                </td>
              </tr>
            `
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
    if (countBadge) {
      countBadge.textContent = String(count);
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
                        ? (() => {
                            const radius =
                              post.avatar_radius !== null &&
                              post.avatar_radius !== undefined
                                ? `${post.avatar_radius}px`
                                : post.gold
                                ? `4px`
                                : `50px`;
                            return `<img src="${post.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
                          })()
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
                            post.article_title
                          )}`
                        : post.content.length > 100
                        ? post.content
                            .replaceAll("<", "&lt;")
                            .replaceAll(">", "&gt;")
                            .substring(0, 100) + "..."
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
                    <button class="btn btn-outline-primary btn-sm" onclick="adminPanel.editPost('${
                      post.id
                    }')">
                      <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn btn-outline-warning btn-sm" onclick="adminPanel.addFactCheck('${
                      post.id
                    }')">
                      <i class="bi bi-exclamation-triangle"></i> Fact-Check
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="adminPanel.deletePost('${
                      post.id
                    }')">
                      <i class="bi bi-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
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
              <th>Severity</th>
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
                        ? (() => {
                            const radius =
                              suspension.avatar_radius !== null &&
                              suspension.avatar_radius !== undefined
                                ? `${suspension.avatar_radius}px`
                                : suspension.gold
                                ? `4px`
                                : `50px`;
                            return `<img src="${suspension.avatar}" class="user-avatar me-2" alt="Avatar" style="border-radius: ${radius};">`;
                          })()
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
                    ${suspension.reason}
                  </div>
                  ${
                    suspension.notes
                      ? `<small class="text-muted">Notes: ${suspension.notes}</small>`
                      : ""
                  }
                </td>
                <td>
                  <span class="badge ${
                    suspension.severity >= 4
                      ? "bg-danger"
                      : suspension.severity >= 3
                      ? "bg-warning"
                      : "bg-info"
                  }">
                    ${suspension.severity}/5
                  </span>
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
                  <button class="btn btn-outline-success btn-sm" onclick="adminPanel.unsuspendUser('${
                    suspension.user_id
                  }')">
                    <i class="bi bi-check-circle"></i> Lift
                  </button>
                </td>
              </tr>
            `
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

      document.getElementById(
        "userModalBody"
      ).innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status" style="border-radius:5000px"></div><div class="mt-2 text-muted">Loading user...</div></div>`;
      document.getElementById(
        "userModalFooter"
      ).innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;
      const modal = new bootstrap.Modal(document.getElementById("userModal"));
      modal.show();

      let userData;
      if (cached) {
        userData = await cached;
      } else {
        userData = await this.apiCall(`/api/admin/users/${userId}`);
      }

      const { user, suspensions, recentPosts, affiliate } = userData;

      document.getElementById("userModalBody").innerHTML = `
        <div class="row">
          <div class="col-md-4 text-center">
            <img src="${
              user.avatar || "/img/default-avatar.png"
            }" class="img-fluid mb-3" style="max-width: 150px; border-radius: ${
        user.avatar_radius !== null && user.avatar_radius !== undefined
          ? `${user.avatar_radius}px`
          : user.gold
          ? "4px"
          : "50%"
      };" alt="Avatar">
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
                        ? '<i class="bi bi-award-fill text-warning ms-1" title="Gold"></i>'
                        : ""
                    }`
                  : ""
              }
            </h4>
            <p class="text-muted">@${user.username}</p>
            <div class="d-flex justify-content-center gap-2 mb-3">
              ${user.admin ? '<span class="badge bg-primary">Admin</span>' : ""}
              ${
                user.suspended
                  ? '<span class="badge bg-danger">Suspended</span>'
                  : ""
              }
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
              <div class="mb-3">
                <label class="form-label">Character Limit Override</label>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                  Current: ${
                    user.character_limit ||
                    (user.gold
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
                    post.created_at
                  )}</small>
                  <p class="mb-1">${post.content
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")}</p>
                  <small>Likes: ${post.like_count} | Retweets: ${
                          post.retweet_count
                        } | Replies: ${post.reply_count}</small>
                </div>
              `
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
                      <strong>Severity ${suspension.severity}/5</strong>
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
                              suspension.expires_at
                            )}`
                          : " | Permanent"
                      }
                    </small>
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;

      document.getElementById("userModalFooter").innerHTML = `
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary" id="editProfileBtn" onclick="adminPanel.toggleEditMode(true)">Edit Profile</button>
        <button type="button" class="btn btn-success d-none" id="saveProfileBtn" onclick="adminPanel.saveProfile('${
          user.id
        }')">Save Changes</button>
        <div class="btn-group">
          <button type="button" class="btn btn-warning dropdown-toggle" data-bs-toggle="dropdown">
            Actions
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            ${
              !user.suspended
                ? `<li><a class="dropdown-item" href="#" onclick="adminPanel.showSuspensionModal('${user.id}')">Suspend User</a></li>`
                : `<li><a class="dropdown-item" href="#" onclick="adminPanel.unsuspendUser('${user.id}')">Unsuspend User</a></li>`
            }
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

      if (verifiedCheckbox && goldCheckbox) {
        const newVerified = verifiedCheckbox.cloneNode(true);
        verifiedCheckbox.parentNode.replaceChild(newVerified, verifiedCheckbox);

        const newGold = goldCheckbox.cloneNode(true);
        goldCheckbox.parentNode.replaceChild(newGold, goldCheckbox);

        const vCheckbox = document.getElementById("editProfileVerified");
        const gCheckbox = document.getElementById("editProfileGold");

        vCheckbox.addEventListener("change", () => {
          if (vCheckbox.checked) gCheckbox.checked = false;
        });

        gCheckbox.addEventListener("change", () => {
          if (gCheckbox.checked) vCheckbox.checked = false;
        });
      }

      const affiliateCheckbox = document.getElementById("editProfileAffiliate");
      const affiliateWithSection = document.getElementById(
        "affiliateWithSection"
      );

      if (affiliateCheckbox && affiliateWithSection) {
        const newAffiliate = affiliateCheckbox.cloneNode(true);
        affiliateCheckbox.parentNode.replaceChild(
          newAffiliate,
          affiliateCheckbox
        );

        const aCheckbox = document.getElementById("editProfileAffiliate");

        aCheckbox.addEventListener("change", () => {
          const section = document.getElementById("affiliateWithSection");
          if (aCheckbox.checked) {
            section.style.display = "block";
          } else {
            section.style.display = "none";
            const affiliateWithInput = document.getElementById(
              "editProfileAffiliateWith"
            );
            if (affiliateWithInput) affiliateWithInput.value = "";
          }
        });
      }
    } catch {
      this.showError("Failed to load user details");
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

  toggleEditMode(enable) {
    const form = document.getElementById("editProfileForm");
    if (!form) return;

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

    if (enable) {
      const firstEditable = form.querySelector(
        "input:not([disabled]):not([type=hidden]), textarea:not([disabled])"
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
      admin: !!adminInput?.checked,
      affiliate: !!affiliateInput?.checked,
    };

    const affiliateWithInput = document.getElementById(
      "editProfileAffiliateWith"
    );
    if (payload.affiliate && affiliateWithInput?.value) {
      const affiliateUsername = affiliateWithInput.value.trim();
      if (affiliateUsername) {
        payload.affiliate_with_username = affiliateUsername;
        affiliateWithInput.value = affiliateUsername;
      }
    }

    const ghostFollowersInput = document.getElementById(
      "editProfileGhostFollowers"
    );
    if (ghostFollowersInput?.value) {
      const count = parseInt(ghostFollowersInput.value) || 0;
      if (count > 0) {
        payload.ghost_followers = count;
      }
    }

    const ghostFollowingInput = document.getElementById(
      "editProfileGhostFollowing"
    );
    if (ghostFollowingInput?.value) {
      const count = parseInt(ghostFollowingInput.value) || 0;
      if (count > 0) {
        payload.ghost_following = count;
      }
    }

    const characterLimitInput = document.getElementById(
      "editProfileCharacterLimit"
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

  showSuspensionModal(userId) {
    document.getElementById("suspendUserId").value = userId;
    document.getElementById("suspensionForm").reset();
    new bootstrap.Modal(document.getElementById("suspensionModal")).show();
  }

  async submitSuspension() {
    const userId = document.getElementById("suspendUserId").value;
    let reason = document.getElementById("suspensionReason").value;
    const severity = parseInt(
      document.getElementById("suspensionSeverity").value
    );
    const duration = document.getElementById("suspensionDuration").value;
    const notes = document.getElementById("suspensionNotes").value;

    if (!reason.trim()) {
      reason =
        "No reason provided. Tweetapus reserves the right to suspend users at our discretion without notice.";
    }

    const payload = {
      reason: reason.trim(),
      severity,
    };

    if (duration?.trim()) {
      payload.duration = parseInt(duration);
    }
    if (notes?.trim()) {
      payload.notes = notes.trim();
    }

    try {
      await this.apiCall(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      bootstrap.Modal.getInstance(
        document.getElementById("suspensionModal")
      ).hide();
      this.showSuccess("User suspended successfully");
      this.loadUsers(this.currentPage.users);
    } catch (error) {
      this.showError(error.message);
    }
  }

  async unsuspendUser(userId) {
    if (!confirm("Are you sure you want to unsuspend this user?")) return;

    try {
      await this.apiCall(`/api/admin/users/${userId}/unsuspend`, {
        method: "POST",
      });

      this.showSuccess("User unsuspended successfully");
      if (this.currentPage.users) this.loadUsers(this.currentPage.users);
      if (this.currentPage.suspensions)
        this.loadSuspensions(this.currentPage.suspensions);
    } catch (error) {
      this.showError(error.message);
    }
  }

  async impersonateUser(userId) {
    try {
      const { error, copyLink } = await this.apiCall(
        `/api/admin/impersonate/${userId}`,
        {
          method: "POST",
        }
      );

      if (error) {
        this.showError(error);
        return;
      }

      navigator.clipboard.writeText(`${copyLink}`);

      this.showSuccess(
        `Impersonation link copied, paste it into a new incognito window`
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
    loadedUsers.forEach((user) => this.setupBulkFormInteractions(user));
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
            parsed.getTime() - parsed.getTimezoneOffset() * 60000
          )
            .toISOString()
            .slice(0, 16);
        }
      } catch (_) {}
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
      `${prefix}-affiliate-with-section`
    );
    if (affiliateCheckbox && affiliateSection) {
      affiliateCheckbox.addEventListener("change", () => {
        if (affiliateCheckbox.checked) {
          affiliateSection.style.display = "block";
        } else {
          affiliateSection.style.display = "none";
          const affiliateInput = document.getElementById(
            `${prefix}-affiliate-with`
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
        normalized.toUpperCase()
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
        `${prefix}-affiliate-with`
      );
      if (payload.affiliate && affiliateWithInput?.value?.trim()) {
        payload.affiliate_with_username = affiliateWithInput.value.trim();
      }

      const ghostFollowersInput = document.getElementById(
        `${prefix}-ghost-followers`
      );
      if (ghostFollowersInput?.value) {
        const count = parseInt(ghostFollowersInput.value, 10) || 0;
        if (count > 0) {
          payload.ghost_followers = count;
        }
      }

      const ghostFollowingInput = document.getElementById(
        `${prefix}-ghost-following`
      );
      if (ghostFollowingInput?.value) {
        const count = parseInt(ghostFollowingInput.value, 10) || 0;
        if (count > 0) {
          payload.ghost_following = count;
        }
      }

      const characterLimitInput = document.getElementById(
        `${prefix}-character-limit`
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
        `${prefix}-force-follow`
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
      `Updated ${order.length} user${order.length === 1 ? "" : "s"}`
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
        document.getElementById("factCheckModal")
      );
      modal.show();
    } catch (error) {
      this.showError("Failed to load fact-check data: " + error.message);
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
        }
      );

      if (response.success) {
        this.showSuccess("Fact-check removed successfully");
        bootstrap.Modal.getInstance(
          document.getElementById("factCheckModal")
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
          }
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
        }
      );

      if (response.success) {
        this.showSuccess(
          "Fact-check added successfully. Notifications sent to all users who interacted with this post."
        );
        bootstrap.Modal.getInstance(
          document.getElementById("factCheckModal")
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
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
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

  formatDateOnly(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
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
        document.getElementById("editPostModal")
      );
      modal.show();
    } catch {
      this.showError("Failed to load post details");
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

      bootstrap.Modal.getInstance(
        document.getElementById("editPostModal")
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
      document.getElementById(
        "tweetUserDisplay"
      ).textContent = `@${user.username}`;
      document.getElementById("tweetContent").value = "";

      const modal = new bootstrap.Modal(
        document.getElementById("tweetOnBehalfModal")
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

      await this.apiCall("/api/admin/tweets", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      bootstrap.Modal.getInstance(
        document.getElementById("tweetOnBehalfModal")
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
        { once: true }
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
      this.clearCustomNotificationIcon()
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

    const sanitized = this.sanitizeSvgMarkup(raw);
    if (!sanitized) {
      this.showError("Invalid SVG markup");
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
      svg: sanitized,
      previewDataUri: this.buildSvgDataUri(sanitized),
    };

    if (this.customNotificationIconClearBtn)
      this.customNotificationIconClearBtn.classList.remove("d-none");
    if (this.customNotificationSvgEditor)
      this.customNotificationSvgEditor.classList.add("d-none");
    this.customNotificationSvgInput.value = "";
    this.updateCustomNotificationPreview();
  }

  sanitizeSvgMarkup(svgText) {
    if (typeof svgText !== "string") return null;
    const trimmed = svgText.trim();
    if (!trimmed || trimmed.length > 8000) return null;
    if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) return null;
    const lowered = trimmed.toLowerCase();
    const forbiddenTokens = [
      "<script",
      "<iframe",
      "<object",
      "<embed",
      "<link",
      "<meta",
      "<style",
      "javascript:",
      "onload",
      "onerror",
      "onclick",
      "onfocus",
      "onmouseenter",
      "onmouseover",
      "onanimation",
      "onbegin",
      "onend",
      "onrepeat",
      "foreignobject",
      "<?xml",
      "<!doctype",
    ];
    for (const token of forbiddenTokens) {
      if (lowered.includes(token)) return null;
    }
    return trimmed;
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
      "#fakeNotificationForm button.btn-primary"
    );

    try {
      const iconPayload = await this.resolveCustomNotificationIcon();
      if (iconPayload) payload.customIcon = iconPayload;
    } catch (iconError) {
      const messageText = iconError?.message || "Failed to prepare custom icon";
      if (resultEl) {
        resultEl.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(
          messageText
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
          msg
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
        `/api/admin/dms/search?username=${encodeURIComponent(username)}`
      );
      this.renderDMsTable(data.conversations);
      document.getElementById("dmsPagination").innerHTML = "";
    } catch {
      this.showError("Failed to search DMs");
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
							`
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
          `/api/admin/dms/${conversationId}/messages?page=1&limit=50`
        ),
      ]);

      this.currentConversationId = conversationId;
      this.renderConversationModal(
        conversationData.conversation,
        messagesData.messages,
        messagesData.pagination
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
                              message.created_at
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
							`
                    )
                    .join("")
                : ""
            }
					</div>
				</div>
			</div>
		`
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
        "Are you sure you want to delete this conversation? This action cannot be undone."
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
        "Are you sure you want to delete this message? This action cannot be undone."
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
        `/api/admin/dms/${this.currentConversationId}/messages?page=${page}&limit=50`
      );
      this.renderConversationModal(
        conversationData.conversation,
        messagesData.messages,
        messagesData.pagination
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
    const modal = new bootstrap.Modal(
      document.getElementById("createUserModal")
    );
    modal.show();

    const verifiedCheckbox = document.getElementById("createVerified");
    const goldCheckbox = document.getElementById("createGold");

    if (verifiedCheckbox && goldCheckbox) {
      const newVerified = verifiedCheckbox.cloneNode(true);
      verifiedCheckbox.parentNode.replaceChild(newVerified, verifiedCheckbox);

      const newGold = goldCheckbox.cloneNode(true);
      goldCheckbox.parentNode.replaceChild(newGold, goldCheckbox);

      const vCheckbox = document.getElementById("createVerified");
      const gCheckbox = document.getElementById("createGold");

      vCheckbox.addEventListener("change", () => {
        if (vCheckbox.checked) gCheckbox.checked = false;
      });

      gCheckbox.addEventListener("change", () => {
        if (gCheckbox.checked) vCheckbox.checked = false;
      });
    }
  }

  async createUser() {
    const username = document.getElementById("createUsername").value.trim();
    const name = document.getElementById("createName").value.trim();
    const bio = document.getElementById("createBio").value.trim();
    const verified = document.getElementById("createVerified").checked;
    const gold = document.getElementById("createGold")?.checked || false;
    const isAdmin = document.getElementById("createAdmin").checked;

    if (!username) {
      this.showError("Username is required");
      return;
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
          admin: isAdmin,
        }),
      });

      bootstrap.Modal.getInstance(
        document.getElementById("createUserModal")
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
          }
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
    const data = await this.apiCall(
      `/api/admin/moderation-logs?page=${page}&limit=50`
    );
    this.currentPage.moderationLogs = page;
    this.renderModerationLogs(data.logs, data.pagination);
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
      unsuspend_user: "✓",
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
      unsuspend_user: "success",
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
      unsuspend_user: "Unsuspended User",
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
                      details.username
                    )}<br>`;
                  }
                  if (details.reason) {
                    detailsHtml += `<strong>Reason:</strong> ${this.escapeHtml(
                      details.reason
                    )}<br>`;
                  }
                  if (details.changes) {
                    detailsHtml += "<strong>Changes:</strong><br>";
                    for (const [key, value] of Object.entries(
                      details.changes
                    )) {
                      if (value.old !== undefined && value.new !== undefined) {
                        detailsHtml += `&nbsp;&nbsp;${key}: ${this.escapeHtml(
                          String(value.old)
                        )} → ${this.escapeHtml(String(value.new))}<br>`;
                      }
                    }
                  }
                  if (details.content) {
                    detailsHtml += `<strong>Content:</strong> ${this.escapeHtml(
                      details.content
                    )}<br>`;
                  }
                  if (details.targetUser) {
                    detailsHtml += `<strong>Target User:</strong> @${this.escapeHtml(
                      details.targetUser
                    )}<br>`;
                  }
                  if (details.author) {
                    detailsHtml += `<strong>Author:</strong> @${this.escapeHtml(
                      details.author
                    )}<br>`;
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
                            log.moderator_name
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
                      log.target_type
                    )}</span>
                    <br><small class="text-muted font-monospace">${this.escapeHtml(
                      log.target_id.substring(0, 8)
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
      this.loadModerationLogs(page)
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
        }
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
      this.loadReports(nextPage)
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
        report.reported.content?.substring(0, 50) || ""
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
            report.resolved_at
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
          String(report.reporter.username)
        )}" target="_blank">${reporterUsername}</a>`
      : reporterUsername;
    const reporterName = report.reporter?.name
      ? `<br><small class="text-muted">${this.escapeHtml(
          String(report.reporter.name)
        )}</small>`
      : "";

    let reportedInfo = "Deleted";
    if (report.reported_type === "user" && report.reported) {
      const reportedUsername = String(report.reported.username || "");
      reportedInfo = `<a href="/@${this.escapeHtml(
        reportedUsername
      )}" target="_blank">@${this.escapeHtml(reportedUsername)}</a>`;
      if (report.reported.name) {
        reportedInfo += `<br><small class="text-muted">${this.escapeHtml(
          String(report.reported.name)
        )}</small>`;
      }
    } else if (report.reported_type === "post" && report.reported) {
      const reportedId = String(report.reported.id || "");
      reportedInfo = `<a href="/tweet/${this.escapeHtml(
        reportedId
      )}" target="_blank">Tweet</a>`;
      if (report.reported.content) {
        const reportedSnippet = String(report.reported.content);
        const truncatedSnippet =
          reportedSnippet.length > 140
            ? `${reportedSnippet.slice(0, 140)}...`
            : reportedSnippet;
        reportedInfo += `<br><small class="text-muted">${this.escapeHtml(
          truncatedSnippet
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
            resolutionLabel
          )}</div>
          <div><strong>Resolved By:</strong> ${resolvedBy}</div>
          <div><strong>Resolved At:</strong> ${this.escapeHtml(
            resolvedAt
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
            reasonLabel
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
          report.reported.content?.substring(0, 100) || ""
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
            report.additional_info || "None"
          )}<br>
          <strong>Reporter:</strong> @${this.escapeHtml(
            report.reporter?.username || "Unknown"
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
              <label class="form-label">Severity</label>
              <select id="banSeverity" class="form-select">
                <option value="1">1 - Minor</option>
                <option value="2">2 - Low</option>
                <option value="3" selected>3 - Medium</option>
                <option value="4">4 - High</option>
                <option value="5">5 - Critical</option>
              </select>
            </div>
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
        document.getElementById("reportActionModal")
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
      const severity = document.getElementById("banSeverity")?.value;
      if (duration) body.duration = Number.parseInt(duration);
      if (severity) body.severity = Number.parseInt(severity);
    } else if (action === "fact_check") {
      const note = document.getElementById("factCheckNoteReport")?.value;
      const severity = document.getElementById(
        "factCheckSeverityReport"
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
        document.getElementById("reportActionModal")
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
        }
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
                          community.id.substring(0, 8)
                        )}...</small>
                      </div>
                    </div>
                  </td>
                  <td style="max-width: 200px;">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${this.escapeHtml(
                        community.description || "No description"
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
        this.loadCommunities(page)
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
        "Are you sure you want to delete this community? This action cannot be undone."
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
      alert("Failed to create community: " + error.message);
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
                    community.name
                  )}" required />
                </div>
                <div class="mb-3">
                  <label class="form-label">Description</label>
                  <textarea class="form-control" id="adminEditCommunityDescription" rows="3">${this.escapeHtml(
                    community.description || ""
                  )}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Rules</label>
                  <textarea class="form-control" id="adminEditCommunityRules" rows="3">${this.escapeHtml(
                    community.rules || ""
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
      alert("Failed to update community: " + error.message);
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
                          m.joined_at
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
                    `
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
        }
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

window.loadConversationMessages = loadConversationMessages;
