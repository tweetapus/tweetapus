import openImageCropper, {
	CROP_CANCELLED,
} from "../../shared/image-cropper.js";
import {
	convertToWebPAvatar,
	convertToWebPBanner,
} from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import api from "./api.js";
import switchPage from "./pages.js";

const showToast = (message, type = "info") => {
	const typeMap = {
		success: "<h1>Success!</h1>",
		error: "<h1>Error</h1>",
		info: "<h1>Info</h1>",
	};
	toastQueue.add(`${typeMap[type] || typeMap.info}<p>${message}</p>`);
};

function formatRoleLabel(role) {
	if (!role || typeof role !== "string") return role || "";
	const trimmed = role.trim().toLowerCase();
	if (trimmed.includes(" ")) {
		return trimmed
			.split(/\s+/)
			.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
			.join(" ");
	}
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
// Returns true if the given object (member/user/profile) shows signs of a
// suspended or disabled account. Handles multiple common field names and
// nested shapes returned by different API variants.
function isSuspendedEntity(obj) {
	if (!obj) return false;

	// Quick checks for common boolean/timestamp/string markers
	const flags = [
		obj.suspended,
		obj.is_suspended,
		obj.suspended_at,
		obj.suspended_by,
		obj.status,
		obj.state,
		obj.deleted,
		obj.disabled,
		obj.banned,
	];

	// nested profile (some APIs attach a profile object)
	if (obj.profile) {
		flags.push(
			obj.profile.suspended,
			obj.profile.is_suspended,
			obj.profile.suspended_at,
			obj.profile.status,
			obj.profile.deleted,
		);
	}

	// nested user/account shapes
	if (obj.user) {
		flags.push(
			obj.user.suspended,
			obj.user.is_suspended,
			obj.user.suspended_at,
			obj.user.status,
			obj.user.deleted,
			obj.user.disabled,
		);
		if (obj.user.profile) {
			flags.push(obj.user.profile.suspended, obj.user.profile.status);
		}
	}

	if (obj.account) {
		flags.push(
			obj.account.suspended,
			obj.account.is_suspended,
			obj.account.status,
		);
	}

	// Some APIs return status/state as strings like 'suspended'. Check those too.
	if (
		typeof obj.status === "string" &&
		obj.status.toLowerCase().includes("suspend")
	)
		return true;
	if (
		typeof obj.state === "string" &&
		obj.state.toLowerCase().includes("suspend")
	)
		return true;

	return flags.some((v) => Boolean(v));
}

	let currentCommunity = null;
let currentMember = null;
let initialized = false;

export function initializeCommunitiesPage() {
	if (initialized) {
		loadCommunities();
		return;
	}

	initialized = true;
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

	setupModalListeners();
	}

function setupModalListeners() {
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
	if (!list) return;

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
		atob(localStorage.getItem("authToken").split(".")[1]),
	).userId;
	const { communities } = await api(`/users/${userId}/communities?limit=50`);
	const list = document.getElementById("myCommunitiesList");
	if (!list) return;

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
		banner.style.backgroundImage = `url('/api/uploads/${community.banner}.webp')`;
	}

	const content = document.createElement("div");
	content.className = "community-card-content";

	if (community.icon) {
		const img = document.createElement("img");
		img.src = `/api/uploads/${community.icon}.webp`;
		img.alt = community.name;
		img.className = "community-icon";
		content.appendChild(img);
	} else {
		const icon = document.createElement("div");
		icon.className = "community-icon default";
		icon.textContent = community.name[0].toUpperCase();
		content.appendChild(icon);
	}

	const info = document.createElement("div");
	info.className = "community-info";

	const titleContainer = document.createElement("h3");
	titleContainer.textContent = `${community.name} `;

	if (community.access_mode === "locked") {
		const lockIcon = document.createElement("span");
		lockIcon.textContent = "🔒";
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
		roleBadge.textContent = formatRoleLabel(community.role);
		meta.appendChild(roleBadge);
	}

	info.appendChild(titleContainer);
	info.appendChild(desc);
	info.appendChild(meta);

	content.appendChild(info);
	card.appendChild(banner);
	card.appendChild(content);

	card.addEventListener("click", () => {
		// Let loadCommunityDetail handle showing the page and history state
		loadCommunityDetail(community.id);
	});

	return card;
}

