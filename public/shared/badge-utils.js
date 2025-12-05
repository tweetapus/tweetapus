let gradientIdCounter = 0;

function parseGradient(gradientStr) {
	const match = gradientStr.match(
		/linear-gradient\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i,
	);
	if (!match) return null;

	const direction = match[1].trim();
	const color1 = match[2].trim();
	const color2 = match[3].trim();

	let x1 = "0%",
		y1 = "0%",
		x2 = "100%",
		y2 = "0%";

	if (direction.includes("to right")) {
		x1 = "0%";
		y1 = "0%";
		x2 = "100%";
		y2 = "0%";
	} else if (direction.includes("to left")) {
		x1 = "100%";
		y1 = "0%";
		x2 = "0%";
		y2 = "0%";
	} else if (direction.includes("to bottom")) {
		x1 = "0%";
		y1 = "0%";
		x2 = "0%";
		y2 = "100%";
	} else if (direction.includes("to top")) {
		x1 = "0%";
		y1 = "100%";
		x2 = "0%";
		y2 = "0%";
	} else if (direction.includes("to bottom right")) {
		x1 = "0%";
		y1 = "0%";
		x2 = "100%";
		y2 = "100%";
	} else if (direction.includes("to bottom left")) {
		x1 = "100%";
		y1 = "0%";
		x2 = "0%";
		y2 = "100%";
	} else if (direction.includes("to top right")) {
		x1 = "0%";
		y1 = "100%";
		x2 = "100%";
		y2 = "0%";
	} else if (direction.includes("to top left")) {
		x1 = "100%";
		y1 = "100%";
		x2 = "0%";
		y2 = "0%";
	}

	return { x1, y1, x2, y2, color1, color2 };
}

export function applyAvatarOutline(
	imgEl,
	outline,
	borderRadius,
	borderWidth = 2,
) {
	if (!outline) {
		imgEl.style.border = "";
		imgEl.style.backgroundClip = "";
		imgEl.style.backgroundOrigin = "";
		imgEl.style.backgroundImage = "";
		imgEl.style.backgroundRepeat = "";
		imgEl.style.backgroundSize = "";
		imgEl.style.backgroundPosition = "";
		return;
	}

	const isGradient = outline.includes("gradient");
	const radiusValue = borderRadius || "50%";

	if (isGradient) {
		const inset = borderWidth * 2;
		imgEl.style.border = `${borderWidth}px solid transparent`;
		imgEl.style.borderRadius = radiusValue;
		imgEl.style.backgroundOrigin = "border-box";
		imgEl.style.backgroundClip = "border-box, padding-box";
		imgEl.style.backgroundImage = `${outline}, linear-gradient(var(--bg-primary), var(--bg-primary))`;
		imgEl.style.backgroundRepeat = "no-repeat, no-repeat";
		imgEl.style.backgroundSize = `100% 100%, calc(100% - ${inset}px) calc(100% - ${inset}px)`;
		imgEl.style.backgroundPosition = `0 0, ${borderWidth}px ${borderWidth}px`;
	} else {
		imgEl.style.border = `${borderWidth}px solid ${outline}`;
		imgEl.style.borderRadius = radiusValue;
		imgEl.style.backgroundClip = "";
		imgEl.style.backgroundOrigin = "";
		imgEl.style.backgroundImage = "";
		imgEl.style.backgroundRepeat = "";
		imgEl.style.backgroundSize = "";
		imgEl.style.backgroundPosition = "";
	}
	imgEl.style.boxSizing = "border-box";
}

export function createVerificationBadge(options = {}) {
	const {
		type = "verified",
		checkmarkOutline = "",
		size = 16,
		title = "",
	} = options;

	let fillColor = "var(--primary)";
	let badgeTitle = title || "Verified Account";

	if (type === "gold") {
		fillColor = "#D4AF37";
		badgeTitle = title || "Gold Account";
	} else if (type === "gray") {
		fillColor = "#829AAB";
		badgeTitle = title || "Gray Check Account";
	}

	const isGradient = checkmarkOutline?.includes("gradient");
	let defsSection = "";
	let strokeAttr = "";

	if (checkmarkOutline) {
		if (isGradient) {
			const gradientData = parseGradient(checkmarkOutline);
			if (gradientData) {
				const gradientId = `badge-gradient-${++gradientIdCounter}`;
				defsSection = `<defs><linearGradient id="${gradientId}" x1="${gradientData.x1}" y1="${gradientData.y1}" x2="${gradientData.x2}" y2="${gradientData.y2}"><stop offset="0%" stop-color="${gradientData.color1}"/><stop offset="100%" stop-color="${gradientData.color2}"/></linearGradient></defs>`;
				strokeAttr = `stroke="url(#${gradientId})" stroke-width="1"`;
			}
		} else {
			strokeAttr = `stroke="${checkmarkOutline}" stroke-width="1"`;
		}
	}

	const svgHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="${badgeTitle}">${defsSection}<path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="${fillColor}" ${strokeAttr}/><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

	const wrapper = document.createElement("span");
	wrapper.className = "verification-badge";
	wrapper.innerHTML = svgHTML;
	return wrapper;
}
