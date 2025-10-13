class AdminPanel {
  constructor() {
    this.token = localStorage.getItem("authToken");
    this.currentUser = null;
    this.isImpersonating = false;
    this.userCache = new Map();
    this.currentPage = {
      users: 1,
      posts: 1,
      suspensions: 1,
      dms: 1,
      moderationLogs: 1,
    };

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
      case "suspensions":
        this.loadSuspensions();
        break;
      case "dms":
        this.loadDMs();
        break;
      case "moderation-logs":
        this.loadModerationLogs();
        break;
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
                                user.avatar_radius !== null && user.avatar_radius !== undefined
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
                              post.avatar_radius !== null && post.avatar_radius !== undefined
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
                              suspension.avatar_radius !== null && suspension.avatar_radius !== undefined
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
      ).innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Loading user...</div></div>`;
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
            }" class="img-fluid rounded-circle mb-3" style="max-width: 150px;" alt="Avatar">
            <h4>@${user.username}</h4>
            <p class="text-muted">${user.name || ""}</p>
            <div class="d-flex justify-content-center gap-2 mb-3">
              ${
                this.isFlagSet(user.verified)
                  ? '<span class="badge bg-success">Verified</span>'
                  : ""
              }
              ${
                this.isFlagSet(user.gold)
                  ? '<span class="badge bg-warning text-dark">Gold</span>'
                  : ""
              }
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
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Followers</label>
                  <input type="number" class="form-control" id="editProfileFollowers" value="${
                    user.actual_follower_count
                  }" readonly>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Following</label>
                  <input type="number" class="form-control" id="editProfileFollowing" value="${
                    user.actual_following_count
                  }" readonly>
                </div>
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

    try {
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

  formatDate(dateString) {
    return new Date(dateString).toLocaleString();
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

    if (!content.trim()) {
      this.showError("Post content cannot be empty");
      return;
    }

    try {
      await this.apiCall(`/api/admin/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: content.trim(),
          likes,
          retweets,
          replies,
        }),
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
    const replyTo = replyToRaw && replyToRaw.trim() ? replyToRaw.trim() : undefined;
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
										${
                      conv.last_message_at
                        ? new Date(conv.last_message_at).toLocaleString()
                        : "No messages"
                    }
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
					<p>${new Date(conversation.created_at).toLocaleString()}</p>
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
							<small class="text-muted">${new Date(
                message.created_at
              ).toLocaleString()}</small>
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
                const date = new Date(log.created_at);
                const formattedDate = date.toLocaleString();
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
