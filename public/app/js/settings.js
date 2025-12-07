import toastQueue from "../../shared/toasts.js";
import { createConfirmModal, createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";

let currentUser = null;
let currentUserPromise = null;
let _spamIndicators = [];

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
		key: "notifications",
		title: "Notifications",
		content: () => createNotificationsContent(),
	},
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
	{
		key: "blocked-causes",
		title: "Blocked causes",
		content: () => createBlockedCausesContent(),
	},
];

const createBlockedCausesContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Blocked causes";
	section.appendChild(h1);

	const description = document.createElement("p");
	description.className = "settings-description";
	description.textContent =
		"These are the tweets that have most frequently led to you being blocked.";
	section.appendChild(description);

	const container = document.createElement("div");
	container.id = "blockedCausesContainer";
	container.className = "blocked-causes-container";
	section.appendChild(container);

	(async () => {
		try {
			const data = await query("/blocking/causes");
			if (data.causes && data.causes.length > 0) {
				data.causes.forEach((cause) => {
					const item = document.createElement("div");
					item.className = "blocked-cause-item";
					item.onclick = async () => {
						const { default: openTweet } = await import("./tweet.js");
						openTweet({ id: cause.source_tweet_id });
					};

					const header = document.createElement("div");
					header.className = "blocked-cause-header";

					const countSpan = document.createElement("span");
					countSpan.className = "blocked-cause-count";
					countSpan.textContent = `${cause.count} block${cause.count !== 1 ? "s" : ""}`;

					const dateSpan = document.createElement("span");
					if (cause.created_at) {
						dateSpan.textContent = new Date(
							cause.created_at,
						).toLocaleDateString();
					}

					header.appendChild(countSpan);
					header.appendChild(dateSpan);

					const content = document.createElement("div");
					content.className = "blocked-cause-content";
					content.textContent = cause.content || "Tweet unavailable";

					item.appendChild(header);
					item.appendChild(content);
					container.appendChild(item);
				});
			} else {
				const empty = document.createElement("div");
				empty.className = "blocked-causes-empty";
				const emptyP1 = document.createElement("p");
				emptyP1.textContent = "No data available yet.";
				const emptyP2 = document.createElement("p");
				emptyP2.className = "blocked-causes-empty-hint";
				emptyP2.textContent = "Tweets that lead to blocks will appear here.";
				empty.appendChild(emptyP1);
				empty.appendChild(emptyP2);
				container.appendChild(empty);
			}
		} catch (err) {
			console.error(err);
			const errorDiv = document.createElement("div");
			errorDiv.className = "blocked-causes-error";
			errorDiv.textContent = "Failed to load data.";
			container.appendChild(errorDiv);
		}
	})();

	return section;
};

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
	themeTitle.textContent = "Theme mode";
	const themeDesc = document.createElement("div");
	themeDesc.className = "setting-description";
	themeDesc.textContent = "Choose light or dark mode";
	themeLabel.appendChild(themeTitle);
	themeLabel.appendChild(themeDesc);

	const themeControl = document.createElement("div");
	themeControl.className = "setting-control";

	const select = document.createElement("select");
	select.id = "themeDropdown";
	select.className = "settings-select";

	["light", "dark", "auto"].forEach((v) => {
		const option = document.createElement("option");
		option.value = v;
		option.textContent = v.charAt(0).toUpperCase() + v.slice(1);
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
	saveBtn.textContent = "Save to account";
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
	h1.textContent = "Account settings";
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
	privateTitle.textContent = "Private account";
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

	const transparencyItem = document.createElement("div");
	transparencyItem.className = "setting-item";

	const transparencyLabel = document.createElement("div");
	transparencyLabel.className = "setting-label";
	const transparencyTitle = document.createElement("div");
	transparencyTitle.className = "setting-title";
	transparencyTitle.textContent = "Transparency location display";
	const transparencyDesc = document.createElement("div");
	transparencyDesc.className = "setting-description";
	transparencyDesc.textContent =
		"Choose how much location detail to show in your transparency data";
	transparencyLabel.appendChild(transparencyTitle);
	transparencyLabel.appendChild(transparencyDesc);

	const transparencyControl = document.createElement("div");
	transparencyControl.className = "setting-control";

	const transparencySelect = document.createElement("select");
	transparencySelect.id = "transparency-location-select";
	transparencySelect.className = "settings-select";

	[
		{ v: "full", t: "Full Location (City, Country)" },
		{ v: "country", t: "Country Only" },
		{ v: "continent", t: "Continent Only" },
	].forEach(({ v, t }) => {
		const option = document.createElement("option");
		option.value = v;
		option.textContent = t;
		transparencySelect.appendChild(option);
	});

	setTimeout(async () => {
		const user = await ensureCurrentUser();
		if (user && transparencySelect) {
			transparencySelect.value = user.transparency_location_display || "full";
		}
	}, 0);

	transparencySelect.addEventListener("change", async (e) => {
		const display = e.target.value;

		try {
			const result = await query("/profile/settings/transparency-location", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ display }),
			});

			if (result.success) {
				if (currentUser) {
					currentUser.transparency_location_display = display;
				}
			} else {
				toastQueue.add(
					`<h1>Failed to update setting</h1><p>${result.error || "Unknown error"}</p>`,
				);
			}
		} catch (error) {
			console.error("Failed to update transparency location:", error);
			toastQueue.add(`<h1>Failed to update setting</h1>`);
		}
	});

	transparencyControl.appendChild(transparencySelect);
	transparencyItem.appendChild(transparencyLabel);
	transparencyItem.appendChild(transparencyControl);
	privacyGroup.appendChild(transparencyItem);

	section.appendChild(privacyGroup);

	// Community Tag Group
	const communityTagGroup = document.createElement("div");
	communityTagGroup.className = "setting-group";
	const communityTagH2 = document.createElement("h2");
	communityTagH2.textContent = "Community tag";
	communityTagGroup.appendChild(communityTagH2);

	const communityTagItem = document.createElement("div");
	communityTagItem.className = "setting-item";

	const communityTagLabel = document.createElement("div");
	communityTagLabel.className = "setting-label";
	const communityTagTitle = document.createElement("div");
	communityTagTitle.className = "setting-title";
	communityTagTitle.textContent = "Display community tag";
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
	select.className = "settings-select";

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
	btnUser.textContent = "Change username";
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
	btnPass.textContent = "Change password";
	control2.appendChild(btnPass);
	item2.appendChild(label2);
	item2.appendChild(control2);
	group.appendChild(item2);

	section.appendChild(group);

	const algoGroup = document.createElement("div");
	algoGroup.className = "setting-group";
	const algoH2 = document.createElement("h2");
	algoH2.textContent = "Algorithm transparency";
	algoGroup.appendChild(algoH2);

	const algoItem = document.createElement("div");
	algoItem.className = "setting-item algo-transparency-item";

	const algoStatsContainer = document.createElement("div");
	algoStatsContainer.id = "settingsAlgorithmStats";
	algoStatsContainer.className = "algo-stats-container";
	algoStatsContainer.innerHTML = `
		<div class="algo-stats-loading">
			<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
				<style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style>
				<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path>
				<path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="currentColor"></path>
			</svg>
		</div>
	`;

	algoItem.appendChild(algoStatsContainer);
	algoGroup.appendChild(algoItem);
	section.appendChild(algoGroup);

	setTimeout(async () => {
		const user = await ensureCurrentUser();
		if (user) {
			try {
				const algoData = await query(
					`/profile/${user.username}/algorithm-stats`,
				);
				if (!algoData.error) {
					const impact = algoData.algorithm_impact;
					const ratingClass =
						impact.rating === "Excellent"
							? "rating-excellent"
							: impact.rating === "Good"
								? "rating-good"
								: impact.rating === "Average"
									? "rating-average"
									: impact.rating === "Below Average"
										? "rating-below-average"
										: impact.rating === "Poor"
											? "rating-poor"
											: "rating-bad";

					algoStatsContainer.innerHTML = "";
					algoStatsContainer.className =
						"algo-stats-container algo-stats-loaded";

					const statsCard = document.createElement("div");
					statsCard.className = "algo-stats-card";

					const header = document.createElement("div");
					header.className = "algo-stats-header";
					header.innerHTML = `
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
						<span class="algo-stats-title">Impact</span>
						<span class="algo-stats-rating ${ratingClass}">${impact.rating}</span>
					`;
					statsCard.appendChild(header);

					const grid = document.createElement("div");
					grid.className = "algo-stats-grid";

					const blockedStat = document.createElement("div");
					blockedStat.className = "algo-stat";
					blockedStat.innerHTML = `
						<span class="algo-stat-label">Blocked by</span>
						<span class="algo-stat-value">${algoData.blocked_by_count} account${algoData.blocked_by_count !== 1 ? "s" : ""}</span>
					`;
					grid.appendChild(blockedStat);

					const mutedStat = document.createElement("div");
					mutedStat.className = "algo-stat";
					mutedStat.innerHTML = `
						<span class="algo-stat-label">Muted by</span>
						<span class="algo-stat-value">${algoData.muted_by_count} account${algoData.muted_by_count !== 1 ? "s" : ""}</span>
					`;
					grid.appendChild(mutedStat);

					const spamStat = document.createElement("div");
					spamStat.className = "algo-stat";
					const spamLabel = document.createElement("span");
					spamLabel.className = "algo-stat-label";
					spamLabel.textContent = "Spam score";
					const spamValueWrapper = document.createElement("div");
					spamValueWrapper.className = "algo-stat-value-wrapper";
					const spamValue = document.createElement("span");
					spamValue.className = "algo-stat-value";
					spamValue.textContent = `${(algoData.spam_score * 100).toFixed(1)}%`;
					const detailsBtn = document.createElement("button");
					detailsBtn.className = "algo-details-btn";
					detailsBtn.innerHTML = `
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
						Details
					`;
					detailsBtn.addEventListener("click", () =>
						showSpamScoreDetails(user.username),
					);
					spamValueWrapper.appendChild(spamValue);
					spamValueWrapper.appendChild(detailsBtn);
					spamStat.appendChild(spamLabel);
					spamStat.appendChild(spamValueWrapper);
					grid.appendChild(spamStat);

					const ageStat = document.createElement("div");
					ageStat.className = "algo-stat";
					ageStat.innerHTML = `
						<span class="algo-stat-label">Account age</span>
						<span class="algo-stat-value">${algoData.account_age_days} days</span>
					`;
					grid.appendChild(ageStat);

					const multiplierRow = document.createElement("div");
					multiplierRow.className = "algo-stat algo-stat-full";
					multiplierRow.innerHTML = `
						<span class="algo-stat-label">Overall multiplier</span>
						<span class="algo-stat-value">${impact.overall_multiplier}x</span>
					`;
					grid.appendChild(multiplierRow);

					statsCard.appendChild(grid);
					algoStatsContainer.appendChild(statsCard);
				} else {
					algoStatsContainer.innerHTML = "";
					const errorDiv = document.createElement("div");
					errorDiv.className = "algo-stats-error";
					errorDiv.textContent = "Failed to load algorithm stats";
					algoStatsContainer.appendChild(errorDiv);
				}
			} catch (error) {
				console.error("Failed to load algorithm stats:", error);
				algoStatsContainer.innerHTML = "";
				const errorDiv = document.createElement("div");
				errorDiv.className = "algo-stats-error";
				errorDiv.textContent = "Failed to load algorithm stats";
				algoStatsContainer.appendChild(errorDiv);
			}
		}
	}, 0);

	const danger = document.createElement("div");
	danger.className = "setting-group danger-group";
	const dh2 = document.createElement("h2");
	dh2.textContent = "Danger zone";
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
	btnDel.textContent = "Delete account";
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
		submit.textContent = hasPassword ? "Change password" : "Set password";
	}

	const currentPasswordGroup = document.getElementById("currentPasswordGroup");
	const currentPasswordInput = document.getElementById("current-password");
	if (currentPasswordGroup) {
		currentPasswordGroup.classList.toggle("hidden", !hasPassword);
	}
	if (currentPasswordInput) {
		currentPasswordInput.required = hasPassword;
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
	h1.textContent = "Passkey management";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Your passkeys";
	group.appendChild(h2);

	const description = document.createElement("p");
	description.className = "settings-description";
	description.textContent =
		"Passkeys allow you to sign in securely without a password. You can use your device's biometric authentication or security key.";
	group.appendChild(description);

	const addPasskeyItem = document.createElement("div");
	addPasskeyItem.className = "setting-item";
	const addPasskeyLabel = document.createElement("div");
	addPasskeyLabel.className = "setting-label";
	const addPasskeyTitle = document.createElement("div");
	addPasskeyTitle.className = "setting-title";
	addPasskeyTitle.textContent = "Add new passkey";
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
	addPasskeyBtn.textContent = "Add passkey";
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
	passkeyListTitle.textContent = "Registered passkeys";
	passkeyListGroup.appendChild(passkeyListTitle);

	const passkeyList = document.createElement("div");
	passkeyList.id = "passkeyListSettings";
	passkeyList.className = "passkey-list";
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
			const errorP = document.createElement("p");
			errorP.className = "passkey-empty";
			errorP.textContent = "Failed to load passkeys";
			passkeyList.innerHTML = "";
			passkeyList.appendChild(errorP);
			return;
		}

		if (!data.passkeys || data.passkeys.length === 0) {
			const emptyP = document.createElement("p");
			emptyP.className = "passkey-empty";
			emptyP.textContent = "No passkeys registered yet";
			passkeyList.innerHTML = "";
			passkeyList.appendChild(emptyP);
			return;
		}

		passkeyList.innerHTML = "";
		data.passkeys.forEach((passkey) => {
			const item = document.createElement("div");
			item.className = "passkey-item";

			const info = document.createElement("div");
			info.className = "passkey-info";

			const name = document.createElement("div");
			name.className = "passkey-name";
			name.textContent = passkey.name || "Unnamed Passkey";

			const createdAt = document.createElement("div");
			createdAt.className = "passkey-date";
			const date = passkey.createdAt ? new Date(passkey.createdAt) : new Date();
			createdAt.textContent = `Created: ${date.toLocaleDateString()}`;

			info.appendChild(name);
			info.appendChild(createdAt);

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "btn danger passkey-remove-btn";
			deleteBtn.textContent = "Remove";
			deleteBtn.onclick = () => deletePasskey(passkey.id);

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
	// Tr Neutral Cursor
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

const createNotificationsContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Notifications";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Push notifications";
	group.appendChild(h2);

	const pushItem = document.createElement("div");
	pushItem.className = "setting-item";

	const pushLabel = document.createElement("div");
	pushLabel.className = "setting-label";
	const pushTitle = document.createElement("div");
	pushTitle.className = "setting-title";
	pushTitle.textContent = "Enable push notifications";
	const pushDesc = document.createElement("div");
	pushDesc.className = "setting-description";
	pushDesc.textContent = "Receive notifications even when the app is closed";
	pushLabel.appendChild(pushTitle);
	pushLabel.appendChild(pushDesc);

	const pushControl = document.createElement("div");
	pushControl.className = "setting-control";

	const pushToggle = document.createElement("label");
	pushToggle.className = "toggle-switch";

	const pushCheckbox = document.createElement("input");
	pushCheckbox.type = "checkbox";
	pushCheckbox.id = "push-notifications-toggle";
	pushCheckbox.disabled = true;

	const pushSlider = document.createElement("span");
	pushSlider.className = "toggle-slider";

	pushToggle.appendChild(pushCheckbox);
	pushToggle.appendChild(pushSlider);
	pushControl.appendChild(pushToggle);

	pushItem.appendChild(pushLabel);
	pushItem.appendChild(pushControl);
	group.appendChild(pushItem);
	section.appendChild(group);

	const statusText = document.createElement("p");
	statusText.className = "settings-status-text";
	statusText.id = "push-status-text";
	statusText.textContent = "Checking push notification support...";
	section.appendChild(statusText);

	initPushNotifications(pushCheckbox, statusText);

	return section;
};

async function initPushNotifications(checkbox, statusText) {
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
		statusText.textContent =
			"Push notifications are not supported in this browser";
		return;
	}

	try {
		const vapidResponse = await query("/push/vapid-key");
		if (vapidResponse.error) {
			statusText.textContent =
				"Push notifications are not configured on this server";
			return;
		}

		const vapidPublicKey = vapidResponse.publicKey;

		let registration;
		try {
			registration = await navigator.serviceWorker.getRegistration("/");
			if (!registration) {
				registration = await navigator.serviceWorker.register("/sw.js", {
					scope: "/",
				});
			}
			await navigator.serviceWorker.ready;
		} catch (swErr) {
			console.error("Service worker registration failed:", swErr);
			statusText.textContent = "Failed to register service worker";
			return;
		}

		checkbox.disabled = false;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			checkbox.checked = true;
			statusText.textContent = "Push notifications are enabled";
		} else {
			checkbox.checked = false;
			statusText.textContent = "Push notifications are disabled";
		}

		checkbox.addEventListener("change", async () => {
			checkbox.disabled = true;

			if (checkbox.checked) {
				try {
					const permission = await Notification.requestPermission();
					if (permission !== "granted") {
						checkbox.checked = false;
						statusText.textContent = "Notification permission denied";
						checkbox.disabled = false;
						return;
					}

					const newSubscription = await registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
					});

					const subscriptionData = {
						subscription: {
							endpoint: newSubscription.endpoint,
							keys: {
								p256dh: arrayBufferToBase64(newSubscription.getKey("p256dh")),
								auth: arrayBufferToBase64(newSubscription.getKey("auth")),
							},
						},
					};
					const response = await query("/push/subscribe", {
						method: "POST",
						body: JSON.stringify(subscriptionData),
					});

					if (response.success) {
						statusText.textContent = "Push notifications are enabled";
					} else {
						await newSubscription.unsubscribe();
						checkbox.checked = false;
						statusText.textContent = "Failed to enable push notifications";
					}
				} catch (err) {
					console.error("Push subscription error:", err);
					checkbox.checked = false;
					statusText.textContent = "Failed to enable push notifications";
				}
			} else {
				try {
					const currentSubscription =
						await registration.pushManager.getSubscription();
					if (currentSubscription) {
						await query("/push/unsubscribe", {
							method: "POST",
							body: JSON.stringify({ endpoint: currentSubscription.endpoint }),
						});
						await currentSubscription.unsubscribe();
					}
					statusText.textContent = "Push notifications are disabled";
				} catch (err) {
					console.error("Push unsubscribe error:", err);
					checkbox.checked = true;
					statusText.textContent = "Failed to disable push notifications";
				}
			}

			checkbox.disabled = false;
		});
	} catch (err) {
		console.error("Push init error:", err);
		statusText.textContent = "Failed to initialize push notifications";
	}
}