export async function loadCommunityDetail(communityId) {
	// Ensure the page is visible (so scrolling/layout/active state are correct)
	try {
		const communityPageEl = document.querySelector(".community-detail-page");
		const isVisible = communityPageEl?.classList.contains("page-active");
		if (!isVisible) {
			switchPage("community-detail", { path: `/communities/${communityId}` });
		}
	} catch (_) {
		// swallow if switchPage isn't available in this environment yet
	}

	const data = await api(`/communities/${communityId}`);

	if (data.error) {
		showToast(data.error, "error");
		return;
	}

	currentCommunity = data.community;
	currentMember = data.member;

	const titleEl = document.getElementById("communityDetailTitle");
	if (titleEl) {
		titleEl.textContent = currentCommunity.name;
	}

	const banner = document.getElementById("communityDetailBanner");
	if (banner) {
		banner.innerHTML = "";

		if (currentCommunity.banner) {
			banner.style.backgroundImage = `url('/api/uploads/${currentCommunity.banner}.webp')`;
			banner.style.height = "200px";
		} else {
			// Use a neutral solid background instead of an inline gradient
			banner.style.backgroundImage = "none";
			banner.style.backgroundColor = "var(--bg-secondary)";
			banner.style.height = "200px";
		}
	}

	const canManage =
		currentMember &&
		(currentMember.role === "owner" || currentMember.role === "admin");
	const isOwner = currentMember && currentMember.role === "owner";

	const headerInfo = document.querySelector(".community-detail-header-info");
	if (headerInfo) {
		let actionsContainer = headerInfo.querySelector(".community-actions");
		if (!actionsContainer) {
			actionsContainer = document.createElement("div");
			actionsContainer.className = "community-actions";
			headerInfo.appendChild(actionsContainer);
		}
		actionsContainer.innerHTML = "";

		if (!currentMember) {
			if (data.joinRequest) {
				const pendingBtn = document.createElement("button");
				pendingBtn.className = "profile-btn";
				pendingBtn.textContent = "Request Pending";
				pendingBtn.disabled = true;
				actionsContainer.appendChild(pendingBtn);
			} else {
				const joinBtn = document.createElement("button");
				joinBtn.className = "profile-btn profile-btn-primary";
				joinBtn.textContent = "Join Community";
				joinBtn.addEventListener("click", () => joinCommunity(communityId));
				actionsContainer.appendChild(joinBtn);
			}
		} else if (currentMember.role !== "owner") {
			const leaveBtn = document.createElement("button");
			leaveBtn.className = "profile-btn profile-btn-secondary";
			leaveBtn.textContent = "Leave Community";
			leaveBtn.addEventListener("click", () => leaveCommunity(communityId));
			actionsContainer.appendChild(leaveBtn);
		}

		if (canManage) {
			const editBtn = document.createElement("button");
			editBtn.className = "profile-btn";
			editBtn.textContent = "Edit Community";
			editBtn.addEventListener("click", openEditModal);
			actionsContainer.appendChild(editBtn);
		}

		if (isOwner) {
			const deleteBtn = document.createElement("button");
			deleteBtn.className = "profile-btn profile-btn-secondary";
			deleteBtn.textContent = "Delete Community";
			deleteBtn.addEventListener("click", () => deleteCommunity(communityId));
			actionsContainer.appendChild(deleteBtn);
		}
	}

	const requestsTab = document.getElementById("requestsTab");
	if (requestsTab) {
		requestsTab.classList.toggle(
			"hidden",
			!(
				currentMember &&
				(currentMember.role === "owner" || currentMember.role === "admin")
			),
		);
	}

	const settingsTab = document.getElementById("settingsTab");
	if (settingsTab) {
		settingsTab.classList.toggle("hidden", !isOwner);
	}

	document.querySelectorAll(".community-detail-tab").forEach((btn) => {
		btn.classList.remove("active");
	});

	const tabButtons = document.querySelectorAll(".community-detail-tab");
	const tabClickHandler = (btn) => () => {
		const tab = btn.dataset.tab;

		tabButtons.forEach((b) => b.classList.remove("active"));
		btn.classList.add("active");

		document
			.getElementById("aboutContent")
			.classList.toggle("hidden", tab !== "about");
		document
			.getElementById("tweetsContent")
			.classList.toggle("hidden", tab !== "tweets");
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
		else if (tab === "tweets") showTweetsTab();
		else if (tab === "members") showMembersTab();
		else if (tab === "requests") showRequestsTab();
		else if (tab === "settings") showSettingsTab();

		// Add/remove a container-level class so Tweets-specific styles can be targeted
		const container = document.querySelector(".community-detail-content");
		if (container) {
			container.classList.toggle("tab-tweets-active", tab === "tweets");
		}
	};

	tabButtons.forEach((btn) => {
		btn.removeEventListener("click", btn._handler);
		btn._handler = tabClickHandler(btn);
		btn.addEventListener("click", btn._handler);
	});

	// Reset tab UI to a known default (About) to avoid stale state when
	// switching between communities without a full page refresh.
	tabButtons.forEach((b) => b.classList.remove("active"));
	const aboutBtn = document.querySelector(
		'.community-detail-tab[data-tab="about"]',
	);
	if (aboutBtn) aboutBtn.classList.add("active");

	// Ensure content panes reflect the same default state (show About,
	// hide others) and clear tweet content to avoid showing the previous
	// community's tweets while the new one loads.
	const aboutContentEl = document.getElementById("aboutContent");
	const tweetsContentEl = document.getElementById("tweetsContent");
	const membersContentEl = document.getElementById("membersContent");
	const requestsContentEl = document.getElementById("requestsContent");
	const settingsContentEl = document.getElementById("settingsContent");

	if (aboutContentEl) aboutContentEl.classList.remove("hidden");
	if (tweetsContentEl) {
		tweetsContentEl.classList.add("hidden");
		tweetsContentEl.innerHTML = "";
	}
	if (membersContentEl) membersContentEl.classList.add("hidden");
	if (requestsContentEl) requestsContentEl.classList.add("hidden");
	if (settingsContentEl) settingsContentEl.classList.add("hidden");

	showAboutTab();
}
// Use root scrolling — ensure user is at top of community view after navigation
setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);

