import api from "../timeline/js/api.js";

const PUBLIC_PAGE_SIZE = 10;
const EXPIRY_OPTIONS = [
	{ label: "Never", minutes: "" },
	{ label: "10 minutes", minutes: "10" },
	{ label: "1 hour", minutes: "60" },
	{ label: "6 hours", minutes: "360" },
	{ label: "1 day", minutes: "1440" },
	{ label: "1 week", minutes: "10080" },
	{ label: "Custom", minutes: "custom" },
];

const state = {
	mode: "create",
	createStatus: {
		loading: false,
		error: "",
		result: null,
	},
	publicList: {
		items: [],
		page: 0,
		loading: false,
		done: false,
		error: "",
	},
	view: {
		slug: null,
		secret: "",
		password: "",
		loading: false,
		data: null,
		error: "",
		needsPassword: false,
	},
	myPastes: {
		items: [],
		page: 0,
		loading: false,
		done: false,
		error: "",
	},
};

const app = document.getElementById("pasteApp");

const createEl = (tag, options = {}) => {
	const el = document.createElement(tag);
	if (options.className) el.className = options.className;
	if (options.text !== undefined) el.textContent = options.text;
	if (options.type) el.type = options.type;
	if (options.value !== undefined) el.value = options.value;
	if (options.placeholder) el.placeholder = options.placeholder;
	if (options.htmlFor) el.htmlFor = options.htmlFor;
	if (options.id) el.id = options.id;
	if (options.name) el.name = options.name;
	if (options.rows) el.rows = options.rows;
	if (options.autocomplete) el.autocomplete = options.autocomplete;
	if (options.required) el.required = true;
	if (options.disabled !== undefined) el.disabled = options.disabled;
	if (options.href) el.href = options.href;
	if (options.rel) el.rel = options.rel;
	if (options.target) el.target = options.target;
	if (options.attrs) {
		Object.entries(options.attrs).forEach(([key, value]) => {
			el.setAttribute(key, value);
		});
	}
	return el;
};

const clearNode = (node) => {
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}
};

const readLocation = () => {
	const url = new URL(window.location.href);
	// Prefer path-based slug: /pastes/p/<slug>
	let slug = null;
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts[0] === "pastes" && parts[1] === "p" && parts[2]) {
		slug = decodeURIComponent(parts[2]);
	} else {
		slug = url.searchParams.get("slug");
	}
	return {
		slug,
		secret: url.searchParams.get("secret") || "",
	};
};

const updateUrl = (slug, secret, replace = true) => {
	const path = slug ? `/pastes/p/${encodeURIComponent(slug)}` : "/pastes";
	const next = new URL(path, window.location.origin);
	if (secret) next.searchParams.set("secret", secret);
	const stateObj = {
		...(history.state || {}),
		page: "pastes",
		slug: slug || null,
		secret: secret || null,
	};
	if (replace) history.replaceState(stateObj, "", next);
	else history.pushState(stateObj, "", next);
};

