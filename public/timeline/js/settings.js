import showPage, { addRoute } from "./pages.js";

const settingsPages = [
	{
		key: "main",
		title: "Main",
		content: () => `
        h
        `,
	},
	{
		key: "other",
		title: "Other",
		content: () => `
        j
        `,
	},
];

const createSettingsPage = () => {
	const settingsContainer = document.createElement("div");
	settingsContainer.className = "settings";
	settingsContainer.style.display = "none";

	const sidebarButtons = settingsPages
		.map(
			(page) =>
				`<button class="settings-tab-btn${page.key === "main" ? " active" : ""}" data-tab="${page.key}">${page.title}</button>`,
		)
		.join("");

	settingsContainer.innerHTML = `
		<div class="settings-header">
			<a href="/" class="back-button">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
					<path d="m12 19-7-7 7-7"/>
					<path d="M19 12H5"/>
				</svg>
			</a>
			<div class="settings-header-info">
				<h1>Settings</h1>
			</div>
		</div>

		<div class="settings-body">
			<div class="settings-sidebar">
				${sidebarButtons}
			</div>
			<div class="settings-content" id="settings-content"></div>
		</div>
	`;

	const style = document.createElement("style");
	style.textContent = `
		.settings {
			flex-direction: column;
			min-height: 100vh;
		}

		.settings-header {
			display: flex;
			align-items: center;
			padding: 20px 0;
			border-bottom: 1px solid var(--border-primary);
			margin-bottom: 20px;
		}

		.back-button {
			background: none;
			border: none;
			color: var(--text-primary);
			cursor: pointer;
			padding: 8px;
			margin-right: 20px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.2s;
		}

		.back-button:hover {
			background-color: var(--surface-hover);
		}

		.settings-header-info h1 {
			margin: 0;
			font-size: 24px;
			font-weight: 700;
			color: var(--text-primary);
		}

		.settings-body {
			display: flex;
			gap: 20px;
			flex: 1;
		}

		.settings-sidebar {
			background-color: var(--bg-secondary);
			border-radius: 8px;
			padding: 8px;
			width: 200px;
			height: fit-content;
		}

		.settings-tab-btn {
			width: 100%;
			background: transparent;
			border: none;
			color: var(--text-primary);
			text-align: left;
			padding: 12px 16px;
			font-size: 16px;
			cursor: pointer;
			border-radius: 6px;
			margin-bottom: 4px;
			font-family: inherit;
			font-weight: 400;
			transition: background-color 0.2s;
		}

		.settings-tab-btn:hover {
			background-color: var(--surface-hover);
		}

		.settings-tab-btn.active {
			background-color: var(--primary);
			color: white;
			font-weight: 500;
		}

		.settings-content {
			background-color: var(--bg-secondary);
			border-radius: 8px;
			padding: 24px;
			flex: 1;
		}

		@media (max-width: 768px) {
			.settings-body {
				flex-direction: column;
			}

			.settings-sidebar {
				width: 100%;
				display: flex;
				overflow-x: auto;
				gap: 8px;
			}

			.settings-tab-btn {
				white-space: nowrap;
				margin-bottom: 0;
			}
		}
	`;

	document.head.appendChild(style);
	document.body.appendChild(settingsContainer);

	return settingsContainer;
};

let settingsPage;

const initializeSettings = () => {
	if (!settingsPage) {
		settingsPage = createSettingsPage();
	}

	const contentArea = settingsPage.querySelector("#settings-content");
	const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");

	const switchTab = (tabKey) => {
		const page = settingsPages.find((p) => p.key === tabKey);
		if (!page) {
			window.location.href = "/settings/main";
			return;
		}

		tabButtons.forEach((btn) => {
			if (btn.dataset.tab === tabKey) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});

		contentArea.innerHTML = page.content();

		const newPath = `/settings/${tabKey}`;
		if (window.location.pathname !== newPath) {
			window.history.pushState(null, null, newPath);
		}
	};

	tabButtons.forEach((btn) => {
		btn.addEventListener("click", () => {
			switchTab(btn.dataset.tab);
		});
	});

	const backButton = settingsPage.querySelector(".back-button");
	backButton.addEventListener("click", () => {
		window.location.href = "/";
	});

	const pathParts = window.location.pathname.split("/");
	let initialTab = pathParts[2];
	if (!initialTab || !settingsPages.find((p) => p.key === initialTab)) {
		initialTab = "main";
		window.history.replaceState(null, null, "/settings/main");
	}
	switchTab(initialTab);
};

export const openSettings = (section = "main") => {
	const page = showPage("settings", {
		path: `/settings/${section}`,
		recoverState: () => initializeSettings(),
	});

	if (!page) {
		initializeSettings();
		showPage("settings", { path: `/settings/${section}` });
	}

	return settingsPage;
};

addRoute(
	(pathname) => pathname.startsWith("/settings"),
	(pathname) => {
		const pathParts = pathname.split("/");
		const section = pathParts[2] || "main";
		const validSection = settingsPages.find((p) => p.key === section);
		openSettings(validSection ? section : "main");
	},
);
