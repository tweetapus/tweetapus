import toastQueue from "../../shared/toasts.js";
import { createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";

let currentUser = null;
let currentUserPromise = null;

const ensureCurrentUser = async (forceReload = false) => {
	if (!authToken) return null;

	if (!forceReload && currentUser) {
		return currentUser;
	}

	if (!forceReload && currentUserPromise) {
		return currentUserPromise;
	}

	currentUserPromise = (async () => {
		try {
			const data = await query("/auth/me?requestPreload=1");
			if (data?.user) {
				currentUser = {
					...data.user,
				};
				return currentUser;
			}
			currentUser = null;
			return null;
		} catch (error) {
			console.error("Failed to query user data:", error);
			currentUser = null;
			return null;
		} finally {
			currentUserPromise = null;
		}
	})();

	return currentUserPromise;
};

const settingsPages = [
	{ key: "account", title: "Account", content: () => createAccountContent() },
	{
		key: "passkeys",
		title: "Passkeys",
		content: () => createPasskeysContent(),
	},
	{ key: "themes", title: "Themes", content: () => createThemesContent() },
	{
		key: "scheduled",
		title: "Scheduled",
		content: () => createScheduledContent(),
	},
	{
		key: "delegates",
		title: "Delegates",
		content: () => createDelegatesContent(),
	},
	{
		key: "others",
		title: "Others",
		content: () => createOthersContent(),
	},
];

const createThemesContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Themes";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Appearance";
	group.appendChild(h2);

	const themeItem = document.createElement("div");
	themeItem.className = "setting-item";

	const themeLabel = document.createElement("div");
	themeLabel.className = "setting-label";
	const themeTitle = document.createElement("div");
	themeTitle.className = "setting-title";
	themeTitle.textContent = "Theme Mode";
	const themeDesc = document.createElement("div");
	themeDesc.className = "setting-description";
	themeDesc.textContent = "Choose light or dark mode";
	themeLabel.appendChild(themeTitle);
	themeLabel.appendChild(themeDesc);

	const themeControl = document.createElement("div");
	themeControl.className = "setting-control";

	const select = document.createElement("select");
	select.id = "themeDropdown";
	select.className = "theme-mode-select";
	select.style.cssText = `
		padding: 8px 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 14px;
		cursor: pointer;
	`;

	[
		{ v: "light", t: "Light" },
		{ v: "dark", t: "Dark" },
		{ v: "auto", t: "Auto" },
	].forEach(({ v, t }) => {
		const option = document.createElement("option");
		option.value = v;
		option.textContent = t;
		select.appendChild(option);
	});

	select.addEventListener("change", () => {
		handleThemeModeChange(select.value);
	});

	themeControl.appendChild(select);

	themeItem.appendChild(themeLabel);
	themeItem.appendChild(themeControl);
	group.appendChild(themeItem);

	const saveItem = document.createElement("div");
	saveItem.className = "setting-item";
	const saveLabel = document.createElement("div");
	saveLabel.className = "setting-label";
	const saveControl = document.createElement("div");
	saveControl.className = "setting-control";
	const saveBtn = document.createElement("button");
	saveBtn.className = "btn primary";
	saveBtn.id = "saveThemeBtn";
	saveBtn.textContent = "Save to Account";
	saveControl.appendChild(saveBtn);
	saveItem.appendChild(saveLabel);
	saveItem.appendChild(saveControl);
	group.appendChild(saveItem);

	section.appendChild(group);
	attachThemeSectionHandlers(section);

	return section;
};

const createAccountContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Account Settings";
	section.appendChild(h1);

	const privacyGroup = document.createElement("div");
	privacyGroup.className = "setting-group";
	const privacyH2 = document.createElement("h2");
	privacyH2.textContent = "Privacy";
	privacyGroup.appendChild(privacyH2);

	const privateItem = document.createElement("div");
	privateItem.className = "setting-item";

	const privateLabel = document.createElement("div");
	privateLabel.className = "setting-label";
	const privateTitle = document.createElement("div");
	privateTitle.className = "setting-title";
	privateTitle.textContent = "Private Account";
	const privateDesc = document.createElement("div");
	privateDesc.className = "setting-description";
	privateDesc.textContent =
		"When enabled, only approved followers can see your posts";
	privateLabel.appendChild(privateTitle);
	privateLabel.appendChild(privateDesc);

	const privateControl = document.createElement("div");
	privateControl.className = "setting-control";

	const privateToggle = document.createElement("label");
	privateToggle.className = "toggle-switch";
	privateToggle.innerHTML = `
    <input type="checkbox" id="private-account-toggle" />
    <span class="toggle-slider"></span>
  `;

	privateControl.appendChild(privateToggle);
	privateItem.appendChild(privateLabel);
	privateItem.appendChild(privateControl);
	privacyGroup.appendChild(privateItem);

	section.appendChild(privacyGroup);

	// Community Tag Group
	const communityTagGroup = document.createElement("div");
	communityTagGroup.className = "setting-group";
	const communityTagH2 = document.createElement("h2");
	communityTagH2.textContent = "Community Tag";
	communityTagGroup.appendChild(communityTagH2);

	const communityTagItem = document.createElement("div");
	communityTagItem.className = "setting-item";

	const communityTagLabel = document.createElement("div");
	communityTagLabel.className = "setting-label";
	const communityTagTitle = document.createElement("div");
	communityTagTitle.className = "setting-title";
	communityTagTitle.textContent = "Display Community Tag";
	const communityTagDesc = document.createElement("div");
	communityTagDesc.className = "setting-description";
	communityTagDesc.textContent =
		"Choose a community tag to display next to your name";
	communityTagLabel.appendChild(communityTagTitle);
	communityTagLabel.appendChild(communityTagDesc);

	const communityTagControl = document.createElement("div");
	communityTagControl.className = "setting-control";

	const select = document.createElement("select");
	select.id = "communityTagDropdown";
	select.className = "community-tag-select";
	select.style.cssText = `
		padding: 8px 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 14px;
		cursor: pointer;
		min-width: 200px;
	`;

	const noneOption = document.createElement("option");
	noneOption.value = "";
	noneOption.textContent = "None";
	select.appendChild(noneOption);

	communityTagControl.appendChild(select);
	communityTagItem.appendChild(communityTagLabel);
	communityTagItem.appendChild(communityTagControl);
	communityTagGroup.appendChild(communityTagItem);

	section.appendChild(communityTagGroup);

	const group = document.createElement("div");
	group.className = "setting-group";
	const h2 = document.createElement("h2");
	h2.textContent = "Profile";
	group.appendChild(h2);

	const item1 = document.createElement("div");
	item1.className = "setting-item";
	const label1 = document.createElement("div");
	label1.className = "setting-label";
	const control1 = document.createElement("div");
	control1.className = "setting-control";
	const btnUser = document.createElement("button");
	btnUser.className = "btn secondary";
	btnUser.id = "changeUsernameBtn";
	btnUser.textContent = "Change Username";
	control1.appendChild(btnUser);
	item1.appendChild(label1);
	item1.appendChild(control1);
	group.appendChild(item1);

	const item2 = document.createElement("div");
	item2.className = "setting-item";
	const label2 = document.createElement("div");
	label2.className = "setting-label";
	const control2 = document.createElement("div");
	control2.className = "setting-control";
	const btnPass = document.createElement("button");
	btnPass.className = "btn secondary";
	btnPass.id = "changePasswordBtn";
	btnPass.textContent = "Change Password";
	control2.appendChild(btnPass);
	item2.appendChild(label2);
	item2.appendChild(control2);
	group.appendChild(item2);

	section.appendChild(group);

	const danger = document.createElement("div");
	danger.className = "setting-group danger-group";
	const dh2 = document.createElement("h2");
	dh2.textContent = "Danger Zone";
	danger.appendChild(dh2);
	const item3 = document.createElement("div");
	item3.className = "setting-item";
	const label3 = document.createElement("div");
	label3.className = "setting-label";
	const control3 = document.createElement("div");
	control3.className = "setting-control";
	const btnDel = document.createElement("button");
	btnDel.className = "btn danger";
	btnDel.id = "deleteAccountBtn";
	btnDel.textContent = "Delete Account";
	control3.appendChild(btnDel);
	item3.appendChild(label3);
	item3.appendChild(control3);
	danger.appendChild(item3);
	section.appendChild(danger);

	attachAccountSectionHandlers(section);

	return section;
};