const formatRelative = (iso) => {
	if (!iso) return "No expiry";
	const target = new Date(iso);
	if (Number.isNaN(target.getTime())) return "Unknown";
	const diff = target.getTime() - Date.now();
	if (diff <= 0) return "Expired";
	const minutes = Math.floor(diff / 60000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return target.toLocaleString();
};

const formatDate = (iso) => {
	if (!iso) return "Unknown";
	const dt = new Date(iso);
	if (Number.isNaN(dt.getTime())) return "Unknown";
	return dt.toLocaleString();
};

const buildPageLink = (slug, secret) => {
	const url = new URL(
		`/pastes/p/${encodeURIComponent(slug)}`,
		window.location.origin,
	);
	if (secret) url.searchParams.set("secret", secret);
	return url.toString();
};

const buildRawLink = (id, secret) => {
	const url = new URL(
		`/api/pastes/raw/${encodeURIComponent(id)}`,
		window.location.origin,
	);
	if (secret) {
		url.searchParams.set("secret", secret);
	}
	return url.toString();
};

const renderApp = () => {
	clearNode(app);
	const shell = createEl("div", { className: "paste-shell" });
	shell.append(renderNav());
	if (state.mode === "create") {
		shell.append(renderCreateCard());
	}
	if (state.mode === "explore") {
		shell.append(renderExploreCard());
	}
	if (state.mode === "view") {
		shell.append(renderViewCard());
	}
	if (state.mode === "mine") {
		shell.append(renderMyPastesCard());
	}
	app.append(shell);
};

const renderNav = () => {
	const nav = createEl("div", { className: "paste-nav" });
	const left = createEl("div", { className: "paste-nav-left" });
	const title = createEl("div", { className: "paste-title", text: "Pastes" });
	const subtitle = createEl("div", {
		className: "status-line",
		text: "Self-hosted snippets with privacy controls.",
	});
	left.append(title, subtitle);

	const actions = createEl("div", { className: "nav-actions" });
	const createBtn = createEl("button", {
		className: `nav-btn${state.mode === "create" ? " active" : ""}`,
		text: "Create",
		type: "button",
	});
	createBtn.addEventListener("click", () => {
		state.mode = "create";
		state.view.slug = null;
		state.view.data = null;
		state.view.error = "";
		state.view.needsPassword = false;
		updateUrl(null, null);
		renderApp();
	});

	const exploreBtn = createEl("button", {
		className: `nav-btn${state.mode === "explore" ? " active" : ""}`,
		text: "Explore",
		type: "button",
	});
	exploreBtn.addEventListener("click", () => {
		state.mode = "explore";
		state.view.slug = null;
		state.view.data = null;
		state.view.error = "";
		state.view.needsPassword = false;
		updateUrl(null, null);
		if (!state.publicList.items.length && !state.publicList.loading) {
			loadPublicPastes(true);
		}
		renderApp();
	});

	const mineBtn = createEl("button", {
		className: `nav-btn${state.mode === "mine" ? " active" : ""}`,
		text: "My Pastes",
		type: "button",
	});
	mineBtn.addEventListener("click", () => {
		state.mode = "mine";
		state.view.slug = null;
		state.view.data = null;
		state.view.error = "";
		state.view.needsPassword = false;
		updateUrl(null, null);
		if (!state.myPastes.items.length && !state.myPastes.loading) {
			loadMyPastes(true);
		}
		renderApp();
	});

	const viewBtn = createEl("button", {
		className: `nav-btn${state.mode === "view" ? " active" : ""}`,
		text: "View",
		type: "button",
		disabled: !state.view.slug,
	});
	viewBtn.addEventListener("click", () => {
		if (!state.view.slug) return;
		state.mode = "view";
		renderApp();
	});

	const openForm = createEl("form", { className: "open-form" });
	const slugInput = createEl("input", {
		placeholder: "Enter slug",
		name: "slug",
		autocomplete: "off",
	});
	const openButton = createEl("button", {
		className: "btn secondary",
		text: "Open",
		type: "submit",
	});
	openForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const targetSlug = slugInput.value.trim();
		if (!targetSlug) return;
		openPaste(targetSlug);
	});
	openForm.append(slugInput, openButton);

	actions.append(createBtn, exploreBtn, mineBtn, viewBtn, openForm);
	nav.append(left, actions);
	return nav;
};

