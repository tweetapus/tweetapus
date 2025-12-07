import {
	createListSkeleton,
	createTweetSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import { updateTabIndicator } from "../../shared/tab-indicator.js";
import toastQueue from "../../shared/toasts.js";
import { createConfirmModal, createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import switchPage from "./pages.js";
import { createTweetElement } from "./tweets.js";

let currentTweets = [];
let currentMembers = [];
let isLoadingTweets = false;

const escapeHTML = (str) =>
	str ? str.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

export async function openUserListsPage(username) {
	switchPage("user-lists", {
		path: `/${username}/lists`,
		title: username,
		recoverState: () => loadUserLists(username),
	});
}

async function loadUserLists(username) {
	const container = document.getElementById("userListsContainer");
	const titleEl = document.getElementById("userListsTitle");

	if (!container) return;

	titleEl.textContent = `@${username}'s Lists`;
	container.innerHTML = "";

	const skeletons = showSkeletons(container, createListSkeleton, 3);

	try {
		const data = await query(`/lists/user/${username}`);

		removeSkeletons(skeletons);

		if (data.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "lists-empty";
			errorDiv.textContent = data.error;
			container.appendChild(errorDiv);
			return;
		}

		if (!data.lists || data.lists.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "lists-empty";
			const emptyIcon = document.createElement("div");
			emptyIcon.className = "lists-empty-icon";
			emptyIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></svg>`;
			emptyDiv.appendChild(emptyIcon);
			const emptyTitle = document.createElement("h3");
			emptyTitle.textContent = "No public lists";
			emptyDiv.appendChild(emptyTitle);
			const emptyText = document.createElement("p");
			emptyText.textContent = `@${username} hasn't created any public lists.`;
			emptyDiv.appendChild(emptyText);
			container.appendChild(emptyDiv);
			return;
		}

		for (const list of data.lists) {
			container.appendChild(createListItem(list, true));
		}
	} catch (err) {
		removeSkeletons(skeletons);
		console.error("Error loading user lists:", err);
		toastQueue.add(`<h1>Failed to load lists</h1>`);
	}
}

function createListItem(list, showOwner = false) {
	const item = document.createElement("div");
	item.className = "list-item";

	const icon = document.createElement("div");
	icon.className = "list-item-icon";
	icon.innerHTML = list.is_private
		? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
		: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></svg>`;
	item.appendChild(icon);

	const info = document.createElement("div");
	info.className = "list-item-info";

	const nameRow = document.createElement("div");
	nameRow.className = "list-item-name-row";

	const name = document.createElement("span");
	name.className = "list-item-name";
	name.textContent = list.name;
	nameRow.appendChild(name);

	if (list.is_private) {
		const privateBadge = document.createElement("span");
		privateBadge.className = "list-private-badge";
		privateBadge.textContent = "Private";
		nameRow.appendChild(privateBadge);
	}

	info.appendChild(nameRow);

	if (showOwner && list.owner_username) {
		const owner = document.createElement("span");
		owner.className = "list-item-owner";
		owner.textContent = `@${list.owner_username}`;
		info.appendChild(owner);
	}

	const meta = document.createElement("span");
	meta.className = "list-item-meta";
	meta.textContent = `${list.member_count || 0} members`;
	info.appendChild(meta);

	item.appendChild(info);

	item.addEventListener("click", () => {
		openListDetail(list.id);
	});

	return item;
}

export async function openListDetail(listId) {
	switchPage("list-detail", {
		path: `/lists/${listId}`,
		title: "List",
		recoverState: () => loadListDetail(listId),
	});
}

async function loadListDetail(listId) {
	const titleEl = document.getElementById("listDetailTitle");
	const ownerEl = document.getElementById("listDetailOwner");
	const infoEl = document.getElementById("listDetailInfo");
	const tweetsContainer = document.getElementById("listTweetsContent");
	const membersContainer = document.getElementById("listMembersContent");

	titleEl.textContent = "Loading...";
	ownerEl.textContent = "";
	infoEl.innerHTML = "";
	tweetsContainer.innerHTML = "";
	membersContainer.innerHTML = "";

	currentList = null;
	currentTweets = [];
	currentMembers = [];
	hasMoreTweets = true;

	try {
		const data = await query(`/lists/${listId}`);

		if (data.error) {
			titleEl.textContent = "List not found";
			ownerEl.textContent = data.error;
			return;
		}

		currentList = data.list;
		currentMembers = data.members || [];

		titleEl.textContent = data.list.name;
		ownerEl.textContent = `@${data.list.owner?.username || "unknown"}`;

		const actionsRow = document.createElement("div");
		actionsRow.className = "list-detail-actions";

		if (data.list.description) {
			const desc = document.createElement("p");
			desc.className = "list-detail-description";
			desc.textContent = data.list.description;
			infoEl.appendChild(desc);
		}

		const statsRow = document.createElement("div");
		statsRow.className = "list-detail-stats";

		const membersSpan = document.createElement("span");
		const membersStrong = document.createElement("strong");
		membersStrong.textContent = data.list.member_count || 0;
		membersSpan.appendChild(membersStrong);
		membersSpan.appendChild(document.createTextNode(" Members"));
		statsRow.appendChild(membersSpan);

		const followersSpan = document.createElement("span");
		const followersStrong = document.createElement("strong");
		followersStrong.textContent = data.list.follower_count || 0;
		followersSpan.appendChild(followersStrong);
		followersSpan.appendChild(document.createTextNode(" Followers"));
		statsRow.appendChild(followersSpan);

		infoEl.appendChild(statsRow);

		if (data.isOwner) {
			const editBtn = document.createElement("button");
			editBtn.className = "list-action-btn";
			editBtn.textContent = "Edit";
			editBtn.addEventListener("click", () => openEditListModal(data.list));
			actionsRow.appendChild(editBtn);

			const addMemberBtn = document.createElement("button");
			addMemberBtn.className = "list-action-btn list-action-btn-primary";
			addMemberBtn.textContent = "Add members";
			addMemberBtn.addEventListener("click", () => openAddMemberModal(listId));
			actionsRow.appendChild(addMemberBtn);
		} else {
			const followBtn = document.createElement("button");
			followBtn.className = `list-action-btn ${data.isFollowing ? "" : "list-action-btn-primary"}`;
			followBtn.textContent = data.isFollowing ? "Following" : "Follow";
			followBtn.addEventListener("click", async () => {
				if (data.isFollowing) {
					const result = await query(`/lists/${listId}/follow`, {
						method: "DELETE",
					});
					if (result.success) {
						followBtn.textContent = "Follow";
						followBtn.classList.add("list-action-btn-primary");
						data.isFollowing = false;
					}
				} else {
					const result = await query(`/lists/${listId}/follow`, {
						method: "POST",
					});
					if (result.success) {
						followBtn.textContent = "Following";
						followBtn.classList.remove("list-action-btn-primary");
						data.isFollowing = true;
					}
				}
			});
			actionsRow.appendChild(followBtn);
		}

		if (actionsRow.children.length > 0) {
			infoEl.appendChild(actionsRow);
		}

		await loadListTweets(listId);

		currentMembers.forEach((member) => {
			membersContainer.appendChild(
				createMemberItem(member, data.isOwner, listId),
			);
		});

		if (currentMembers.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "lists-empty";
			const emptyTitle = document.createElement("h3");
			emptyTitle.textContent = "No members";
			emptyDiv.appendChild(emptyTitle);
			const emptyText = document.createElement("p");
			emptyText.textContent = "This list has no members yet.";
			emptyDiv.appendChild(emptyText);
			membersContainer.appendChild(emptyDiv);
		}

		setupListDetailTabs();
	} catch (err) {
		console.error("Error loading list detail:", err);
		titleEl.textContent = "Error";
		ownerEl.textContent = "Failed to load list";
	}
}

async function loadListTweets(listId, append = false) {
	if (isLoadingTweets || (!append && currentTweets.length > 0)) return;

	isLoadingTweets = true;
	const container = document.getElementById("listTweetsContent");

	let skeletons = [];
	if (!append) {
		skeletons = showSkeletons(container, createTweetSkeleton, 3);
	}

	try {
		let url = `/lists/${listId}/tweets?limit=20`;
		if (append && currentTweets.length > 0) {
			const lastTweet = currentTweets[currentTweets.length - 1];
			url += `&before=${lastTweet.id}`;
		}

		const data = await query(url);

		removeSkeletons(skeletons);

		if (data.error) {
			if (!append) {
				const errorDiv = document.createElement("div");
				errorDiv.className = "lists-empty";
				errorDiv.textContent = data.error;
				container.appendChild(errorDiv);
			}
			hasMoreTweets = false;
			return;
		}

		if (!data.tweets || data.tweets.length === 0) {
			if (!append && currentTweets.length === 0) {
				const emptyDiv = document.createElement("div");
				emptyDiv.className = "lists-empty";
				const emptyTitle = document.createElement("h3");
				emptyTitle.textContent = "No tweets";
				emptyDiv.appendChild(emptyTitle);
				const emptyText = document.createElement("p");
				emptyText.textContent = "Tweets from list members will appear here.";
				emptyDiv.appendChild(emptyText);
				container.appendChild(emptyDiv);
			}
			hasMoreTweets = false;
			return;
		}

		currentTweets = append ? [...currentTweets, ...data.tweets] : data.tweets;
		hasMoreTweets = data.hasMore;

		data.tweets.forEach((tweet) => {
			const tweetEl = createTweetElement(tweet, { clickToOpen: true });
			container.appendChild(tweetEl);
		});
	} catch (err) {
		removeSkeletons(skeletons);
		console.error("Error loading list tweets:", err);
	} finally {
		isLoadingTweets = false;
	}
}

function createMemberItem(member, isOwner, listId) {
	const item = document.createElement("div");
	item.className = "list-member-item";

	const avatar = document.createElement("img");
	avatar.src = member.avatar || "/public/shared/assets/default-avatar.svg";
	avatar.alt = member.name || member.username;
	avatar.className = "list-member-avatar";
	const radius =
		member.avatar_radius !== null && member.avatar_radius !== undefined
			? `${member.avatar_radius}px`
			: member.gold
				? "4px"
				: "50px";
	avatar.style.borderRadius = radius;
	item.appendChild(avatar);

	const info = document.createElement("div");
	info.className = "list-member-info";

	const name = document.createElement("div");
	name.className = "list-member-name";
	name.textContent = member.name || member.username;
	info.appendChild(name);

	const username = document.createElement("div");
	username.className = "list-member-username";
	username.textContent = `@${member.username}`;
	info.appendChild(username);

	item.appendChild(info);

	if (isOwner) {
		const removeBtn = document.createElement("button");
		removeBtn.className = "list-member-remove";
		removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			const result = await query(`/lists/${listId}/members/${member.id}`, {
				method: "DELETE",
			});
			if (result.success) {
				item.remove();
				toastQueue.add(`<h1>Member removed</h1>`);
			} else {
				toastQueue.add(
					`<h1>${escapeHTML(result.error || "Failed to remove member")}</h1>`,
				);
			}
		});
		item.appendChild(removeBtn);
	}

	item.addEventListener("click", async () => {
		const { openProfile } = await import("./profile.js");
		openProfile(member.username);
	});

	return item;
}

function setupListDetailTabs() {
	const tabNav = document.querySelector(".list-detail-tabs");
	const tweetsContent = document.getElementById("listTweetsContent");
	const membersContent = document.getElementById("listMembersContent");

	tabNav.querySelectorAll(".list-detail-tab").forEach((tab) => {
		tab.addEventListener("click", () => {
			tabNav.querySelectorAll(".list-detail-tab").forEach((t) => {
				t.classList.remove("active");
			});
			tab.classList.add("active");
			updateTabIndicator(tabNav, tab);

			const tabName = tab.dataset.tab;
			if (tabName === "tweets") {
				tweetsContent.classList.remove("hidden");
				membersContent.classList.add("hidden");
			} else {
				tweetsContent.classList.add("hidden");
				membersContent.classList.remove("hidden");
			}
		});
	});

	const activeTab = tabNav.querySelector(".active");
	if (activeTab) {
		updateTabIndicator(tabNav, activeTab);
	}
}

export function openCreateListModal() {
	const content = document.createElement("div");
	content.className = "create-list-form";

	const nameGroup = document.createElement("div");
	nameGroup.className = "form-group";
	const nameLabel = document.createElement("label");
	nameLabel.textContent = "Name";
	nameLabel.htmlFor = "newListName";
	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.id = "newListName";
	nameInput.maxLength = 25;
	nameInput.placeholder = "My list";
	nameGroup.appendChild(nameLabel);
	nameGroup.appendChild(nameInput);
	content.appendChild(nameGroup);

	const descGroup = document.createElement("div");
	descGroup.className = "form-group";
	const descLabel = document.createElement("label");
	descLabel.textContent = "Description";
	descLabel.htmlFor = "newListDesc";
	const descInput = document.createElement("textarea");
	descInput.id = "newListDesc";
	descInput.maxLength = 100;
	descInput.placeholder = "What's this list about?";
	descInput.rows = 3;
	descGroup.appendChild(descLabel);
	descGroup.appendChild(descInput);
	content.appendChild(descGroup);

	const privateGroup = document.createElement("div");
	privateGroup.className = "form-group checkbox-group";
	const privateLabel = document.createElement("label");
	privateLabel.className = "checkbox-label";
	const privateCheckbox = document.createElement("input");
	privateCheckbox.type = "checkbox";
	privateCheckbox.id = "newListPrivate";
	const privateText = document.createElement("span");
	privateText.textContent = "Make it private";
	privateLabel.appendChild(privateCheckbox);
	privateLabel.appendChild(privateText);
	privateGroup.appendChild(privateLabel);
	content.appendChild(privateGroup);

	const actions = document.createElement("div");
	actions.className = "modal-actions";

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "profile-btn";
	cancelBtn.textContent = "Cancel";

	const createBtn = document.createElement("button");
	createBtn.className = "profile-btn profile-btn-primary";
	createBtn.textContent = "Create";

	actions.appendChild(cancelBtn);
	actions.appendChild(createBtn);
	content.appendChild(actions);

	const modal = createModal({
		title: "Create a new list",
		content,
		className: "create-list-modal",
	});

	cancelBtn.addEventListener("click", () => modal.close());

	createBtn.addEventListener("click", async () => {
		const name = nameInput.value.trim();
		const description = descInput.value.trim();
		const isPrivate = privateCheckbox.checked;

		if (!name) {
			toastQueue.add(`<h1>Name is required</h1>`);
			return;
		}

		createBtn.disabled = true;
		createBtn.textContent = "Creating...";

		const result = await query("/lists/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, description, isPrivate }),
		});

		if (result.success) {
			modal.close();
			toastQueue.add(`<h1>List created!</h1>`);
			if (result.list?.id) {
				openListDetail(result.list.id);
			}
		} else {
			toastQueue.add(
				`<h1>${escapeHTML(result.error || "Failed to create list")}</h1>`,
			);
			createBtn.disabled = false;
			createBtn.textContent = "Create";
		}
	});
}

function openEditListModal(list) {
	const content = document.createElement("div");
	content.className = "create-list-form";

	const nameGroup = document.createElement("div");
	nameGroup.className = "form-group";
	const nameLabel = document.createElement("label");
	nameLabel.textContent = "Name";
	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.maxLength = 25;
	nameInput.value = list.name || "";
	nameGroup.appendChild(nameLabel);
	nameGroup.appendChild(nameInput);
	content.appendChild(nameGroup);

	const descGroup = document.createElement("div");
	descGroup.className = "form-group";
	const descLabel = document.createElement("label");
	descLabel.textContent = "Description";
	const descInput = document.createElement("textarea");
	descInput.maxLength = 100;
	descInput.value = list.description || "";
	descInput.rows = 3;
	descGroup.appendChild(descLabel);
	descGroup.appendChild(descInput);
	content.appendChild(descGroup);

	const privateGroup = document.createElement("div");
	privateGroup.className = "form-group checkbox-group";
	const privateLabel = document.createElement("label");
	privateLabel.className = "checkbox-label";
	const privateCheckbox = document.createElement("input");
	privateCheckbox.type = "checkbox";
	privateCheckbox.checked = !!list.is_private;
	const privateText = document.createElement("span");
	privateText.textContent = "Make it private";
	privateLabel.appendChild(privateCheckbox);
	privateLabel.appendChild(privateText);
	privateGroup.appendChild(privateLabel);
	content.appendChild(privateGroup);

	const actions = document.createElement("div");
	actions.className = "modal-actions";

	const deleteBtn = document.createElement("button");
	deleteBtn.className = "profile-btn profile-btn-danger";
	deleteBtn.textContent = "Delete list";

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "profile-btn";
	cancelBtn.textContent = "Cancel";

	const saveBtn = document.createElement("button");
	saveBtn.className = "profile-btn profile-btn-primary";
	saveBtn.textContent = "Save";

	actions.appendChild(deleteBtn);
	actions.appendChild(cancelBtn);
	actions.appendChild(saveBtn);
	content.appendChild(actions);

	const modal = createModal({
		title: "Edit list",
		content,
		className: "create-list-modal",
	});

	cancelBtn.addEventListener("click", () => modal.close());

	deleteBtn.addEventListener("click", async () => {
		createConfirmModal({
			title: "Delete list",
			message:
				"Are you sure you want to delete this list? This action cannot be undone.",
			confirmText: "Delete",
			cancelText: "Cancel",
			danger: true,
			onConfirm: async () => {
				const result = await query(`/lists/${list.id}`, { method: "DELETE" });
				if (result.success) {
					modal.close();
					toastQueue.add(`<h1>List deleted</h1>`);
					history.back();
				} else {
					toastQueue.add(
						`<h1>${escapeHTML(result.error || "Failed to delete list")}</h1>`,
					);
				}
			},
		});
	});

	saveBtn.addEventListener("click", async () => {
		const name = nameInput.value.trim();
		const description = descInput.value.trim();
		const isPrivate = privateCheckbox.checked;

		if (!name) {
			toastQueue.add(`<h1>Name is required</h1>`);
			return;
		}

		saveBtn.disabled = true;
		saveBtn.textContent = "Saving...";

		const result = await query(`/lists/${list.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, description, isPrivate }),
		});

		if (result.success) {
			modal.close();
			toastQueue.add(`<h1>List updated!</h1>`);
			loadListDetail(list.id);
		} else {
			toastQueue.add(
				`<h1>${escapeHTML(result.error || "Failed to update list")}</h1>`,
			);
			saveBtn.disabled = false;
			saveBtn.textContent = "Save";
		}
	});
}

