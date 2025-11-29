export const CROP_CANCELLED = Symbol("CROP_CANCELLED");
const MAX_RELATIVE_ZOOM = 5;

export function openImageCropper(file, options = {}) {
	const aspect = options.aspect || 1;
	const outSize = options.size || 300;

	return new Promise((resolve, reject) => {
		if (!file) return reject(new Error("No file provided"));

		const objectUrl = URL.createObjectURL(file);

		const overlay = document.createElement("div");
		overlay.className = "image-cropper-overlay";

		const panel = document.createElement("div");
		panel.className = "image-cropper-panel";

		const canvas = document.createElement("canvas");
		const displaySize = Math.min(600, Math.max(240, outSize));
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(displaySize * ratio);
		canvas.height = Math.round((displaySize / aspect) * ratio);
		canvas.style.width = `${displaySize}px`;
		canvas.style.height = `${displaySize / aspect}px`;
		canvas.className = "image-cropper-canvas";

		const controls = document.createElement("div");
		controls.className = "image-cropper-controls";

		const zoom = document.createElement("input");
		zoom.type = "range";
		zoom.min = 0;
		zoom.max = MAX_RELATIVE_ZOOM;
		zoom.step = 0.01;
		zoom.value = 0;
		zoom.className = "image-cropper-zoom";

		const resetBtn = document.createElement("button");
		resetBtn.type = "button";
		resetBtn.textContent = "Reset";
		resetBtn.className = "btn secondary image-cropper-reset";
		const cancelBtn = document.createElement("button");
		cancelBtn.type = "button";
		cancelBtn.textContent = "Cancel";
		cancelBtn.className = "btn secondary image-cropper-cancel";

		const applyBtn = document.createElement("button");
		applyBtn.type = "button";
		applyBtn.textContent = "Apply";
		applyBtn.className = "btn primary image-cropper-apply";

		controls.appendChild(zoom);

		const actionRow = document.createElement("div");
		actionRow.className = "image-cropper-action-row";
		actionRow.appendChild(cancelBtn);
		actionRow.appendChild(applyBtn);
		controls.appendChild(actionRow);

		actionRow.appendChild(resetBtn); // Move resetBtn to actionRow
		panel.appendChild(canvas);
		panel.appendChild(controls);
		overlay.appendChild(panel);
		document.body.appendChild(overlay);

		const ctx = canvas.getContext("2d");
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			URL.revokeObjectURL(objectUrl);

			let scale = 1;
			let baseScale = 1;
			let minScale = 1;
			let maxScale = 1;
			let zoomRelative = 0;
			let zoomMaxRelative = MAX_RELATIVE_ZOOM;
			let offsetX = 0;
			let offsetY = 0;
			let dragging = false;
			let lastX = 0;
			let lastY = 0;

			const pointers = new Map();
			let prevPinchDistance = 0;
			const minRelative = 0;

			const draw = () => {
				ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = "#111";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.imageSmoothingEnabled = true;
				const iw = img.width * scale;
				const ih = img.height * scale;
				// draw using CSS pixel offsets/size — setTransform will scale to device pixels
				ctx.drawImage(img, offsetX, offsetY, iw, ih);
			};

			const constrain = () => {
				const dwCss = canvas.width / ratio;
				const dhCss = canvas.height / ratio;
				const iw = img.width * scale;
				const ih = img.height * scale;
				const minX = Math.min(0, dwCss - iw);
				const minY = Math.min(0, dhCss - ih);

				if (iw <= dwCss) {
					offsetX = (dwCss - iw) / 2;
				} else if (offsetX > 0) {
					offsetX = 0;
				} else if (offsetX < minX) {
					offsetX = minX;
				}

				if (ih <= dhCss) {
					offsetY = (dhCss - ih) / 2;
				} else if (offsetY > 0) {
					offsetY = 0;
				} else if (offsetY < minY) {
					offsetY = minY;
				}
			};

			// Handle single-finger dragging and multi-finger pinch zoom properly
			canvas.addEventListener("pointerdown", (ev) => {
				canvas.setPointerCapture(ev.pointerId);
				pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
				if (pointers.size === 1) {
					dragging = true;
					lastX = ev.clientX;
					lastY = ev.clientY;
					canvas.style.cursor = "grabbing";
				}
				ev.preventDefault();
			});

			window.addEventListener(
				"pointermove",
				(ev) => {
					if (!pointers.has(ev.pointerId)) return;
					pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
					if (pointers.size === 1 && dragging) {
						const dx = ev.clientX - lastX;
						const dy = ev.clientY - lastY;
						lastX = ev.clientX;
						lastY = ev.clientY;
						offsetX += dx;
						offsetY += dy;
						constrain();
						draw();
					} else if (pointers.size === 2) {
						const pts = Array.from(pointers.values());
						const dx = pts[0].x - pts[1].x;
						const dy = pts[0].y - pts[1].y;
						const dist = Math.hypot(dx, dy);
						if (prevPinchDistance && Math.abs(dist - prevPinchDistance) > 2) {
							const ratioChange = dist / prevPinchDistance;
							const delta = Math.log2(ratioChange) * 0.25;
							const current = parseFloat(zoom.value) || 0;
							const next = Math.max(
								minRelative,
								Math.min(zoomMaxRelative, current + delta),
							);
							zoom.value = `${next}`;
							zoom.dispatchEvent(new Event("input"));
						}
						prevPinchDistance = dist;
					}
				},
				{ passive: false },
			);

			const endPointer = (ev) => {
				pointers.delete(ev.pointerId);
				if (pointers.size === 0) {
					dragging = false;
					canvas.style.cursor = "grab";
				}
				prevPinchDistance = 0;
			};

			canvas.addEventListener("pointerup", endPointer);
			canvas.addEventListener("pointercancel", endPointer);
			canvas.addEventListener("pointerout", endPointer);
			canvas.addEventListener("pointerleave", endPointer);

			canvas.addEventListener(
				"wheel",
				(ev) => {
					ev.preventDefault();
					const delta = ev.deltaY > 0 ? -0.05 : 0.05;
					const current = parseFloat(zoom.value) || 0;
					const next = Math.max(
						minRelative,
						Math.min(zoomMaxRelative, current + delta),
					);
					zoom.value = `${next}`;
					zoom.dispatchEvent(new Event("input"));
				},
				{ passive: false },
			);

			// Reset handler added once, not every zoom input event
			resetBtn.addEventListener("click", () => {
				// Reset to base scale and center the image
				scale = baseScale;
				const dwCssReset = canvas.width / ratio;
				const dhCssReset = canvas.height / ratio;
				offsetX = (dwCssReset - img.width * scale) / 2;
				offsetY = (dhCssReset - img.height * scale) / 2;
				zoom.value = "0";
				prevPinchDistance = 0;
				constrain();
				draw();
			});

			zoom.addEventListener("input", (e) => {
				const raw = parseFloat(e.target.value);
				const desired = Number.isFinite(raw) ? raw : 0;
				const clamped = Math.max(
					minRelative,
					Math.min(zoomMaxRelative, desired),
				);
				const previousScale = scale;
				const targetScale = Math.max(
					minScale,
					Math.min(maxScale, baseScale * (1 + clamped)),
				);

				// Reset logic handled outside of this handler

				const centerX = canvas.width / ratio / 2;
				const centerY = canvas.height / ratio / 2;
				const relX = (centerX - offsetX) / previousScale;
				const relY = (centerY - offsetY) / previousScale;
				scale = targetScale;
				offsetX = centerX - relX * targetScale;
				offsetY = centerY - relY * targetScale;
				constrain();

				zoomRelative = Math.max(
					minRelative,
					Math.min(zoomMaxRelative, scale / baseScale - 1),
				);
				zoom.value = `${zoomRelative}`;
				draw();
			});

			const dwCss = canvas.width / ratio;
			const dhCss = canvas.height / ratio;
			const scaleX = dwCss / img.width;
			const scaleY = dhCss / img.height;
			const containScale = Math.min(scaleX, scaleY);
			baseScale = containScale > 0 ? containScale : 1;
			if (baseScale > 1) baseScale = 1;
			if (baseScale <= 0) baseScale = 0.01;
			minScale = baseScale;
			maxScale = baseScale * (1 + MAX_RELATIVE_ZOOM);
			zoomMaxRelative = MAX_RELATIVE_ZOOM;
			scale = baseScale;
			offsetX = (dwCss - img.width * scale) / 2;
			offsetY = (dhCss - img.height * scale) / 2;
			zoomRelative = 0;
			zoom.min = `${minRelative}`;
			zoom.max = `${zoomMaxRelative}`;
			zoom.value = "0";
			draw();

			cancelBtn.addEventListener("click", () => {
				cleanup();
				resolve(CROP_CANCELLED);
			});

			applyBtn.addEventListener("click", () => {
				applyBtn.disabled = true;
				const outCanvas = document.createElement("canvas");
				outCanvas.width = outSize;
				outCanvas.height = Math.round(outSize / aspect);
				const outCtx = outCanvas.getContext("2d");
				outCtx.fillStyle = "#FFFFFF";
				outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);

				const dwCss = canvas.width / ratio;
				const dhCss = canvas.height / ratio;
				const scaleX = outCanvas.width / dwCss;
				const scaleY = outCanvas.height / dhCss;

				outCtx.imageSmoothingEnabled = true;
				outCtx.imageSmoothingQuality = "high";
				outCtx.save();
				outCtx.scale(scaleX, scaleY);
				outCtx.beginPath();
				outCtx.rect(0, 0, dwCss, dhCss);
				outCtx.clip();
				outCtx.drawImage(
					img,
					offsetX,
					offsetY,
					img.width * scale,
					img.height * scale,
				);
				outCtx.restore();

				outCanvas.toBlob(
					(blob) => {
						applyBtn.disabled = false;
						if (!blob) {
							cleanup();
							return reject(new Error("Failed to create cropped image"));
						}
						const base = (file.name || "image").replace(/\.[^/.]+$/, "");
						const outFile = new File([blob], `${base}.webp`, {
							type: "image/webp",
							lastModified: Date.now(),
						});
						cleanup();
						resolve(outFile);
					},
					"image/webp",
					0.9,
				);
			});
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			cleanup();
			reject(new Error("Failed to load image for cropping"));
		};

		img.src = objectUrl;

		function cleanup() {
			try {
				overlay.remove();
			} catch {}
			URL.revokeObjectURL(objectUrl);
		}
	});
}

export default openImageCropper;
