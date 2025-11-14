(() => {
	const EXTENSIONS_ENDPOINT = "/api/extensions";
	const loaderFlag = "__tweetapusExtensionsLoaderActive";
	const rootWindow = window;

	if (rootWindow[loaderFlag]) return;
	rootWindow[loaderFlag] = true;

	const state = {
		ready: false,
		entries: [],
		errors: [],
	};

	const readyCallbacks = [];

	const buildFileUrl = (extension, relativePath) => {
		if (!relativePath) return null;
		return `${extension.fileEndpoint}?path=${encodeURIComponent(relativePath)}&v=${extension.bundleHash}`;
	};

	const markReady = () => {
		state.ready = true;
		while (readyCallbacks.length) {
			const callback = readyCallbacks.shift();
			try {
				callback([...state.entries]);
			} catch (error) {
				console.error("tweetapus extension callback failed", error);
			}
		}
		rootWindow.dispatchEvent(
			new CustomEvent("tweetapus:extensions-ready", {
				detail: [...state.entries],
			}),
		);
	};

	const injectExtensionAssets = (extension) => {
		if (!extension || !extension.id || !extension.rootFile) return;
		const safeId = extension.id;
		const stylePaths = Array.isArray(extension.styles) ? extension.styles : [];
		stylePaths.forEach((stylePath) => {
			const selector = `link[data-tweetapus-extension="${safeId}"][data-ext-path="${stylePath}"]`;
			if (document.querySelector(selector)) return;
			const href = buildFileUrl(extension, stylePath);
			if (!href) return;
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.dataset.tweetapusExtension = safeId;
			link.dataset.extPath = stylePath;
			document.head.appendChild(link);
		});

		const scriptSelector = `script[data-tweetapus-extension="${safeId}"][data-ext-path="${extension.rootFile}"]`;
		if (document.querySelector(scriptSelector)) return;

		const scriptUrl = buildFileUrl(extension, extension.rootFile);
		if (!scriptUrl) return;
		const script = document.createElement("script");
		script.type = extension.entryType === "script" ? "text/javascript" : "module";
		script.src = scriptUrl;
		script.dataset.tweetapusExtension = safeId;
		script.dataset.extPath = extension.rootFile;
		script.addEventListener("error", () => {
			console.error(`Failed to load extension ${extension.name || safeId}`);
		});
		document.head.appendChild(script);
	};

	const loadExtensions = async () => {
		try {
			const response = await fetch(EXTENSIONS_ENDPOINT, {
				credentials: "same-origin",
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const payload = await response.json();
			state.entries = Array.isArray(payload.extensions)
				? payload.extensions.filter((entry) => entry?.id && entry?.rootFile)
				: [];
			state.entries.forEach(injectExtensionAssets);
			markReady();
		} catch (error) {
			console.error("Unable to load tweetapus extensions", error);
			state.errors.push(error.message);
			markReady();
		}
	};

	const api = {
		list() {
			return [...state.entries];
		},
		onReady(callback) {
			if (typeof callback !== "function") return;
			if (state.ready) {
				callback([...state.entries]);
				return;
			}
			readyCallbacks.push(callback);
		},
		getAssetUrl(extensionId, relativePath) {
			if (!extensionId || typeof relativePath !== "string") return null;
			if (relativePath.includes("..")) return null;
			const extension = state.entries.find((entry) => entry.id === extensionId);
			return extension ? buildFileUrl(extension, relativePath) : null;
		},
	};

	if (!rootWindow.tweetapusExtensions) {
		Object.defineProperty(rootWindow, "tweetapusExtensions", {
			value: api,
			enumerable: false,
			configurable: false,
			writable: false,
		});
	}

	loadExtensions();
})();