const openChangeUsernameModal = async () => {
	const userForModal = await ensureCurrentUser();
	if (!userForModal) {
		toastQueue.add(
			"<h1>Not Signed In</h1><p>Please sign in to manage your account</p>",
		);
		return;
	}

	const modal = document.getElementById("changeUsernameModal");
	if (!modal) return;

	showModal(modal);

	const usernameInput = document.getElementById("newUsername");
	if (usernameInput) {
		usernameInput.value = userForModal.username || "";
		usernameInput.focus();
		usernameInput.select();
	}
};

const openChangePasswordModal = async () => {
	const userForPassword = await ensureCurrentUser();
	if (!userForPassword) {
		toastQueue.add(
			"<h1>Not Signed In</h1><p>Please sign in to manage your password</p>",
		);
		return;
	}

	const modal = document.getElementById("changePasswordModal");
	if (!modal) return;

	const hasPassword = !!userForPassword.has_password;

	const header = modal.querySelector("h2");
	if (header) {
		header.textContent = hasPassword ? "Change Password" : "Set Password";
	}

	const submit = modal.querySelector("button[type='submit']");
	if (submit) {
		submit.textContent = hasPassword ? "Change Password" : "Set Password";
	}

	const currentPasswordGroup = document.getElementById("currentPasswordGroup");
	if (currentPasswordGroup) {
		currentPasswordGroup.style.display = hasPassword ? "flex" : "none";
	}

	const form = document.getElementById("changePasswordForm");
	if (form && typeof form.reset === "function") {
		form.reset();
	}

	const focusTarget = hasPassword
		? document.getElementById("current-password")
		: document.getElementById("new-password");
	focusTarget?.focus?.();

	showModal(modal);
};

const openDeleteAccountModal = async () => {
	const userForDeletion = await ensureCurrentUser();
	if (!userForDeletion) {
		toastQueue.add(
			"<h1>Not Signed In</h1><p>Please sign in to manage your account</p>",
		);
		return;
	}

	const modal = document.getElementById("deleteAccountModal");
	if (!modal) return;

	const confirmation = document.getElementById("deleteConfirmation");
	if (confirmation) {
		confirmation.value = "";
		confirmation.focus();
	}

	showModal(modal);
};

const loadCommunityTagOptions = async () => {
	const user = await ensureCurrentUser();
	if (!user) return;

	try {
		const response = await query("/communities/user/me");
		if (response.error) {
			console.error("Failed to load communities:", response.error);
			return;
		}

		const communities = response.communities || [];
		const select = document.getElementById("communityTagDropdown");

		if (!select) return;

		select.innerHTML = "";

		const noneOption = document.createElement("option");
		noneOption.value = "";
		noneOption.textContent = "None";
		select.appendChild(noneOption);

		const communitiesWithTags = communities.filter((c) => c.tag_enabled);
		communitiesWithTags.forEach((community) => {
			const option = document.createElement("option");
			option.value = community.id;
			option.textContent =
				`${community.tag_emoji || ""} ${community.tag_text || ""} - ${community.name}`.trim();
			select.appendChild(option);
		});

		if (user.selected_community_tag) {
			select.value = user.selected_community_tag;
		} else {
			select.value = "";
		}

		select.addEventListener("change", async () => {
			const communityId = select.value;

			try {
				const result = await query("/profile/settings/community-tag", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						community_id: communityId || null,
					}),
				});

				if (result.success) {
					toastQueue.add(
						"<h1>Community Tag Updated</h1><p>Your community tag has been updated</p>",
					);

					if (currentUser) {
						currentUser.selected_community_tag = communityId || null;
					}
				} else {
					toastQueue.add(
						`<h1>Error</h1><p>${result.error || "Failed to update community tag"}</p>`,
					);
				}
			} catch (error) {
				console.error("Failed to update community tag:", error);
				toastQueue.add("<h1>Error</h1><p>Failed to update community tag</p>");
			}
		});
	} catch (error) {
		console.error("Failed to load community tag options:", error);
	}
};

const attachAccountSectionHandlers = (root) => {
	if (!root) return;

	const usernameBtn = root.querySelector("#changeUsernameBtn");
	if (usernameBtn && !usernameBtn.dataset.bound) {
		usernameBtn.dataset.bound = "1";
		usernameBtn.addEventListener("click", (event) => {
			event.preventDefault();
			openChangeUsernameModal();
		});
	}

	const passwordBtn = root.querySelector("#changePasswordBtn");
	if (passwordBtn && !passwordBtn.dataset.bound) {
		passwordBtn.dataset.bound = "1";
		passwordBtn.addEventListener("click", (event) => {
			event.preventDefault();
			openChangePasswordModal();
		});
	}

	const deleteBtn = root.querySelector("#deleteAccountBtn");
	if (deleteBtn && !deleteBtn.dataset.bound) {
		deleteBtn.dataset.bound = "1";
		deleteBtn.addEventListener("click", (event) => {
			event.preventDefault();
			openDeleteAccountModal();
		});
	}

	// Load and handle community tag dropdown
	setTimeout(async () => {
		await loadCommunityTagOptions();
	}, 100);
};

const attachThemeSectionHandlers = (root) => {
	if (!root) return;
	const saveBtn = root.querySelector("#saveThemeBtn");
	if (saveBtn && !saveBtn.dataset.bound) {
		saveBtn.dataset.bound = "1";
		saveBtn.addEventListener("click", (event) => {
			event.preventDefault();
			saveThemeToServer();
		});
	}
};

const enhanceSettingsSection = (root) => {
	if (!root) return;
	if (root.querySelector("#changeUsernameBtn")) {
		attachAccountSectionHandlers(root);
	}
	if (root.querySelector("#saveThemeBtn")) {
		attachThemeSectionHandlers(root);
	}
};

const createPasskeysContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Passkey Management";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Your Passkeys";
	group.appendChild(h2);

	const description = document.createElement("p");
	description.style.color = "var(--text-secondary)";
	description.style.fontSize = "14px";
	description.style.marginBottom = "16px";
	description.textContent =
		"Passkeys allow you to sign in securely without a password. You can use your device's biometric authentication or security key.";
	group.appendChild(description);

	const addPasskeyItem = document.createElement("div");
	addPasskeyItem.className = "setting-item";
	const addPasskeyLabel = document.createElement("div");
	addPasskeyLabel.className = "setting-label";
	const addPasskeyTitle = document.createElement("div");
	addPasskeyTitle.className = "setting-title";
	addPasskeyTitle.textContent = "Add New Passkey";
	const addPasskeyDesc = document.createElement("div");
	addPasskeyDesc.className = "setting-description";
	addPasskeyDesc.textContent = "Register a new passkey for this account";
	addPasskeyLabel.appendChild(addPasskeyTitle);
	addPasskeyLabel.appendChild(addPasskeyDesc);
	const addPasskeyControl = document.createElement("div");
	addPasskeyControl.className = "setting-control";
	const addPasskeyBtn = document.createElement("button");
	addPasskeyBtn.className = "btn primary";
	addPasskeyBtn.id = "addPasskeyBtn";
	addPasskeyBtn.textContent = "Add Passkey";
	addPasskeyBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		await handleAddPasskey();
	});
	addPasskeyControl.appendChild(addPasskeyBtn);
	addPasskeyItem.appendChild(addPasskeyLabel);
	addPasskeyItem.appendChild(addPasskeyControl);
	group.appendChild(addPasskeyItem);

	section.appendChild(group);

	const passkeyListGroup = document.createElement("div");
	passkeyListGroup.className = "setting-group";
	const passkeyListTitle = document.createElement("h2");
	passkeyListTitle.textContent = "Registered Passkeys";
	passkeyListGroup.appendChild(passkeyListTitle);

	const passkeyList = document.createElement("div");
	passkeyList.id = "passkeyListSettings";
	passkeyList.style.display = "flex";
	passkeyList.style.flexDirection = "column";
	passkeyList.style.gap = "12px";
	passkeyListGroup.appendChild(passkeyList);

	section.appendChild(passkeyListGroup);

	setTimeout(() => {
		loadPasskeys();
	}, 100);

	return section;
};

