export function createPopup(options) {
	const {
		items = [],
		triggerElement = null,
		anchorPoint = null,
		onClose = () => {},
		customContent = null,
		className = "",
	} = options;
	const anchor = anchorPoint
		? { x: anchorPoint.x ?? 0, y: anchorPoint.y ?? 0 }
		: null;

	const overlay = document.createElement("div");
	overlay.className = "popup-overlay";

	const popup = document.createElement("div");
	popup.className = `popup${className ? ` ${className}` : ""}`;

	const popupContent = document.createElement("div");
	popupContent.className = "popup-content";

	if (customContent) {
		popupContent.appendChild(customContent);
	} else {
		items.forEach((item) => {
			const button = document.createElement("button");
			button.className = "popup-option";
			button.type = "button";

			if (item.id) button.id = item.id;

			const icon = document.createElement("div");
			icon.className = "popup-option-icon";
			icon.innerHTML = item.icon || "";

			const content = document.createElement("div");
			content.className = "popup-option-content";

			const title = document.createElement("div");
			title.className = "popup-option-title";
			title.textContent = item.title || "";

			const description = document.createElement("div");
			description.className = "popup-option-description";
			description.textContent = item.description || "";

			content.appendChild(title);
			if (item.description) content.appendChild(description);

			button.appendChild(icon);
			button.appendChild(content);

			button.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				try {
					if (typeof item.onClick === "function") item.onClick(e);
				} catch (err) {
					console.error(err);
				}

				closePopup();
			});

			popupContent.appendChild(button);
		});
	}

	popup.appendChild(popupContent);

	document.body.appendChild(overlay);
	document.body.appendChild(popup);
	try {
		overlay.style.zIndex = "9999";
		popup.style.zIndex = "10000";
	} catch {}
	popup.style.position = "fixed";
	popup.style.left = "0px";
	popup.style.top = "0px";

	const viewportWidth = () => window.innerWidth;
	const viewportHeight = () => window.innerHeight;

	let lastKnownRect = null;
	if (
		triggerElement &&
		typeof triggerElement.getBoundingClientRect === "function"
	) {
		try {
			const initialRect = triggerElement.getBoundingClientRect();
			if (initialRect) {
				lastKnownRect = {
					top: initialRect.top,
					left: initialRect.left,
					right: initialRect.right,
					bottom: initialRect.bottom,
					width: initialRect.width,
					height: initialRect.height,
				};
			}
		} catch {}
	}

	const computeTriggerRect = () => {
		try {
			if (
				triggerElement &&
				typeof triggerElement.getBoundingClientRect === "function"
			) {
				const r = triggerElement.getBoundingClientRect();
				if (
					triggerElement.id === "profileDropdownBtn" &&
					(r.width === 0 || r.height === 0 || Number.isNaN(r.top))
				) {
					try {
						const container = triggerElement.closest
							? triggerElement.closest(".profile-dropdown")
							: triggerElement.parentElement;
						if (
							container &&
							typeof container.getBoundingClientRect === "function"
						) {
							const cr = container.getBoundingClientRect();
							if (cr && (cr.width > 0 || cr.height > 0)) {
								lastKnownRect = {
									top: cr.top,
									left: cr.left,
									right: cr.right,
									bottom: cr.bottom,
									width: cr.width,
									height: cr.height,
								};
								return lastKnownRect;
							}
						}
					} catch {}
				}
				if (r) {
					lastKnownRect = {
						top: r.top,
						left: r.left,
						right: r.right,
						bottom: r.bottom,
						width: r.width,
						height: r.height,
					};
					return lastKnownRect;
				}
			}

			if (
				triggerElement &&
				typeof triggerElement.getClientRects === "function"
			) {
				const rects = triggerElement.getClientRects();
				if (rects && rects.length > 0) {
					const rect = rects[0];
					lastKnownRect = {
						top: rect.top,
						left: rect.left,
						right: rect.right,
						bottom: rect.bottom,
						width: rect.width,
						height: rect.height,
					};
					return lastKnownRect;
				}
			}

			if (
				triggerElement?.parentElement &&
				typeof triggerElement.parentElement.getBoundingClientRect === "function"
			) {
				const p = triggerElement.parentElement.getBoundingClientRect();
				if (p) {
					lastKnownRect = {
						top: p.top,
						left: p.left,
						right: p.right,
						bottom: p.bottom,
						width: p.width,
						height: p.height,
					};
					return lastKnownRect;
				}
			}

			if (anchor)
				return {
					top: anchor.y,
					left: anchor.x,
					right: anchor.x,
					bottom: anchor.y,
					width: 0,
					height: 0,
				};
			if (lastKnownRect) return lastKnownRect;
		} catch (err) {
			console.warn("computeTriggerRect error", err);
		}
		if (lastKnownRect) return lastKnownRect;
		return null;
	};

	const reposition = () => {
		popup.style.left = "-9999px";
		popup.style.top = "-9999px";

		const doMeasure = () => {
			const popupRect = popup.getBoundingClientRect();
			const triggerRect = computeTriggerRect();

			if (triggerRect && (triggerRect.width > 0 || triggerRect.height > 0)) {
				let left = triggerRect.left;
				let top = triggerRect.bottom + 8;
				let transformOriginX = "left";
				let transformOriginY = "top";

				if (triggerRect.width === 0 && triggerRect.height === 0 && anchor) {
					left = anchor.x - popupRect.width / 2;
					top = anchor.y + 10;
					transformOriginX = "center";
				}

				const minLeft = 12;
				const maxLeft = viewportWidth() - popupRect.width - 12;

				if (left + popupRect.width > viewportWidth() - 12) {
					left = triggerRect.right - popupRect.width;
					transformOriginX = "right";
				}

				if (left < minLeft) {
					left = minLeft;
					transformOriginX = "left";
				}

				if (left > maxLeft) {
					left = maxLeft;
					transformOriginX = "right";
				}

				const minTop = 12;
				const maxTop = viewportHeight() - popupRect.height - 12;
				if (top > maxTop) {
					top = triggerRect.top - popupRect.height - 8;
					transformOriginY = "bottom";
				}

				if (top < minTop) {
					top = minTop;
					transformOriginY = "top";
				}

				popup.style.left = "0px";
				popup.style.top = "0px";
				popup.style.setProperty("--popup-translate-x", `${Math.round(left)}px`);
				popup.style.setProperty("--popup-translate-y", `${Math.round(top)}px`);
				popup.style.transformOrigin = `${transformOriginX} ${transformOriginY}`;
				try {
					popupContent.style.transformOrigin = `${transformOriginX} ${transformOriginY}`;
				} catch {}
			} else {
				const left = Math.max(
					12,
					Math.min(
						(viewportWidth() - popupRect.width) / 2,
						viewportWidth() - popupRect.width - 12,
					),
				);
				const top = Math.max(
					12,
					Math.min(
						(viewportHeight() - popupRect.height) / 2,
						viewportHeight() - popupRect.height - 12,
					),
				);
				popup.style.left = "0px";
				popup.style.top = "0px";
				popup.style.setProperty("--popup-translate-x", `${Math.round(left)}px`);
				popup.style.setProperty("--popup-translate-y", `${Math.round(top)}px`);
				popup.style.transformOrigin = "center center";
				try {
					popupContent.style.transformOrigin = "center center";
				} catch {}
			}
		};

		try {
			firstPositioning = false;
		} catch {}
		doMeasure();
	};

	popup.style.opacity = "0";
	overlay.classList.add("visible");
	popup.classList.add("visible");
	try {
		if (popupContent.parentElement !== popup) popup.appendChild(popupContent);
	} catch {}
	try {
		if (popup.parentElement !== document.body) document.body.appendChild(popup);
	} catch {}
	try {
		if (overlay.parentElement !== document.body)
			document.body.appendChild(overlay);
	} catch {}

	reposition();
	popup.style.opacity = "1";
	try {
		popupContent.style.transform = "";
		popupContent.style.opacity = "";
	} catch {}

	let scheduled = false;
	const scheduleReposition = () => {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(() => {
			try {
				reposition();
			} finally {
				scheduled = false;
			}
		});
	};

	const handleResize = () => scheduleReposition();
	const handleScroll = () => scheduleReposition();
	window.addEventListener("resize", handleResize, { passive: true });
	window.addEventListener("scroll", handleScroll, { passive: true });

	const observeTarget = document.body;
	const observer = new MutationObserver(() => scheduleReposition());
	try {
		observer.observe(observeTarget, {
			attributes: true,
			childList: true,
			subtree: false,
		});
	} catch {
		try {
			observer.observe(document.body, {
				attributes: true,
				childList: true,
				subtree: false,
			});
		} catch {}
	}

	overlay._reposition = reposition;
	overlay._handleResize = handleResize;
	overlay._handleScroll = handleScroll;
	overlay._observer = observer;
	const popupContentObserver = new MutationObserver(() => {
		try {
			if (popupContent.parentElement !== popup) popup.appendChild(popupContent);
		} catch {}
	});
	try {
		popupContentObserver.observe(popup, { childList: true });
	} catch {}
	overlay._popupContentObserver = popupContentObserver;
	overlay._popup = popup;

	let isClosing = false;

	const closePopup = () => {
		if (isClosing) return;
		isClosing = true;
		overlay.classList.remove("visible");
		overlay.classList.add("closing");
		popup.classList.remove("visible");
		popup.classList.add("closing");
		document.removeEventListener("keydown", handleKeyDown);
		try {
			if (overlay._handleResize)
				window.removeEventListener("resize", overlay._handleResize);
			if (overlay._handleScroll)
				window.removeEventListener("scroll", overlay._handleScroll);
			if (overlay._observer) overlay._observer.disconnect();
			if (overlay._popupContentObserver)
				overlay._popupContentObserver.disconnect();
		} catch {}

		try {
			overlay.remove();
		} catch {}
		try {
			popup.remove();
		} catch {}
		onClose();
	};

	const handleKeyDown = (e) => {
		if (e.key === "Escape") closePopup();
	};

	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) closePopup();
	});

	document.addEventListener("keydown", handleKeyDown);

	return {
		close: closePopup,
		element: overlay,
	};
}

