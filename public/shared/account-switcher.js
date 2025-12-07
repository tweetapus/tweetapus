import toastQueue from "./toasts.js";

export async function openAccountSwitcher() {
	const modal = document.createElement("div");
	modal.className = "account-switcher-modal";

	const container = document.createElement("div");
	container.className = "account-switcher-container";

	const header = document.createElement("div");
	header.className = "account-switcher-header";

	const title = document.createElement("h3");
	title.textContent = "Switch accounts";

	const closeBtn = document.createElement("button");
	closeBtn.className = "account-switcher-close";
	closeBtn.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	`;
	closeBtn.onclick = () => modal.remove();

	header.appendChild(title);
	header.appendChild(closeBtn);
	container.appendChild(header);

	const accountsList = document.createElement("div");
	accountsList.className = "accounts-list";

	try {
		const storedAccounts = JSON.parse(localStorage.getItem("accounts") || "[]");
		const currentToken = localStorage.getItem("authToken");

		const { default: query } = await import("../app/js/api.js");

		if (!currentToken) {
			toastQueue.add("<h1>No active session</h1>");
			modal.remove();
			return;
		}

		const currentUserResponse = await query("/auth/me");
		const currentUser = currentUserResponse.user;
		const isDelegate = currentUserResponse.isDelegate;

		accountsList.innerHTML = "";

		const currentAccountItem = createAccountItem(
			currentUser,
			true,
			isDelegate ? "Delegate" : "Current",
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
							gray: user.gray,
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

		const delegationsResponse = await query("/delegates/my-delegations");
		// Tr Cursor
		if (
			delegationsResponse?.delegations &&
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
	} catch (error) {
		console.error("Error loading accounts:", error);
		toastQueue.add("<h1>Failed to load accounts</h1>");
		modal.remove();
		return;
	}

	container.appendChild(accountsList);

	const addAccountBtn = document.createElement("button");
	addAccountBtn.textContent = "+ Add an account";
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
		verifiedBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="Verified Account"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="var(--primary)"></path><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
		verifiedBadge.style.color = "var(--primary)";
		nameRow.appendChild(verifiedBadge);
	}

	if (account.gold) {
		const goldBadge = document.createElement("svg");
		goldBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="Gold Account"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="#D4AF37"></path><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
		nameRow.appendChild(goldBadge);
	}

	if (account.gray) {
		const grayBadge = document.createElement("svg");
		grayBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="Gray Account"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="#829AAB"></path><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
		nameRow.appendChild(grayBadge);
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
		verifiedBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="Verified Account"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="var(--primary)"></path><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
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

	const username = document.createElement("div");
	username.textContent = `@${delegation.username}`;
	username.style.cssText = "font-size: 14px; color: var(--text-secondary);";

	info.appendChild(nameRow);
	info.appendChild(username);

	item.appendChild(avatar);
	item.appendChild(info);

	item.onclick = async () => {
		try {
			const { default: query } = await import("../app/js/api.js");
			const { success, token, error } = await query(
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
			const { default: query } = await import("../app/js/api.js");
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
					gray: user.gray,
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
			const { default: query } = await import("../app/js/api.js");

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
					gray: user.gray,
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