const loadPasskeys = async () => {
	const passkeyList = document.getElementById("passkeyListSettings");
	if (!passkeyList) return;

	try {
		const data = await query("/auth/passkeys");

		if (data.error) {
			passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load passkeys</p>`;
			return;
		}

		if (!data.passkeys || data.passkeys.length === 0) {
			passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No passkeys registered yet</p>`;
			return;
		}

		passkeyList.innerHTML = "";
		data.passkeys.forEach((passkey) => {
			const item = document.createElement("div");
			item.style.display = "flex";
			item.style.justifyContent = "space-between";
			item.style.alignItems = "center";
			item.style.padding = "16px";
			item.style.backgroundColor = "var(--bg-primary)";
			item.style.borderRadius = "8px";
			item.style.border = "1px solid var(--border-primary)";

			const info = document.createElement("div");
			info.style.flex = "1";

			const name = document.createElement("div");
			name.style.fontWeight = "500";
			name.style.color = "var(--text-primary)";
			name.style.marginBottom = "4px";
			name.textContent = passkey.name || "Unnamed Passkey";

			const createdAt = document.createElement("div");
			createdAt.style.fontSize = "12px";
			createdAt.style.color = "var(--text-secondary)";
			const date = passkey.created_at
				? new Date(passkey.created_at)
				: new Date();
			createdAt.textContent = `Created: ${date.toLocaleDateString()}`;

			info.appendChild(name);
			info.appendChild(createdAt);

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "btn danger";
			deleteBtn.textContent = "Remove";
			deleteBtn.style.maxWidth = "120px";
			deleteBtn.onclick = () => deletePasskey(passkey.cred_id);

			item.appendChild(info);
			item.appendChild(deleteBtn);
			passkeyList.appendChild(item);
		});
	} catch (error) {
		console.error("Failed to load passkeys:", error);
		passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load passkeys</p>`;
	}
};

const deletePasskey = async (passkeyId) => {
	if (!confirm("Are you sure you want to remove this passkey?")) return;

	try {
		const data = await query(`/auth/passkeys/${passkeyId}`, {
			method: "DELETE",
		});

		if (data.error) {
			toastQueue.add(`<h1>Error</h1><p>${data.error}</p>`);
			return;
		}

		toastQueue.add(`<h1>Success</h1><p>Passkey removed successfully</p>`);
		loadPasskeys();
	} catch (error) {
		console.error("Failed to delete passkey:", error);
		toastQueue.add(`<h1>Error</h1><p>Failed to remove passkey</p>`);
	}
};

const createOthersContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Others";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Composer";
	group.appendChild(h2);

	const cardComposerItem = document.createElement("div");
	cardComposerItem.className = "setting-item";

	const cardComposerLabel = document.createElement("div");
	cardComposerLabel.className = "setting-label";
	const cardComposerTitle = document.createElement("div");
	cardComposerTitle.className = "setting-title";
	cardComposerTitle.textContent = "Card Composer";
	const cardComposerDesc = document.createElement("div");
	cardComposerDesc.className = "setting-description";
	cardComposerDesc.textContent = "Create interactive cards";
	cardComposerLabel.appendChild(cardComposerTitle);
	cardComposerLabel.appendChild(cardComposerDesc);

	const cardComposerControl = document.createElement("div");
	cardComposerControl.className = "setting-control";

	const cardComposerBtn = document.createElement("button");
	cardComposerBtn.className = "btn primary";
	cardComposerBtn.id = "open-card-composer-btn";
	cardComposerBtn.textContent = "Open Card Composer";
	cardComposerBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		await openCardComposer();
	});

	cardComposerControl.appendChild(cardComposerBtn);
	cardComposerItem.appendChild(cardComposerLabel);
	cardComposerItem.appendChild(cardComposerControl);
	group.appendChild(cardComposerItem);

	section.appendChild(group);

	return section;
};

const createDelegatesContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Delegates";
	section.appendChild(h1);

	const myDelegatesGroup = document.createElement("div");
	myDelegatesGroup.className = "setting-group";

	const myDelegatesH2 = document.createElement("h2");
	myDelegatesH2.textContent = "My Delegates";
	myDelegatesGroup.appendChild(myDelegatesH2);

	const inviteForm = document.createElement("div");
	inviteForm.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  `;

	const inviteInput = document.createElement("input");
	inviteInput.type = "text";
	inviteInput.placeholder = "Enter username to invite";
	inviteInput.style.cssText = `
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
  `;

	const inviteBtn = document.createElement("button");
	inviteBtn.className = "btn primary";
	inviteBtn.textContent = "Invite";
	inviteBtn.onclick = async () => {
		const username = inviteInput.value.trim();
		if (!username) return;

		try {
			const result = await query("/delegates/invite", {
				method: "POST",
				body: JSON.stringify({ username }),
			});

			if (result.success) {
				toastQueue.add(
					`<h1>Invited</h1><p>Delegate invitation sent to @${username}</p>`,
				);
				inviteInput.value = "";
				loadDelegates();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${result.error || "Failed to send invitation"}</p>`,
				);
			}
		} catch (error) {
			console.error("Failed to invite delegate:", error);
			toastQueue.add(`<h1>Error</h1><p>Failed to send invitation</p>`);
		}
	};

	inviteForm.appendChild(inviteInput);
	inviteForm.appendChild(inviteBtn);
	myDelegatesGroup.appendChild(inviteForm);

	const delegatesList = document.createElement("div");
	delegatesList.id = "delegates-list";
	delegatesList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
	myDelegatesGroup.appendChild(delegatesList);

	section.appendChild(myDelegatesGroup);

	const delegationsGroup = document.createElement("div");
	delegationsGroup.className = "setting-group";

	const delegationsH2 = document.createElement("h2");
	delegationsH2.textContent = "I'm a Delegate For";
	delegationsGroup.appendChild(delegationsH2);

	const delegationsList = document.createElement("div");
	delegationsList.id = "delegations-list";
	delegationsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
	delegationsGroup.appendChild(delegationsList);

	section.appendChild(delegationsGroup);

	const invitationsGroup = document.createElement("div");
	invitationsGroup.className = "setting-group";

	const invitationsH2 = document.createElement("h2");
	invitationsH2.textContent = "Pending Invitations";
	invitationsGroup.appendChild(invitationsH2);

	const invitationsList = document.createElement("div");
	invitationsList.id = "pending-invitations-list";
	invitationsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
	invitationsGroup.appendChild(invitationsList);

	section.appendChild(invitationsGroup);

	setTimeout(() => {
		loadDelegates();
	}, 100);

	return section;
};

const loadDelegates = async () => {
	const delegatesList = document.getElementById("delegates-list");
	const delegationsList = document.getElementById("delegations-list");
	const invitationsList = document.getElementById("pending-invitations-list");

	if (!delegatesList || !delegationsList || !invitationsList) return;

	try {
		const [delegatesData, delegationsData, invitationsData] = await Promise.all(
			[
				query("/delegates/my-delegates"),
				query("/delegates/my-delegations"),
				query("/delegates/pending-invitations"),
			],
		);

		if (delegatesData.delegates && delegatesData.delegates.length > 0) {
			delegatesList.innerHTML = "";
			delegatesData.delegates.forEach((delegate) => {
				const item = createDelegateItem(delegate, "delegate");
				delegatesList.appendChild(item);
			});
		} else {
			delegatesList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No delegates yet</p>`;
		}

		if (delegationsData.delegations && delegationsData.delegations.length > 0) {
			delegationsList.innerHTML = "";
			delegationsData.delegations.forEach((delegation) => {
				const item = createDelegateItem(delegation, "delegation");
				delegationsList.appendChild(item);
			});
		} else {
			delegationsList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">You're not a delegate for anyone</p>`;
		}

		if (invitationsData.invitations && invitationsData.invitations.length > 0) {
			invitationsList.innerHTML = "";
			invitationsData.invitations.forEach((invitation) => {
				const item = createInvitationItem(invitation);
				invitationsList.appendChild(item);
			});
		} else {
			invitationsList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No pending invitations</p>`;
		}
	} catch (error) {
		console.error("Failed to load delegates:", error);
	}
};

const createDelegateItem = (item, type) => {
	const container = document.createElement("div");
	container.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
  `;

	const userInfo = document.createElement("div");
	userInfo.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

	const avatar = document.createElement("img");
	avatar.src = item.avatar || "/shared/assets/default-avatar.png";
	avatar.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
  `;

	const textInfo = document.createElement("div");

	const name = document.createElement("div");
	name.style.cssText = `
    font-weight: 600;
    color: var(--text-primary);
  `;
	name.textContent = item.name || item.username;

	const username = document.createElement("div");
	username.style.cssText = `
    color: var(--text-secondary);
    font-size: 14px;
  `;
	username.textContent = `@${item.username}`;

	textInfo.appendChild(name);
	textInfo.appendChild(username);

	userInfo.appendChild(avatar);
	userInfo.appendChild(textInfo);

	const removeBtn = document.createElement("button");
	removeBtn.className = "btn danger";
	removeBtn.textContent = "Remove";
	removeBtn.style.cssText = `
    padding: 6px 12px;
    font-size: 13px;
  `;
	removeBtn.onclick = async () => {
		const confirmMsg =
			type === "delegate"
				? `Are you sure you want to remove @${item.username} as your delegate?`
				: `Are you sure you want to stop being a delegate for @${item.username}?`;

		if (confirm(confirmMsg)) {
			try {
				const result = await query(`/delegates/${item.id}`, {
					method: "DELETE",
				});

				if (result.success) {
					toastQueue.add(`<h1>Removed</h1><p>Delegation removed</p>`);
					loadDelegates();
				} else {
					toastQueue.add(
						`<h1>Error</h1><p>${result.error || "Failed to remove delegation"}</p>`,
					);
				}
			} catch (error) {
				console.error("Failed to remove delegation:", error);
				toastQueue.add(`<h1>Error</h1><p>Failed to remove delegation</p>`);
			}
		}
	};

	container.appendChild(userInfo);
	container.appendChild(removeBtn);

	return container;
};

const createInvitationItem = (invitation) => {
	const container = document.createElement("div");
	container.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
  `;

	const userInfo = document.createElement("div");
	userInfo.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

	const avatar = document.createElement("img");
	avatar.src = invitation.avatar || "/shared/assets/default-avatar.png";
	avatar.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
  `;

	const textInfo = document.createElement("div");

	const name = document.createElement("div");
	name.style.cssText = `
    font-weight: 600;
    color: var(--text-primary);
  `;
	name.textContent = invitation.name || invitation.username;

	const username = document.createElement("div");
	username.style.cssText = `
    color: var(--text-secondary);
    font-size: 14px;
  `;
	username.textContent = `@${invitation.username}`;

	textInfo.appendChild(name);
	textInfo.appendChild(username);

	userInfo.appendChild(avatar);
	userInfo.appendChild(textInfo);

	const actions = document.createElement("div");
	actions.style.cssText = `
    display: flex;
    gap: 8px;
  `;

	const acceptBtn = document.createElement("button");
	acceptBtn.className = "btn primary";
	acceptBtn.textContent = "Accept";
	acceptBtn.style.cssText = `
    padding: 6px 12px;
    font-size: 13px;
  `;
	acceptBtn.onclick = async () => {
		try {
			const result = await query(`/delegates/${invitation.id}/accept`, {
				method: "POST",
			});

			if (result.success) {
				toastQueue.add(
					`<h1>Accepted</h1><p>You're now a delegate for @${invitation.username}</p>`,
				);
				loadDelegates();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${result.error || "Failed to accept invitation"}</p>`,
				);
			}
		} catch (error) {
			console.error("Failed to accept invitation:", error);
			toastQueue.add(`<h1>Error</h1><p>Failed to accept invitation</p>`);
		}
	};

	const declineBtn = document.createElement("button");
	declineBtn.className = "btn";
	declineBtn.textContent = "Decline";
	declineBtn.style.cssText = `
    padding: 6px 12px;
    font-size: 13px;
  `;
	declineBtn.onclick = async () => {
		try {
			const result = await query(`/delegates/${invitation.id}/decline`, {
				method: "POST",
			});

			if (result.success) {
				toastQueue.add(`<h1>Declined</h1><p>Invitation declined</p>`);
				loadDelegates();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${result.error || "Failed to decline invitation"}</p>`,
				);
			}
		} catch (error) {
			console.error("Failed to decline invitation:", error);
			toastQueue.add(`<h1>Error</h1><p>Failed to decline invitation</p>`);
		}
	};

	actions.appendChild(acceptBtn);
	actions.appendChild(declineBtn);

	container.appendChild(userInfo);
	container.appendChild(actions);

	return container;
};

const createScheduledContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Scheduled Tweets";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Upcoming Posts";
	group.appendChild(h2);

	const listDiv = document.createElement("div");
	listDiv.id = "scheduled-posts-list";
	listDiv.style.display = "flex";
	listDiv.style.flexDirection = "column";
	listDiv.style.gap = "12px";
	group.appendChild(listDiv);

	section.appendChild(group);

	setTimeout(() => {
		loadScheduledPosts();
	}, 100);

	return section;
};

const loadScheduledPosts = async () => {
	const listDiv = document.getElementById("scheduled-posts-list");
	if (!listDiv) return;

	try {
		const data = await query("/scheduled/");

		if (data.error) {
			listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load scheduled posts</p>`;
			return;
		}

		if (!data.scheduledPosts || data.scheduledPosts.length === 0) {
			listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No scheduled posts yet</p>`;
			return;
		}

		listDiv.innerHTML = "";
		data.scheduledPosts.forEach((post) => {
			const item = document.createElement("div");
			item.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        background-color: var(--bg-primary);
        border-radius: 8px;
        border: 1px solid var(--border-primary);
      `;

			const header = document.createElement("div");
			header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

			const scheduledTime = document.createElement("div");
			scheduledTime.style.cssText = `
        font-weight: 500;
        color: var(--primary);
        font-size: 14px;
      `;
			scheduledTime.textContent = `Scheduled for ${new Date(
				post.scheduled_for,
			).toLocaleString()}`;

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "btn danger";
			deleteBtn.textContent = "Delete";
			deleteBtn.style.cssText = `
        padding: 6px 12px;
        font-size: 13px;
        max-width: 100px;
      `;
			deleteBtn.onclick = async () => {
				if (confirm("Are you sure you want to delete this scheduled post?")) {
					try {
						const result = await query(`/scheduled/${post.id}`, {
							method: "DELETE",
						});

						if (result.success) {
							toastQueue.add(`<h1>Deleted</h1><p>Scheduled post deleted</p>`);
							loadScheduledPosts();
						} else {
							toastQueue.add(`<h1>Error</h1><p>Failed to delete post</p>`);
						}
					} catch {
						toastQueue.add(`<h1>Error</h1><p>Failed to delete post</p>`);
					}
				}
			};

			header.appendChild(scheduledTime);
			header.appendChild(deleteBtn);

			const content = document.createElement("div");
			content.style.cssText = `
        color: var(--text-primary);
        font-size: 14px;
        word-wrap: break-word;
      `;
			content.textContent = post.content;

			item.appendChild(header);
			item.appendChild(content);
			listDiv.appendChild(item);
		});
	} catch (error) {
		console.error("Failed to load scheduled posts:", error);
		listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load scheduled posts</p>`;
	}
};

const createChangeUsernameModal = () => {
	const overlay = document.createElement("div");
	overlay.id = "changeUsernameModal";
	overlay.className = "settings-modal-overlay";
	overlay.style.display = "none";
	overlay.style.position = "fixed";
	overlay.style.top = "0";
	overlay.style.left = "0";
	overlay.style.right = "0";
	overlay.style.bottom = "0";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.backgroundColor = "rgba(15, 20, 25, 0.6)";
	overlay.style.zIndex = "1200";

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "changeUsernameHeading");
	modal.style.backgroundColor = "var(--bg-primary)";
	modal.style.borderRadius = "16px";
	modal.style.width = "min(480px, 90vw)";
	modal.style.maxHeight = "85vh";
	modal.style.boxShadow = "0 18px 48px rgba(0, 0, 0, 0.35)";
	modal.style.display = "flex";
	modal.style.flexDirection = "column";
	modal.style.overflow = "hidden";
	modal.style.margin = "0 auto";
	modal.style.alignSelf = "center";

	const header = document.createElement("div");
	header.className = "modal-header";
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.justifyContent = "space-between";
	header.style.padding = "16px 20px";
	header.style.borderBottom = "1px solid var(--border-primary)";
	const h2 = document.createElement("h2");
	h2.id = "changeUsernameHeading";
	h2.textContent = "Change Username";
	h2.style.margin = "0";
	h2.style.fontSize = "20px";
	h2.style.fontWeight = "600";
	h2.style.color = "var(--text-primary)";
	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closeUsernameModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close change username dialog");
	close.textContent = "×";
	close.style.backgroundColor = "transparent";
	close.style.border = "none";
	close.style.color = "var(--text-secondary)";
	close.style.cursor = "pointer";
	close.style.fontSize = "24px";
	close.style.lineHeight = "1";
	close.style.width = "32px";
	close.style.height = "32px";
	close.style.borderRadius = "50%";
	close.style.display = "flex";
	close.style.alignItems = "center";
	close.style.justifyContent = "center";
	close.style.transition = "background-color 0.2s ease, color 0.2s ease";
	close.addEventListener("pointerenter", () => {
		close.style.backgroundColor = "var(--bg-secondary)";
		close.style.color = "var(--text-primary)";
	});
	close.addEventListener("pointerleave", () => {
		close.style.backgroundColor = "transparent";
		close.style.color = "var(--text-secondary)";
	});
	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";
	body.style.padding = "20px";
	body.style.overflowY = "auto";
	body.style.color = "var(--text-primary)";
	const form = document.createElement("form");
	form.id = "changeUsernameForm";
	form.style.display = "flex";
	form.style.flexDirection = "column";
	form.style.gap = "16px";
	const fg = document.createElement("div");
	fg.className = "form-group";
	fg.style.display = "flex";
	fg.style.flexDirection = "column";
	fg.style.gap = "8px";
	const label = document.createElement("label");
	label.htmlFor = "newUsername";
	label.textContent = "New Username";
	label.style.fontSize = "14px";
	label.style.fontWeight = "500";
	label.style.color = "var(--text-primary)";
	const userWrap = document.createElement("div");
	userWrap.className = "username-wrapper";
	userWrap.style.display = "flex";
	userWrap.style.alignItems = "center";
	userWrap.style.gap = "8px";
	userWrap.style.backgroundColor = "var(--bg-secondary)";
	userWrap.style.border = "1px solid var(--border-primary)";
	userWrap.style.borderRadius = "10px";
	userWrap.style.padding = "10px 12px";
	const at = document.createElement("span");
	at.setAttribute("inert", "");
	at.textContent = "@";
	at.style.color = "var(--text-secondary)";
	at.style.fontWeight = "600";
	const input = document.createElement("input");
	input.type = "text";
	input.id = "newUsername";
	input.placeholder = "new username";
	input.required = true;
	input.style.flex = "1";
	input.style.backgroundColor = "transparent";
	input.style.border = "none";
	input.style.outline = "none";
	input.style.color = "var(--text-primary)";
	userWrap.appendChild(at);
	userWrap.appendChild(input);
	const small = document.createElement("small");
	small.textContent =
		"Username must be 3-20 characters and contain only letters, numbers, and underscores.";
	small.style.color = "var(--text-secondary)";
	small.style.fontSize = "12px";
	fg.appendChild(label);
	fg.appendChild(userWrap);
	fg.appendChild(small);

	const actions = document.createElement("div");
	actions.className = "form-actions";
	actions.style.display = "flex";
	actions.style.justifyContent = "flex-end";
	actions.style.alignItems = "center";
	actions.style.gap = "10px";
	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelUsernameChange";
	cancel.textContent = "Cancel";
	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn primary";
	submit.textContent = "Change Username";
	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fg);
	form.appendChild(actions);
	body.appendChild(form);

	modal.appendChild(header);
	modal.appendChild(body);
	overlay.appendChild(modal);
	return overlay;
};

