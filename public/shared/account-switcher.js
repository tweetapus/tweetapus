import toastQueue from "./toasts.js";

export async function openAccountSwitcher() {
	const modal = document.createElement("div");
	modal.className = "account-switcher-modal";
	modal.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	`;

	const container = document.createElement("div");
	container.style.cssText = `
		background: var(--bg-primary);
		border-radius: 12px;
		padding: 24px;
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
	`;

	const header = document.createElement("div");
	header.style.cssText = `
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	`;

	const title = document.createElement("h3");
	title.textContent = "Switch Account";
	title.style.cssText = "margin: 0; font-size: 20px;";

	const closeBtn = document.createElement("button");
	closeBtn.textContent = "×";
	closeBtn.style.cssText = `
		background: none;
		border: none;
		font-size: 28px;
		cursor: pointer;
		color: var(--text-secondary);
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	`;
	closeBtn.onclick = () => modal.remove();

	header.appendChild(title);
	header.appendChild(closeBtn);
	container.appendChild(header);

	const accountsList = document.createElement("div");
	accountsList.style.cssText = `
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 20px;
	`;

	try {
		const storedAccounts = JSON.parse(localStorage.getItem("accounts") || "[]");
		const currentToken = localStorage.getItem("authToken");

		const { default: query } = await import("../timeline/js/api.js");

		if (!currentToken) {
			toastQueue.add("<h1>No active session</h1>");
			modal.remove();
			return;
		}

		const currentUserResponse = await query("/auth/me");
		const currentUser = currentUserResponse.user;
		const isDelegate = currentUserResponse.isDelegate;
		const primaryUserId = currentUserResponse.primaryUserId;

		accountsList.innerHTML = "";

		const currentAccountItem = createAccountItem(
			currentUser,
			true,
			isDelegate ? "Delegate" : "Current Account",
		);
		accountsList.appendChild(currentAccountItem);

		const uniqueAccounts = new Map();
		for (const account of storedAccounts) {
			if (account.userId !== currentUser.id) {
				uniqueAccounts.set(account.userId, account);
			}
		}

		for (const account of uniqueAccounts.values()) {
			const accountItem = createAccountItem(account, false);
			accountsList.appendChild(accountItem);
		}

		if (isDelegate) {
			const switchBackBtn = document.createElement("button");
			switchBackBtn.textContent = "Switch back to my account";
			switchBackBtn.className = "btn primary";
			switchBackBtn.style.cssText = `
				width: 100%;
				padding: 12px;
				margin-bottom: 12px;
				border-radius: 8px;
				font-weight: 500;
			`;
			switchBackBtn.onclick = async () => {
				try {
					const { success, token, user, error } = await query(
						"/auth/switch-to-primary",
						{
							method: "POST",
						},
					);

					if (success && token) {
						const accounts = JSON.parse(
							localStorage.getItem("accounts") || "[]",
						);
						const existingIndex = accounts.findIndex(
							(acc) => acc.userId === user.id,
						);
						const accountData = {
							userId: user.id,
							username: user.username,
							name: user.name,
							avatar: user.avatar,
							verified: user.verified,
							gold: user.gold,
							avatar_radius: user.avatar_radius,
							token,
						};

						if (existingIndex >= 0) {
							accounts[existingIndex] = accountData;
						} else {
							accounts.push(accountData);
						}

						localStorage.setItem("accounts", JSON.stringify(accounts));
						localStorage.setItem("authToken", token);
						window.location.reload();
					} else {
						toastQueue.add(
							`<h1>Error</h1><p>${error || "Failed to switch back"}</p>`,
						);
					}
				} catch (error) {
					console.error("Switch back error:", error);
					toastQueue.add("<h1>Failed to switch back to your account</h1>");
				}
			};
			container.insertBefore(switchBackBtn, accountsList);
		}

		try {
			const delegationsResponse = await query("/delegates/my-delegations");
			if (
				delegationsResponse.delegations &&
				delegationsResponse.delegations.length > 0
			) {
				const delegatesSection = document.createElement("div");
				delegatesSection.style.cssText = "margin-top: 20px;";

				const delegatesTitle = document.createElement("h4");
				delegatesTitle.textContent = "Delegate Accounts";
				delegatesTitle.style.cssText = `
				font-size: 14px;
				color: var(--text-secondary);
				margin: 0 0 12px 0;
				text-transform: uppercase;
				font-weight: 600;
			`;
				delegatesSection.appendChild(delegatesTitle);

				for (const delegation of delegationsResponse.delegations) {
					const delegateItem = createDelegateItem(delegation);
					delegatesSection.appendChild(delegateItem);
				}

				accountsList.appendChild(delegatesSection);
			}
		} catch (delegateError) {
			console.error("Error loading delegate accounts:", delegateError);
		}
	} catch (error) {
		console.error("Error loading accounts:", error);
		toastQueue.add("<h1>Failed to load accounts</h1>");
		modal.remove();
		return;
	}

	container.appendChild(accountsList);

	const addAccountBtn = document.createElement("button");
	addAccountBtn.textContent = "+ Add Account";
	addAccountBtn.style.cssText = `
		width: 100%;
		padding: 12px;
		border: 2px dashed var(--border-primary);
		border-radius: 8px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
		font-weight: 500;
		font-size: 14px;
	`;
	addAccountBtn.onclick = () => {
		modal.remove();
		openAddAccountModal();
	};

	container.appendChild(addAccountBtn);
	modal.appendChild(container);
	document.body.appendChild(modal);

	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			modal.remove();
		}
	});
}

function createAccountItem(account, isCurrent, badge = null) {
	const item = document.createElement("button");
	item.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: ${isCurrent ? "var(--bg-secondary)" : "var(--bg-primary)"};
		cursor: ${isCurrent ? "default" : "pointer"};
		width: 100%;
		text-align: left;
	`;

	const avatar = document.createElement("img");
	avatar.src = account.avatar || "/public/shared/assets/default-avatar.svg";
	avatar.style.cssText = `
		width: 40px;
		height: 40px;
		border-radius: ${account.avatar_radius ?? 50}%;
		object-fit: cover;
	`;

	const info = document.createElement("div");
	info.style.cssText = "flex: 1;";

	const nameRow = document.createElement("div");
	nameRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

	const name = document.createElement("span");
	name.textContent = account.name || account.username;
	name.style.cssText = "font-weight: 600; color: var(--text-primary);";

	nameRow.appendChild(name);

	if (account.verified) {
		const verifiedBadge = document.createElement("svg");
		verifiedBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="verified-badge"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
		verifiedBadge.style.color = "var(--primary)";
		nameRow.appendChild(verifiedBadge);
	}

	if (badge) {
		const badgeEl = document.createElement("span");
		badgeEl.textContent = badge;
		badgeEl.style.cssText = `
			font-size: 11px;
			padding: 2px 8px;
			border-radius: 4px;
			background: var(--primary);
			color: white;
			font-weight: 600;
			text-transform: uppercase;
		`;
		nameRow.appendChild(badgeEl);
	}

	const username = document.createElement("div");
	username.textContent = `@${account.username}`;
	username.style.cssText = "font-size: 14px; color: var(--text-secondary);";

	info.appendChild(nameRow);
	info.appendChild(username);

	item.appendChild(avatar);
	item.appendChild(info);

	if (!isCurrent && account.token) {
		item.onclick = async () => {
			localStorage.setItem("authToken", account.token);
			window.location.reload();
		};
	}

	return item;
}