async function openAddMemberModal(listId) {
	const content = document.createElement("div");
	content.className = "add-member-form";

	const searchGroup = document.createElement("div");
	searchGroup.className = "form-group";
	const searchLabel = document.createElement("label");
	searchLabel.textContent = "Search users";
	const searchInput = document.createElement("input");
	searchInput.type = "text";
	searchInput.placeholder = "Enter username...";
	searchGroup.appendChild(searchLabel);
	searchGroup.appendChild(searchInput);
	content.appendChild(searchGroup);

	const resultsContainer = document.createElement("div");
	resultsContainer.className = "add-member-results";
	content.appendChild(resultsContainer);

	createModal({
		title: "Add members",
		content,
		className: "add-member-modal",
	});

	let debounceTimer = null;

	searchInput.addEventListener("input", () => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			const term = searchInput.value.trim();
			if (term.length < 2) {
				resultsContainer.innerHTML = "";
				return;
			}

			const data = await query(
				`/search?q=${encodeURIComponent(term)}&type=users&limit=10`,
			);
			resultsContainer.innerHTML = "";

			if (data.users && data.users.length > 0) {
				data.users.forEach((user) => {
					const item = document.createElement("div");
					item.className = "add-member-user";

					const avatar = document.createElement("img");
					avatar.src =
						user.avatar || "/public/shared/assets/default-avatar.svg";
					avatar.className = "add-member-avatar";
					const radius =
						user.avatar_radius !== null && user.avatar_radius !== undefined
							? `${user.avatar_radius}px`
							: user.gold || user.gray
								? "4px"
								: "50px";
					avatar.style.borderRadius = radius;
					item.appendChild(avatar);

					const info = document.createElement("div");
					info.className = "add-member-info";
					const name = document.createElement("div");
					name.className = "add-member-name";
					name.textContent = user.name || user.username;
					const username = document.createElement("div");
					username.className = "add-member-username";
					username.textContent = `@${user.username}`;
					info.appendChild(name);
					info.appendChild(username);
					item.appendChild(info);

					const addBtn = document.createElement("button");
					addBtn.className = "add-member-btn";
					addBtn.textContent = "Add";
					addBtn.addEventListener("click", async () => {
						addBtn.disabled = true;
						addBtn.textContent = "Adding...";

						const result = await query(`/lists/${listId}/members`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ userId: user.id }),
						});

						if (result.success) {
							addBtn.textContent = "Added";
							addBtn.classList.add("added");
							toastQueue.add(`<h1>Member added</h1>`);
						} else {
							addBtn.disabled = false;
							addBtn.textContent = "Add";
							toastQueue.add(
								`<h1>${escapeHTML(result.error || "Failed to add member")}</h1>`,
							);
						}
					});
					item.appendChild(addBtn);

					resultsContainer.appendChild(item);
				});
			} else {
				const noResults = document.createElement("p");
				noResults.className = "no-results";
				noResults.textContent = "No users found";
				resultsContainer.appendChild(noResults);
			}
		}, 300);
	});

	searchInput.focus();
}

