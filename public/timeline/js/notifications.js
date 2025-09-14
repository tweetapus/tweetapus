import { authToken } from "./auth.js";

class NotificationManager {
	constructor() {
		this.pollInterval = null;
		this.init();
	}

	init() {
		this.startPolling();
		this.updateUnreadCount();
	}

	async updateUnreadCount() {
		if (!authToken) return;

		try {
			const response = await fetch("/api/notifications/unread-count", {
				headers: { Authorization: `Bearer ${authToken}` },
			});

			if (response.ok) {
				const data = await response.json();
				this.displayUnreadCount(data.count || 0);
			}
		} catch (error) {
			console.error("Failed to load unread count:", error);
		}
	}

	displayUnreadCount(count) {
		const countElement = document.getElementById("notificationCount");
		if (countElement) {
			if (count > 0) {
				countElement.textContent = count > 99 ? "99+" : count.toString();
				countElement.style.display = "block";
			} else {
				countElement.style.display = "none";
			}
		}
	}

	startPolling() {
		this.pollInterval = setInterval(() => {
			this.updateUnreadCount();
		}, 30000);
	}

	stopPolling() {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}
}

const notificationManager = new NotificationManager();
export default notificationManager;
