import { convertImageToWebP } from "../shared/image-utils.js";
import { showToast } from "../shared/toasts.js";
import api from "../timeline/js/api.js";

let currentCommunity = null;
let currentMember = null;

async function loadCommunities() {
  const { communities } = await api("/communities?limit=50");
  const list = document.getElementById("communitiesList");
  list.innerHTML = "";

  if (!communities || communities.length === 0) {
    list.innerHTML =
      '<p class="empty-state">No communities yet. Create the first one!</p>';
    return;
  }

  for (const community of communities) {
    const card = createCommunityCard(community);
    list.appendChild(card);
  }
}

async function loadMyCommunities() {
  const userId = JSON.parse(
    atob(localStorage.getItem("authToken").split(".")[1])
  ).userId;
  const { communities } = await api(`/users/${userId}/communities?limit=50`);
  const list = document.getElementById("myCommunitiesList");
  list.innerHTML = "";

  if (!communities || communities.length === 0) {
    list.innerHTML =
      '<p class="empty-state">You haven\'t joined any communities yet.</p>';
    return;
  }

  for (const community of communities) {
    const card = createCommunityCard(community, true);
    list.appendChild(card);
  }
}

function createCommunityCard(community, showRole = false) {
  const card = document.createElement("div");
  card.className = "community-card";

  const banner = community.banner
    ? `<div class="community-banner" style="background-image: url('/public/shared/assets/uploads/${community.banner}')"></div>`
    : '<div class="community-banner default"></div>';

  const icon = community.icon
    ? `<img src="/public/shared/assets/uploads/${community.icon}" alt="${community.name}" class="community-icon" />`
    : `<div class="community-icon default">${community.name[0].toUpperCase()}</div>`;

  const roleHTML =
    showRole && community.role
      ? `<span class="role-badge ${community.role}">${community.role}</span>`
      : "";

  const lockIcon =
    community.access_mode === "locked"
      ? '<svg class="lock-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6zM18 20H6V10h12v10z"/></svg>'
      : "";

  card.innerHTML = `
    ${banner}
    <div class="community-card-content">
      ${icon}
      <div class="community-info">
        <h3>${community.name} ${lockIcon}</h3>
        <p class="community-description">${
          community.description || "No description"
        }</p>
        <div class="community-meta">
          <span>${community.member_count || 0} members</span>
          ${roleHTML}
        </div>
      </div>
    </div>
  `;

  card.addEventListener("click", () => openCommunityModal(community.id));
  return card;
}

async function openCommunityModal(communityId) {
  const data = await api(`/communities/${communityId}`);

  if (data.error) {
    showToast(data.error, "error");
    return;
  }

  currentCommunity = data.community;
  currentMember = data.member;

  const modal = document.getElementById("communityModal");
  const title = document.getElementById("communityModalTitle");
  const header = document.getElementById("communityHeader");

  title.textContent = currentCommunity.name;

  const banner = currentCommunity.banner
    ? `<div class="community-modal-banner" style="background-image: url('/public/shared/assets/uploads/${currentCommunity.banner}')"></div>`
    : '<div class="community-modal-banner default"></div>';

  const icon = currentCommunity.icon
    ? `<img src="/public/shared/assets/uploads/${currentCommunity.icon}" alt="${currentCommunity.name}" class="community-modal-icon" />`
    : `<div class="community-modal-icon default">${currentCommunity.name[0].toUpperCase()}</div>`;

  const canManage =
    currentMember &&
    (currentMember.role === "owner" || currentMember.role === "admin");
  const isOwner = currentMember && currentMember.role === "owner";

  let actionButton = "";
  if (!currentMember) {
    if (data.joinRequest) {
      actionButton =
        '<button class="btn-secondary" disabled>Request Pending</button>';
    } else {
      actionButton = `<button class="btn-primary" id="joinCommunityBtn">Join Community</button>`;
    }
  } else if (currentMember.role !== "owner") {
    actionButton =
      '<button class="btn-danger" id="leaveCommunityBtn">Leave Community</button>';
  }

  const editButton = canManage
    ? '<button class="btn-secondary" id="editCommunityBtn">Edit Community</button>'
    : "";

  const deleteButton = isOwner
    ? '<button class="btn-danger" id="deleteCommunityBtn">Delete Community</button>'
    : "";

  header.innerHTML = `
    ${banner}
    <div class="community-modal-info">
      ${icon}
      <div>
        <h2>${currentCommunity.name}</h2>
        <p>${currentCommunity.member_count || 0} members</p>
      </div>
      <div class="community-actions">
        ${actionButton}
        ${editButton}
        ${deleteButton}
      </div>
    </div>
  `;

  document
    .getElementById("requestsTab")
    .classList.toggle(
      "hidden",
      !(
        currentMember &&
        (currentMember.role === "owner" || currentMember.role === "admin")
      )
    );
  document.getElementById("settingsTab").classList.toggle("hidden", !isOwner);

  showAboutTab();
  modal.classList.remove("hidden");

  const joinBtn = document.getElementById("joinCommunityBtn");
  const leaveBtn = document.getElementById("leaveCommunityBtn");
  const editBtn = document.getElementById("editCommunityBtn");
  const deleteBtn = document.getElementById("deleteCommunityBtn");

  if (joinBtn) joinBtn.addEventListener("click", joinCommunity);
  if (leaveBtn) leaveBtn.addEventListener("click", leaveCommunity);
  if (editBtn) editBtn.addEventListener("click", openEditModal);
  if (deleteBtn) deleteBtn.addEventListener("click", deleteCommunity);
}