export function openAddToListModal(userId, username) {
	const content = document.createElement("div");
	content.className = "add-to-list-form";

	const loadingDiv = document.createElement("div");
	loadingDiv.className = "loading";
	loadingDiv.textContent = "Loading your lists...";
	content.appendChild(loadingDiv);

	const modal = createModal({
		title: `Add @${username} to list`,
		content,
		className: "add-to-list-modal",
	});

	(async () => {
		const data = await query("/lists/");
		content.innerHTML = "";

		if (data.error || !data.ownedLists) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "lists-empty";
			errorDiv.textContent = data.error || "Failed to load lists";
			content.appendChild(errorDiv);
			return;
		}

		if (data.ownedLists.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "lists-empty";
			const emptyTitle = document.createElement("h3");
			emptyTitle.textContent = "No lists";
			emptyDiv.appendChild(emptyTitle);
			const emptyText = document.createElement("p");
			emptyText.textContent = "Create a list first to add users.";
			emptyDiv.appendChild(emptyText);
			const createBtn = document.createElement("button");
			createBtn.className = "profile-btn profile-btn-primary";
			createBtn.textContent = "Create list";
			createBtn.addEventListener("click", () => {
				modal.close();
				openCreateListModal();
			});
			emptyDiv.appendChild(createBtn);
			content.appendChild(emptyDiv);
			return;
		}

		const listContainer = document.createElement("div");
		listContainer.className = "add-to-list-items";

		for (const list of data.ownedLists) {
			const item = document.createElement("div");
			item.className = "add-to-list-item";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = `list-${list.id}`;
			checkbox.checked = list.hasMember;
			item.appendChild(checkbox);

			const label = document.createElement("label");
			label.htmlFor = `list-${list.id}`;

			const name = document.createElement("span");
			name.className = "list-name";
			name.textContent = list.name;
			label.appendChild(name);

			if (list.is_private) {
				const badge = document.createElement("span");
				badge.className = "list-private-badge";
				badge.textContent = "Private";
				label.appendChild(badge);
			}

			item.appendChild(label);

			checkbox.addEventListener("change", async () => {
				checkbox.disabled = true;
				if (checkbox.checked) {
					const result = await query(`/lists/${list.id}/members`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ userId }),
					});
					if (!result.success) {
						checkbox.checked = false;
						toastQueue.add(
							`<h1>${escapeHTML(result.error || "Failed to add to list")}</h1>`,
						);
					}
				} else {
					const result = await query(`/lists/${list.id}/members/${userId}`, {
						method: "DELETE",
					});
					if (!result.success) {
						checkbox.checked = true;
						toastQueue.add(
							`<h1>${escapeHTML(result.error || "Failed to remove from list")}</h1>`,
						);
					}
				}
				checkbox.disabled = false;
			});

			listContainer.appendChild(item);
		}

		content.appendChild(listContainer);
	})();
}

export function initLists() {
	const createBtn = document.getElementById("createListBtn");
	if (createBtn) {
		createBtn.addEventListener("click", () => openCreateListModal());
	}
}