const createDeleteAccountModal = () => {
	const overlay = document.createElement("div");
	overlay.id = "deleteAccountModal";
	overlay.className = "settings-modal-overlay";
	overlay.style.display = "none";
	overlay.style.position = "fixed";
	overlay.style.top = "0";
	overlay.style.left = "0";
	overlay.style.right = "0";
	overlay.style.bottom = "0";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.backgroundColor = "rgba(15, 20, 25, 0.6)";
	overlay.style.zIndex = "1200";

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "deleteAccountHeading");
	modal.style.backgroundColor = "var(--bg-primary)";
	modal.style.borderRadius = "16px";
	modal.style.width = "min(480px, 90vw)";
	modal.style.maxHeight = "85vh";
	modal.style.boxShadow = "0 18px 48px rgba(0, 0, 0, 0.35)";
	modal.style.display = "flex";
	modal.style.flexDirection = "column";
	modal.style.overflow = "hidden";
	modal.style.margin = "0 auto";
	modal.style.alignSelf = "center";

	const header = document.createElement("div");
	header.className = "modal-header";
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.justifyContent = "space-between";
	header.style.padding = "16px 20px";
	header.style.borderBottom = "1px solid var(--border-primary)";
	const h2 = document.createElement("h2");
	h2.id = "deleteAccountHeading";
	h2.textContent = "Delete Account";
	h2.style.margin = "0";
	h2.style.fontSize = "20px";
	h2.style.fontWeight = "600";
	h2.style.color = "var(--text-primary)";
	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closeDeleteModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close delete account dialog");
	close.textContent = "×";
	close.style.backgroundColor = "transparent";
	close.style.border = "none";
	close.style.color = "var(--text-secondary)";
	close.style.cursor = "pointer";
	close.style.fontSize = "24px";
	close.style.lineHeight = "1";
	close.style.width = "32px";
	close.style.height = "32px";
	close.style.borderRadius = "50%";
	close.style.display = "flex";
	close.style.alignItems = "center";
	close.style.justifyContent = "center";
	close.style.transition = "background-color 0.2s ease, color 0.2s ease";
	close.addEventListener("pointerenter", () => {
		close.style.backgroundColor = "var(--bg-secondary)";
		close.style.color = "var(--text-primary)";
	});
	close.addEventListener("pointerleave", () => {
		close.style.backgroundColor = "transparent";
		close.style.color = "var(--text-secondary)";
	});
	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";
	body.style.padding = "20px";
	body.style.overflowY = "auto";
	body.style.color = "var(--text-primary)";
	const warning = document.createElement("p");
	warning.innerHTML =
		"<strong>Warning:</strong> This action cannot be undone. All your tweets, likes, follows, and account data will be permanently deleted.";
	warning.style.margin = "0 0 16px 0";
	warning.style.fontSize = "14px";
	warning.style.lineHeight = "1.5";
	const form = document.createElement("form");
	form.id = "deleteAccountForm";
	form.style.display = "flex";
	form.style.flexDirection = "column";
	form.style.gap = "16px";
	const fg = document.createElement("div");
	fg.className = "form-group";
	fg.style.display = "flex";
	fg.style.flexDirection = "column";
	fg.style.gap = "8px";
	const label = document.createElement("label");
	label.htmlFor = "deleteConfirmation";
	label.textContent = 'Type "DELETE MY ACCOUNT" to confirm:';
	label.style.fontSize = "14px";
	label.style.fontWeight = "500";
	label.style.color = "var(--text-primary)";
	const input = document.createElement("input");
	input.type = "text";
	input.id = "deleteConfirmation";
	input.placeholder = "DELETE MY ACCOUNT";
	input.required = true;
	input.style.padding = "10px 12px";
	input.style.borderRadius = "10px";
	input.style.border = "1px solid var(--border-primary)";
	input.style.backgroundColor = "var(--bg-secondary)";
	input.style.color = "var(--text-primary)";
	input.style.outline = "none";
	fg.appendChild(label);
	fg.appendChild(input);

	const actions = document.createElement("div");
	actions.className = "form-actions";
	actions.style.display = "flex";
	actions.style.justifyContent = "flex-end";
	actions.style.alignItems = "center";
	actions.style.gap = "10px";
	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelAccountDelete";
	cancel.textContent = "Cancel";
	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn danger";
	submit.textContent = "Delete Account";
	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fg);
	form.appendChild(actions);
	body.appendChild(warning);
	body.appendChild(form);

	modal.appendChild(header);
	modal.appendChild(body);
	overlay.appendChild(modal);
	return overlay;
};