const renderCreateCard = () => {
	const form = createEl("form", { className: "card" });
	const titleRow = createEl("div", { className: "form-row" });
	const titleLabel = createEl("label", {
		text: "Title",
		htmlFor: "paste-title",
	});
	const titleInput = createEl("input", {
		id: "paste-title",
		name: "title",
		placeholder: "Snippet title (optional)",
		autocomplete: "off",
	});
	titleRow.append(titleLabel, titleInput);

	const languageRow = createEl("div", { className: "form-row" });
	const languageLabel = createEl("label", {
		text: "Language",
		htmlFor: "paste-language",
	});
	const languageInput = createEl("input", {
		id: "paste-language",
		name: "language",
		placeholder: "Language hint (optional)",
		autocomplete: "off",
	});
	languageRow.append(languageLabel, languageInput);

	const contentRow = createEl("div", { className: "form-row" });
	const contentLabel = createEl("label", {
		text: "Content",
		htmlFor: "paste-content",
	});
	const contentInput = createEl("textarea", {
		id: "paste-content",
		name: "content",
		placeholder: "Paste your snippet here...",
		rows: 14,
		required: true,
	});
	contentRow.append(contentLabel, contentInput);

	const controlsRow = createEl("div", { className: "form-row" });
	const expireLabel = createEl("label", {
		text: "Expires",
		htmlFor: "paste-expiry",
	});
	const expireSelect = createEl("select", {
		id: "paste-expiry",
		name: "expiry",
	});
	EXPIRY_OPTIONS.forEach((option) => {
		const opt = document.createElement("option");
		opt.value = option.minutes;
		opt.textContent = option.label;
		expireSelect.append(opt);
	});
	controlsRow.append(expireLabel, expireSelect);

	const customExpiryRow = createEl("div", {
		className: "form-row custom-expiry-row hidden",
	});
	const customExpiryLabel = createEl("label", {
		text: "Custom expiry (minutes)",
		htmlFor: "paste-custom-expiry",
	});
	const customExpiryInput = createEl("input", {
		id: "paste-custom-expiry",
		name: "customExpiry",
		type: "number",
		placeholder: "e.g. 120 for 2 hours",
		autocomplete: "off",
	});
	customExpiryInput.min = "1";
	customExpiryRow.append(customExpiryLabel, customExpiryInput);

	expireSelect.addEventListener("change", () => {
		if (expireSelect.value === "custom") {
			customExpiryRow.classList.remove("hidden");
		} else {
			customExpiryRow.classList.add("hidden");
		}
	});

	const passwordRow = createEl("div", { className: "form-row" });
	const passwordLabel = createEl("label", {
		text: "Password (optional)",
		htmlFor: "paste-password",
	});
	const passwordInput = createEl("input", {
		id: "paste-password",
		name: "password",
		type: "password",
		placeholder: "Leave empty for no password",
		autocomplete: "new-password",
	});
	passwordRow.append(passwordLabel, passwordInput);

	const toggleRow = createEl("div", { className: "toggle-row" });
	const privateLabel = createEl("label");
	const privateInput = createEl("input", {
		type: "checkbox",
		name: "private",
		id: "paste-private",
	});
	privateLabel.append(privateInput, createEl("span", { text: "Private" }));

	const burnLabel = createEl("label");
	const burnInput = createEl("input", {
		type: "checkbox",
		name: "burn",
		id: "paste-burn",
	});
	burnLabel.append(burnInput, createEl("span", { text: "Burn after reading" }));

	const showAuthorLabel = createEl("label");
	const showAuthorInput = createEl("input", {
		type: "checkbox",
		name: "showAuthor",
		id: "paste-show-author",
	});
	showAuthorInput.checked = true;
	showAuthorLabel.append(
		showAuthorInput,
		createEl("span", { text: "Show author" }),
	);

	toggleRow.append(privateLabel, burnLabel, showAuthorLabel);

	const submitRow = createEl("div", { className: "form-row" });
	const submitBtn = createEl("button", {
		className: "btn primary",
		text: state.createStatus.loading ? "Creating..." : "Publish paste",
		type: "submit",
		disabled: state.createStatus.loading,
	});
	const status = createEl("div", {
		className: state.createStatus.error ? "error-text" : "status-line",
		text: state.createStatus.error
			? state.createStatus.error
			: "Supports up to 200k characters.",
	});
	submitRow.append(submitBtn, status);

	form.append(
		titleRow,
		languageRow,
		contentRow,
		controlsRow,
		customExpiryRow,
		passwordRow,
		toggleRow,
		submitRow,
	);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		await handleCreate(event.currentTarget);
	});

	if (state.createStatus.result) {
		form.append(renderResultCard(state.createStatus.result));
	}

	return form;
};

const renderResultCard = (result) => {
	const card = createEl("div", { className: "result-card" });
	card.append(createEl("strong", { text: "Paste ready" }));
	card.append(
		createEl("div", {
			className: "status-line",
			text: result.burn_after_reading
				? "This paste deletes itself after the next view."
				: "Share the link below.",
		}),
	);

	const linkRow = createEl("div", { className: "link-row" });
	const pageLink = buildPageLink(result.slug, result.secret_key || "");
	const rawLink = buildRawLink(
		result.slug || result.id,
		result.secret_key || "",
	);

	const pageBtn = createEl("button", {
		className: "btn secondary",
		text: "Copy share link",
		type: "button",
	});
	pageBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(pageLink);
			pageBtn.textContent = "Copied";
			setTimeout(() => {
				pageBtn.textContent = "Copy share link";
			}, 1500);
		} catch {}
	});

	const rawBtn = createEl("button", {
		className: "btn secondary",
		text: "Copy raw link",
		type: "button",
	});
	rawBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(rawLink);
			rawBtn.textContent = "Copied";
			setTimeout(() => {
				rawBtn.textContent = "Copy raw link";
			}, 1500);
		} catch {}
	});

	const viewBtn = createEl("button", {
		className: "btn secondary",
		text: "Open paste",
		type: "button",
	});
	viewBtn.addEventListener("click", () => {
		openPaste(result.slug, result.secret_key || "");
	});

	linkRow.append(pageBtn, rawBtn, viewBtn);
	card.append(linkRow);

	if (result.secret_key) {
		card.append(
			createEl("div", {
				className: "status-line",
				text: `Secret key: ${result.secret_key}`,
			}),
		);
	}

	return card;
};

