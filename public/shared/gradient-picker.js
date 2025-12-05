export function createGradientPicker(options = {}) {
	const { onChange, initialValue = "", id = "" } = options;

	const container = document.createElement("div");
	container.className = "gradient-picker";
	if (id) container.id = id;

	const preview = document.createElement("div");
	preview.className = "gradient-picker-preview";
	const previewInner = document.createElement("div");
	previewInner.className = "gradient-picker-preview-inner";
	preview.appendChild(previewInner);

	const controls = document.createElement("div");
	controls.className = "gradient-picker-controls";

	const modeSelector = document.createElement("div");
	modeSelector.className = "gradient-picker-mode";

	const solidBtn = document.createElement("button");
	solidBtn.type = "button";
	solidBtn.textContent = "Solid";
	solidBtn.className = "active";

	const gradientBtn = document.createElement("button");
	gradientBtn.type = "button";
	gradientBtn.textContent = "Gradient";

	modeSelector.appendChild(solidBtn);
	modeSelector.appendChild(gradientBtn);

	const colorInputs = document.createElement("div");
	colorInputs.className = "gradient-picker-color-inputs";

	const color1Container = document.createElement("div");
	color1Container.className = "gradient-picker-color-input";
	const color1Picker = document.createElement("input");
	color1Picker.type = "color";
	color1Picker.value = "#ff0000";
	const color1Hex = document.createElement("input");
	color1Hex.type = "text";
	color1Hex.className = "gradient-picker-hex-input";
	color1Hex.placeholder = "#ff0000";
	color1Hex.value = "#ff0000";
	color1Container.appendChild(color1Picker);
	color1Container.appendChild(color1Hex);

	const color2Container = document.createElement("div");
	color2Container.className = "gradient-picker-color-input";
	color2Container.style.display = "none";
	const color2Picker = document.createElement("input");
	color2Picker.type = "color";
	color2Picker.value = "#0000ff";
	const color2Hex = document.createElement("input");
	color2Hex.type = "text";
	color2Hex.className = "gradient-picker-hex-input";
	color2Hex.placeholder = "#0000ff";
	color2Hex.value = "#0000ff";
	color2Container.appendChild(color2Picker);
	color2Container.appendChild(color2Hex);

	const directionContainer = document.createElement("div");
	directionContainer.className = "gradient-picker-direction";
	directionContainer.style.display = "none";
	const directionSelect = document.createElement("select");
	const directions = [
		{ value: "to right", label: "→" },
		{ value: "to left", label: "←" },
		{ value: "to bottom", label: "↓" },
		{ value: "to top", label: "↑" },
		{ value: "to bottom right", label: "↘" },
		{ value: "to bottom left", label: "↙" },
		{ value: "to top right", label: "↗" },
		{ value: "to top left", label: "↖" },
	];
	for (const dir of directions) {
		const opt = document.createElement("option");
		opt.value = dir.value;
		opt.textContent = dir.label;
		directionSelect.appendChild(opt);
	}
	directionContainer.appendChild(directionSelect);

	const actionsRow = document.createElement("div");
	actionsRow.className = "gradient-picker-actions";

	const swapBtn = document.createElement("button");
	swapBtn.type = "button";
	swapBtn.className = "gradient-picker-action";
	swapBtn.textContent = "Swap";

	const presetsRow = document.createElement("div");
	presetsRow.className = "gradient-picker-presets";

	const presets = [
		{
			label: "Sunrise",
			value: "linear-gradient(to right, #ff8a00, #f83600)",
		},
		{
			label: "Aurora",
			value: "linear-gradient(to right, #7f7fd5, #86a8e7)",
		},
		{
			label: "Lagoon",
			value: "linear-gradient(to right, #2af598, #009efd)",
		},
		{
			label: "Candy",
			value: "linear-gradient(to right, #ff6fd8, #3813c2)",
		},
	];

	presets.forEach((preset) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "gradient-picker-preset";
		btn.title = preset.label;
		btn.dataset.value = preset.value;
		btn.style.backgroundImage = preset.value;
		btn.addEventListener("click", () => {
			parseValue(preset.value);
		});
		presetsRow.appendChild(btn);
	});

	const clearBtn = document.createElement("button");
	clearBtn.type = "button";
	clearBtn.className = "gradient-picker-clear";
	clearBtn.textContent = "Clear";

	colorInputs.appendChild(color1Container);
	colorInputs.appendChild(color2Container);

	controls.appendChild(modeSelector);
	controls.appendChild(colorInputs);
	controls.appendChild(directionContainer);
	actionsRow.appendChild(swapBtn);
	actionsRow.appendChild(presetsRow);
	controls.appendChild(actionsRow);
	controls.appendChild(clearBtn);

	container.appendChild(preview);
	container.appendChild(controls);

	let mode = "solid";
	let currentValue = "";

	const updatePreview = () => {
		if (!currentValue) {
			previewInner.style.background = "var(--bg-tertiary)";
		} else {
			previewInner.style.background = currentValue;
		}
	};

	preview.addEventListener("click", () => {
		setMode(mode === "solid" ? "gradient" : "solid");
	});

	const getValue = () => {
		if (mode === "solid") {
			return color1Hex.value || "";
		}
		const c1 = color1Hex.value || "#ff0000";
		const c2 = color2Hex.value || "#0000ff";
		const dir = directionSelect.value;
		return `linear-gradient(${dir}, ${c1}, ${c2})`;
	};

	const emitChange = () => {
		currentValue = getValue();
		updatePreview();
		if (onChange) onChange(currentValue);
	};

	const setMode = (newMode) => {
		mode = newMode;
		if (mode === "solid") {
			solidBtn.className = "active";
			gradientBtn.className = "";
			color2Container.style.display = "none";
			directionContainer.style.display = "none";
		} else {
			solidBtn.className = "";
			gradientBtn.className = "active";
			color2Container.style.display = "flex";
			directionContainer.style.display = "flex";
		}
		emitChange();
	};

	const parseValue = (val) => {
		if (!val) {
			color1Picker.value = "#ff0000";
			color1Hex.value = "";
			color2Picker.value = "#0000ff";
			color2Hex.value = "";
			setMode("solid");
			currentValue = "";
			updatePreview();
			return;
		}

		const gradientMatch = val.match(
			/linear-gradient\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i,
		);
		if (gradientMatch) {
			setMode("gradient");
			const direction = gradientMatch[1].trim();
			const c1 = gradientMatch[2].trim();
			const c2 = gradientMatch[3].trim();

			for (const opt of directionSelect.options) {
				if (opt.value === direction) {
					directionSelect.value = direction;
					break;
				}
			}

			color1Hex.value = c1;
			color1Picker.value = toHexColor(c1);
			color2Hex.value = c2;
			color2Picker.value = toHexColor(c2);
		} else {
			setMode("solid");
			color1Hex.value = val;
			color1Picker.value = toHexColor(val);
		}

		currentValue = val;
		updatePreview();
	};

	const toHexColor = (color) => {
		if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
		if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
			return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
		}
		const namedColors = {
			red: "#ff0000",
			blue: "#0000ff",
			green: "#008000",
			yellow: "#ffff00",
			purple: "#800080",
			orange: "#ffa500",
			pink: "#ffc0cb",
			cyan: "#00ffff",
			magenta: "#ff00ff",
			white: "#ffffff",
			black: "#000000",
			gray: "#808080",
			grey: "#808080",
			gold: "#ffd700",
			silver: "#c0c0c0",
		};
		return namedColors[color.toLowerCase()] || "#ff0000";
	};

	solidBtn.addEventListener("click", () => setMode("solid"));
	gradientBtn.addEventListener("click", () => setMode("gradient"));
	swapBtn.addEventListener("click", () => {
		const c1 = color1Hex.value || "#ff0000";
		const c2 = color2Hex.value || "#0000ff";
		color1Hex.value = c2;
		color1Picker.value = toHexColor(c2);
		color2Hex.value = c1;
		color2Picker.value = toHexColor(c1);
		setMode("gradient");
	});

	color1Picker.addEventListener("input", () => {
		color1Hex.value = color1Picker.value;
		emitChange();
	});

	color1Hex.addEventListener("input", () => {
		if (/^#[0-9A-Fa-f]{6}$/.test(color1Hex.value)) {
			color1Picker.value = color1Hex.value;
		}
		emitChange();
	});

	color2Picker.addEventListener("input", () => {
		color2Hex.value = color2Picker.value;
		emitChange();
	});

	color2Hex.addEventListener("input", () => {
		if (/^#[0-9A-Fa-f]{6}$/.test(color2Hex.value)) {
			color2Picker.value = color2Hex.value;
		}
		emitChange();
	});

	directionSelect.addEventListener("change", emitChange);

	clearBtn.addEventListener("click", () => {
		parseValue("");
		emitChange();
	});

	parseValue(initialValue);

	return {
		element: container,
		getValue: () => currentValue,
		setValue: parseValue,
	};
}