function showAboutTab() {
	const content = document.getElementById("aboutContent");
	if (!content) return;

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

async function showTweetsTab() {
	const content = document.getElementById("tweetsContent");
	if (!content) return;

	content.innerHTML = "";

	const tweetsWrapper = document.createElement("div");
	tweetsWrapper.style.cssText =
		"display: flex; flex-direction: column; gap: 16px;";

	if (currentMember) {
		const { createComposer } = await import("./composer.js");

		const composer = await createComposer({
			placeholder: `Share something with ${currentCommunity.name}...`,
			callback: async (_newTweet) => {
				showToast("Tweet posted to community!", "success");
				showTweetsTab();
			},
			communityId: currentCommunity.id,
		});

		// rely on stylesheet for spacing and borders to avoid inline-style inconsistencies
		composer.classList.remove();
		composer.classList.add("compose-tweet");
		tweetsWrapper.appendChild(composer);
	}

	// Add a class on the container when there is no composer so CSS can style spacing
	const container = document.querySelector(".community-detail-content");
	if (container)
		container.classList.toggle("tweets-no-composer", !currentMember);

	const loadingDiv = document.createElement("div");
	loadingDiv.className = "loading";
	loadingDiv.textContent = "Loading tweets...";
	tweetsWrapper.appendChild(loadingDiv);

	content.appendChild(tweetsWrapper);

	const { tweets } = await api(
		`/communities/${currentCommunity.id}/tweets?limit=50`,
	);

	tweetsWrapper.removeChild(loadingDiv);

	if (!tweets || tweets.length === 0) {
		const emptyMsg = document.createElement("p");
		emptyMsg.className = "empty-state";
		emptyMsg.textContent = "No tweets in this community yet.";
		tweetsWrapper.appendChild(emptyMsg);
		return;
	}

	const tweetsContainer = document.createElement("div");
	tweetsContainer.className = "community-tweets";
	tweetsContainer.style.cssText =
		"display: flex; flex-direction: column; gap: 16px;";

	const { createTweetElement } = await import("./tweets.js");

	for (const tweet of tweets) {
		const tweetEl = createTweetElement(tweet, {
			clickToOpen: true,
			showTopReply: false,
			isTopReply: false,
			size: "normal",
		});
		tweetsContainer.appendChild(tweetEl);
	}

	tweetsWrapper.appendChild(tweetsContainer);
}

async function showMembersTab() {
	const content = document.getElementById("membersContent");
	if (!content) return;

	content.innerHTML = '<div class="loading">Loading members...</div>';

	const { members } = await api(
		`/communities/${currentCommunity.id}/members?limit=100`,
	);

	// Filter out suspended accounts on the client-side. Prefer server-side
	// filtering, but handle common suspension markers returned by the API.
	// Use a helper that checks multiple common shapes/fields to be robust
	// across API variants.
	const visibleMembers = (members || []).filter((m) => {
		if (!m) return false;

		// If the returned element is itself a user-like object, respect that
		if (isSuspendedEntity(m)) return false;

		// If member wraps a user/profile/account object, check those too
		if (m.user && isSuspendedEntity(m.user)) return false;
		if (m.profile && isSuspendedEntity(m.profile)) return false;
		if (m.account && isSuspendedEntity(m.account)) return false;
		if (m.member && isSuspendedEntity(m.member)) return false;

		return true;
	});

	content.innerHTML = "";

	if (!visibleMembers || visibleMembers.length === 0) {
		const empty = document.createElement("div");
		empty.className = "empty-state";
		empty.textContent = "No visible members.";
		content.appendChild(empty);
		return;
	}

	for (const member of visibleMembers) {
		const memberEl = createMemberElement(member);
		content.appendChild(memberEl);
	}
}

function createMemberElement(member) {
	const div = document.createElement("div");
	div.className = "member-item";

	if (member.avatar) {
		const img = document.createElement("img");
		img.src = member.avatar;
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
	roleBadge.textContent = formatRoleLabel(member.role);
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

			roleSelect.addEventListener("change", (e) => {
				e.stopPropagation();
				changeUserRole(member.user_id, e.target.value);
			});
			actions.appendChild(roleSelect);
		}

		const banBtn = document.createElement("button");
		banBtn.className = member.banned
			? "profile-btn"
			: "profile-btn profile-btn-secondary";
		banBtn.textContent = member.banned ? "Unban" : "Ban";
		banBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (member.banned) {
				unbanUser(member.user_id);
			} else {
				banUser(member.user_id);
			}
		});
		actions.appendChild(banBtn);

		div.appendChild(actions);
	}

	div.addEventListener("click", async () => {
		const rawUsername = (member.username || "").replace(/^@/, "");

		const { openProfile } = await import("./profile.js");
		openProfile(rawUsername);
	});

	return div;
}