const renderExploreCard = () => {
	const card = createEl("div", { className: "card" });
	card.append(createEl("strong", { text: "Latest public pastes" }));

	if (state.publicList.error) {
		card.append(
			createEl("div", {
				className: "error-text",
				text: state.publicList.error,
			}),
		);
	}

	if (!state.publicList.items.length && state.publicList.loading) {
		card.append(
			createEl("div", { className: "status-line", text: "Loading..." }),
		);
		return card;
	}

	if (!state.publicList.items.length) {
		card.append(
			createEl("div", {
				className: "empty-state",
				text: "No public pastes yet.",
			}),
		);
	} else {
		const list = createEl("div", { className: "public-list" });
		state.publicList.items.forEach((item) => {
			list.append(renderPublicItem(item));
		});
		card.append(list);
	}

	const controls = createEl("div", { className: "command-bar" });
	const reloadBtn = createEl("button", {
		className: "btn secondary",
		text: "Refresh",
		type: "button",
		disabled: state.publicList.loading,
	});
	reloadBtn.addEventListener("click", () => loadPublicPastes(true));
	controls.append(reloadBtn);

	if (!state.publicList.done) {
		const moreBtn = createEl("button", {
			className: "btn secondary",
			text: state.publicList.loading ? "Loading..." : "Load more",
			type: "button",
			disabled: state.publicList.loading,
		});
		moreBtn.addEventListener("click", () => loadPublicPastes(false));
		controls.append(moreBtn);
	}

	card.append(controls);
	return card;
};

const renderPublicItem = (item) => {
	const entry = createEl("div", { className: "list-item" });
	entry.append(
		createEl("div", {
			className: "item-title",
			text: item.title || item.slug,
		}),
	);
	entry.append(
		createEl("div", {
			className: "item-meta",
			text: `Views ${item.view_count || 0} • ${formatDate(item.created_at)}`,
		}),
	);
	const lang = createEl("div", {
		className: "status-line",
		text: item.language ? `Language: ${item.language}` : "Language: Plain",
	});
	entry.append(lang);
	const openBtn = createEl("button", {
		className: "btn secondary",
		text: "Open",
		type: "button",
	});
	openBtn.addEventListener("click", () => openPaste(item.slug));
	entry.append(openBtn);
	return entry;
};