const createChangePasswordModal = () => {
	const overlay = document.createElement("div");
	overlay.id = "changePasswordModal";
	overlay.className = "settings-modal-overlay";
	overlay.style.display = "none";
	overlay.style.position = "fixed";
	overlay.style.top = "0";
	overlay.style.left = "0";
	overlay.style.right = "0";
	overlay.style.bottom = "0";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.backgroundColor = "rgba(15, 20, 25, 0.6)";
	overlay.style.zIndex = "1200";

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "changePasswordHeading");
	modal.setAttribute("aria-describedby", "passwordModalDescription");
	modal.style.backgroundColor = "var(--bg-primary)";
	modal.style.borderRadius = "16px";
	modal.style.width = "min(480px, 90vw)";
	modal.style.maxHeight = "85vh";
	modal.style.boxShadow = "0 18px 48px rgba(0, 0, 0, 0.35)";
	modal.style.display = "flex";
	modal.style.flexDirection = "column";
	modal.style.overflow = "hidden";
	modal.style.margin = "0 auto";
	modal.style.alignSelf = "center";

	const header = document.createElement("div");
	header.className = "modal-header";
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.justifyContent = "space-between";
	header.style.padding = "16px 20px";
	header.style.borderBottom = "1px solid var(--border-primary)";
	const h2 = document.createElement("h2");
	h2.id = "changePasswordHeading";
	h2.textContent = "Change Password";
	h2.style.margin = "0";
	h2.style.fontSize = "20px";
	h2.style.fontWeight = "600";
	h2.style.color = "var(--text-primary)";
	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closePasswordModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close change password dialog");
	close.textContent = "×";
	close.style.backgroundColor = "transparent";
	close.style.border = "none";
	close.style.color = "var(--text-secondary)";
	close.style.cursor = "pointer";
	close.style.fontSize = "24px";
	close.style.lineHeight = "1";
	close.style.width = "32px";
	close.style.height = "32px";
	close.style.borderRadius = "50%";
	close.style.display = "flex";
	close.style.alignItems = "center";
	close.style.justifyContent = "center";
	close.style.transition = "background-color 0.2s ease, color 0.2s ease";
	close.addEventListener("pointerenter", () => {
		close.style.backgroundColor = "var(--bg-secondary)";
		close.style.color = "var(--text-primary)";
	});
	close.addEventListener("pointerleave", () => {
		close.style.backgroundColor = "transparent";
		close.style.color = "var(--text-secondary)";
	});
	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";
	body.style.padding = "20px";
	body.style.overflowY = "auto";
	body.style.color = "var(--text-primary)";
	const description = document.createElement("p");
	description.id = "passwordModalDescription";
	description.textContent =
		"Set a password for your account to enable traditional username/password login.";
	description.style.margin = "0 0 16px 0";
	description.style.fontSize = "14px";
	description.style.lineHeight = "1.5";
	const form = document.createElement("form");
	form.id = "changePasswordForm";
	form.style.display = "flex";
	form.style.flexDirection = "column";
	form.style.gap = "16px";
	const fgCur = document.createElement("div");
	fgCur.className = "form-group";
	fgCur.id = "currentPasswordGroup";
	fgCur.style.display = "none";
	fgCur.style.flexDirection = "column";
	fgCur.style.gap = "8px";
	const labelCur = document.createElement("label");
	labelCur.htmlFor = "current-password";
	labelCur.textContent = "Current Password";
	labelCur.style.fontSize = "14px";
	labelCur.style.fontWeight = "500";
	labelCur.style.color = "var(--text-primary)";
	const inputCur = document.createElement("input");
	inputCur.type = "password";
	inputCur.id = "current-password";
	inputCur.placeholder = "enter your current password";
	inputCur.required = true;
	inputCur.style.padding = "10px 12px";
	inputCur.style.borderRadius = "10px";
	inputCur.style.border = "1px solid var(--border-primary)";
	inputCur.style.backgroundColor = "var(--bg-secondary)";
	inputCur.style.color = "var(--text-primary)";
	inputCur.style.outline = "none";
	fgCur.appendChild(labelCur);
	fgCur.appendChild(inputCur);

	const fgNew = document.createElement("div");
	fgNew.className = "form-group";
	fgNew.style.display = "flex";
	fgNew.style.flexDirection = "column";
	fgNew.style.gap = "8px";
	const labelNew = document.createElement("label");
	labelNew.htmlFor = "new-password";
	labelNew.textContent = "New Password";
	labelNew.style.fontSize = "14px";
	labelNew.style.fontWeight = "500";
	labelNew.style.color = "var(--text-primary)";
	const inputNew = document.createElement("input");
	inputNew.type = "password";
	inputNew.id = "new-password";
	inputNew.placeholder = "enter your new password";
	inputNew.minLength = 8;
	inputNew.required = true;
	inputNew.style.padding = "10px 12px";
	inputNew.style.borderRadius = "10px";
	inputNew.style.border = "1px solid var(--border-primary)";
	inputNew.style.backgroundColor = "var(--bg-secondary)";
	inputNew.style.color = "var(--text-primary)";
	inputNew.style.outline = "none";
	const hint = document.createElement("small");
	hint.textContent = "Password must be at least 8 characters long.";
	hint.style.color = "var(--text-secondary)";
	hint.style.fontSize = "12px";
	fgNew.appendChild(labelNew);
	fgNew.appendChild(inputNew);
	fgNew.appendChild(hint);

	const actions = document.createElement("div");
	actions.className = "form-actions";
	actions.style.display = "flex";
	actions.style.justifyContent = "flex-end";
	actions.style.alignItems = "center";
	actions.style.gap = "10px";
	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelPasswordChange";
	cancel.textContent = "Cancel";
	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn primary";
	submit.id = "changePasswordSubmit";
	submit.textContent = "Set Password";
	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fgCur);
	form.appendChild(fgNew);
	form.appendChild(actions);
	body.appendChild(description);
	body.appendChild(form);

	modal.appendChild(header);
	modal.appendChild(body);
	overlay.appendChild(modal);
	return overlay;
};

const ensureAccountModals = () => {
	const body = document.body;
	if (!body) return;

	if (!document.getElementById("changeUsernameModal")) {
		body.appendChild(createChangeUsernameModal());
	}

	if (!document.getElementById("changePasswordModal")) {
		body.appendChild(createChangePasswordModal());
	}

	if (!document.getElementById("deleteAccountModal")) {
		body.appendChild(createDeleteAccountModal());
	}
};

const createSettingsPage = () => {
	const settingsContainer = document.createElement("div");
	settingsContainer.className = "settings";
	settingsContainer.style.display = "none";

	const header = document.createElement("div");
	header.className = "settings-header";
	const back = document.createElement("a");
	back.href = "/";
	back.className = "back-button";
	const svgNS = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNS, "svg");
	svg.setAttribute("xmlns", svgNS);
	svg.setAttribute("width", "24");
	svg.setAttribute("height", "24");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2.25");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	const path1 = document.createElementNS(svgNS, "path");
	path1.setAttribute("d", "m12 19-7-7 7-7");
	const path2 = document.createElementNS(svgNS, "path");
	path2.setAttribute("d", "M19 12H5");
	svg.appendChild(path1);
	svg.appendChild(path2);
	back.appendChild(svg);
	const headerInfo = document.createElement("div");
	headerInfo.className = "settings-header-info";
	const h1 = document.createElement("h1");
	h1.textContent = "Settings";
	headerInfo.appendChild(h1);
	header.appendChild(back);
	header.appendChild(headerInfo);

	const body = document.createElement("div");
	body.className = "settings-body";
	const sidebar = document.createElement("div");
	sidebar.className = "settings-sidebar";
	settingsPages.forEach((page) => {
		const b = document.createElement("button");
		b.className = `settings-tab-btn${page.key === "account" ? " active" : ""}`;
		b.dataset.tab = page.key;
		b.textContent = page.title;
		sidebar.appendChild(b);
	});
	const content = document.createElement("div");
	content.className = "settings-content";
	content.id = "settings-content";
	body.appendChild(sidebar);
	body.appendChild(content);

	settingsContainer.appendChild(header);
	settingsContainer.appendChild(body);

	document.querySelector(".main-content").appendChild(settingsContainer);
	return settingsContainer;
};

let settingsPage;
let settingsInitialized = false;
let eventHandlersSetup = false;

const initializeSettings = () => {
	if (settingsInitialized) return;
	settingsInitialized = true;

	const contentArea = settingsPage.querySelector("#settings-content");
	const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");

	const switchTab = (tabKey) => {
		const page = settingsPages.find((p) => p.key === tabKey);
		if (!page) {
			window.history.replaceState(null, null, "/settings/account");
			openSettings("account");
			return;
		}

		tabButtons.forEach((btn) => {
			if (btn.dataset.tab === tabKey) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});

		contentArea.textContent = "";
		const node = page.content();
		contentArea.appendChild(node);
		enhanceSettingsSection(node);

		const newPath = `/settings/${tabKey}`;
		if (window.location.pathname !== newPath) {
			window.history.replaceState(null, null, newPath);
		}

		if (tabKey === "themes") {
			setTimeout(() => {
				loadCurrentThemeMode();
			}, 50);
		}

		if (tabKey === "account") {
			setTimeout(() => {
				loadPrivacySettings();
			}, 50);
		}
	};

	tabButtons.forEach((btn) => {
		btn.addEventListener("click", () => {
			switchTab(btn.dataset.tab);
		});
	});

	const backButton = settingsPage.querySelector(".back-button");
	backButton.addEventListener("click", (e) => {
		e.preventDefault();
		window.location.href = "/";
	});

	if (!eventHandlersSetup) {
		eventHandlersSetup = true;
		setupSettingsEventHandlers();
	}
};