export function createModal(options) {
	const {
		title = "",
		content = null,
		className = "",
		onClose = () => {},
		closeOnOverlayClick = true,
	} = options;

	const overlay = document.createElement("div");
	overlay.className = "modal-overlay";

	const modal = document.createElement("div");
	modal.className = `modal${className ? ` ${className}` : ""}`;

	const closeButton = document.createElement("button");
	closeButton.className = "modal-close";
	closeButton.type = "button";
	closeButton.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	`;

	const closeModal = () => {
		overlay.classList.add("closing");
		modal.classList.add("closing");
		setTimeout(() => {
			overlay.remove();
			document.removeEventListener("keydown", handleKeyDown);
			onClose();
		}, 200);
	};

	closeButton.addEventListener("click", closeModal);

	const handleKeyDown = (e) => {
		if (e.key === "Escape") {
			closeModal();
		}
	};

	document.addEventListener("keydown", handleKeyDown);

	if (title) {
		const modalHeader = document.createElement("div");
		modalHeader.className = "modal-header";
		const h2 = document.createElement("h2");
		h2.textContent = title;
		modalHeader.appendChild(h2);

		modalHeader.appendChild(closeButton);
		modal.appendChild(modalHeader);
	} else {
		modal.appendChild(closeButton);
	}

	if (content instanceof HTMLElement) {
		modal.appendChild(content);
	} else {
		const ce = document.createElement("div");
		modal.appendChild(ce);

		ce.innerHTML = content;
	}

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => {
		overlay.classList.add("visible");
		modal.classList.add("visible");
	});

	if (className?.includes("settings-modal")) {
		try {
			modal.style.boxSizing = "border-box";
			modal.style.setProperty(
				"width",
				"min(1400px, calc(100vw - 32px))",
				"important",
			);
			modal.style.setProperty("max-width", "1400px", "important");
			modal.style.setProperty("height", "min(90vh, 900px)", "important");
			modal.style.setProperty("max-height", "90vh", "important");
			modal.style.setProperty("overflow", "hidden", "important");
		} catch {}
	}

	if (closeOnOverlayClick) {
		overlay.addEventListener("click", (e) => {
			if (e.target === overlay) {
				closeModal();
			}
		});
	}

	modal.addEventListener("click", (e) => {
		e.stopPropagation();
	});

	return {
		close: closeModal,
		element: overlay,
		modal,
	};
}
export function createConfirmModal(options) {
	const {
		title = "Confirm",
		message = "Are you sure?",
		confirmText = "Confirm",
		cancelText = "Cancel",
		onConfirm = () => {},
		onCancel = () => {},
		danger = false,
	} = options;

	const content = document.createElement("div");
	content.className = "confirm-modal-content";

	const messageEl = document.createElement("p");
	messageEl.className = "confirm-modal-message";
	messageEl.textContent = message;
	content.appendChild(messageEl);

	const actions = document.createElement("div");
	actions.className = "confirm-modal-actions";

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "confirm-modal-cancel";
	cancelBtn.textContent = cancelText;
	cancelBtn.type = "button";

	const confirmBtn = document.createElement("button");
	confirmBtn.className = `confirm-modal-confirm${danger ? " danger" : ""}`;
	confirmBtn.textContent = confirmText;
	confirmBtn.type = "button";

	actions.appendChild(cancelBtn);
	actions.appendChild(confirmBtn);
	content.appendChild(actions);

	const { close, element, modal } = createModal({
		title,
		content,
		className: "confirm-modal",
		closeOnOverlayClick: false,
	});

	cancelBtn.addEventListener("click", () => {
		close();
		onCancel();
	});

	confirmBtn.addEventListener("click", () => {
		close();
		onConfirm();
	});

	return { close, element, modal };
}
