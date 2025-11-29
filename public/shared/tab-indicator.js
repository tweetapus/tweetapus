export function updateTabIndicator(container, activeTab) {
	const updateIndicatorPosition = () => {
		const tabWidth = activeTab.offsetWidth;
		const tabLeft = activeTab.offsetLeft;

		if (tabWidth === 0 || tabLeft === undefined) {
			requestAnimationFrame(updateIndicatorPosition);
			return;
		}

		container.style.setProperty("--indicator-width", `${tabWidth}px`);
		container.style.setProperty("--indicator-left", `${tabLeft}px`);
	};

	requestAnimationFrame(updateIndicatorPosition);
}

export function initTabIndicators() {
	const tabContainers = [
		document.querySelector(".timeline .tab-nav"),
		document.querySelector(".search-filters"),
		document.querySelector(".profile-tab-nav"),
		document.querySelector(".communities-tabs"),
		document.querySelector(".community-detail-tabs"),
		document.querySelector(".notifications-tabs"),
	].filter(Boolean);

	tabContainers.forEach((container) => {
		const activeTab = container.querySelector(".active");
		if (activeTab) {
			updateTabIndicator(container, activeTab);
		}

		let resizeTimeout;
		const resizeObserver = new ResizeObserver(() => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				const active = container.querySelector(".active");
				if (active) {
					updateTabIndicator(container, active);
				}
			}, 50);
		});
		resizeObserver.observe(container);

		container.addEventListener("click", (e) => {
			const target = e.target.closest(
				"a, button, .filter-btn, .profile-tab-btn, .communities-tab, .community-detail-tab, .notifications-tabs button",
			);
			if (target) {
				const tabs = Array.from(
					container.querySelectorAll(
						"a, button, .filter-btn, .profile-tab-btn, .communities-tab, .community-detail-tab, .notifications-tabs button",
					),
				);
				tabs.forEach((tab) => { tab.classList.remove("active") });
				target.classList.add("active");
				updateTabIndicator(container, target);
			}
		});
	});
}