const setupSettingsEventHandlers = async () => {
	// Ensure we have the latest user data so toggles/modals reflect server state.
	ensureAccountModals();

	const user = await ensureCurrentUser();
	if (user?.theme) {
		localStorage.setItem("theme", user.theme);
		handleThemeModeChange(user.theme);
	}

	document.addEventListener("click", async (event) => {
		const target = event.target;

		if (target.closest("#changeUsernameBtn")) {
			event.preventDefault();
			await openChangeUsernameModal();
			return;
		}

		if (target.closest("#addPasskeyBtn")) {
			event.preventDefault();
			event.stopPropagation();
			await handleAddPasskey();
			return;
		}

		if (target.closest("#open-card-composer-btn")) {
			event.preventDefault();
			openCardComposer();
		}

		if (target.closest("#changePasswordBtn")) {
			event.preventDefault();
			await openChangePasswordModal();
			return;
		}

		if (target.closest("#deleteAccountBtn")) {
			event.preventDefault();
			await openDeleteAccountModal();
			return;
		}

		if (
			target.classList?.contains("close-btn") ||
			target.id?.includes("cancel") ||
			target.id?.includes("close")
		) {
			const overlay =
				target.closest(".settings-modal-overlay") || target.closest(".modal");
			if (overlay) hideModal(overlay);
		}
	});

	document.addEventListener("submit", (event) => {
		const form = event.target;

		if (form.id === "changeUsernameForm") {
			event.preventDefault();
			handleUsernameChange();
		}

		if (form.id === "changePasswordForm") {
			event.preventDefault();
			handlePasswordChange();
		}

		if (form.id === "deleteAccountForm") {
			event.preventDefault();
			handleAccountDeletion();
		}
	});

	document.addEventListener("input", (event) => {
		if (event.target.id === "newUsername") {
			event.target.value = event.target.value
				.toLowerCase()
				.replace(/[^a-z0-9_]/g, "");
		}
		if (event.target.classList?.contains("theme-mode-select")) {
			handleThemeModeChange(event.target.value);
		}
	});

	document.addEventListener("click", (event) => {
		if (event.target.classList?.contains("settings-modal-overlay")) {
			hideModal(event.target);
		}
	});

	loadCurrentThemeMode();
};