function urlBase64ToUint8Array(base64String) {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i++) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

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
	cardComposerTitle.textContent = "Card composer";
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
	cardComposerBtn.textContent = "Open card composer";
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

	const cleanupGroup = document.createElement("div");
	cleanupGroup.className = "setting-group";

	const cleanupHeader = document.createElement("h2");
	cleanupHeader.textContent = "Post cleanup";
	cleanupGroup.appendChild(cleanupHeader);

	const cleanupCard = document.createElement("div");
	cleanupCard.className = "bulk-delete-card";
	cleanupGroup.appendChild(cleanupCard);

	const cleanupDescription = document.createElement("p");
	cleanupDescription.className = "bulk-delete-description";
	cleanupDescription.textContent =
		"Erase large batches of tweets and replies you created. This action cannot be undone.";
	cleanupCard.appendChild(cleanupDescription);

	const toLocalInputValue = (date) => {
		const local = new Date(
			date.getTime() - date.getTimezoneOffset() * 60 * 1000,
		);
		return local.toISOString().slice(0, 16);
	};

	const controlsGrid = document.createElement("div");
	controlsGrid.className = "bulk-delete-controls";
	cleanupCard.appendChild(controlsGrid);

	const fromControl = document.createElement("label");
	fromControl.className = "bulk-delete-control";

	const fromTitle = document.createElement("span");
	fromTitle.className = "bulk-delete-control-title";
	fromTitle.textContent = "Delete items created after (from)";
	fromControl.appendChild(fromTitle);

	const fromInput = document.createElement("input");
	fromInput.type = "datetime-local";
	// Default to 1 year ago
	fromInput.value = toLocalInputValue(
		new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
	);
	fromInput.max = toLocalInputValue(new Date());
	fromInput.setAttribute("aria-label", "Delete tweets created after (from)");
	fromControl.appendChild(fromInput);
	controlsGrid.appendChild(fromControl);

	const toControl = document.createElement("label");
	toControl.className = "bulk-delete-control";

	const toTitle = document.createElement("span");
	toTitle.className = "bulk-delete-control-title";
	toTitle.textContent = "Delete items created before (to)";
	toControl.appendChild(toTitle);

	const toInput = document.createElement("input");
	toInput.type = "datetime-local";
	toInput.value = toLocalInputValue(new Date());
	toInput.max = toLocalInputValue(new Date());
	toInput.setAttribute("aria-label", "Delete tweets created before (to)");
	toControl.appendChild(toInput);
	controlsGrid.appendChild(toControl);

	const limitControl = document.createElement("label");
	limitControl.className = "bulk-delete-control";

	const limitTitle = document.createElement("span");
	limitTitle.className = "bulk-delete-control-title";
	limitTitle.textContent = "Max posts per batch";
	limitControl.appendChild(limitTitle);

	const limitInput = document.createElement("input");
	limitInput.type = "number";
	limitInput.min = "1";
	limitInput.max = "500";
	limitInput.step = "10";
	limitInput.value = "100";
	limitInput.setAttribute("aria-label", "Maximum posts to delete per batch");
	limitControl.appendChild(limitInput);
	controlsGrid.appendChild(limitControl);

	const includeRepliesLabel = document.createElement("label");
	includeRepliesLabel.className = "bulk-delete-toggle";

	const includeRepliesCheckbox = document.createElement("input");
	includeRepliesCheckbox.type = "checkbox";
	includeRepliesCheckbox.checked = true;
	includeRepliesCheckbox.setAttribute(
		"aria-label",
		"Include replies in deletions",
	);
	includeRepliesLabel.appendChild(includeRepliesCheckbox);

	const includeRepliesCopy = document.createElement("div");
	includeRepliesCopy.className = "bulk-delete-toggle-copy";
	const includeRepliesTitle = document.createElement("strong");
	includeRepliesTitle.textContent = "Include replies";
	const includeRepliesDesc = document.createElement("span");
	includeRepliesDesc.textContent = "Also remove replies that meet the cutoff";
	includeRepliesCopy.appendChild(includeRepliesTitle);
	includeRepliesCopy.appendChild(includeRepliesDesc);
	includeRepliesLabel.appendChild(includeRepliesCopy);
	controlsGrid.appendChild(includeRepliesLabel);

	const keepPinnedLabel = document.createElement("label");
	keepPinnedLabel.className = "bulk-delete-toggle";

	const keepPinnedCheckbox = document.createElement("input");
	keepPinnedCheckbox.type = "checkbox";
	keepPinnedCheckbox.checked = true;
	keepPinnedCheckbox.setAttribute("aria-label", "Skip pinned tweets");
	keepPinnedLabel.appendChild(keepPinnedCheckbox);

	const keepPinnedCopy = document.createElement("div");
	keepPinnedCopy.className = "bulk-delete-toggle-copy";
	const keepPinnedTitle = document.createElement("strong");
	keepPinnedTitle.textContent = "Keep pinned tweets";
	const keepPinnedDesc = document.createElement("span");
	keepPinnedDesc.textContent = "Pinned tweets stay unless you turn this off";
	keepPinnedCopy.appendChild(keepPinnedTitle);
	keepPinnedCopy.appendChild(keepPinnedDesc);
	keepPinnedLabel.appendChild(keepPinnedCopy);
	controlsGrid.appendChild(keepPinnedLabel);

	const statusBox = document.createElement("div");
	statusBox.className = "bulk-delete-status";
	statusBox.dataset.variant = "muted";

	const statusTitle = document.createElement("strong");
	statusTitle.textContent = "No preview yet";
	const statusBody = document.createElement("p");
	statusBody.textContent =
		"Use preview to see how many posts match your filters before deleting.";
	statusBox.appendChild(statusTitle);
	statusBox.appendChild(statusBody);
	cleanupCard.appendChild(statusBox);

	const actionsRow = document.createElement("div");
	actionsRow.className = "bulk-delete-actions";
	cleanupCard.appendChild(actionsRow);

	const previewBtn = document.createElement("button");
	previewBtn.className = "btn secondary";
	previewBtn.textContent = "Preview selection";
	actionsRow.appendChild(previewBtn);

	const deleteBtn = document.createElement("button");
	deleteBtn.className = "btn danger";
	deleteBtn.textContent = "Delete matching posts";
	actionsRow.appendChild(deleteBtn);

	const warningText = document.createElement("p");
	warningText.className = "bulk-delete-warning";
	warningText.textContent =
		"Deleted tweets cannot be recovered. Run multiple times for large archives.";
	cleanupCard.appendChild(warningText);

	const setStatus = (title, body, variant = "muted") => {
		statusTitle.textContent = title;
		statusBody.textContent = body;
		statusBox.dataset.variant = variant;
	};

	const clampLimit = () => {
		const raw = Number(limitInput.value);
		const sanitized = Number.isFinite(raw)
			? Math.min(500, Math.max(1, Math.floor(raw)))
			: 100;
		limitInput.value = `${sanitized}`;
		return sanitized;
	};

	const normalizeRange = () => {
		const now = new Date();
		const rawFrom = fromInput.value ? new Date(fromInput.value) : new Date(0);
		const rawTo = toInput.value ? new Date(toInput.value) : now;
		const validFrom = Number.isNaN(rawFrom.getTime()) ? new Date(0) : rawFrom;
		const validTo = Number.isNaN(rawTo.getTime()) ? now : rawTo;
		// Clamp bounds
		const from = validFrom > now ? new Date(0) : validFrom;
		const to = validTo > now ? now : validTo;

		// Ensure from <= to
		if (from > to) {
			// set from to be same as to
			fromInput.value = toLocalInputValue(to);
			return { after: to, before: to };
		}

		fromInput.max = toLocalInputValue(to);
		toInput.max = toLocalInputValue(now);
		fromInput.value = toLocalInputValue(from);
		toInput.value = toLocalInputValue(to);
		return { after: from, before: to };
	};

	const collectPayload = () => {
		const range = normalizeRange();
		const limit = clampLimit();
		return {
			after: range.after.toISOString(),
			before: range.before.toISOString(),
			includeReplies: includeRepliesCheckbox.checked,
			keepPinned: keepPinnedCheckbox.checked,
			limit,
		};
	};

	const handlePreview = async () => {
		const payload = collectPayload();
		previewBtn.disabled = true;
		previewBtn.textContent = "Calculating...";
		setStatus("Preparing preview", "Counting matching posts...", "muted");
		try {
			const result = await query("/tweets/bulk-delete", {
				method: "POST",
				body: JSON.stringify({ ...payload, dryRun: true }),
			});
			if (result?.error) {
				setStatus("Preview failed", result.error, "warning");
				toastQueue.add(`<h1>Preview failed</h1><p>${result.error}</p>`);
				return;
			}
			const total = Number(result?.preview?.total) || 0;
			if (total === 0) {
				setStatus(
					"No posts matched",
					"Try widening the date range or lowering filters to find posts to remove.",
					"muted",
				);
				return;
			}
			const plural = total === 1 ? "post" : "posts";
			setStatus(
				`${total} ${plural} ready`,
				`Up to ${payload.limit} will be deleted each time you run cleanup.`,
				"success",
			);
		} catch (error) {
			console.error("Bulk delete preview error", error);
			setStatus("Preview failed", "Could not load preview.", "warning");
			toastQueue.add("<h1>Preview failed</h1><p>Something went wrong.</p>");
		} finally {
			previewBtn.disabled = false;
			previewBtn.textContent = "Preview selection";
		}
	};

	const handleDelete = async () => {
		const payload = collectPayload();
		const fromLabel = new Date(payload.after).toLocaleString();
		const toLabel = new Date(payload.before).toLocaleString();
		const scopeLabel = payload.includeReplies ? "tweets and replies" : "tweets";
		const confirmMessage = `Delete up to ${payload.limit} ${scopeLabel} posted between ${fromLabel} and ${toLabel}? This cannot be undone.`;
		if (!confirm(confirmMessage)) {
			return;
		}
		deleteBtn.disabled = true;
		deleteBtn.textContent = "Deleting...";
		setStatus("Deleting posts", "Please keep this tab open.", "muted");
		try {
			const result = await query("/tweets/bulk-delete", {
				method: "POST",
				body: JSON.stringify(payload),
			});
			if (result?.error) {
				setStatus("Deletion failed", result.error, "warning");
				toastQueue.add(`<h1>Deletion failed</h1><p>${result.error}</p>`);
				return;
			}
			const deleted = Number(result.deleted) || 0;
			const remaining = Number(result.remaining) || 0;
			const deletedPlural = deleted === 1 ? "post" : "posts";
			const remainingPlural = remaining === 1 ? "post" : "posts";
			setStatus(
				`${deleted} ${deletedPlural} deleted`,
				remaining > 0
					? `${remaining} ${remainingPlural} still match your filters. Run cleanup again to continue.`
					: "All posts matching your filters are gone.",
				"success",
			);
			toastQueue.add(
				`<h1>Cleanup complete</h1><p>Deleted ${deleted} ${deletedPlural}.</p>`,
			);
		} catch (error) {
			console.error("Bulk delete error", error);
			setStatus("Deletion failed", "Could not delete posts.", "warning");
			toastQueue.add("<h1>Deletion failed</h1><p>Something went wrong.</p>");
		} finally {
			deleteBtn.disabled = false;
			deleteBtn.textContent = "Delete matching posts";
		}
	};

	previewBtn.addEventListener("click", handlePreview);
	deleteBtn.addEventListener("click", handleDelete);
	fromInput.addEventListener("blur", normalizeRange);
	toInput.addEventListener("blur", normalizeRange);
	limitInput.addEventListener("blur", clampLimit);

	section.appendChild(cleanupGroup);

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
	inviteForm.className = "delegate-invite-form";

	const inviteInput = document.createElement("input");
	inviteInput.type = "text";
	inviteInput.placeholder = "Enter username to invite";
	inviteInput.className = "delegate-invite-input";

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
	delegatesList.className = "delegates-list";
	myDelegatesGroup.appendChild(delegatesList);

	section.appendChild(myDelegatesGroup);

	const delegationsGroup = document.createElement("div");
	delegationsGroup.className = "setting-group";

	const delegationsH2 = document.createElement("h2");
	delegationsH2.textContent = "I'm a Delegate For";
	delegationsGroup.appendChild(delegationsH2);

	const delegationsList = document.createElement("div");
	delegationsList.id = "delegations-list";
	delegationsList.className = "delegates-list";
	delegationsGroup.appendChild(delegationsList);

	section.appendChild(delegationsGroup);

	const invitationsGroup = document.createElement("div");
	invitationsGroup.className = "setting-group";

	const invitationsH2 = document.createElement("h2");
	invitationsH2.textContent = "Pending Invitations";
	invitationsGroup.appendChild(invitationsH2);

	const invitationsList = document.createElement("div");
	invitationsList.id = "pending-invitations-list";
	invitationsList.className = "delegates-list";
	invitationsGroup.appendChild(invitationsList);

	section.appendChild(invitationsGroup);

	const sentInvitationsGroup = document.createElement("div");
	sentInvitationsGroup.className = "setting-group";

	const sentInvitationsH2 = document.createElement("h2");
	sentInvitationsH2.textContent = "Sent Invitations";
	sentInvitationsGroup.appendChild(sentInvitationsH2);

	const sentInvitationsList = document.createElement("div");
	sentInvitationsList.id = "sent-invitations-list";
	sentInvitationsList.className = "delegates-list";
	sentInvitationsGroup.appendChild(sentInvitationsList);

	section.appendChild(sentInvitationsGroup);

	setTimeout(() => {
		loadDelegates();
	}, 100);

	return section;
};

