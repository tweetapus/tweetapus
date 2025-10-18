import { convertImageToWebP } from "../../shared/image-utils.js";
import { showToast } from "../../shared/toasts.js";
import api from "./api.js";
import switchPage from "./pages.js";

let currentCommunity = null;
let currentMember = null;

export function initializeCommunitiesPage() {
  loadCommunities();

  document.querySelectorAll(".communities-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      document
        .querySelectorAll(".communities-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .getElementById("communitiesList")
        .classList.toggle("hidden", tab !== "all");
      document
        .getElementById("myCommunitiesList")
        .classList.toggle("hidden", tab !== "my");

      if (tab === "my") {
        loadMyCommunities();
      }
    });
  });

  const createBtn = document.getElementById("createCommunityBtn");
  if (createBtn && !createBtn.hasAttribute("data-listener")) {
    createBtn.setAttribute("data-listener", "true");
    createBtn.addEventListener("click", () => {
      document
        .getElementById("createCommunityModal")
        .classList.remove("hidden");
    });
  }

  const closeCreateModal = document.getElementById("closeCreateModal");
  if (closeCreateModal && !closeCreateModal.hasAttribute("data-listener")) {
    closeCreateModal.setAttribute("data-listener", "true");
    closeCreateModal.addEventListener("click", () => {
      document.getElementById("createCommunityModal").classList.add("hidden");
    });
  }

  const cancelCreateBtn = document.getElementById("cancelCreateBtn");
  if (cancelCreateBtn && !cancelCreateBtn.hasAttribute("data-listener")) {
    cancelCreateBtn.setAttribute("data-listener", "true");
    cancelCreateBtn.addEventListener("click", () => {
      document.getElementById("createCommunityModal").classList.add("hidden");
    });
  }

  const createForm = document.getElementById("createCommunityForm");
  if (createForm && !createForm.hasAttribute("data-listener")) {
    createForm.setAttribute("data-listener", "true");
    createForm.addEventListener("submit", handleCreateCommunity);
  }

  const closeEditModal = document.getElementById("closeEditModal");
  if (closeEditModal && !closeEditModal.hasAttribute("data-listener")) {
    closeEditModal.setAttribute("data-listener", "true");
    closeEditModal.addEventListener("click", () => {
      document.getElementById("editCommunityModal").classList.add("hidden");
    });
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if (cancelEditBtn && !cancelEditBtn.hasAttribute("data-listener")) {
    cancelEditBtn.setAttribute("data-listener", "true");
    cancelEditBtn.addEventListener("click", () => {
      document.getElementById("editCommunityModal").classList.add("hidden");
    });
  }

  const editForm = document.getElementById("editCommunityForm");
  if (editForm && !editForm.hasAttribute("data-listener")) {
    editForm.setAttribute("data-listener", "true");
    editForm.addEventListener("submit", handleEditCommunity);
  }
}