function showAboutTab() {
  const content = document.getElementById("aboutContent");
  content.innerHTML = `
    <div class="about-section">
      <h3>Description</h3>
      <p>${currentCommunity.description || "No description provided."}</p>
    </div>
    <div class="about-section">
      <h3>Rules</h3>
      <p>${currentCommunity.rules || "No rules specified."}</p>
    </div>
    <div class="about-section">
      <h3>Access Mode</h3>
      <p>${
        currentCommunity.access_mode === "locked"
          ? "🔒 Locked - Requires approval to join"
          : "🔓 Open - Anyone can join"
      }</p>
    </div>
  `;
}

async function showMembersTab() {
  const content = document.getElementById("membersContent");
  content.innerHTML = '<div class="loading">Loading members...</div>';

  const { members } = await api(
    `/communities/${currentCommunity.id}/members?limit=100`
  );

  if (!members || members.length === 0) {
    content.innerHTML = '<p class="empty-state">No members yet.</p>';
    return;
  }

  content.innerHTML = "";
  for (const member of members) {
    const memberEl = createMemberElement(member);
    content.appendChild(memberEl);
  }
}

function createMemberElement(member) {
  const div = document.createElement("div");
  div.className = "member-item";

  const avatar = member.avatar
    ? `<img src="/public/shared/assets/uploads/${member.avatar}" alt="${member.username}" class="member-avatar" />`
    : `<div class="member-avatar default">${member.username[0].toUpperCase()}</div>`;

  const canManage =
    currentMember &&
    ["owner", "admin", "mod"].includes(currentMember.role) &&
    member.user_id !== currentMember.user_id;
  const canChangeRole =
    currentMember?.role === "owner" ||
    (currentMember?.role === "admin" && member.role === "member");

  let actionsHTML = "";
  if (canManage) {
    const banButton = member.banned
      ? `<button class="btn-small" data-action="unban" data-user="${member.user_id}">Unban</button>`
      : `<button class="btn-small btn-danger" data-action="ban" data-user="${member.user_id}">Ban</button>`;

    const roleButton =
      canChangeRole && !member.banned
        ? `<select class="role-select" data-user="${member.user_id}">
          <option value="member" ${
            member.role === "member" ? "selected" : ""
          }>Member</option>
          <option value="mod" ${
            member.role === "mod" ? "selected" : ""
          }>Mod</option>
          ${
            currentMember.role === "owner"
              ? `<option value="admin" ${
                  member.role === "admin" ? "selected" : ""
                }>Admin</option>`
              : ""
          }
        </select>`
        : "";

    actionsHTML = `<div class="member-actions">${roleButton}${banButton}</div>`;
  }

  div.innerHTML = `
    ${avatar}
    <div class="member-info">
      <div class="member-name">
        <strong>${member.name || member.username}</strong>
        <span class="role-badge ${member.role}">${member.role}</span>
      </div>
      <span class="member-username">@${member.username}</span>
      ${member.banned ? '<span class="banned-badge">BANNED</span>' : ""}
    </div>
    ${actionsHTML}
  `;

  const banBtn = div.querySelector('[data-action="ban"]');
  const unbanBtn = div.querySelector('[data-action="unban"]');
  const roleSelect = div.querySelector(".role-select");

  if (banBtn) banBtn.addEventListener("click", () => banUser(member.user_id));
  if (unbanBtn)
    unbanBtn.addEventListener("click", () => unbanUser(member.user_id));
  if (roleSelect)
    roleSelect.addEventListener("change", (e) =>
      changeUserRole(member.user_id, e.target.value)
    );

  return div;
}

async function showRequestsTab() {
  const content = document.getElementById("requestsContent");
  content.innerHTML = '<div class="loading">Loading join requests...</div>';

  const { requests } = await api(
    `/communities/${currentCommunity.id}/join-requests?limit=100`
  );

  if (!requests || requests.length === 0) {
    content.innerHTML = '<p class="empty-state">No pending join requests.</p>';
    return;
  }

  content.innerHTML = "";
  for (const request of requests) {
    const requestEl = createRequestElement(request);
    content.appendChild(requestEl);
  }
}