const loadDelegates = async () => {
	const delegatesList = document.getElementById("delegates-list");
	const delegationsList = document.getElementById("delegations-list");
	const invitationsList = document.getElementById("pending-invitations-list");
	const sentInvitationsList = document.getElementById("sent-invitations-list");

	if (
		!delegatesList ||
		!delegationsList ||
		!invitationsList ||
		!sentInvitationsList
	)
		return;

	try {
		const [
			delegatesData,
			delegationsData,
			invitationsData,
			sentInvitationsData,
		] = await Promise.all([
			query("/delegates/my-delegates"),
			query("/delegates/my-delegations"),
			query("/delegates/pending-invitations"),
			query("/delegates/sent-invitations"),
		]);

		if (delegatesData.delegates && delegatesData.delegates.length > 0) {
			delegatesList.innerHTML = "";
			delegatesData.delegates.forEach((delegate) => {
				const item = createDelegateItem(delegate, "delegate");
				delegatesList.appendChild(item);
			});
		} else {
			delegatesList.innerHTML = "";
			const emptyP = document.createElement("p");
			emptyP.className = "delegates-empty";
			emptyP.textContent = "No delegates yet";
			delegatesList.appendChild(emptyP);
		}

		if (delegationsData.delegations && delegationsData.delegations.length > 0) {
			delegationsList.innerHTML = "";
			delegationsData.delegations.forEach((delegation) => {
				const item = createDelegateItem(delegation, "delegation");
				delegationsList.appendChild(item);
			});
		} else {
			delegationsList.innerHTML = "";
			const emptyP = document.createElement("p");
			emptyP.className = "delegates-empty";
			emptyP.textContent = "You're not a delegate for anyone";
			delegationsList.appendChild(emptyP);
		}

		if (invitationsData.invitations && invitationsData.invitations.length > 0) {
			invitationsList.innerHTML = "";
			invitationsData.invitations.forEach((invitation) => {
				const item = createInvitationItem(invitation);
				invitationsList.appendChild(item);
			});
		} else {
			invitationsList.innerHTML = "";
			const emptyP = document.createElement("p");
			emptyP.className = "delegates-empty";
			emptyP.textContent = "No pending invitations";
			invitationsList.appendChild(emptyP);
		}

		if (
			sentInvitationsData.invitations &&
			sentInvitationsData.invitations.length > 0
		) {
			sentInvitationsList.innerHTML = "";
			sentInvitationsData.invitations.forEach((invitation) => {
				const item = createSentInvitationItem(invitation);
				sentInvitationsList.appendChild(item);
			});
		} else {
			sentInvitationsList.innerHTML = "";
			const emptyP = document.createElement("p");
			emptyP.className = "delegates-empty";
			emptyP.textContent = "No sent invitations";
			sentInvitationsList.appendChild(emptyP);
		}
	} catch (error) {
		console.error("Failed to load delegates:", error);
	}
};

