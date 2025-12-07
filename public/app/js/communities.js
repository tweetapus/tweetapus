import {
	applyAvatarOutline,
	createVerificationBadge,
} from "../../shared/badge-utils.js";
import {
	convertToWebPAvatar,
	convertToWebPBanner,
} from "../../shared/image-utils.js";
import {
	createCommunitySkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import { updateTabIndicator } from "../../shared/tab-indicator.js";
import toastQueue from "../../shared/toasts.js";
import { createPopup } from "../../shared/ui-utils.js";
import api from "./api.js";
import switchPage, { updatePageTitle } from "./pages.js";

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

	if (obj.profile) {
		flags.push(
			obj.profile.suspended,
			obj.profile.is_suspended,
			obj.profile.suspended_at,
			obj.profile.status,
			obj.profile.deleted,
		);
	}

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

	const tabContainer = document.querySelector(".communities-tabs");
	if (tabContainer) {
		const activeTab = tabContainer.querySelector(".active");
		if (activeTab) {
			setTimeout(() => {
				updateTabIndicator(tabContainer, activeTab);
			}, 50);
		}
	}

	document.querySelectorAll(".communities-tab").forEach((btn) => {
		btn.addEventListener("click", () => {
			const tab = btn.dataset.tab;

			document.querySelectorAll(".communities-tab").forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");

			if (tabContainer) {
				updateTabIndicator(tabContainer, btn);
			}

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
	const list = document.getElementById("communitiesList");
	if (!list) return;

	const skeletons = showSkeletons(list, createCommunitySkeleton, 3);

	const { communities } = await api("/communities?limit=50");

	removeSkeletons(skeletons);
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
	const list = document.getElementById("myCommunitiesList");
	if (!list) return;

	const skeletons = showSkeletons(list, createCommunitySkeleton, 3);

	const { communities } = await api(`/users/${userId}/communities?limit=50`);

	removeSkeletons(skeletons);
	list.innerHTML = "";

	if (!communities || communities.length === 0) {
		const empty = document.createElement("div");
		empty.className = "empty-state";
		empty.innerHTML = `<img src="/public/shared/assets/img/cats/cupcake_cat.png" alt="Cupcake cat" draggable="false">You haven't joined any communities yet.`;
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
	titleContainer.textContent = community.name;

	if (community.access_mode === "locked") {
		const lockIcon = document.createElement("span");
		lockIcon.textContent = "🔒";
		lockIcon.className = "lock-icon";
		titleContainer.appendChild(lockIcon);
	}

	info.appendChild(titleContainer);

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

	info.appendChild(meta);
	content.appendChild(info);
	card.appendChild(content);

	card.addEventListener("click", () => {
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
	} catch (_) {}

	const data = await api(`/communities/${communityId}`);

	if (data.error) {
		showToast(data.error, "error");
		return;
	}

	currentCommunity = data.community;
	currentMember = data.member;

	updatePageTitle("community-detail", { title: currentCommunity.name });

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
				joinBtn.textContent = "Join";
				joinBtn.addEventListener("click", () => joinCommunity(communityId));
				actionsContainer.appendChild(joinBtn);
			}
		} else if (currentMember.role !== "owner") {
			const leaveBtn = document.createElement("button");
			leaveBtn.className = "profile-btn profile-btn-secondary";
			leaveBtn.textContent = "Leave";
			leaveBtn.addEventListener("click", () => leaveCommunity(communityId));
			actionsContainer.appendChild(leaveBtn);
		}

		if (canManage) {
			const actionItems = [];
			if (canManage) {
				actionItems.push({
					title: "Edit",
					onClick: () => openEditModal(),
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
				});
			}
			if (isOwner) {
				actionItems.push({
					title: "Delete Community",
					onClick: () => deleteCommunity(communityId),
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M15 6V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2"/></svg>`,
				});
			}
			if (actionItems.length > 0) {
				const menuBtn = document.createElement("button");
				menuBtn.type = "button";
				menuBtn.className = "profile-btn";
				menuBtn.setAttribute("aria-label", "Community actions");
				menuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
				menuBtn.style.minWidth = "auto";
				menuBtn.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					createPopup({
						triggerElement: menuBtn,
						items: actionItems,
					});
				});
				actionsContainer.appendChild(menuBtn);
			}
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
	const detailTabContainer = document.querySelector(".community-detail-tabs");

	const tabClickHandler = (btn) => () => {
		const tab = btn.dataset.tab;

		tabButtons.forEach((b) => {
			b.classList.remove("active");
		});
		btn.classList.add("active");

		if (detailTabContainer) {
			updateTabIndicator(detailTabContainer, btn);
		}

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

	tabButtons.forEach((b) => {
		b.classList.remove("active");
	});
	const aboutBtn = document.querySelector(
		'.community-detail-tab[data-tab="about"]',
	);
	if (aboutBtn) {
		aboutBtn.classList.add("active");
		if (detailTabContainer) {
			setTimeout(() => {
				updateTabIndicator(detailTabContainer, aboutBtn);
			}, 50);
		}
	}

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

		composer.classList.remove();
		composer.classList.add("compose-tweet");
		tweetsWrapper.appendChild(composer);
	}

	const container = document.querySelector(".community-detail-content");
	if (container)
		container.classList.toggle("tweets-no-composer", !currentMember);

	content.appendChild(tweetsWrapper);

	const { createTweetSkeleton, removeSkeletons, showSkeletons } = await import(
		"../../shared/skeleton-utils.js"
	);

	const skeletons = showSkeletons(tweetsWrapper, createTweetSkeleton, 3);

	try {
		const { tweets } = await api(
			`/communities/${currentCommunity.id}/tweets?limit=50`,
		);

		removeSkeletons(skeletons);

		if (!tweets || tweets.length === 0) {
			const emptyMsg = document.createElement("p");
			emptyMsg.className = "empty-state";
			emptyMsg.innerHTML = `<img src="/public/shared/assets/img/cats/pit_cat_400.png" draggable="false">No tweets in this community yet.`;
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
	} catch (error) {
		removeSkeletons(skeletons);
		console.error("Error loading community tweets:", error);
		const emptyMsg = document.createElement("p");
		emptyMsg.className = "empty-state";
		emptyMsg.textContent = "Failed to load tweets.";
		tweetsWrapper.appendChild(emptyMsg);
	}
}

async function showMembersTab() {
	const content = document.getElementById("membersContent");
	if (!content) return;

	const { createFollowerSkeleton, removeSkeletons, showSkeletons } =
		await import("../../shared/skeleton-utils.js");

	content.innerHTML = "";
	const skeletons = showSkeletons(content, createFollowerSkeleton, 5);

	try {
		const { members } = await api(
			`/communities/${currentCommunity.id}/members?limit=100`,
		);

		removeSkeletons(skeletons);

		const visibleMembers = (members || []).filter((m) => {
			if (!m) return false;

			if (isSuspendedEntity(m)) return false;

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
	} catch (error) {
		removeSkeletons(skeletons);
		console.error("Error loading members:", error);
		content.innerHTML = "";
		const empty = document.createElement("div");
		empty.className = "empty-state";
		empty.textContent = "Failed to load members.";
		content.appendChild(empty);
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
		const memberRadiusValue =
			member.avatar_radius !== null && member.avatar_radius !== undefined
				? `${member.avatar_radius}px`
				: member.gold || member.gray
					? "4px"
					: "50%";

		img.style.borderRadius = memberRadiusValue;

		if (member.gray) {
			applyAvatarOutline(
				img,
				member.avatar_outline || "",
				memberRadiusValue || "4px",
				2,
			);
		} else {
			applyAvatarOutline(img, "", memberRadiusValue, 2);
		}
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

	if (member.gold) {
		const goldBadge = document.createElement("span");
		goldBadge.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="#D4AF37"/><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		nameDiv.appendChild(goldBadge);
	} else if (member.gray) {
		const grayBadge = createVerificationBadge({
			type: "gray",
			checkmarkOutline: member.checkmark_outline || "",
			size: 16,
		});
		nameDiv.appendChild(grayBadge);
	} else if (member.verified) {
		const verifiedBadge = document.createElement("span");
		verifiedBadge.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="var(--primary)"/><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		nameDiv.appendChild(verifiedBadge);
	}

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

	const { createFollowerSkeleton, removeSkeletons, showSkeletons } =
		await import("../../shared/skeleton-utils.js");

	content.innerHTML = "";
	const skeletons = showSkeletons(content, createFollowerSkeleton, 3);

	try {
		const { requests } = await api(
			`/communities/${currentCommunity.id}/join-requests?limit=100`,
		);

		removeSkeletons(skeletons);

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
	} catch (error) {
		removeSkeletons(skeletons);
		console.error("Error loading join requests:", error);
		content.innerHTML = "";
		const empty = document.createElement("div");
		empty.className = "empty-state";
		empty.textContent = "Failed to load join requests.";
		content.appendChild(empty);
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

	// Community Tag Section
	const tagSection = document.createElement("div");
	tagSection.className = "settings-section";
	tagSection.style.marginTop = "24px";

	const tagTitle = document.createElement("h3");
	tagTitle.textContent = "Community Tag";

	const tagDesc = document.createElement("p");
	tagDesc.style.color = "var(--text-secondary)";
	tagDesc.style.fontSize = "14px";
	tagDesc.style.marginBottom = "16px";
	tagDesc.textContent =
		"Enable a community tag that members can display next to their name";

	const tagEnabledDiv = document.createElement("div");
	tagEnabledDiv.style.marginBottom = "16px";

	const tagEnabledLabel = document.createElement("label");
	tagEnabledLabel.style.display = "flex";
	tagEnabledLabel.style.alignItems = "center";
	tagEnabledLabel.style.gap = "8px";
	tagEnabledLabel.style.cursor = "pointer";

	const tagEnabledCheckbox = document.createElement("input");
	tagEnabledCheckbox.type = "checkbox";
	tagEnabledCheckbox.id = "tagEnabledCheckbox";
	tagEnabledCheckbox.checked = currentCommunity.tag_enabled || false;

	const tagEnabledText = document.createElement("span");
	tagEnabledText.textContent = "Enable Community Tag";

	tagEnabledLabel.appendChild(tagEnabledCheckbox);
	tagEnabledLabel.appendChild(tagEnabledText);
	tagEnabledDiv.appendChild(tagEnabledLabel);

	const tagInputsDiv = document.createElement("div");
	tagInputsDiv.style.display = "flex";
	tagInputsDiv.style.flexDirection = "column";
	tagInputsDiv.style.gap = "12px";
	tagInputsDiv.style.marginBottom = "16px";

	const emojiInputDiv = document.createElement("div");
	const emojiLabel = document.createElement("label");
	emojiLabel.textContent = "Emoji";
	emojiLabel.style.display = "block";
	emojiLabel.style.marginBottom = "4px";
	emojiLabel.style.fontSize = "14px";
	const emojiInput = document.createElement("input");
	emojiInput.type = "text";
	emojiInput.id = "tagEmojiInput";
	emojiInput.placeholder = "🎉";
	emojiInput.value = currentCommunity.tag_emoji || "";
	emojiInput.style.width = "100%";
	emojiInput.style.padding = "8px 12px";
	emojiInput.style.border = "1px solid var(--border-primary)";
	emojiInput.style.borderRadius = "8px";
	emojiInput.style.backgroundColor = "var(--bg-primary)";
	emojiInput.style.color = "var(--text-primary)";
	emojiInputDiv.appendChild(emojiLabel);
	emojiInputDiv.appendChild(emojiInput);

	const textInputDiv = document.createElement("div");
	const textLabel = document.createElement("label");
	textLabel.textContent = "Text (max 4 characters)";
	textLabel.style.display = "block";
	textLabel.style.marginBottom = "4px";
	textLabel.style.fontSize = "14px";
	const textInput = document.createElement("input");
	textInput.type = "text";
	textInput.id = "tagTextInput";
	textInput.placeholder = "COOL";
	textInput.maxLength = 4;
	textInput.value = currentCommunity.tag_text || "";
	textInput.style.width = "100%";
	textInput.style.padding = "8px 12px";
	textInput.style.border = "1px solid var(--border-primary)";
	textInput.style.borderRadius = "8px";
	textInput.style.backgroundColor = "var(--bg-primary)";
	textInput.style.color = "var(--text-primary)";
	textInputDiv.appendChild(textLabel);
	textInputDiv.appendChild(textInput);

	tagInputsDiv.appendChild(emojiInputDiv);
	tagInputsDiv.appendChild(textInputDiv);

	const tagSaveBtn = document.createElement("button");
	tagSaveBtn.className = "profile-btn profile-btn-primary";
	tagSaveBtn.textContent = "Save Community Tag";
	tagSaveBtn.addEventListener("click", saveCommunityTag);

	tagSection.appendChild(tagTitle);
	tagSection.appendChild(tagDesc);
	tagSection.appendChild(tagEnabledDiv);
	tagSection.appendChild(tagInputsDiv);
	tagSection.appendChild(tagSaveBtn);
	content.appendChild(tagSection);
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
		showToast("Join request sent", "success");
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

async function saveCommunityTag() {
	const tagEnabled = document.getElementById("tagEnabledCheckbox").checked;
	const tagEmoji = document.getElementById("tagEmojiInput").value.trim();
	const tagText = document.getElementById("tagTextInput").value.trim();

	if (tagEnabled && (!tagEmoji || !tagText)) {
		showToast("Please provide both emoji and text for the tag", "error");
		return;
	}

	const result = await api(`/communities/${currentCommunity.id}/tag`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			tag_enabled: tagEnabled,
			tag_emoji: tagEmoji || null,
			tag_text: tagText || null,
		}),
	});

	if (result.error) {
		showToast(result.error, "error");
		return;
	}

	currentCommunity.tag_enabled = tagEnabled;
	currentCommunity.tag_emoji = tagEmoji;
	currentCommunity.tag_text = tagText;
	showToast("Community tag updated", "success");
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

	const { default: openImageCropper, CROP_CANCELLED } = await import(
		"../../shared/image-cropper.js"
	);

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
			const cropRes = await openImageCropper(iconFile, {
				aspect: 1,
				size: 250,
			});
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
			const cropRes = await openImageCropper(bannerFile, {
				aspect: 3,
				size: 1500,
			});
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
			const webpFile = await convertToWebPBanner(
				bannerToProcess,
				1500,
				500,
				0.8,
			);
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