function createRequestElement(request) {
  const div = document.createElement("div");
  div.className = "request-item";

  const avatar = request.avatar
    ? `<img src="/public/shared/assets/uploads/${request.avatar}" alt="${request.username}" class="request-avatar" />`
    : `<div class="request-avatar default">${request.username[0].toUpperCase()}</div>`;

  div.innerHTML = `
    ${avatar}
    <div class="request-info">
      <strong>${request.name || request.username}</strong>
      <span class="request-username">@${request.username}</span>
    </div>
    <div class="request-actions">
      <button class="btn-small btn-primary" data-action="approve" data-request="${
        request.id
      }">Approve</button>
      <button class="btn-small btn-danger" data-action="reject" data-request="${
        request.id
      }">Reject</button>
    </div>
  `;

  const approveBtn = div.querySelector('[data-action="approve"]');
  const rejectBtn = div.querySelector('[data-action="reject"]');

  approveBtn.addEventListener("click", () => approveRequest(request.id));
  rejectBtn.addEventListener("click", () => rejectRequest(request.id));

  return div;
}

async function showSettingsTab() {
  const content = document.getElementById("settingsContent");

  content.innerHTML = `
    <div class="settings-section">
      <h3>Access Mode</h3>
      <select id="accessModeSelect" class="settings-select">
        <option value="open" ${
          currentCommunity.access_mode === "open" ? "selected" : ""
        }>Open - Anyone can join instantly</option>
        <option value="locked" ${
          currentCommunity.access_mode === "locked" ? "selected" : ""
        }>Locked - Requires approval to join</option>
      </select>
      <button class="btn-primary" id="saveAccessModeBtn">Save Access Mode</button>
    </div>
  `;

  document
    .getElementById("saveAccessModeBtn")
    .addEventListener("click", saveAccessMode);
}