const createDelegateItem = (item, type) => {
	const container = document.createElement("div");
	container.className = "delegate-item";

	const userInfo = document.createElement("div");
	userInfo.className = "delegate-user-info";

	const avatar = document.createElement("img");
	avatar.src = item.avatar || "/shared/assets/default-avatar.png";
	avatar.className = "delegate-avatar";

	const textInfo = document.createElement("div");

	const name = document.createElement("div");
	name.className = "delegate-name";
	name.textContent = item.name || item.username;

	const username = document.createElement("div");
	username.className = "delegate-username";
	username.textContent = `@${item.username}`;

	textInfo.appendChild(name);
	textInfo.appendChild(username);

	userInfo.appendChild(avatar);
	userInfo.appendChild(textInfo);

	const removeBtn = document.createElement("button");
	removeBtn.className = "btn danger delegate-remove-btn";
	removeBtn.textContent = "Remove";
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
	container.className = "delegate-item";

	const userInfo = document.createElement("div");
	userInfo.className = "delegate-user-info";

	const avatar = document.createElement("img");
	avatar.src = invitation.avatar || "/shared/assets/default-avatar.png";
	avatar.className = "delegate-avatar";

	const textInfo = document.createElement("div");

	const name = document.createElement("div");
	name.className = "delegate-name";
	name.textContent = invitation.name || invitation.username;

	const username = document.createElement("div");
	username.className = "delegate-username";
	username.textContent = `@${invitation.username}`;

	textInfo.appendChild(name);
	textInfo.appendChild(username);

	userInfo.appendChild(avatar);
	userInfo.appendChild(textInfo);

	const actions = document.createElement("div");
	actions.className = "delegate-actions";

	const acceptBtn = document.createElement("button");
	acceptBtn.className = "btn primary delegate-action-btn";
	acceptBtn.textContent = "Accept";
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
	declineBtn.className = "btn secondary delegate-action-btn";
	declineBtn.textContent = "Decline";
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

const createSentInvitationItem = (invitation) => {
	const container = document.createElement("div");
	container.className = "delegate-item";

	const userInfo = document.createElement("div");
	userInfo.className = "delegate-user-info";

	const avatar = document.createElement("img");
	avatar.src = invitation.avatar || "/shared/assets/default-avatar.png";
	avatar.className = "delegate-avatar";

	const textInfo = document.createElement("div");

	const name = document.createElement("div");
	name.className = "delegate-name";
	name.textContent = invitation.name || invitation.username;

	const username = document.createElement("div");
	username.className = "delegate-username";
	username.textContent = `@${invitation.username}`;

	textInfo.appendChild(name);
	textInfo.appendChild(username);

	userInfo.appendChild(avatar);
	userInfo.appendChild(textInfo);

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "btn danger delegate-remove-btn";
	cancelBtn.textContent = "Cancel";
	cancelBtn.onclick = async () => {
		if (!confirm(`Cancel invitation to @${invitation.username}?`)) return;

		try {
			const result = await query(`/delegates/${invitation.id}`, {
				method: "DELETE",
			});

			if (result.success) {
				toastQueue.add(`<h1>Cancelled</h1><p>Invitation cancelled</p>`);
				loadDelegates();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${result.error || "Failed to cancel invitation"}</p>`,
				);
			}
		} catch (error) {
			console.error("Failed to cancel invitation:", error);
			toastQueue.add(`<h1>Error</h1><p>Failed to cancel invitation</p>`);
		}
	};

	container.appendChild(userInfo);
	container.appendChild(cancelBtn);

	return container;
};

const createScheduledContent = () => {
	const section = document.createElement("div");
	section.className = "settings-section";

	const h1 = document.createElement("h1");
	h1.textContent = "Scheduled tweets";
	section.appendChild(h1);

	const group = document.createElement("div");
	group.className = "setting-group";

	const h2 = document.createElement("h2");
	h2.textContent = "Upcoming posts";
	group.appendChild(h2);

	const listDiv = document.createElement("div");
	listDiv.id = "scheduled-posts-list";
	listDiv.className = "scheduled-posts-list";
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
			listDiv.innerHTML = "";
			const errorP = document.createElement("p");
			errorP.className = "scheduled-posts-empty";
			errorP.textContent = "Failed to load scheduled posts";
			listDiv.appendChild(errorP);
			return;
		}

		if (!data.scheduledPosts || data.scheduledPosts.length === 0) {
			listDiv.innerHTML = "";
			const emptyP = document.createElement("p");
			emptyP.className = "scheduled-posts-empty";
			emptyP.textContent = "No scheduled posts yet";
			listDiv.appendChild(emptyP);
			return;
		}

		listDiv.innerHTML = "";
		data.scheduledPosts.forEach((post) => {
			const item = document.createElement("div");
			item.className = "scheduled-post-item";

			const header = document.createElement("div");
			header.className = "scheduled-post-header";

			const scheduledTime = document.createElement("div");
			scheduledTime.className = "scheduled-post-time";
			scheduledTime.textContent = `Scheduled for ${new Date(
				post.scheduled_for,
			).toLocaleString()}`;

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "btn danger scheduled-post-delete";
			deleteBtn.textContent = "Delete";
			deleteBtn.onclick = async () => {
				createConfirmModal({
					title: "Delete scheduled post",
					message: "Are you sure you want to delete this scheduled post?",
					confirmText: "Delete",
					cancelText: "Cancel",
					danger: true,
					onConfirm: async () => {
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
					},
				});
			};

			header.appendChild(scheduledTime);
			header.appendChild(deleteBtn);

			const content = document.createElement("div");
			content.className = "scheduled-post-content";
			content.textContent = post.content;

			item.appendChild(header);
			item.appendChild(content);
			listDiv.appendChild(item);
		});
	} catch (error) {
		console.error("Failed to load scheduled posts:", error);
		listDiv.innerHTML = "";
		const errorP = document.createElement("p");
		errorP.className = "scheduled-posts-empty";
		errorP.textContent = "Failed to load scheduled posts";
		listDiv.appendChild(errorP);
	}
};

const createChangeUsernameModal = () => {
	const overlay = document.createElement("div");
	overlay.id = "changeUsernameModal";
	overlay.className = "settings-modal-overlay";

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "changeUsernameHeading");

	const header = document.createElement("div");
	header.className = "modal-header";

	const h2 = document.createElement("h2");
	h2.id = "changeUsernameHeading";
	h2.textContent = "Change username";

	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closeUsernameModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close change username dialog");
	close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";

	const form = document.createElement("form");
	form.id = "changeUsernameForm";

	const fg = document.createElement("div");
	fg.className = "form-group";

	const label = document.createElement("label");
	label.htmlFor = "newUsername";
	label.textContent = "New username";

	const userWrap = document.createElement("div");
	userWrap.className = "username-wrapper";

	const at = document.createElement("span");
	at.setAttribute("inert", "");
	at.textContent = "@";

	const input = document.createElement("input");
	input.type = "text";
	input.id = "newUsername";
	input.placeholder = "new username";
	input.required = true;

	userWrap.appendChild(at);
	userWrap.appendChild(input);

	const small = document.createElement("small");
	small.id = "usernameHelp";

	const isVerified =
		currentUser?.verified || currentUser?.gold || currentUser?.gray;

	if (isVerified) {
		small.textContent =
			"You're verified, so you can use emojis in your username! Username must be 3-40 characters and contain only letters, numbers, emojis, underscores, periods, and hyphens.";
	} else {
		small.textContent =
			"Username must be 3-20 characters and contain only letters, numbers, underscores, periods, and hyphens.";
	}

	fg.appendChild(label);
	fg.appendChild(userWrap);
	fg.appendChild(small);

	const actions = document.createElement("div");
	actions.className = "form-actions";

	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelUsernameChange";
	cancel.textContent = "Cancel";

	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn primary";
	submit.textContent = "Change username";

	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fg);
	form.appendChild(actions);

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		handleUsernameChange();
	});

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

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "deleteAccountHeading");

	const header = document.createElement("div");
	header.className = "modal-header";

	const h2 = document.createElement("h2");
	h2.id = "deleteAccountHeading";
	h2.textContent = "Delete account";

	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closeDeleteModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close delete account dialog");
	close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
	close.onclick = () => hideModal(overlay);

	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";

	const warning = document.createElement("p");
	warning.className = "modal-warning";
	warning.innerHTML = `<img src="/public/shared/assets/img/cats/NOOOOOOO.png">This action cannot be undone. All your tweets, likes, follows, and account data will be permanently deleted.`;

	const form = document.createElement("form");
	form.id = "deleteAccountForm";

	const fg = document.createElement("div");
	fg.className = "form-group";

	const label = document.createElement("label");
	label.htmlFor = "deleteConfirmation";
	label.textContent = 'Type "DELETE MY ACCOUNT" to confirm:';

	const input = document.createElement("input");
	input.type = "text";
	input.id = "deleteConfirmation";
	input.placeholder = "DELETE MY ACCOUNT";
	input.required = true;

	fg.appendChild(label);
	fg.appendChild(input);

	const actions = document.createElement("div");
	actions.className = "form-actions";

	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelAccountDelete";
	cancel.textContent = "Cancel";

	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn danger";
	submit.textContent = "Delete account";

	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fg);
	form.appendChild(actions);

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		handleAccountDeletion();
	});

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

	const modal = document.createElement("div");
	modal.className = "modal settings-form-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "changePasswordHeading");
	modal.setAttribute("aria-describedby", "passwordModalDescription");

	const header = document.createElement("div");
	header.className = "modal-header";

	const h2 = document.createElement("h2");
	h2.id = "changePasswordHeading";
	h2.textContent = "Change password";

	const close = document.createElement("button");
	close.className = "close-btn";
	close.id = "closePasswordModal";
	close.type = "button";
	close.setAttribute("aria-label", "Close change password dialog");
	close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

	header.appendChild(h2);
	header.appendChild(close);

	const body = document.createElement("div");
	body.className = "modal-body";

	const description = document.createElement("p");
	description.id = "passwordModalDescription";
	description.className = "modal-description";
	description.textContent =
		"Set a password for your account to enable traditional username/password login.";

	const form = document.createElement("form");
	form.id = "changePasswordForm";

	const fgCur = document.createElement("div");
	fgCur.className = "form-group hidden";
	fgCur.id = "currentPasswordGroup";

	const labelCur = document.createElement("label");
	labelCur.htmlFor = "current-password";
	labelCur.textContent = "Current password";

	const inputCur = document.createElement("input");
	inputCur.type = "password";
	inputCur.id = "current-password";
	inputCur.placeholder = "enter your current password";
	inputCur.required = false;

	fgCur.appendChild(labelCur);
	fgCur.appendChild(inputCur);

	const fgNew = document.createElement("div");
	fgNew.className = "form-group";

	const labelNew = document.createElement("label");
	labelNew.htmlFor = "new-password";
	labelNew.textContent = "New password";

	const inputNew = document.createElement("input");
	inputNew.type = "password";
	inputNew.id = "new-password";
	inputNew.placeholder = "enter your new password";
	inputNew.minLength = 8;
	inputNew.required = true;

	const hint = document.createElement("small");
	hint.textContent = "Password must be at least 8 characters long.";

	fgNew.appendChild(labelNew);
	fgNew.appendChild(inputNew);
	fgNew.appendChild(hint);

	const actions = document.createElement("div");
	actions.className = "form-actions";

	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn secondary";
	cancel.id = "cancelPasswordChange";
	cancel.textContent = "Cancel";

	const submit = document.createElement("button");
	submit.type = "submit";
	submit.className = "btn primary";
	submit.id = "changePasswordSubmit";
	submit.textContent = "Set password";

	actions.appendChild(cancel);
	actions.appendChild(submit);

	form.appendChild(fgCur);
	form.appendChild(fgNew);
	form.appendChild(actions);

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		handlePasswordChange();
	});

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
			}, 100);
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

		if (target.classList?.contains("settings-modal-overlay")) {
			const modal = target.querySelector(".modal");
			if (modal && event.target === target) {
				hideModal(target);
			}
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
			const isVerified =
				currentUser?.verified || currentUser?.gold || currentUser?.gray;
			const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;

			event.target.value = event.target.value.replace(zeroWidthRegex, "");

			if (!isVerified) {
				event.target.value = event.target.value
					.toLowerCase()
					.replace(/[^a-z0-9._-]/g, "");
			}
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

		const transparencySelect = document.getElementById(
			"transparency-location-select",
		);

		if (transparencySelect && user) {
			transparencySelect.value = user.transparency_location_display || "full";

			if (!transparencySelect.dataset.listenerAttached) {
				transparencySelect.dataset.listenerAttached = "true";
				transparencySelect.addEventListener("change", async (e) => {
					const display = e.target.value;
					try {
						const result = await query(
							"/profile/settings/transparency-location",
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({ display }),
							},
						);

						if (result.success) {
							if (currentUser) {
								currentUser.transparency_location_display = display;
							}
							toastQueue.add(
								`<h1>Setting Updated</h1><p>Transparency location display updated to ${
									display === "full"
										? "Full Location"
										: display === "country"
											? "Country Only"
											: "Continent Only"
								}</p>`,
							);
						} else {
							toastQueue.add(
								`<h1>Failed to update setting</h1><p>${result.error || "Unknown error"}</p>`,
							);
						}
					} catch (error) {
						console.error("Failed to update transparency location:", error);
						toastQueue.add(`<h1>Failed to update setting</h1>`);
					}
				});
			}
		}
	} catch (error) {
		console.error("Failed to load privacy setting:", error);
		checkbox.checked = false;
		checkbox.defaultChecked = false;
		checkbox.dataset.serverState = "off";
		checkbox.setAttribute("aria-checked", "false");
		checkbox.disabled = true;
	}

	if (!checkbox.dataset.listenerAttached) {
		checkbox.dataset.listenerAttached = "true";
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
	}
};

const showModal = (element) => {
	if (!element) return;
	const overlay = element.classList?.contains("settings-modal-overlay")
		? element
		: element.closest?.(".settings-modal-overlay") || element;
	if (!overlay) return;
	overlay.classList.add("active");
	overlay.scrollTop = 0;

	const modal = overlay.querySelector(".modal");
	if (modal) {
		requestAnimationFrame(() => {
			modal.classList.add("visible");
			modal.classList.remove("closing");
		});
	}
};

const hideModal = (element) => {
	if (!element) return;
	const overlay = element.classList?.contains("settings-modal-overlay")
		? element
		: element.closest?.(".settings-modal-overlay") || element;
	if (!overlay) return;

	const modal = overlay.querySelector(".modal");
	if (modal) {
		modal.classList.remove("visible");
		modal.classList.add("closing");
		setTimeout(() => {
			overlay.classList.remove("active");
			modal.classList.remove("closing");
		}, 200);
	} else {
		overlay.classList.remove("active");
	}
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

		if (section === "account") {
			setTimeout(() => {
				loadPrivacySettings();
			}, 100);
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

// Spam score details modal
async function showSpamScoreDetails(username) {
	try {
		const data = await query(`/profile/${username}/spam-score`);

		if (data.error) {
			toastQueue.add(`<h1>Error</h1><p>${data.error}</p>`);
			return;
		}

		const metrics = data.accountMetrics;
		const scoreColor =
			data.spamScore > 0.5
				? "#f44336"
				: data.spamScore > 0.3
					? "#ff9800"
					: data.spamScore > 0.1
						? "#ffeb3b"
						: "#4caf50";

		const getStatusColor = (status) => {
			return status === "warning"
				? "#f44336"
				: status === "caution"
					? "#ff9800"
					: "#4caf50";
		};

		const getIndicatorIcon = (name) => {
			const icons = {
				duplicate_content: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
				near_duplicate: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
				posting_frequency: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
				timing_regularity: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 6v6l4 2"/></svg>`,
				url_spam: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
				hashtag_spam: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
				mention_spam: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>`,
				content_quality: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
				reply_spam: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
				engagement_manipulation: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
				account_behavior: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
				composite_bot_signal: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="5" r="4"/></svg>`,
			};
			return (
				icons[name] ||
				`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
			);
		};

		const getSpecificAdvice = (indicator) => {
			const adviceMap = {
				duplicate_content: {
					warning:
						"You're posting identical content repeatedly. Each post should be unique.",
					caution:
						"Some duplicate posts detected. Try to vary your content more.",
					good: "Good variety in your post content.",
				},
				near_duplicate: {
					warning:
						"Many posts are very similar (rephrased). Avoid posting the same idea repeatedly.",
					caution: "Some posts are too similar. Diversify your topics.",
					good: "Posts have good variety.",
				},
				posting_frequency: {
					warning:
						"Posting original tweets too fast. Slow down to under 10 posts per hour",
					caution:
						"Original post pace is elevated. Consider spacing posts out more",
					good: "Healthy posting frequency.",
				},
				timing_regularity: {
					warning:
						"Posts appear automated (suspiciously regular timing between posts).",
					caution: "Posting pattern looks mechanical. Vary your timing.",
					good: "Natural posting timing.",
				},
				url_spam: {
					warning:
						"Too many links, especially shortened/suspicious URLs. Reduce link posting.",
					caution: "Frequent link sharing detected. Use links sparingly.",
					good: "Link usage is appropriate.",
				},
				hashtag_spam: {
					warning:
						"Excessive hashtags detected. Use 1-3 relevant hashtags max.",
					caution: "Using many hashtags. Keep it to 2-3 per post.",
					good: "Hashtag usage is appropriate.",
				},
				mention_spam: {
					warning: "Mentioning too many users. This looks like spam tagging.",
					caution: "High mention count. Only @mention when necessary.",
					good: "Mention usage is appropriate.",
				},
				content_quality: {
					warning:
						"Posts contain spam keywords, excessive caps, or repeated characters.",
					caution:
						"Some low-quality content detected. Write more thoughtfully.",
					good: "Content quality is good.",
				},
				reply_spam: {
					warning:
						"Sending identical/similar replies to many users. Personalize responses.",
					caution: "Reply patterns look repetitive. Add more variety.",
					good: "Reply behavior is normal.",
				},
				engagement_manipulation: {
					warning:
						"High post volume with zero engagement suggests inauthentic activity.",
					caution: "Many posts aren't getting engagement. Focus on quality.",
					good: "Engagement patterns are normal.",
				},
				account_behavior: {
					warning:
						"New account with high activity and few followers raises flags.",
					caution:
						"Account activity pattern is unusual for your follower count.",
					good: "Account behavior is normal.",
				},
				composite_bot_signal: {
					warning:
						"Multiple bot-like signals detected. Account may be flagged.",
					caution: "Some automated behavior patterns detected.",
					good: "No bot-like behavior detected.",
				},
			};
			const advice = adviceMap[indicator.name];
			if (!advice) return indicator.details;
			return advice[indicator.status] || indicator.details;
		};

		const showImpactingTweets = (indicator) => {
			const tweets = indicator.impactingTweets || [];
			if (tweets.length === 0) return;

			const escapeHtml = (str) => {
				if (!str) return "";
				return str
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#039;");
			};

			const formatDecayWeight = (decayWeight) => {
				if (decayWeight === undefined || decayWeight === null) return "";
				const pct = (decayWeight * 100).toFixed(0);
				const color =
					decayWeight > 0.7
						? "#4caf50"
						: decayWeight > 0.3
							? "#ff9800"
							: "#9e9e9e";
				return `<span style="font-size: 10px; color: ${color}; margin-left: 8px; padding: 1px 6px; background: ${color}22; border-radius: 8px;">${pct}% impact</span>`;
			};

			const tweetsModal = document.createElement("div");
			// tweetsModal.className = "modal"; // Removed to avoid conflict with shared modal.css
			tweetsModal.style.cssText =
				"display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10001; align-items: center; justify-content: center; animation: fadeIn 0.2s;";

			const statusColor = getStatusColor(indicator.status);
			const tweetsHTML = tweets
				.map(
					(t) => `
				<div style="background: var(--bg-secondary); padding: 12px; border-left: 3px solid ${statusColor};">
					<div style="font-size: 13px; color: var(--text-primary); margin-bottom: 6px; word-break: break-word;">${escapeHtml(t.content || "No content")}${(t.content?.length || 0) >= 80 ? "..." : ""}</div>
					<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
						<span style="font-size: 11px; color: ${statusColor}; font-weight: 500;">${escapeHtml(t.reason)}${formatDecayWeight(t.decayWeight)}</span>
						<a href="/${username}/status/${t.id}" target="_blank" style="font-size: 11px; color: var(--accent-color); text-decoration: none;">View →</a>
					</div>
				</div>
			`,
				)
				.join("");

			tweetsModal.innerHTML = `
				<div style="background: var(--bg-primary); border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
					<div style="padding: 20px; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--bg-primary); z-index: 1;">
						<div style="display: flex; justify-content: space-between; align-items: center;">
							<h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">
								${indicator.displayName}
							</h3>
							<button class="close-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
						</div>
						<div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px;">Older tweets have less impact on your score (7-day half-life)</div>
					</div>
					<div style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
						${tweetsHTML}
					</div>
				</div>
			`;

			document.body.appendChild(tweetsModal);
			tweetsModal
				.querySelector("button")
				.addEventListener("click", () => tweetsModal.remove());
			tweetsModal.addEventListener("click", (e) => {
				if (e.target === tweetsModal) tweetsModal.remove();
			});
		};

		_spamIndicators = data.indicators;

		const indicatorsHTML = data.indicators
			.slice(0, 12)
			.map((ind, idx) => {
				const statusColor = getStatusColor(ind.status);
				const scorePercent = (ind.score * 100).toFixed(0);
				const icon = getIndicatorIcon(ind.name);
				const specificAdvice = getSpecificAdvice(ind);
				const hasTweets = ind.impactingTweets && ind.impactingTweets.length > 0;

				return `
				<div style="background: var(--bg-primary); padding: 16px; border-left: 3px solid ${statusColor}; border-radius: 0 8px 8px 0;">
					<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
						<div style="flex: 1;">
							<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
								<span style="color: ${statusColor}; display: flex; align-items: center;">${icon}</span>
								<span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${ind.displayName}</span>
								<span style="padding: 2px 8px; background: ${statusColor}22; color: ${statusColor}; border-radius: 12px; font-size: 11px; font-weight: 600;">${scorePercent}%</span>
								${
									hasTweets
										? `<button data-indicator-idx="${idx}" style="padding: 2px 8px; background: var(--bg-secondary); border: 1px solid var(--border-hover); color: var(--text-secondary); border-radius: 12px; font-size: 10px; cursor: pointer; font-family: inherit;">
									See ${ind.impactingTweets.length} tweets
								</button>`
										: ""
								}
							</div>
							<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">${ind.details}</div>
							<div style="font-size: 12px; color: ${statusColor};">${specificAdvice}</div>
						</div>
						<div style="text-align: right; min-width: 70px;">
							<div style="font-size: 11px; color: var(--text-secondary);">Weight: ${(ind.weight * 100).toFixed(0)}%</div>
							<div style="font-size: 11px; color: ${statusColor}; font-weight: 600;">Impact: ${ind.contribution}</div>
						</div>
					</div>
					<div style="background: var(--bg-secondary); border-radius: 4px; height: 6px; overflow: hidden;">
						<div style="background: ${statusColor}; height: 100%; width: ${scorePercent}%; transition: width 0.3s ease;"></div>
					</div>
				</div>
			`;
			})
			.join("");

		const getOverallAdvice = () => {
			const topIssues = data.indicators
				.filter((i) => i.status === "warning")
				.slice(0, 3);
			if (topIssues.length === 0) {
				return data.spamPercentage > 10
					? `<li><strong>Minor issues:</strong> Address the caution indicators above to lower your score.</li>`
					: `<li>Your spam score is excellent! Keep maintaining good posting habits.</li><li>Continue engaging authentically with the community.</li>`;
			}
			return topIssues
				.map((issue) => {
					const adviceMap = {
						duplicate_content:
							"Stop posting identical content. Make each post unique.",
						near_duplicate:
							"Avoid rephrasing the same message. Post diverse content.",
						posting_frequency:
							"Reduce original posts to under 10 per hour. Replies don't count toward this.",
						timing_regularity: "Add natural variation to when you post.",
						url_spam: "Reduce link sharing, avoid URL shorteners.",
						hashtag_spam: "Use fewer hashtags (1-3 per post max).",
						mention_spam: "Reduce @mentions. Don't mass-tag users.",
						content_quality:
							"Write more thoughtful, varied content. Avoid spam keywords.",
						reply_spam: "Personalize your replies. Don't copy-paste responses.",
						engagement_manipulation: "Focus on quality over quantity.",
						account_behavior:
							"Build followers naturally before posting frequently.",
						composite_bot_signal:
							"Multiple issues detected - address individual warnings above.",
					};
					return `<li><strong>${issue.displayName}:</strong> ${adviceMap[issue.name] || "Address this issue to improve your score."}</li>`;
				})
				.join("");
		};

		const modal = document.createElement("div");
		// Use a unique class or no class to avoid conflict with shared modal.css
		// which sets .modal { opacity: 0 }
		modal.style.cssText =
			"display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center; animation: fadeIn 0.2s;";

		modal.innerHTML = `
			<div style="background: var(--bg-primary); border-radius: 16px; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); animation: modalSlideUp 0.3s;">
				<div style="padding: 24px; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--bg-primary); z-index: 1;">
					<div style="display: flex; justify-content: space-between; align-items: center;">
						<h2 style="margin: 0; font-size: 20px; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
							Spam score analysis
						</h2>
						<button class="close-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
					</div>
				</div>
				
				<div style="padding: 24px;">
					<div style="text-align: center; margin-bottom: 28px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; border: 2px solid ${scoreColor}33;">
						<div style="font-size: 64px; font-weight: bold; color: ${scoreColor}; line-height: 1; margin-bottom: 12px;">${data.spamPercentage.toFixed(1)}%</div>
						<div style="font-size: 16px; color: var(--text-primary); font-weight: 600; margin-bottom: 6px;">
							${data.message}
						</div>
						<div style="font-size: 13px; color: var(--text-secondary);">
							Based on analysis of ${metrics.totalPosts} tweets
						</div>
					</div>

					<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 28px;">
						<div style="padding: 16px; text-align: center; background: var(--bg-secondary); border-radius: 8px;">
							<div style="font-size: 24px; font-weight: bold; color: var(--text-primary);">${metrics.followerCount}</div>
							<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Followers</div>
						</div>
						<div style="padding: 16px; text-align: center; background: var(--bg-secondary); border-radius: 8px;">
							<div style="font-size: 24px; font-weight: bold; color: var(--text-primary);">${metrics.followingCount}</div>
							<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Following</div>
						</div>
						<div style="padding: 16px; text-align: center; background: var(--bg-secondary); border-radius: 8px;">
							<div style="font-size: 24px; font-weight: bold; color: var(--text-primary);">${metrics.accountAgeDays}</div>
							<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Days Old</div>
						</div>
						<div style="padding: 16px; text-align: center; background: var(--bg-secondary); border-radius: 8px;">
							<div style="font-size: 24px; font-weight: bold; color: ${metrics.postsLastHour > 10 ? "#f44336" : metrics.postsLastHour > 5 ? "#ff9800" : "var(--text-primary)"};">${metrics.postsLastHour}</div>
							<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Posts/Hour</div>
						</div>
					</div>

					<div style="margin-bottom: 24px;">
						<h3 style="margin: 0 0 16px 0; font-size: 17px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
							Breakdown
						</h3>
						<div style="display: flex; flex-direction: column; gap: 12px;" id="spam-indicators-container">
							${indicatorsHTML}
						</div>
					</div>

						<h3 style="margin: 0 0 12px 0; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
							What you can do to improve your score
						</h3>
						<ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 14px; line-height: 1.8;">
							${getOverallAdvice()}
						</ul>

					<details style="margin-top: 20px;">
						<summary style="cursor: pointer; padding: 12px; border-radius: 8px; color: var(--text-primary); font-size: 14px; user-select: none; text-decoration: underline;">
							Technical details
						</summary>
						<div style="padding: 16px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; border-radius: 0 0 8px 8px; margin-top: -8px;">
							<p style="margin: 0 0 8px 0;"><strong>Score Calculation:</strong> Each indicator has a weight representing its importance. Your final score is a logistic-transformed weighted sum.</p>
							<p style="margin: 0 0 8px 0;"><strong>Posts Analyzed:</strong> Up to 200 recent original posts (${metrics.totalPosts} total, replies analyzed separately)</p>
							<p style="margin: 0 0 8px 0;"><strong>Recent Activity:</strong> ${metrics.postsLastHour} posts/hour • ${metrics.postsLast6Hours} posts/6hrs • ${metrics.postsLastDay} posts/24hrs</p>
							<p style="margin: 0;"><strong>Follow Ratio:</strong> ${metrics.followRatio} (following÷followers)</p>
						</div>
					</details>
				</div>
			</div>
		`;

		modal.querySelector(".close-btn").addEventListener("click", () => {
			modal.remove();
		});

		document.body.appendChild(modal);

		modal.querySelectorAll("[data-indicator-idx]").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const idx = parseInt(btn.dataset.indicatorIdx, 10);
				const ind = _spamIndicators[idx];
				if (ind) showImpactingTweets(ind);
			});
		});

		modal.addEventListener("click", (e) => {
			if (e.target === modal) modal.remove();
		});
	} catch (error) {
		console.error("Failed to load spam score details:", error);
		toastQueue.add("<h1>Error</h1><p>Failed to load spam score details</p>");
	}
}
