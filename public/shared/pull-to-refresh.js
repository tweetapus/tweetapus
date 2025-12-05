export function initPullToRefresh(containerSelector, onRefresh) {
	const container = typeof containerSelector === "string" 
		? document.querySelector(containerSelector) 
		: containerSelector;
	
	if (!container) return null;
	
	const indicator = document.createElement("div");
	indicator.className = "pull-refresh-indicator";
	indicator.innerHTML = `
		<svg class="pull-refresh-spinner" viewBox="0 0 24 24" width="24" height="24">
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.4" stroke-dashoffset="31.4" stroke-linecap="round"/>
		</svg>
	`;
	container.insertBefore(indicator, container.firstChild);
	
	let startY = 0;
	let currentY = 0;
	let pulling = false;
	let refreshing = false;
	const threshold = 80;
	const maxPull = 120;
	
	const onTouchStart = (e) => {
		if (refreshing) return;
		if (window.scrollY > 0) return;
		
		startY = e.touches[0].clientY;
		pulling = true;
	};
	
	const onTouchMove = (e) => {
		if (!pulling || refreshing) return;
		if (window.scrollY > 0) {
			pulling = false;
			indicator.style.transform = "translateY(-100%)";
			indicator.style.opacity = "0";
			return;
		}
		
		currentY = e.touches[0].clientY;
		const pullDistance = Math.min(currentY - startY, maxPull);
		
		if (pullDistance > 0) {
			e.preventDefault();
			const progress = Math.min(pullDistance / threshold, 1);
			indicator.style.transform = `translateY(${pullDistance - 60}px)`;
			indicator.style.opacity = progress.toString();
			
			const circle = indicator.querySelector("circle");
			if (circle) {
				circle.style.strokeDashoffset = (31.4 * (1 - progress)).toString();
			}
			
			if (progress >= 1) {
				indicator.classList.add("ready");
			} else {
				indicator.classList.remove("ready");
			}
		}
	};
	
	const onTouchEnd = async () => {
		if (!pulling) return;
		pulling = false;
		
		const pullDistance = currentY - startY;
		
		if (pullDistance >= threshold && !refreshing) {
			refreshing = true;
			indicator.classList.add("refreshing");
			indicator.classList.remove("ready");
			indicator.style.transform = "translateY(20px)";
			
			try {
				await onRefresh();
			} finally {
				refreshing = false;
				indicator.classList.remove("refreshing");
				indicator.style.transform = "translateY(-100%)";
				indicator.style.opacity = "0";
			}
		} else {
			indicator.style.transform = "translateY(-100%)";
			indicator.style.opacity = "0";
			indicator.classList.remove("ready");
		}
		
		startY = 0;
		currentY = 0;
	};
	
	container.addEventListener("touchstart", onTouchStart, { passive: true });
	container.addEventListener("touchmove", onTouchMove, { passive: false });
	container.addEventListener("touchend", onTouchEnd, { passive: true });
	
	return {
		destroy: () => {
			container.removeEventListener("touchstart", onTouchStart);
			container.removeEventListener("touchmove", onTouchMove);
			container.removeEventListener("touchend", onTouchEnd);
			indicator.remove();
		}
	};
}