const renderViewCard = () => {
	const card = createEl("div", { className: "card" });
	card.append(createEl("strong", { text: "View paste" }));

	if (!state.view.slug) {
		card.append(
			createEl("div", {
				className: "empty-state",
				text: "Pick a paste from Explore or enter a slug.",
			}),
		);
		return card;
	}

	card.append(
		createEl("div", {
			className: "status-line",
			text: `Slug: ${state.view.slug}`,
		}),
	);

	if (state.view.loading) {
		card.append(
			createEl("div", { className: "status-line", text: "Loading..." }),
		);
		return card;
	}

	if (state.view.needsPassword) {
		card.append(renderPasswordForm());
		return card;
	}

	if (state.view.error) {
		card.append(
			createEl("div", { className: "error-text", text: state.view.error }),
		);
		card.append(renderSecretForm());
		return card;
	}

	if (!state.view.data) {
		card.append(
			createEl("div", { className: "status-line", text: "No data." }),
		);
		return card;
	}

	const paste = state.view.data;
	const chips = createEl("div", { className: "chip-row" });
	chips.append(
		createEl("div", {
			className: "chip",
			text: paste.language ? paste.language : "Plain text",
		}),
		createEl("div", {
			className: "chip",
			text: `Views ${paste.view_count || 0}`,
		}),
		createEl("div", {
			className: "chip",
			text: `Created ${formatDate(paste.created_at)}`,
		}),
	);
	chips.append(
		createEl("div", {
			className: "chip",
			text: formatRelative(paste.expires_at),
		}),
	);
	if (paste.has_password) {
		chips.append(
			createEl("div", {
				className: "chip",
				text: "🔒 Password",
			}),
		);
	}
	card.append(chips);

	const codeBlock = createEl("div", { className: "code-block" });
	const pre = createEl("pre");
	const code = createEl("code");
	code.textContent = paste.content || "";
	if (paste.language) {
		code.className = `language-${paste.language.toLowerCase()}`;
	}
	pre.append(code);
	codeBlock.append(pre);
	card.append(codeBlock);

	highlightCode(code, paste.language);

	const commands = createEl("div", { className: "command-bar" });
	const shareBtn = createEl("button", {
		className: "btn secondary",
		text: "Copy link",
		type: "button",
	});
	shareBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(
				buildPageLink(paste.slug, state.view.secret || ""),
			);
			shareBtn.textContent = "Copied";
			setTimeout(() => {
				shareBtn.textContent = "Copy link";
			}, 1500);
		} catch {}
	});

	const rawBtn = createEl("button", {
		className: "btn secondary",
		text: "Open raw",
		type: "button",
	});
	rawBtn.addEventListener("click", () => {
		let rawUrl = buildRawLink(paste.slug || paste.id, state.view.secret || "");
		if (state.view.password) {
			const url = new URL(rawUrl);
			url.searchParams.set("password", state.view.password);
			rawUrl = url.toString();
		}
		window.open(rawUrl, "_blank");
	});

	const newBtn = createEl("button", {
		className: "btn secondary",
		text: "New paste",
		type: "button",
	});
	newBtn.addEventListener("click", () => {
		state.mode = "create";
		state.view.slug = null;
		state.view.data = null;
		state.view.error = "";
		state.view.needsPassword = false;
		state.view.password = "";
		updateUrl(null, null);
		renderApp();
	});

	commands.append(shareBtn, rawBtn, newBtn);
	card.append(commands);

	if (paste.burn_after_reading) {
		card.append(
			createEl("div", {
				className: "error-text",
				text: "Heads up: this paste will be removed after this view.",
			}),
		);
	}

	return card;
};

const renderPasswordForm = () => {
	const form = createEl("form", { className: "secret-form" });
	form.append(
		createEl("div", {
			className: "status-line",
			text: "This paste is password-protected. Enter the password to view.",
		}),
	);
	const input = createEl("input", {
		placeholder: "Password",
		type: "password",
		value: state.view.password,
		autocomplete: "off",
	});
	const submit = createEl("button", {
		className: "btn primary",
		text: "Unlock",
		type: "submit",
	});
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		state.view.password = input.value.trim();
		state.view.needsPassword = false;
		if (!state.view.slug) return;
		loadPaste(state.view.slug, state.view.secret, state.view.password);
	});
	form.append(input, submit);
	return form;
};

const renderSecretForm = () => {
	const form = createEl("form", { className: "secret-form" });
	form.append(
		createEl("div", {
			className: "status-line",
			text: "Private paste. Provide the secret key to unlock.",
		}),
	);
	const input = createEl("input", {
		placeholder: "Secret key",
		value: state.view.secret,
		autocomplete: "off",
	});
	const submit = createEl("button", {
		className: "btn primary",
		text: "Unlock",
		type: "submit",
	});
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		state.view.secret = input.value.trim();
		if (!state.view.slug) return;
		loadPaste(state.view.slug, state.view.secret);
	});
	form.append(input, submit);
	return form;
};

const minutesToISO = (value) => {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	return new Date(Date.now() + amount * 60_000).toISOString();
};

const handleCreate = async (form) => {
	let expiryMinutes = form.expiry.value;
	if (expiryMinutes === "custom") {
		expiryMinutes = form.customExpiry.value;
	}
	const formData = {
		title: form.title.value.trim() || null,
		language: form.language.value.trim() || null,
		content: form.content.value,
		is_public: !form.private.checked,
		burn_after_reading: form.burn.checked,
		expires_at: minutesToISO(expiryMinutes),
		password: form.password.value.trim() || null,
		show_author: form.showAuthor.checked,
	};

	state.createStatus.loading = true;
	state.createStatus.error = "";
	renderApp();

	const payload = {
		title: formData.title,
		language: formData.language,
		content: formData.content,
		is_public: formData.is_public,
		burn_after_reading: formData.burn_after_reading,
		expires_at: formData.expires_at,
		password: formData.password,
		show_author: formData.show_author,
	};

	const response = await api("/pastes", {
		method: "POST",
		body: JSON.stringify(payload),
	});

	state.createStatus.loading = false;
	if (!response || response.error) {
		state.createStatus.error = response?.error || "Failed to create paste";
		renderApp();
		return;
	}

	state.createStatus.result = response.paste;
	form.reset();
	renderApp();
};