function createDelegateItem(delegation) {
	const item = document.createElement("button");
	item.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: var(--bg-primary);
		cursor: pointer;
		width: 100%;
		text-align: left;
		margin-bottom: 8px;
	`;

	const avatar = document.createElement("img");
	avatar.src = delegation.avatar || "/public/shared/assets/default-avatar.svg";
	avatar.style.cssText = `
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
	`;

	const info = document.createElement("div");
	info.style.cssText = "flex: 1;";

	const nameRow = document.createElement("div");
	nameRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

	const name = document.createElement("span");
	name.textContent = delegation.name || delegation.username;
	name.style.cssText = "font-weight: 600; color: var(--text-primary);";

	nameRow.appendChild(name);

	if (delegation.verified) {
		const verifiedBadge = document.createElement("svg");
		verifiedBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
		verifiedBadge.style.color = "var(--primary)";
		nameRow.appendChild(verifiedBadge);
	}

	const delegateBadge = document.createElement("span");
	delegateBadge.textContent = "Delegate";
	delegateBadge.style.cssText = `
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 4px;
		background: var(--accent-color, var(--primary));
		color: white;
		font-weight: 600;
	`;
	nameRow.appendChild(delegateBadge);
	const accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
	const existingIndex = accounts.findIndex((acc) => acc.userId === user.id);
	const accountData = {
		userId: user.id,
		username: user.username,
		name: user.name,
		avatar: user.avatar,
		verified: user.verified,
		gold: user.gold,
		avatar_radius: user.avatar_radius,
		token,
	};

	if (existingIndex >= 0) {
		accounts[existingIndex] = accountData;
	} else {
		accounts.push(accountData);
	}

	localStorage.setItem("accounts", JSON.stringify(accounts));

	const username = document.createElement("div");
	username.textContent = `@${delegation.username}`;
	username.style.cssText = "font-size: 14px; color: var(--text-secondary);";

	info.appendChild(nameRow);
	info.appendChild(username);

	item.appendChild(avatar);
	item.appendChild(info);

	item.onclick = async () => {
		try {
			const { default: query } = await import("../timeline/js/api.js");
			const { success, token, user, error } = await query(
				"/auth/switch-to-delegate",
				{
					method: "POST",
					body: JSON.stringify({ ownerId: delegation.owner_id }),
				},
			);

			if (success && token) {
				localStorage.setItem("authToken", token);
				window.location.reload();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${error || "Failed to switch to delegate"}</p>`,
				);
			}
		} catch (error) {
			console.error("Switch to delegate error:", error);
			toastQueue.add("<h1>Failed to switch to delegate account</h1>");
		}
	};

	return item;
}