async function loadCommunities() {
  const { communities } = await api("/communities?limit=50");
  const list = document.getElementById("communitiesList");
  list.innerHTML = "";

  if (!communities || communities.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No communities yet. Create the first one!";
    list.appendChild(empty);
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
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "You haven't joined any communities yet.";
    list.appendChild(empty);
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

  const banner = document.createElement("div");
  banner.className = "community-banner";
  if (community.banner) {
    banner.style.backgroundImage = `url('/public/shared/assets/uploads/${community.banner}')`;
  }

  const content = document.createElement("div");
  content.className = "community-card-content";

  const icon = document.createElement("div");
  if (community.icon) {
    const img = document.createElement("img");
    img.src = `/public/shared/assets/uploads/${community.icon}`;
    img.alt = community.name;
    img.className = "community-icon";
    content.appendChild(img);
  } else {
    icon.className = "community-icon default";
    icon.textContent = community.name[0].toUpperCase();
    content.appendChild(icon);
  }

  const info = document.createElement("div");
  info.className = "community-info";

  const titleContainer = document.createElement("h3");
  titleContainer.textContent = community.name + " ";

  if (community.access_mode === "locked") {
    const lockIcon = document.createElement("span");
    lockIcon.innerHTML = "🔒";
    lockIcon.className = "lock-icon";
    titleContainer.appendChild(lockIcon);
  }

  const desc = document.createElement("p");
  desc.className = "community-description";
  desc.textContent = community.description || "No description";

  const meta = document.createElement("div");
  meta.className = "community-meta";

  const members = document.createElement("span");
  members.textContent = `${community.member_count || 0} members`;
  meta.appendChild(members);

  if (showRole && community.role) {
    const roleBadge = document.createElement("span");
    roleBadge.className = `role-badge ${community.role}`;
    roleBadge.textContent = community.role;
    meta.appendChild(roleBadge);
  }

  info.appendChild(titleContainer);
  info.appendChild(desc);
  info.appendChild(meta);

  content.appendChild(info);
  card.appendChild(banner);
  card.appendChild(content);

  card.addEventListener("click", () => {
    switchPage("community-detail", { path: `/communities/${community.id}` });
    loadCommunityDetail(community.id);
  });

  return card;
}

export async function loadCommunityDetail(communityId) {
  const data = await api(`/communities/${communityId}`);

  if (data.error) {
    showToast(data.error, "error");
    return;
  }

  currentCommunity = data.community;
  currentMember = data.member;

  document.getElementById("communityDetailTitle").textContent =
    currentCommunity.name;

  const banner = document.getElementById("communityDetailBanner");
  banner.innerHTML = "";

  if (currentCommunity.banner) {
    banner.style.backgroundImage = `url('/public/shared/assets/uploads/${currentCommunity.banner}')`;
    banner.style.height = "200px";
  } else {
    banner.style.background =
      "linear-gradient(135deg, var(--primary), #6366f1)";
    banner.style.height = "200px";
  }

  const canManage =
    currentMember &&
    (currentMember.role === "owner" || currentMember.role === "admin");
  const isOwner = currentMember && currentMember.role === "owner";

  const headerInfo = document.querySelector(".community-detail-header-info");
  headerInfo.innerHTML = "";

  const title = document.createElement("h1");
  title.id = "communityDetailTitle";
  title.textContent = currentCommunity.name;
  headerInfo.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "community-actions";

  if (!currentMember) {
    if (data.joinRequest) {
      const pendingBtn = document.createElement("button");
      pendingBtn.className = "profile-btn";
      pendingBtn.textContent = "Request Pending";
      pendingBtn.disabled = true;
      actions.appendChild(pendingBtn);
    } else {
      const joinBtn = document.createElement("button");
      joinBtn.className = "profile-btn profile-btn-primary";
      joinBtn.textContent = "Join Community";
      joinBtn.addEventListener("click", () => joinCommunity(communityId));
      actions.appendChild(joinBtn);
    }
  } else if (currentMember.role !== "owner") {
    const leaveBtn = document.createElement("button");
    leaveBtn.className = "profile-btn profile-btn-secondary";
    leaveBtn.textContent = "Leave Community";
    leaveBtn.addEventListener("click", () => leaveCommunity(communityId));
    actions.appendChild(leaveBtn);
  }

  if (canManage) {
    const editBtn = document.createElement("button");
    editBtn.className = "profile-btn";
    editBtn.textContent = "Edit Community";
    editBtn.addEventListener("click", openEditModal);
    actions.appendChild(editBtn);
  }

  if (isOwner) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "profile-btn profile-btn-secondary";
    deleteBtn.textContent = "Delete Community";
    deleteBtn.addEventListener("click", () => deleteCommunity(communityId));
    actions.appendChild(deleteBtn);
  }

  headerInfo.appendChild(actions);

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

  document.querySelectorAll(".community-detail-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      document
        .querySelectorAll(".community-detail-tab")
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
    });
  });

  showAboutTab();
}

