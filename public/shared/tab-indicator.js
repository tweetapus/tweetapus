export function updateTabIndicator(container, activeTab) {
	const indicator = container;
	const tabs = Array.from(
		container
			.querySelectorAll(
				"a, button, .filter-btn, .profile-tab-btn, .communities-tab, .community-detail-tab, .notifications-tabs button",
			)
			.values(),
	).filter((el) => !el.classList.contains("hidden"));

	const activeIndex = tabs.indexOf(activeTab);
	if (activeIndex === -1) return;

	requestAnimationFrame(() => {
		const tabWidth = activeTab.offsetWidth;
		const tabLeft = activeTab.offsetLeft;

		if (tabWidth === 0 || tabLeft === undefined) {
			setTimeout(() => updateTabIndicator(container, activeTab), 50);
			return;
		}

		indicator.style.setProperty("--indicator-width", `${tabWidth}px`);
		indicator.style.setProperty("--indicator-left", `${tabLeft}px`);

		const style = document.createElement("style");
		const existingStyle = document.getElementById("tab-indicator-animation");
		if (existingStyle) {
			existingStyle.remove();
		}
		style.id = "tab-indicator-animation";
		style.textContent = `
			${container.tagName.toLowerCase()}${container.className ? `.${container.className.split(" ").join(".")}` : ""}::after {
				width: ${tabWidth}px !important;
				transform: translateX(${tabLeft}px) !important;
			}
		`;
		document.head.appendChild(style);
		indicator.setAttribute("data-indicator-init", "true");
	});
}

export function initTabIndicators() {
	const tabContainers = [
		document.querySelector(".timeline h1"),
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

		const resizeObserver = new ResizeObserver(() => {
			const active = container.querySelector(".active");
			if (active) {
				updateTabIndicator(container, active);
			}
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
				tabs.forEach((tab) => tab.classList.remove("active"));
				target.classList.add("active");
				updateTabIndicator(container, target);
			}
		});
	});
}