async function openAddAccountModal() {
	const modal = document.createElement("div");
	modal.className = "add-account-modal";
	modal.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	`;

	const container = document.createElement("div");
	container.style.cssText = `
		background: var(--bg-primary);
		border-radius: 12px;
		padding: 24px;
		max-width: 400px;
		width: 90%;
	`;

	const header = document.createElement("div");
	header.style.cssText = `
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	`;

	const title = document.createElement("h3");
	title.textContent = "Add Account";
	title.style.cssText = "margin: 0; font-size: 20px;";

	const closeBtn = document.createElement("button");
	closeBtn.textContent = "×";
	closeBtn.style.cssText = `
		background: none;
		border: none;
		font-size: 28px;
		cursor: pointer;
		color: var(--text-secondary);
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	`;
	closeBtn.onclick = () => modal.remove();

	header.appendChild(title);
	header.appendChild(closeBtn);
	container.appendChild(header);

	const form = document.createElement("form");
	form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

	const usernameInput = document.createElement("input");
	usernameInput.type = "text";
	usernameInput.placeholder = "Username";
	usernameInput.style.cssText = `
		padding: 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 14px;
	`;

	const passwordInput = document.createElement("input");
	passwordInput.type = "password";
	passwordInput.placeholder = "Password";
	passwordInput.style.cssText = `
		padding: 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 14px;
	`;

	const submitBtn = document.createElement("button");
	submitBtn.type = "submit";
	submitBtn.textContent = "Add Account";
	submitBtn.className = "btn primary";
	submitBtn.style.cssText = `
		padding: 12px;
		border-radius: 8px;
		font-weight: 500;
	`;

	const passkeyBtn = document.createElement("button");
	passkeyBtn.type = "button";
	passkeyBtn.textContent = "Or use Passkey";
	passkeyBtn.style.cssText = `
		padding: 12px;
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
		font-weight: 500;
	`;

	form.appendChild(usernameInput);
	form.appendChild(passwordInput);
	form.appendChild(submitBtn);
	form.appendChild(passkeyBtn);

	form.onsubmit = async (e) => {
		e.preventDefault();
		const username = usernameInput.value.trim();
		const password = passwordInput.value;

		if (!username || !password) {
			toastQueue.add("<h1>Please fill in all fields</h1>");
			return;
		}

		try {
			const { default: query } = await import("../timeline/js/api.js");
			const { success, token, user, error } = await query("/auth/add-account", {
				method: "POST",
				body: JSON.stringify({ username, password }),
			});

			if (success && token) {
				const accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
				const existingIndex = accounts.findIndex(
					(acc) => acc.userId === user.id,
				);
				const accountData = {
					userId: user.id,
					username: user.username,
					name: user.name,
					avatar: user.avatar,
					verified: user.verified,
					gold: user.gold,
					avatar_radius: user.avatar_radius,
					token,
				};

				if (existingIndex >= 0) {
					accounts[existingIndex] = accountData;
				} else {
					accounts.push(accountData);
				}

				localStorage.setItem("accounts", JSON.stringify(accounts));
				localStorage.setItem("authToken", token);
				window.location.reload();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${error || "Failed to add account"}</p>`,
				);
			}
		} catch (error) {
			console.error("Add account error:", error);
			toastQueue.add("<h1>Failed to add account</h1>");
		}
	};

	passkeyBtn.onclick = async () => {
		try {
			const { default: query } = await import("../timeline/js/api.js");

			const { options, expectedChallenge } = await query(
				"/auth/generate-authentication-options",
				{
					method: "POST",
				},
			);

			if (!options) {
				toastQueue.add("<h1>Failed to generate authentication options</h1>");
				return;
			}

			const { startAuthentication } = await import("@simplewebauthn/browser");
			const credential = await startAuthentication(options);

			const { success, token, user, error } = await query("/auth/add-account", {
				method: "POST",
				body: JSON.stringify({ credential, expectedChallenge }),
			});

			if (success && token) {
				const accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
				const existingIndex = accounts.findIndex(
					(acc) => acc.userId === user.id,
				);
				const accountData = {
					userId: user.id,
					username: user.username,
					name: user.name,
					avatar: user.avatar,
					verified: user.verified,
					gold: user.gold,
					avatar_radius: user.avatar_radius,
					token,
				};

				if (existingIndex >= 0) {
					accounts[existingIndex] = accountData;
				} else {
					accounts.push(accountData);
				}

				localStorage.setItem("accounts", JSON.stringify(accounts));
				localStorage.setItem("authToken", token);
				window.location.reload();
			} else {
				toastQueue.add(
					`<h1>Error</h1><p>${error || "Failed to add account"}</p>`,
				);
			}
		} catch (error) {
			console.error("Passkey authentication error:", error);
			toastQueue.add("<h1>Passkey authentication failed</h1>");
		}
	};

	container.appendChild(form);
	modal.appendChild(container);
	document.body.appendChild(modal);

	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			modal.remove();
		}
	});
}
