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

    this.init();
  }

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  } // Tr, a the fix
  // Applehidr

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
      // Setup clone form if present on the page
      try {
        this.setupCloneForm();
      } catch (_e) {
        // noop
      }
      // Setup fake notification form if present
      try {
        this.setupFakeNotificationForm();
      } catch (_e) {
        // noop
      }
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

  /* Emoji management (admin) */
  async loadEmojis() {
    try {
      const data = await this.apiCall("/api/admin/emojis");
      const emojis = data.emojis || [];
      this.renderEmojisList(emojis);
      // Setup form handlers lazily
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

    // remember whether the file input was originally required so we can
    // temporarily bypass native validation when we store a processed file
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
        // Upload file via upload endpoint
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

        // Create emoji record via admin API
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
      modalEl,
      size,
      ratio,
      image: null,
      scale: 1,
      minScale: 1,
      maxScale: 4,
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

    modalEl.addEventListener("hidden.bs.modal", () => {
      if (this.emojiCropper) {
        this.emojiCropper.image = null;
        this.emojiCropper.isDragging = false;
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
      const minScale = Math.max(
        canvasSize / img.width,
        canvasSize / img.height
      );
      const maxScale = Math.max(minScale * 6, minScale + 0.5);
      crop.minScale = minScale;
      crop.maxScale = maxScale;
      crop.scale = minScale;
      crop.offsetX = (canvasSize - img.width * crop.scale) / 2;
      crop.offsetY = (canvasSize - img.height * crop.scale) / 2;
      crop.zoom.min = `${minScale}`;
      crop.zoom.max = `${maxScale}`;
      crop.zoom.step = Math.max(minScale / 100, 0.01);
      crop.zoom.value = `${minScale}`;
      this.drawEmojiCrop();
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

  updateEmojiScale(newScale) {
    const crop = this.emojiCropper;
    if (!crop || !crop.image) return;
    const clamped = Math.max(crop.minScale, Math.min(crop.maxScale, newScale));
    const canvasSize = crop.size * crop.ratio;
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const relX = centerX - crop.offsetX;
    const relY = centerY - crop.offsetY;
    const ratio = clamped / crop.scale;
    crop.offsetX = centerX - relX * ratio;
    crop.offsetY = centerY - relY * ratio;
    crop.scale = clamped;
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
        // clear the native file input so it shows "No file selected" visually,
        // but remove the required attribute when we have a processed file so
        // native browser validation does not block form submission
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
      // we restored a processed file from before, ensure native required is not blocking
      if (this.emojiFileInput && this.emojiFileInitiallyRequired)
        this.emojiFileInput.removeAttribute("required");
    } else {
      // no processed file available, restore original required state on the input
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
      // restore required attribute state if it was originally present
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
    const defaultOptions = {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": options?.body ? "application/json" : undefined,
        ...options.headers,
      },
    };

    const response = await fetch(endpoint, { ...defaultOptions, ...options });
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
                          ? `<br><small class="text-muted">${user.name}</small>`
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
                      // add account switching @tiagozip
                      this.isFlagSet(user.gold)
                        ? '<span class="badge bg-yellow">Gold</span>'
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
                      post.content.length > 100
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
                          ? `<br><small class="text-muted">${suspension.name}</small>`
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

  renderPagination(type, pagination) {
    const container = document.getElementById(`${type}Pagination`);

    if (pagination.pages <= 1) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      <ul class="pagination justify-content-center align-items-center">
        <li class="page-item ${pagination.page === 1 ? "disabled" : ""}">
          <a class="page-link" href="#" onclick="adminPanel.load${
            type.charAt(0).toUpperCase() + type.slice(1)
          }(${pagination.page - 1})">Previous</a>
        </li>
        <li class="page-item">
          <span class="page-link bg-light">
            Page <input type="number" min="1" max="${
              pagination.pages
            }" value="${pagination.page}" 
                       style="width: 60px; border: 1px solid #ccc; text-align: center; margin: 0 5px;"
                       onkeypress="if(event.key === 'Enter') adminPanel.load${
                         type.charAt(0).toUpperCase() + type.slice(1)
                       }(parseInt(this.value))"
                       onchange="adminPanel.load${
                         type.charAt(0).toUpperCase() + type.slice(1)
                       }(parseInt(this.value))"> of ${pagination.pages}
          </span>
        </li>
        <li class="page-item ${
          pagination.page === pagination.pages ? "disabled" : ""
        }">
          <a class="page-link" href="#" onclick="adminPanel.load${
            type.charAt(0).toUpperCase() + type.slice(1)
          }(${pagination.page + 1})">Next</a>
        </li>
      </ul>
    `;
  }

  async showUserModal(userId) {
    try {
      // If we have cached data (or a promise), use it. Otherwise fetch and show loading state.
      const cached = this.userCache.get(userId);

      // Show an immediate lightweight loading state so the modal appears instantly
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
        // cached may be a promise or the resolved data
        userData = await cached;
      } else {
        userData = await this.apiCall(`/api/admin/users/${userId}`);
      }

      const { user, suspensions, recentPosts } = userData;

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

      // Ensure fields are readonly/disabled until Edit Profile is clicked
      this.toggleEditMode(false);

      // populate created_at field if available
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

      // Make verified and gold checkboxes mutually exclusive
      const verifiedCheckbox = document.getElementById("editProfileVerified");
      const goldCheckbox = document.getElementById("editProfileGold");

      if (verifiedCheckbox && goldCheckbox) {
        // Remove any existing listeners by replacing node with a clone, then re-query
        const newVerified = verifiedCheckbox.cloneNode(true);
        verifiedCheckbox.parentNode.replaceChild(newVerified, verifiedCheckbox);

        const newGold = goldCheckbox.cloneNode(true);
        goldCheckbox.parentNode.replaceChild(newGold, goldCheckbox);

        // Re-query to get the replaced elements
        const vCheckbox = document.getElementById("editProfileVerified");
        const gCheckbox = document.getElementById("editProfileGold");

        vCheckbox.addEventListener("change", () => {
          if (vCheckbox.checked) gCheckbox.checked = false;
        });

        gCheckbox.addEventListener("change", () => {
          if (gCheckbox.checked) vCheckbox.checked = false;
        });
      }
    } catch {
      this.showError("Failed to load user details");
    }
  }

  // Prefetch user details into an in-memory cache to make the View/Edit action feel instant
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

    // Enable/disable all relevant controls in the form (more robust than only using readOnly)
    const controls = form.querySelectorAll("input, textarea, select");
    controls.forEach((field) => {
      // keep hidden/id field untouched
      if (field.id === "editProfileId" || field.type === "hidden") return;

      // skip buttons
      if (field.tagName === "BUTTON") return;

      // skip input types that shouldn't be toggled (file, submit, reset)
      if (
        field.tagName === "INPUT" &&
        ["button", "submit", "reset", "file"].includes(field.type)
      )
        return;

      // Use disabled for all controls so they cannot be interacted with
      field.disabled = !enable;

      // For checkboxes, we want them to show their state but not be changeable in view mode
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

      // allow created_at datetime-local to be edited when enabling edit mode
      if (field.id === "editProfileCreatedAt") {
        field.readOnly = !enable;
        field.disabled = !enable;
      }

      // For textual inputs and textareas also set readOnly to allow styling/selection differences
      if (
        field.tagName === "TEXTAREA" ||
        (field.tagName === "INPUT" &&
          ["text", "number", "email", "tel", "password"].includes(field.type))
      ) {
        field.readOnly = !enable;
      }
    });

    // Toggle buttons visibility
    const editBtn = document.getElementById("editProfileBtn");
    const saveBtn = document.getElementById("saveProfileBtn");
    if (editBtn) editBtn.classList.toggle("d-none", enable);
    if (saveBtn) saveBtn.classList.toggle("d-none", !enable);

    // Focus the first editable field when enabling edit mode
    if (enable) {
      const firstEditable = form.querySelector(
        "input:not([disabled]):not([type=hidden]), textarea:not([disabled])"
      );
      if (firstEditable) firstEditable.focus();
    }
  }

  async saveProfile(userId) {
    const payload = {
      username: document.getElementById("editProfileUsername").value,
      name: document.getElementById("editProfileName").value,
      bio: document.getElementById("editProfileBio").value,
      verified: document.getElementById("editProfileVerified").checked,
      gold: document.getElementById("editProfileGold").checked,
      admin: document.getElementById("editProfileAdmin").checked,
    };

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
      // include created_at if provided
      const createdInput = document.getElementById("editProfileCreatedAt");
      if (createdInput?.value) {
        const local = new Date(createdInput.value);
        payload.created_at = local.toISOString();
      }

      await this.apiCall(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      try {
        this.userCache.delete(userId);
      } catch {
        // noop
      }

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
      // Refresh both users and suspensions if we're on those pages
      if (this.currentPage.users) this.loadUsers(this.currentPage.users);
      if (this.currentPage.suspensions)
        this.loadSuspensions(this.currentPage.suspensions);
    } catch (error) {
      this.showError(error.message);
    }
  }

  async impersonateUser(userId) {
    try {
      const result = await this.apiCall(`/api/admin/impersonate/${userId}`, {
        method: "POST",
      });

      navigator.clipboard.writeText(`${result.copyLink}`);

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
    /* There's a MASSIVE vulnerability in this code that can TAPER away all the users and FADE the userbase to a LOW point */
    try {
      await this.apiCall(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      this.showSuccess("User deleted successfully");
      this.loadUsers(this.currentPage.users);
    } catch (error) {
      this.showError(error.message);
    }
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

  formatDate(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return "";
    // If year is before 1926, force a full numeric year to avoid two-digit ambiguity
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

  // Date-only formatter (keeps just the date portion). Also forces full year for <1926
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
    // Switch to users tab
    document.getElementById("users-nav").click();

    // Focus and set search input
    const searchInput = document.getElementById("userSearch");
    searchInput.value = username;
    searchInput.focus();

    // Trigger search
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
      // populate created_at if present
      const createdInput = document.getElementById("editPostCreatedAt");
      if (createdInput) {
        try {
          const d = new Date(post.created_at);
          // convert to local ISO for datetime-local value
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
        // convert local datetime-local back to ISO
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
      // setup char count UI (admin default: unlimited)
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
    // Admin panel: unlimited by default
    const noCharLimit = true;

    if (!content.trim()) {
      this.showError("Tweet content cannot be empty");
      return;
    }

    try {
      // Build payload, omitting replyTo when not provided to avoid sending null
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

  // Setup the fake notification form behavior
  setupFakeNotificationForm() {
    const form = document.getElementById("fakeNotificationForm");
    if (!form) return;

    // Attach a submit-like handler to the send button (we use explicit click handler in HTML)
    // But also prevent Enter from submitting the page accidentally
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sendFakeNotification();
    });
  }

  // Send a fake notification via the admin API endpoint
  async sendFakeNotification() {
    const targetRaw = document.getElementById("notifTarget")?.value?.trim();
    const title = document.getElementById("notifTitle")?.value?.trim();
    const type = document.getElementById("notifType")?.value || "default";
    // Subtitle replaces the old message body textarea and is the preferred
    // notification preview/body. Message remains optional as a fallback.
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

    // Allow subtitle OR message (or title) — require at least one body/title present
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

    try {
      const sendBtn = document.querySelector(
        "#fakeNotificationForm button.btn-primary"
      );
      if (sendBtn) sendBtn.disabled = true;

      await this.apiCall("/api/admin/fake-notification", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (resultEl)
        resultEl.innerHTML =
          '<div class="alert alert-success">Notification sent (or queued) successfully.</div>';
      document.getElementById("notifTitle").value = "";
      document.getElementById("notifSubtitle").value = "";
      const msgEl = document.getElementById("notifMessage");
      if (msgEl) msgEl.value = "";
      document.getElementById("notifUrl").value = "";
      if (sendBtn) sendBtn.disabled = false;
    } catch (err) {
      const msg = err?.message || "Failed to send notification";
      if (resultEl)
        resultEl.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(
          msg
        )}</div>`;
      else this.showError(msg);
    }
  }

  // DM Management Methods
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

    // Previous button
    if (currentPage > 1) {
      paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="adminPanel.loadDMs(${
        currentPage - 1
      })">Previous</a></li>`;
    }

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? "active" : "";
      paginationHtml += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="adminPanel.loadDMs(${i})">${i}</a></li>`;
    }

    // Next button
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

    // Render messages
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

    // Render pagination if needed
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
      // Reload the current conversation
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

  // Create user methods
  showCreateUserModal() {
    document.getElementById("createUserForm").reset();
    const modal = new bootstrap.Modal(
      document.getElementById("createUserModal")
    );
    modal.show();

    // Make verified and gold checkboxes mutually exclusive in create modal
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

  // Clone profile UI integration -------------------------------------------------
  setupCloneForm() {
    const form = document.getElementById("cloneForm");
    if (!form) return; // nothing to do on pages without the clone form

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
        // Include boolean flags only when explicitly set to allow server defaults
        payload.cloneRelations = cloneRelations;
        payload.cloneGhosts = cloneGhosts;
        payload.cloneTweets = cloneTweets;
        payload.cloneReplies = cloneReplies;
        payload.cloneRetweets = cloneRetweets;
        payload.cloneReactions = cloneReactions;
        payload.cloneCommunities = cloneCommunities;
        payload.cloneMedia = cloneMedia;

        const data = await this.apiCall(
          `/api/admin/users/${encodeURIComponent(sourceId)}/clone`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );

        if (resultEl) {
          resultEl.className = "success";
          // Prefer server-returned username; fall back to the requested username
          const createdUsername = data?.username || username || data?.id || "";
          resultEl.textContent = `Cloned user created: @${createdUsername}`;
          const a = document.createElement("a");
          // Link to canonical username URL (/@username)
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