async function showRequestsTab() {
	const content = document.getElementById("requestsContent");
	if (!content) return;

	content.innerHTML = '<div class="loading">Loading join requests...</div>';

	const { requests } = await api(
		`/communities/${currentCommunity.id}/join-requests?limit=100`,
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
		img.src = request.avatar;
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
	if (!content) return;

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
			"Are you sure you want to delete this community? This action cannot be undone.",
		)
	)
		return;
	if (
		!confirm(
			"This will permanently delete the community and all its data. Are you absolutely sure?",
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
		},
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
		{ method: "POST" },
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
		},
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
		{ method: "POST" },
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
		{ method: "POST" },
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
		iconPreview.innerHTML = `<img src="/api/uploads/${currentCommunity.icon}.webp" alt="Current icon" />`;
	} else {
		iconPreview.innerHTML = "";
	}

	if (currentCommunity.banner) {
		bannerPreview.innerHTML = `<img src="/api/uploads/${currentCommunity.banner}.webp" alt="Current banner" />`;
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
		let iconToProcess = iconFile;
		try {
			const cropRes = await openImageCropper(iconFile, { aspect: 1, size: 250 });
			if (cropRes === CROP_CANCELLED) {
				iconToProcess = null;
			} else {
				iconToProcess = cropRes || iconFile;
			}
		} catch (err) {
			console.warn("Icon cropper failed, using original file", err);
			iconToProcess = iconFile;
		}

		if (iconToProcess) {
			const webpFile = await convertToWebPAvatar(iconToProcess, 250, 0.8);
			const formData = new FormData();
			formData.append("file", webpFile, "icon.webp");

			const uploadResult = await fetch("/api/upload", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("authToken")}`,
				},
				body: formData,
			}).then((r) => r.json());

			if (uploadResult.file?.hash) {
				await api(`/communities/${currentCommunity.id}/icon`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ icon: uploadResult.file.hash }),
				});
			}
		}
	}

	if (bannerFile) {
		let bannerToProcess = bannerFile;
		try {
			const cropRes = await openImageCropper(bannerFile, { aspect: 3, size: 1500 });
			if (cropRes === CROP_CANCELLED) {
				bannerToProcess = null;
			} else {
				bannerToProcess = cropRes || bannerFile;
			}
		} catch (err) {
			console.warn("Banner cropper failed, using original file", err);
			bannerToProcess = bannerFile;
		}

		if (bannerToProcess) {
			const webpFile = await convertToWebPBanner(bannerToProcess, 1500, 500, 0.8);
			const formData = new FormData();
			formData.append("file", webpFile, "banner.webp");

			const uploadResult = await fetch("/api/upload", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("authToken")}`,
				},
				body: formData,
			}).then((r) => r.json());

			if (uploadResult.file?.hash) {
				await api(`/communities/${currentCommunity.id}/banner`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ banner: uploadResult.file.hash }),
				});
			}
		}
	}

	showToast("Community updated!", "success");
	document.getElementById("editCommunityModal").classList.add("hidden");
	loadCommunityDetail(currentCommunity.id);
}