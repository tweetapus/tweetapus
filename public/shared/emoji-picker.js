async function createEmojiPicker() {
	let mod = null;
	if (!customElements.get("emoji-picker")) {
		try {
			mod = await import(
				"/public/shared/assets/js/emoji-picker-element/index.js"
			);
		} catch (_err) {}
	}

	let custom = [];
	try {
		const resp = await fetch("/api/emojis");
		if (resp.ok) {
			const data = await resp.json();
			custom = (data.emojis || []).map((e) => ({
				name: e.name,
				shortcodes: [e.name],
				url: e.file_url,
				category: e.category || "Custom",
			}));
		}
	} catch (_err) {
		custom = [];
	}

	if (mod?.Picker) {
		try {
			const picker = new mod.Picker({
				customEmoji: custom,
				dataSource: `/public/shared/assets/js/emoji-picker-element/data.json`,
			});
			try {
				picker.dataset = picker.dataset || {};
				picker.dataset.hasCustom = "1";
			} catch (_e) {}
			return picker;
		} catch (_err) {}
	}

	const picker = document.createElement("emoji-picker");
	try {
		if (custom.length && typeof picker.setAttribute === "function") {
			picker.customEmoji = custom;
		}
	} catch (_e) {}
	return picker;
}

export async function showEmojiPickerPopup(onEmojiSelect, position = {}) {
	const picker = await createEmojiPicker(onEmojiSelect);
	picker.className = "emoji-picker emoji-picker-popup";

	document.querySelectorAll("emoji-picker").forEach((pickerEl) => {
		pickerEl.remove();
	});
	document.body.appendChild(picker);

	const rect = picker.getBoundingClientRect();
	let x = position.x ?? window.innerWidth / 2 - rect.width / 2;
	let y = position.y ?? window.innerHeight / 2 - rect.height / 2;

	if (x + rect.width > window.innerWidth)
		x = window.innerWidth - rect.width - 10;
	if (y + rect.height > window.innerHeight)
		y = window.innerHeight - rect.height - 10;
	if (x < 10) x = 10;
	if (y < 10) y = 10;

	picker.style.position = "fixed";
	picker.style.left = `${x}px`;
	picker.style.top = `${y}px`;

	const cleanup = () => {
		try {
			picker.parentNode?.removeChild(picker);
		} catch (_e) {}
		try {
			document.removeEventListener("click", closeOnClickOutside);
		} catch (_e) {}
	};

	picker.addEventListener("emoji-click", (event) => {
		try {
			const d = event.detail || {};
			let out = null;
			if (d.unicode) out = d.unicode;
			else if (d.name) out = `:${d.name}:`;
			else if (Array.isArray(d.shortcodes) && d.shortcodes[0])
				out = `:${d.shortcodes[0]}:`;
			else if (d.emoji) out = d.emoji;

			if (onEmojiSelect && out) onEmojiSelect(out);
		} catch {}
		cleanup();
	});

	const closeOnClickOutside = (e) => {
		const clickedInsidePicker = picker.contains(e.target);
		if (!clickedInsidePicker) {
			cleanup();
		}
	};

	setTimeout(() => document.addEventListener("click", closeOnClickOutside), 10);

	return picker;
}