function showAboutTab() {
  const content = document.getElementById("aboutContent");
  content.innerHTML = "";

  const descSection = document.createElement("div");
  descSection.className = "about-section";
  const descTitle = document.createElement("h3");
  descTitle.textContent = "Description";
  const descText = document.createElement("p");
  descText.textContent =
    currentCommunity.description || "No description provided.";
  descSection.appendChild(descTitle);
  descSection.appendChild(descText);

  const rulesSection = document.createElement("div");
  rulesSection.className = "about-section";
  const rulesTitle = document.createElement("h3");
  rulesTitle.textContent = "Rules";
  const rulesText = document.createElement("p");
  rulesText.textContent = currentCommunity.rules || "No rules specified.";
  rulesSection.appendChild(rulesTitle);
  rulesSection.appendChild(rulesText);

  const accessSection = document.createElement("div");
  accessSection.className = "about-section";
  const accessTitle = document.createElement("h3");
  accessTitle.textContent = "Access Mode";
  const accessText = document.createElement("p");
  accessText.textContent =
    currentCommunity.access_mode === "locked"
      ? "🔒 Locked - Requires approval to join"
      : "🔓 Open - Anyone can join";
  accessSection.appendChild(accessTitle);
  accessSection.appendChild(accessText);

  content.appendChild(descSection);
  content.appendChild(rulesSection);
  content.appendChild(accessSection);
}

async function showMembersTab() {
  const content = document.getElementById("membersContent");
  content.innerHTML = '<div class="loading">Loading members...</div>';

  const { members } = await api(
    `/communities/${currentCommunity.id}/members?limit=100`
  );

  content.innerHTML = "";

  if (!members || members.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No members yet.";
    content.appendChild(empty);
    return;
  }

  for (const member of members) {
    const memberEl = createMemberElement(member);
    content.appendChild(memberEl);
  }
}

function createMemberElement(member) {
  const div = document.createElement("div");
  div.className = "member-item";

  if (member.avatar) {
    const img = document.createElement("img");
    img.src = `/public/shared/assets/uploads/${member.avatar}`;
    img.alt = member.username;
    img.className = "member-avatar";
    div.appendChild(img);
  } else {
    const avatar = document.createElement("div");
    avatar.className = "member-avatar default";
    avatar.textContent = member.username[0].toUpperCase();
    div.appendChild(avatar);
  }

  const info = document.createElement("div");
  info.className = "member-info";

  const nameDiv = document.createElement("div");
  nameDiv.className = "member-name";

  const name = document.createElement("strong");
  name.textContent = member.name || member.username;
  nameDiv.appendChild(name);

  const roleBadge = document.createElement("span");
  roleBadge.className = `role-badge ${member.role}`;
  roleBadge.textContent = member.role;
  nameDiv.appendChild(roleBadge);

  const username = document.createElement("span");
  username.className = "member-username";
  username.textContent = `@${member.username}`;

  info.appendChild(nameDiv);
  info.appendChild(username);

  if (member.banned) {
    const bannedBadge = document.createElement("span");
    bannedBadge.className = "banned-badge";
    bannedBadge.textContent = "BANNED";
    info.appendChild(bannedBadge);
  }

  div.appendChild(info);

  const canManage =
    currentMember &&
    ["owner", "admin", "mod"].includes(currentMember.role) &&
    member.user_id !== currentMember.user_id;
  const canChangeRole =
    currentMember?.role === "owner" ||
    (currentMember?.role === "admin" && member.role === "member");

  if (canManage) {
    const actions = document.createElement("div");
    actions.className = "member-actions";

    if (canChangeRole && !member.banned) {
      const roleSelect = document.createElement("select");
      roleSelect.className = "role-select";

      const memberOpt = document.createElement("option");
      memberOpt.value = "member";
      memberOpt.textContent = "Member";
      memberOpt.selected = member.role === "member";
      roleSelect.appendChild(memberOpt);

      const modOpt = document.createElement("option");
      modOpt.value = "mod";
      modOpt.textContent = "Mod";
      modOpt.selected = member.role === "mod";
      roleSelect.appendChild(modOpt);

      if (currentMember.role === "owner") {
        const adminOpt = document.createElement("option");
        adminOpt.value = "admin";
        adminOpt.textContent = "Admin";
        adminOpt.selected = member.role === "admin";
        roleSelect.appendChild(adminOpt);
      }

      roleSelect.addEventListener("change", (e) =>
        changeUserRole(member.user_id, e.target.value)
      );
      actions.appendChild(roleSelect);
    }

    const banBtn = document.createElement("button");
    banBtn.className = member.banned
      ? "profile-btn"
      : "profile-btn profile-btn-secondary";
    banBtn.textContent = member.banned ? "Unban" : "Ban";
    banBtn.addEventListener("click", () => {
      if (member.banned) {
        unbanUser(member.user_id);
      } else {
        banUser(member.user_id);
      }
    });
    actions.appendChild(banBtn);

    div.appendChild(actions);
  }

  return div;
}

