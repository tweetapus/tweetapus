import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

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

let currentNotifications = [];

async function openNotifications() {
	switchPage("notifications", {
		path: "/notifications",
		recoverState: async () => {
			await loadNotifications();
		},
	});
}

async function loadNotifications() {
	if (!authToken) {
		switchPage("timeline", { path: "/" });
		return;
	}

	const listElement = document.getElementById("notificationsList");
	if (listElement) {
		listElement.innerHTML =
			'<div class="notification-loading">Loading notifications...</div>';
	}

	try {
		const response = await fetch("/api/notifications/", {
			headers: { Authorization: `Bearer ${authToken}` },
		});

		if (response.ok) {
			const data = await response.json();
			currentNotifications = data.notifications || [];
			renderNotifications();
		} else {
			console.error("Failed to load notifications:", response.status);
			if (listElement) {
				listElement.innerHTML =
					'<div class="no-notifications">Failed to load notifications</div>';
			}
		}
	} catch (error) {
		console.error("Failed to load notifications:", error);
		if (listElement) {
			listElement.innerHTML =
				'<div class="no-notifications">Failed to load notifications</div>';
		}
	}
}

function renderNotifications() {
	const listElement = document.getElementById("notificationsList");
	if (!listElement) return;

	if (currentNotifications.length === 0) {
		listElement.innerHTML =
			'<div class="no-notifications">No notifications for now!</div>';
		return;
	}

	listElement.innerHTML = currentNotifications
		.map((notification) => createNotificationHTML(notification))
		.join("");

	listElement.querySelectorAll(".notification-item").forEach((item) => {
		item.addEventListener("click", (e) => {
			const notificationId = e.currentTarget.dataset.id;
			const notificationType = e.currentTarget.dataset.type;
			const relatedId = e.currentTarget.dataset.relatedId;

			handleNotificationClick(notificationId, notificationType, relatedId);
		});
	});
}

async function handleNotificationClick(notificationId, type, relatedId) {
	await markAsRead(notificationId);

	if (!relatedId) return;

	if (
		type === "like" ||
		type === "retweet" ||
		type === "reply" ||
		type === "quote"
	) {
		try {
			const response = await fetch(`/api/tweets/${relatedId}`, {
				headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
			});

			if (response.ok) {
				const { openTweet } = await import("./tweet.js");
				openTweet({ id: relatedId });
			} else {
				toastQueue.add(`<h1>Tweet not found</h1>`);
			}
		} catch (error) {
			console.error("Failed to load tweet:", error);
			toastQueue.add(`<h1>Failed to load tweet</h1>`);
		}
	} else if (type === "follow") {
		try {
			const response = await fetch(`/api/profile/${relatedId}`, {
				headers: { Authorization: `Bearer ${authToken}` },
			});

			if (response.ok) {
				const { default: openProfile } = await import("./profile.js");
				openProfile(relatedId);
			} else {
				toastQueue.add(`<h1>Profile not found</h1>`);
			}
		} catch (error) {
			console.error("Failed to load profile:", error);
			toastQueue.add(`<h1>Failed to load profile</h1>`);
		}
	}
}

function createNotificationHTML(notification) {
	const timeAgo = getTimeAgo(new Date(notification.created_at));
	const isUnread = !notification.read;
	const icon = getNotificationIcon(notification.type);
	const iconClass = getNotificationIconClass(notification.type);

	let tweetPreview = "";

	// Add tweet preview based on notification type
	if (notification.tweet) {
		if (notification.type === "reply") {
			// For replies, show full tweet element
			const tweetElement = createTweetElement(notification.tweet, {
				clickToOpen: false,
				showTopReply: false,
				isTopReply: false,
				size: "preview",
			});
			tweetPreview = `<div class="notification-tweet-preview">${tweetElement.outerHTML}</div>`;
		} else if (["like", "retweet", "quote"].includes(notification.type)) {
			// For likes, retweets, quotes, show subtitle with tweet content
			const tweetContent =
				notification.tweet.content.length > 100
					? notification.tweet.content.substring(0, 100) + "..."
					: notification.tweet.content;
			tweetPreview = `<div class="notification-tweet-subtitle">"${tweetContent}"</div>`;
		}
	}

	return `
		<div class="notification-item ${isUnread ? "unread" : ""}" data-id="${notification.id}" data-type="${notification.type}" data-related-id="${notification.related_id || ""}">
			<div class="notification-icon ${iconClass}">
				${icon}
			</div>
			<div class="notification-content">
				<p>${notification.content} <span class="notification-time">• ${timeAgo}</span></p>
				${tweetPreview}
			</div>
		</div>
	`;
}

function getNotificationIconClass(type) {
	const classes = {
		like: "like-icon",
		retweet: "retweet-icon",
		reply: "reply-icon",
		follow: "follow-icon",
		quote: "quote-icon",
	};
	return classes[type] || "follow-icon";
}

function getNotificationIcon(type) {
	const icons = {
		like: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
			<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
		</svg>`,
		retweet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M17 1l4 4-4 4"/>
			<path d="M3 11V9a4 4 0 0 1 4-4h14"/>
			<path d="M7 23l-4-4 4-4"/>
			<path d="M21 13v2a4 4 0 0 1-4 4H3"/>
		</svg>`,
		reply: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>`,
		follow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
			<circle cx="9" cy="7" r="4"/>
			<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
			<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
		</svg>`,
		quote: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
			<path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
		</svg>`,
	};
	return icons[type] || icons.like;
}

function getTimeAgo(date) {
	const now = new Date();
	const diffInSeconds = Math.floor((now - date) / 1000);

	if (diffInSeconds < 60) return "just now";
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
	if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
	return date.toLocaleDateString();
}

async function markAsRead(notificationId) {
	if (!authToken) return;

	try {
		const response = await fetch(`/api/notifications/${notificationId}/read`, {
			method: "PATCH",
			headers: { Authorization: `Bearer ${authToken}` },
		});

		if (response.ok) {
			const notification = currentNotifications.find(
				(n) => n.id === notificationId,
			);
			if (notification) {
				notification.read = true;
				renderNotifications();
				notificationManager.updateUnreadCount();
			}
		}
	} catch (error) {
		console.error("Failed to mark notification as read:", error);
	}
}

async function markAllAsRead() {
	if (!authToken) return;

	try {
		const response = await fetch("/api/notifications/mark-all-read", {
			method: "PATCH",
			headers: { Authorization: `Bearer ${authToken}` },
		});

		if (response.ok) {
			currentNotifications.forEach((notification) => {
				notification.read = true;
			});
			renderNotifications();
			notificationManager.updateUnreadCount();
			toastQueue.add(`<h1>All notifications marked as read</h1>`);
		}
	} catch (error) {
		console.error("Failed to mark all notifications as read:", error);
		toastQueue.add(`<h1>Failed to mark notifications as read</h1>`);
	}
}

document
	.querySelector(".notifications .back-button")
	?.addEventListener("click", (e) => {
		e.preventDefault();
		history.back();
	});

document
	.getElementById("markAllReadBtn")
	?.addEventListener("click", markAllAsRead);

addRoute(
	(pathname) => pathname === "/notifications",
	() => {
		openNotifications();
	},
);

export default notificationManager;
export { openNotifications, loadNotifications, markAllAsRead };
