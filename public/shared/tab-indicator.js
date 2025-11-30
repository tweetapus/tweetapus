const activeObservers = new WeakMap();

export function updateTabIndicator(container, activeTab) {
	if (!container || !activeTab) return;

	const updateIndicatorPosition = () => {
		if (!activeTab.isConnected || !container.isConnected) return;

		const containerRect = container.getBoundingClientRect();
		const tabRect = activeTab.getBoundingClientRect();

		if (containerRect.width === 0 || tabRect.width === 0) {
			requestAnimationFrame(updateIndicatorPosition);
			return;
		}

		const tabLeft = tabRect.left - containerRect.left + container.scrollLeft;
		const tabWidth = tabRect.width;

		container.style.setProperty("--indicator-width", `${tabWidth}px`);
		container.style.setProperty("--indicator-left", `${tabLeft}px`);
	};

	requestAnimationFrame(updateIndicatorPosition);
	requestAnimationFrame(() => requestAnimationFrame(updateIndicatorPosition));
}

export function observeTabContainer(container) {
	if (!container || activeObservers.has(container)) return;

	const updateActive = () => {
		const active = container.querySelector(".active");
		if (active) {
			updateTabIndicator(container, active);
		}
	};

	let resizeTimeout;
	const resizeObserver = new ResizeObserver(() => {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(updateActive, 16);
	});

	resizeObserver.observe(container);

	const mutationObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (
				mutation.type === "attributes" &&
				mutation.attributeName === "class"
			) {
				if (mutation.target.classList.contains("active")) {
					updateTabIndicator(container, mutation.target);
					break;
				}
			}
			if (mutation.type === "childList") {
				updateActive();
				break;
			}
		}
	});

	mutationObserver.observe(container, {
		attributes: true,
		attributeFilter: ["class"],
		subtree: true,
		childList: true,
	});

	activeObservers.set(container, { resizeObserver, mutationObserver });
	updateActive();
}

export function initTabIndicators() {
	const tabContainers = [
		document.querySelector(".timeline .tab-nav"),
		document.querySelector(".search-filters"),
		document.querySelector(".profile-tab-nav"),
		document.querySelector(".communities-tabs"),
		document.querySelector(".community-detail-tabs"),
		document.querySelector(".notifications-tabs"),
		document.querySelector(".followers-modal-tabs"),
	].filter(Boolean);

	tabContainers.forEach((container) => {
		observeTabContainer(container);

		container.addEventListener("click", (e) => {
			const target = e.target.closest(
				"a, button, .filter-btn, .profile-tab-btn, .communities-tab, .community-detail-tab, .notifications-tabs button, .followers-modal-tab",
			);
			if (target && container.contains(target)) {
				const tabs = Array.from(
					container.querySelectorAll(
						"a, button, .filter-btn, .profile-tab-btn, .communities-tab, .community-detail-tab, .followers-modal-tab",
					),
				);
				tabs.forEach((tab) => {
					tab.classList.remove("active");
				});
				target.classList.add("active");
				updateTabIndicator(container, target);
			}
		});
	});
}