async function showRequestsTab() {
  const content = document.getElementById("requestsContent");
  content.innerHTML = '<div class="loading">Loading join requests...</div>';

  const { requests } = await api(
    `/communities/${currentCommunity.id}/join-requests?limit=100`
  );

  content.innerHTML = "";

  if (!requests || requests.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No pending join requests.";
    content.appendChild(empty);
    return;
  }

  for (const request of requests) {
    const requestEl = createRequestElement(request);
    content.appendChild(requestEl);
  }
}

function createRequestElement(request) {
  const div = document.createElement("div");
  div.className = "request-item";

  if (request.avatar) {
    const img = document.createElement("img");
    img.src = `/public/shared/assets/uploads/${request.avatar}`;
    img.alt = request.username;
    img.className = "request-avatar";
    div.appendChild(img);
  } else {
    const avatar = document.createElement("div");
    avatar.className = "request-avatar default";
    avatar.textContent = request.username[0].toUpperCase();
    div.appendChild(avatar);
  }

  const info = document.createElement("div");
  info.className = "request-info";

  const name = document.createElement("strong");
  name.textContent = request.name || request.username;

  const username = document.createElement("span");
  username.className = "request-username";
  username.textContent = `@${request.username}`;

  info.appendChild(name);
  info.appendChild(username);
  div.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "request-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "profile-btn profile-btn-primary";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", () => approveRequest(request.id));

  const rejectBtn = document.createElement("button");
  rejectBtn.className = "profile-btn profile-btn-secondary";
  rejectBtn.textContent = "Reject";
  rejectBtn.addEventListener("click", () => rejectRequest(request.id));

  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  div.appendChild(actions);

  return div;
}

function showSettingsTab() {
  const content = document.getElementById("settingsContent");
  content.innerHTML = "";

  const section = document.createElement("div");
  section.className = "settings-section";

  const title = document.createElement("h3");
  title.textContent = "Access Mode";

  const select = document.createElement("select");
  select.id = "accessModeSelect";
  select.className = "settings-select";

  const openOpt = document.createElement("option");
  openOpt.value = "open";
  openOpt.textContent = "Open - Anyone can join instantly";
  openOpt.selected = currentCommunity.access_mode === "open";

  const lockedOpt = document.createElement("option");
  lockedOpt.value = "locked";
  lockedOpt.textContent = "Locked - Requires approval to join";
  lockedOpt.selected = currentCommunity.access_mode === "locked";

  select.appendChild(openOpt);
  select.appendChild(lockedOpt);

  const saveBtn = document.createElement("button");
  saveBtn.className = "profile-btn profile-btn-primary";
  saveBtn.textContent = "Save Access Mode";
  saveBtn.addEventListener("click", saveAccessMode);

  section.appendChild(title);
  section.appendChild(select);
  section.appendChild(saveBtn);
  content.appendChild(section);
}

async function joinCommunity(communityId) {
  const result = await api(`/communities/${communityId}/join`, {
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

  loadCommunityDetail(communityId);
}

async function leaveCommunity(communityId) {
  if (!confirm("Are you sure you want to leave this community?")) return;

  const result = await api(`/communities/${communityId}/leave`, {
    method: "POST",
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Left community", "success");
  switchPage("communities", { path: "/communities" });
}

async function deleteCommunity(communityId) {
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

  const result = await api(`/communities/${communityId}`, { method: "DELETE" });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast("Community deleted", "success");
  switchPage("communities", { path: "/communities" });
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

async function handleCreateCommunity(e) {
  e.preventDefault();

  const name = document.getElementById("communityName").value;
  const description = document.getElementById("communityDescription").value;
  const rules = document.getElementById("communityRules").value;
  const accessMode = document.getElementById("accessMode").value;

  const result = await api("/communities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, rules, access_mode: accessMode }),
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
}

async function handleEditCommunity(e) {
  e.preventDefault();

  const name = document.getElementById("editCommunityName").value;
  const description = document.getElementById("editCommunityDescription").value;
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
      headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
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
      headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
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
  loadCommunityDetail(currentCommunity.id);
}