async function joinCommunity() {
  const result = await api(`/communities/${currentCommunity.id}/join`, {
    method: "POST",
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  if (result.status === "pending") {
    showToast("Join request sent!", "success");
  } else {
    showToast("Joined community!", "success");
  }

  document.getElementById("communityModal").classList.add("hidden");
  loadCommunities();
  loadMyCommunities();
}

async function leaveCommunity() {
  if (!confirm("Are you sure you want to leave this community?")) return;

  const result = await api(`/communities/${currentCommunity.id}/leave`, {
    method: "POST",
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Left community", "success");
  document.getElementById("communityModal").classList.add("hidden");
  loadCommunities();
  loadMyCommunities();
}

async function deleteCommunity() {
  if (
    !confirm(
      "Are you sure you want to delete this community? This action cannot be undone."
    )
  )
    return;
  if (
    !confirm(
      "This will permanently delete the community and all its data. Are you absolutely sure?"
    )
  )
    return;

  const result = await api(`/communities/${currentCommunity.id}`, {
    method: "DELETE",
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Community deleted", "success");
  document.getElementById("communityModal").classList.add("hidden");
  loadCommunities();
  loadMyCommunities();
}

async function banUser(userId) {
  const reason = prompt("Reason for ban (optional):");
  if (reason === null) return;

  const result = await api(
    `/communities/${currentCommunity.id}/members/${userId}/ban`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }
  );

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("User banned", "success");
  showMembersTab();
}

async function unbanUser(userId) {
  const result = await api(
    `/communities/${currentCommunity.id}/members/${userId}/unban`,
    { method: "POST" }
  );

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("User unbanned", "success");
  showMembersTab();
}

async function changeUserRole(userId, newRole) {
  const result = await api(
    `/communities/${currentCommunity.id}/members/${userId}/role`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    }
  );

  if (result.error) {
    showToast(result.error, "error");
    showMembersTab();
    return;
  }

  showToast("Role updated", "success");
}

async function approveRequest(requestId) {
  const result = await api(
    `/communities/${currentCommunity.id}/join-requests/${requestId}/approve`,
    { method: "POST" }
  );

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Request approved", "success");
  showRequestsTab();
}

async function rejectRequest(requestId) {
  const result = await api(
    `/communities/${currentCommunity.id}/join-requests/${requestId}/reject`,
    { method: "POST" }
  );

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Request rejected", "success");
  showRequestsTab();
}

async function saveAccessMode() {
  const accessMode = document.getElementById("accessModeSelect").value;

  const result = await api(`/communities/${currentCommunity.id}/access-mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_mode: accessMode }),
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  currentCommunity.access_mode = accessMode;
  showToast("Access mode updated", "success");
}

function openEditModal() {
  document.getElementById("editCommunityName").value = currentCommunity.name;
  document.getElementById("editCommunityDescription").value =
    currentCommunity.description || "";
  document.getElementById("editCommunityRules").value =
    currentCommunity.rules || "";

  const iconPreview = document.getElementById("iconPreview");
  const bannerPreview = document.getElementById("bannerPreview");

  if (currentCommunity.icon) {
    iconPreview.innerHTML = `<img src="/public/shared/assets/uploads/${currentCommunity.icon}" alt="Current icon" />`;
  } else {
    iconPreview.innerHTML = "";
  }

  if (currentCommunity.banner) {
    bannerPreview.innerHTML = `<img src="/public/shared/assets/uploads/${currentCommunity.banner}" alt="Current banner" />`;
  } else {
    bannerPreview.innerHTML = "";
  }

  document.getElementById("editCommunityModal").classList.remove("hidden");
}

document.getElementById("createCommunityBtn").addEventListener("click", () => {
  document.getElementById("createCommunityModal").classList.remove("hidden");
});

document.getElementById("closeCreateModal").addEventListener("click", () => {
  document.getElementById("createCommunityModal").classList.add("hidden");
});

document.getElementById("cancelCreateBtn").addEventListener("click", () => {
  document.getElementById("createCommunityModal").classList.add("hidden");
});

document.getElementById("closeCommunityModal").addEventListener("click", () => {
  document.getElementById("communityModal").classList.add("hidden");
});

document.getElementById("closeEditModal").addEventListener("click", () => {
  document.getElementById("editCommunityModal").classList.add("hidden");
});

document.getElementById("cancelEditBtn").addEventListener("click", () => {
  document.getElementById("editCommunityModal").classList.add("hidden");
});

document
  .getElementById("createCommunityForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("communityName").value;
    const description = document.getElementById("communityDescription").value;
    const rules = document.getElementById("communityRules").value;
    const accessMode = document.getElementById("accessMode").value;

    const result = await api("/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        rules,
        access_mode: accessMode,
      }),
    });

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    showToast("Community created!", "success");
    document.getElementById("createCommunityModal").classList.add("hidden");
    document.getElementById("createCommunityForm").reset();
    loadCommunities();
    loadMyCommunities();
  });

document
  .getElementById("editCommunityForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("editCommunityName").value;
    const description = document.getElementById(
      "editCommunityDescription"
    ).value;
    const rules = document.getElementById("editCommunityRules").value;

    const result = await api(`/communities/${currentCommunity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, rules }),
    });

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    const iconFile = document.getElementById("iconUpload").files[0];
    const bannerFile = document.getElementById("bannerUpload").files[0];

    if (iconFile) {
      const webpBlob = await convertImageToWebP(iconFile);
      const formData = new FormData();
      formData.append("file", webpBlob, "icon.webp");

      const uploadResult = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: formData,
      }).then((r) => r.json());

      if (uploadResult.hash) {
        await api(`/communities/${currentCommunity.id}/icon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: uploadResult.hash }),
        });
      }
    }

    if (bannerFile) {
      const webpBlob = await convertImageToWebP(bannerFile);
      const formData = new FormData();
      formData.append("file", webpBlob, "banner.webp");

      const uploadResult = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: formData,
      }).then((r) => r.json());

      if (uploadResult.hash) {
        await api(`/communities/${currentCommunity.id}/banner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ banner: uploadResult.hash }),
        });
      }
    }

    showToast("Community updated!", "success");
    document.getElementById("editCommunityModal").classList.add("hidden");
    document.getElementById("communityModal").classList.add("hidden");
    loadCommunities();
    loadMyCommunities();
  });

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    if (btn.closest(".tabs")) {
      document
        .querySelectorAll(".tabs .tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .getElementById("allTab")
        .classList.toggle("hidden", tab !== "all");
      document.getElementById("myTab").classList.toggle("hidden", tab !== "my");

      if (tab === "my") {
        loadMyCommunities();
      }
    } else if (btn.closest(".community-tabs")) {
      document
        .querySelectorAll(".community-tabs .tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .getElementById("aboutContent")
        .classList.toggle("hidden", tab !== "about");
      document
        .getElementById("membersContent")
        .classList.toggle("hidden", tab !== "members");
      document
        .getElementById("requestsContent")
        .classList.toggle("hidden", tab !== "requests");
      document
        .getElementById("settingsContent")
        .classList.toggle("hidden", tab !== "settings");

      if (tab === "about") showAboutTab();
      if (tab === "members") showMembersTab();
      if (tab === "requests") showRequestsTab();
      if (tab === "settings") showSettingsTab();
    }
  });
});

loadCommunities();