const loadPublicPastes = async (reset) => {
	if (state.publicList.loading) return;
	if (reset) {
		state.publicList.items = [];
		state.publicList.page = 0;
		state.publicList.done = false;
		state.publicList.error = "";
	}
	state.publicList.loading = true;
	renderApp();
	const response = await api(
		`/pastes/public?limit=${PUBLIC_PAGE_SIZE}&page=${state.publicList.page}`,
	);
	state.publicList.loading = false;
	if (!response || response.error) {
		state.publicList.error = response?.error || "Unable to load pastes";
		renderApp();
		return;
	}
	const rows = response.pastes || [];
	state.publicList.items = reset ? rows : state.publicList.items.concat(rows);
	state.publicList.page += 1;
	if (rows.length < PUBLIC_PAGE_SIZE) {
		state.publicList.done = true;
	}
	renderApp();
};

const openPaste = (slug, secret = "", password = "") => {
	const trimmedSlug = slug.trim();
	if (!trimmedSlug) return;
	state.mode = "view";
	state.view.slug = trimmedSlug;
	state.view.secret = secret.trim();
	state.view.password = password.trim();
	state.view.data = null;
	state.view.error = "";
	state.view.needsPassword = false;
	updateUrl(trimmedSlug, state.view.secret || null, false);
	loadPaste(trimmedSlug, state.view.secret, state.view.password);
	renderApp();
};

const loadPaste = async (slug, secret, password = "") => {
	if (!slug) return;
	state.view.loading = true;
	state.view.error = "";
	state.view.data = null;
	state.view.needsPassword = false;
	renderApp();
	const queryParams = [];
	if (secret) queryParams.push(`secret=${encodeURIComponent(secret)}`);
	if (password) queryParams.push(`password=${encodeURIComponent(password)}`);
	const queryString = queryParams.length ? `?${queryParams.join("&")}` : "";
	const response = await api(
		`/pastes/${encodeURIComponent(slug)}${queryString}`,
	);
	state.view.loading = false;
	if (!response || response.error) {
		if (response?.password_protected) {
			state.view.needsPassword = true;
			renderApp();
			return;
		}
		state.view.error = response?.error || "Unable to load paste";
		renderApp();
		return;
	}
	state.view.data = response.paste;
	renderApp();
};

let hljsLoaded = false;
const loadHighlightJS = () => {
	if (hljsLoaded) return Promise.resolve();
	return new Promise((resolve) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href =
			"https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
		document.head.appendChild(link);
		const script = document.createElement("script");
		script.src =
			"https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
		script.onload = () => {
			hljsLoaded = true;
			resolve();
		};
		script.onerror = () => resolve();
		document.head.appendChild(script);
	});
};

const highlightCode = async (codeElement, language) => {
	await loadHighlightJS();
	if (!window.hljs) return;
	if (language) {
		try {
			const result = window.hljs.highlight(codeElement.textContent, {
				language: language.toLowerCase(),
				ignoreIllegals: true,
			});
			codeElement.innerHTML = result.value;
			codeElement.classList.add("hljs");
		} catch {
			window.hljs.highlightElement(codeElement);
		}
	} else {
		window.hljs.highlightElement(codeElement);
	}
};

const loadMyPastes = async (reset) => {
	if (state.myPastes.loading) return;
	if (reset) {
		state.myPastes.items = [];
		state.myPastes.page = 0;
		state.myPastes.done = false;
		state.myPastes.error = "";
	}
	state.myPastes.loading = true;
	renderApp();
	const response = await api(
		`/pastes/mine/list?limit=${PUBLIC_PAGE_SIZE}&page=${state.myPastes.page}`,
	);
	state.myPastes.loading = false;
	if (!response || response.error) {
		state.myPastes.error = response?.error || "Unable to load your pastes";
		renderApp();
		return;
	}
	const rows = response.pastes || [];
	state.myPastes.items = reset ? rows : state.myPastes.items.concat(rows);
	state.myPastes.page += 1;
	if (rows.length < PUBLIC_PAGE_SIZE) {
		state.myPastes.done = true;
	}
	renderApp();
};