const saveThemeToServer = async () => {
	const user = await ensureCurrentUser();
	if (!user) {
		toastQueue.add(
			`<h1>Not Signed In</h1><p>Please sign in to save theme settings</p>`,
		);
		return;
	}

	const select = document.querySelector("#themeDropdown");
	const theme = select ? select.value : "auto";

	try {
		const data = await query(`/profile/${user.username}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ theme }),
		});

		if (data.error) {
			toastQueue.add(`<h1>Save Failed</h1><p>${data.error}</p>`);
			return;
		}

		if (data.success) {
			currentUser = {
				...user,
				theme,
			};
			handleThemeModeChange(theme);
			toastQueue.add(
				`<h1>Saved</h1><p>Your theme is now saved to your account</p>`,
			);
		}
	} catch {
		toastQueue.add(`<h1>Save Failed</h1><p>Unable to contact server</p>`);
	}
};

const handleThemeModeChange = (theme) => {
	const root = document.documentElement;
	const select = document.querySelector("#themeDropdown");
	if (select) select.value = theme;
	if (theme === "auto") {
		localStorage.removeItem("theme");
		const systemDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		if (systemDark) {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}
	} else if (theme === "dark") {
		root.classList.add("dark");
		localStorage.setItem("theme", "dark");
	} else {
		root.classList.remove("dark");
		localStorage.setItem("theme", "light");
	}
};

const loadCurrentThemeMode = () => {
	let currentTheme = "auto";

	if (currentUser?.theme) {
		currentTheme = currentUser.theme;
	} else {
		const savedTheme = localStorage.getItem("theme");
		if (savedTheme === "dark") currentTheme = "dark";
		else if (savedTheme === "light") currentTheme = "light";
	}

	const select = document.querySelector("#themeDropdown");
	if (select) select.value = currentTheme;
};

const loadPrivacySettings = async () => {
	const checkbox = document.getElementById("private-account-toggle");
	if (!checkbox) return;

	try {
		const user = await ensureCurrentUser();
		const serverEnabled = !!user?.private;
		checkbox.checked = serverEnabled;
		checkbox.defaultChecked = serverEnabled;
		checkbox.dataset.serverState = serverEnabled ? "on" : "off";
		checkbox.setAttribute("aria-checked", serverEnabled ? "true" : "false");
		checkbox.disabled = !user;
	} catch (error) {
		console.error("Failed to load privacy setting:", error);
		checkbox.checked = false;
		checkbox.defaultChecked = false;
		checkbox.dataset.serverState = "off";
		checkbox.setAttribute("aria-checked", "false");
		checkbox.disabled = true;
	}

	checkbox.addEventListener("change", async (e) => {
		const enabled = e.target.checked;
		try {
			const result = await query("/profile/settings/private", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ enabled }),
			});

			if (result.success) {
				checkbox.dataset.serverState = enabled ? "on" : "off";
				checkbox.setAttribute("aria-checked", enabled ? "true" : "false");
				currentUser = {
					...(currentUser || {}),
					private: enabled,
				};
				toastQueue.add(
					`<h1>Privacy ${enabled ? "Enabled" : "Disabled"}</h1><p>${
						enabled
							? "Your account is now private. Only approved followers can see your posts."
							: "Your account is now public. Anyone can see your posts."
					}</p>`,
				);
			} else {
				e.target.checked = !enabled;
				checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
				toastQueue.add(`<h1>Failed to update setting</h1>`);
			}
		} catch {
			e.target.checked = !enabled;
			checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
			toastQueue.add(`<h1>Failed to update setting</h1>`);
		}
	});
};

const showModal = (element) => {
	if (!element) return;
	const overlay = element.classList?.contains("settings-modal-overlay")
		? element
		: element.closest?.(".settings-modal-overlay") || element;
	if (!overlay) return;

	overlay.style.display = "flex";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.flexDirection = "column";
	overlay.style.width = "100%";
	overlay.style.height = "100%";
	overlay.style.minWidth = "100vw";
	overlay.style.minHeight = "100vh";
	overlay.style.padding = "0";
	overlay.style.boxSizing = "border-box";
	overlay.style.overflowY = "auto";
	overlay.scrollTop = 0;

	const modal = overlay.querySelector?.(".settings-form-modal");
	if (modal) {
		modal.style.margin = "auto";
		modal.style.alignSelf = "center";
	}
};
const hideModal = (element) => {
	if (!element) return;
	const overlay = element.classList?.contains("settings-modal-overlay")
		? element
		: element.closest?.(".settings-modal-overlay") || element;
	if (!overlay) return;
	overlay.style.display = "none";
};

const handleAddPasskey = async () => {
	try {
		const user = await ensureCurrentUser();
		if (!user) {
			toastQueue.add(
				"<h1>Not Signed In</h1><p>Please sign in to add a passkey</p>",
			);
			return;
		}

		const options = await query("/auth/generate-registration-options", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username: user.username }),
		});

		if (options.error) {
			toastQueue.add(`<h1>Error</h1><p>${options.error}</p>`);
			return;
		}

		const { startRegistration } = window.SimpleWebAuthnBrowser;
		let attResp;
		try {
			attResp = await startRegistration({ optionsJSON: options.options });
		} catch {
			return;
		}

		const verificationJSON = await query("/auth/verify-registration", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				username: user.username,
				credential: attResp,
				challenge: options.challenge,
			}),
		});

		if (verificationJSON.error) {
			toastQueue.add(
				`<h1>Verification Failed</h1><p>${verificationJSON.error}</p>`,
			);
			return;
		}

		if (verificationJSON.verified) {
			toastQueue.add(`<h1>Success!</h1><p>Passkey added successfully</p>`);
			loadPasskeys();
		}
	} catch (error) {
		console.error("Failed to add passkey:", error);
		toastQueue.add(`<h1>Error</h1><p>Failed to add passkey</p>`);
	}
};

const handleUsernameChange = async () => {
	const user = await ensureCurrentUser();
	if (!user) {
		toastQueue.add(
			`<h1>Not Signed In</h1><p>Please sign in to change your username</p>`,
		);
		return;
	}

	const usernameField = document.getElementById("newUsername");
	if (!usernameField) {
		toastQueue.add(`<h1>Error</h1><p>Username field not found</p>`);
		return;
	}
	const newUsername = usernameField.value.trim();

	if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
		toastQueue.add(
			`<h1>Invalid Username</h1><p>Username must be between 3 and 20 characters</p>`,
		);
		return;
	}

	if (newUsername === user.username) {
		toastQueue.add(
			`<h1>No Change</h1><p>Please enter a different username</p>`,
		);
		return;
	}

	try {
		const data = await query(`/profile/${user.username}/username`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ newUsername }),
		});

		if (data.error) {
			toastQueue.add(`<h1>Username Change Failed</h1><p>${data.error}</p>`);
			return;
		}

		if (data.success) {
			currentUser = {
				...user,
				username: data.username,
			};

			if (data.token) {
				localStorage.setItem("authToken", data.token);
			}

			hideModal(document.getElementById("changeUsernameModal"));
			toastQueue.add(
				`<h1>Username Changed!</h1><p>Your username is now @${data.username}</p>`,
			);
		}
	} catch {
		toastQueue.add(
			`<h1>Username Change Failed</h1><p>Unable to connect to server</p>`,
		);
	}
};

const handlePasswordChange = async () => {
	const user = await ensureCurrentUser();
	if (!user) {
		toastQueue.add(
			`<h1>Not Signed In</h1><p>Please sign in to change your password</p>`,
		);
		return;
	}

	const hasPassword = !!user.has_password;
	const currentPassword = document.getElementById("current-password")?.value;
	const newPasswordField = document.getElementById("new-password");
	if (!newPasswordField) {
		toastQueue.add(`<h1>Error</h1><p>Password field not found</p>`);
		return;
	}
	const newPassword = newPasswordField.value;

	if (!newPassword || newPassword.length < 8) {
		toastQueue.add(
			`<h1>Invalid Password</h1><p>Password must be at least 8 characters long</p>`,
		);
		return;
	}

	if (hasPassword && !currentPassword) {
		toastQueue.add(
			`<h1>Current Password Required</h1><p>Please enter your current password</p>`,
		);
		return;
	}

	try {
		const data = await query(`/profile/${user.username}/password`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				currentPassword: hasPassword ? currentPassword : undefined,
				newPassword,
			}),
		});

		if (data.error) {
			toastQueue.add(`<h1>Password Change Failed</h1><p>${data.error}</p>`);
			return;
		}

		if (data.success) {
			currentUser = {
				...user,
				has_password: true,
			};
			hideModal(document.getElementById("changePasswordModal"));
			toastQueue.add(
				`<h1>Password ${
					hasPassword ? "Changed" : "Set"
				}!</h1><p>Your password has been ${
					hasPassword ? "updated" : "set"
				} successfully</p>`,
			);
		}
	} catch {
		toastQueue.add(
			`<h1>Password Change Failed</h1><p>Unable to connect to server</p>`,
		);
	}
};

const handleAccountDeletion = async () => {
	const user = await ensureCurrentUser();
	if (!user) {
		toastQueue.add(
			`<h1>Not Signed In</h1><p>Please sign in to delete your account</p>`,
		);
		return;
	}

	const confirmationField = document.getElementById("deleteConfirmation");
	if (!confirmationField) {
		toastQueue.add(`<h1>Error</h1><p>Confirmation field not found</p>`);
		return;
	}
	const confirmationText = confirmationField.value;

	if (confirmationText !== "DELETE MY ACCOUNT") {
		toastQueue.add(
			`<h1>Confirmation Required</h1><p>Please type "DELETE MY ACCOUNT" exactly as shown</p>`,
		);
		return;
	}

	try {
		const data = await query(`/profile/${user.username}`, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ confirmationText }),
		});

		if (data.error) {
			toastQueue.add(`<h1>Account Deletion Failed</h1><p>${data.error}</p>`);
			return;
		}

		if (data.success) {
			hideModal(document.getElementById("deleteAccountModal"));
			toastQueue.add(
				`<h1>Account Deleted</h1><p>Your account has been permanently deleted</p>`,
			);

			setTimeout(() => {
				localStorage.removeItem("authToken");
				window.location.href = "/";
			}, 2000);
		}
	} catch {
		toastQueue.add(
			`<h1>Account Deletion Failed</h1><p>Unable to connect to server</p>`,
		);
	}
};

export const openSettings = (section = "account") => {
	if (!settingsPage) {
		settingsPage = createSettingsPage();
	}

	Object.values(
		document.querySelectorAll(
			".timeline, .tweetPage, .profile, .notifications, .search-page, .bookmarks-page, .direct-messages, .dm-conversation",
		),
	).forEach((p) => {
		if (p) {
			p.style.display = "none";
			p.classList.remove("page-active");
		}
	});

	settingsPage.style.display = "flex";
	settingsPage.classList.add("page-active");

	if (!settingsInitialized) {
		initializeSettings();
	}

	const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");
	const contentArea = settingsPage.querySelector("#settings-content");
	const page = settingsPages.find((p) => p.key === section);

	if (page) {
		tabButtons.forEach((btn) => {
			if (btn.dataset.tab === section) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});

		contentArea.textContent = "";
		const node = page.content();
		contentArea.appendChild(node);
		enhanceSettingsSection(node);

		if (section === "themes") {
			setTimeout(() => {
				loadCurrentThemeMode();
			}, 50);
		}
	}

	return settingsPage;
};

export const openCardComposer = async () => {
	const { createComposer } = await import("./composer.js");
	const { createModal } = await import("../../shared/ui-utils.js");

	const composerEl = await createComposer({
		callback: () => {
			toastQueue.add(
				`<h1>Card Posted!</h1><p>Your interactive card has been posted</p>`,
			);
			if (modal?.close) {
				modal.close();
			}
		},
		placeholder: "Create an interactive card...",
		autofocus: true,
		cardOnly: true,
	});

	const modal = createModal({
		title: "Card Composer",
		content: composerEl,
		className: "card-composer-modal",
		onClose: () => {},
	});

	return modal;
};

export const openSettingsModal = (section = "account") => {
	const modalContent = document.createElement("div");
	modalContent.className = "settings-modal-wrapper";

	const sidebar = document.createElement("div");
	sidebar.className = "settings-modal-sidebar";

	settingsPages.forEach((page) => {
		const btn = document.createElement("button");
		btn.className = `settings-modal-tab${
			page.key === section ? " active" : ""
		}`;
		btn.dataset.tab = page.key;
		btn.textContent = page.title;
		sidebar.appendChild(btn);
	});

	const contentWrapper = document.createElement("div");
	contentWrapper.className = "settings-modal-content-wrapper";

	const contentArea = document.createElement("div");
	contentArea.id = "settings-modal-content";
	contentWrapper.appendChild(contentArea);

	modalContent.appendChild(sidebar);
	modalContent.appendChild(contentWrapper);

	const modal = createModal({
		title: "Settings",
		content: modalContent,
		className: "settings-modal",
		onClose: () => {},
	});

	if (!eventHandlersSetup) {
		eventHandlersSetup = true;
		setupSettingsEventHandlers();
	}

	const switchTab = (tabKey) => {
		const page = settingsPages.find((p) => p.key === tabKey);
		if (!page) return;

		sidebar.querySelectorAll(".settings-modal-tab").forEach((btn) => {
			if (btn.dataset.tab === tabKey) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});

		contentArea.textContent = "";
		const node = page.content();
		contentArea.appendChild(node);
		enhanceSettingsSection(node);

		if (tabKey === "themes") {
			setTimeout(() => {
				loadCurrentThemeMode();
			}, 50);
		}
	};

	sidebar.querySelectorAll(".settings-modal-tab").forEach((btn) => {
		btn.addEventListener("click", () => {
			switchTab(btn.dataset.tab);
		});
	});

	switchTab(section);

	return modal;
};