const deletePaste = async (slug) => {
	if (!confirm("Are you sure you want to delete this paste?")) return;
	const response = await api(`/pastes/${encodeURIComponent(slug)}`, {
		method: "DELETE",
	});
	if (!response || response.error) {
		alert(response?.error || "Failed to delete paste");
		return;
	}
	state.myPastes.items = state.myPastes.items.filter((p) => p.slug !== slug);
	renderApp();
};

const renderMyPastesCard = () => {
	const card = createEl("div", { className: "card" });
	card.append(createEl("strong", { text: "My Pastes" }));

	if (state.myPastes.error) {
		card.append(
			createEl("div", {
				className: "error-text",
				text: state.myPastes.error,
			}),
		);
	}

	if (!state.myPastes.items.length && state.myPastes.loading) {
		card.append(
			createEl("div", { className: "status-line", text: "Loading..." }),
		);
		return card;
	}

	if (!state.myPastes.items.length) {
		card.append(
			createEl("div", {
				className: "empty-state",
				text: "You haven't created any pastes yet.",
			}),
		);
	} else {
		const list = createEl("div", { className: "public-list" });
		state.myPastes.items.forEach((item) => {
			list.append(renderMyPasteItem(item));
		});
		card.append(list);
	}

	const controls = createEl("div", { className: "command-bar" });
	const reloadBtn = createEl("button", {
		className: "btn secondary",
		text: "Refresh",
		type: "button",
		disabled: state.myPastes.loading,
	});
	reloadBtn.addEventListener("click", () => loadMyPastes(true));
	controls.append(reloadBtn);

	if (!state.myPastes.done) {
		const moreBtn = createEl("button", {
			className: "btn secondary",
			text: state.myPastes.loading ? "Loading..." : "Load more",
			type: "button",
			disabled: state.myPastes.loading,
		});
		moreBtn.addEventListener("click", () => loadMyPastes(false));
		controls.append(moreBtn);
	}

	card.append(controls);
	return card;
};

const renderMyPasteItem = (item) => {
	const entry = createEl("div", { className: "list-item" });
	entry.append(
		createEl("div", {
			className: "item-title",
			text: item.title || item.slug,
		}),
	);
	const metaParts = [
		`Views ${item.view_count || 0}`,
		formatDate(item.created_at),
	];
	if (!item.is_public) metaParts.push("Private");
	if (item.has_password) metaParts.push("🔒");
	if (item.burn_after_reading) metaParts.push("Burn");
	entry.append(
		createEl("div", {
			className: "item-meta",
			text: metaParts.join(" • "),
		}),
	);
	const lang = createEl("div", {
		className: "status-line",
		text: item.language ? `Language: ${item.language}` : "Language: Plain",
	});
	entry.append(lang);
	const btnRow = createEl("div", { className: "item-actions" });
	const openBtn = createEl("button", {
		className: "btn secondary",
		text: "Open",
		type: "button",
	});
	openBtn.addEventListener("click", () => openPaste(item.slug));
	const deleteBtn = createEl("button", {
		className: "btn danger",
		text: "Delete",
		type: "button",
	});
	deleteBtn.addEventListener("click", () => deletePaste(item.slug));
	btnRow.append(openBtn, deleteBtn);
	entry.append(btnRow);
	return entry;
};

const boot = () => {
	const { slug, secret } = readLocation();
	if (slug) {
		state.mode = "view";
		state.view.slug = slug;
		state.view.secret = secret;
		loadPaste(slug, secret);
	} else {
		renderApp();
	}

	// single handler registered in boot
};

window.addEventListener("popstate", () => {
	// Ensure paste UI updates when user navigates back or forward
	const path = window.location.pathname || "";
	if (!path.startsWith("/pastes")) return;
	const { slug, secret } = readLocation();
	if (slug) {
		state.mode = "view";
		state.view.slug = slug;
		state.view.secret = secret;
		state.view.data = null;
		state.view.error = "";
		loadPaste(slug, secret);
	} else {
		state.mode = "create";
		state.view.slug = null;
		state.view.data = null;
		state.view.error = "";
		renderApp();
	}
});

boot();
