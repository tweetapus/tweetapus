import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

let currentNotifications = [];

async function updateUnreadCount() {
	if (			if (response.ok) {
				const openTweet = (await import("./tweet.js")).default;
				openTweet({ id: relatedId });thToken) return;

	const { count } = await (
		await fetch("/api/notifications/unread-count", {
			headers: { Authorization: `Bearer ${authToken}` },
		})
	).json();

	displayUnreadCount(count || 0);
}

function displayUnreadCount(count) {
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

async function openNotifications() {
	window.scrollTo(0, 0);
	switchPage("notifications", {
		path: "/notifications",
		recoverState: loadNotifications,
	});
}

async function loadNotifications() {
	if (!authToken) {
		switchPage("timeline", { path: "/" });
		return;
	}

	const listElement = document.getElementById("notificationsList");
	if (listElement) {
		listElement.innerHTML = "";
	}

	try {
		const data = await (
			await fetch("/api/notifications/", {
				headers: { Authorization: `Bearer ${authToken}` },
			})
		).json();

		const notifications = (data.notifications || []).map((notification) => {
			if (notification.tweet?.user) {
				notification.tweet.author = notification.tweet.user;
				delete notification.tweet.user;
			}
			return notification;
		});

		currentNotifications = notifications;
		renderNotifications();
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

	listElement.innerHTML = "";

	if (currentNotifications.length === 0) {
		const noNotificationsEl = document.createElement("div");
		noNotificationsEl.className = "no-notifications";
		noNotificationsEl.textContent = "No notifications for now!";
		listElement.appendChild(noNotificationsEl);
		return;
	}

	currentNotifications.forEach((notification) => {
		const notificationEl = createNotificationElement(notification);
		listElement.appendChild(notificationEl);
	});
}

function createNotificationElement(notification) {
	const now = new Date();
	let date;

	if (
		typeof notification.created_at === "string" &&
		!notification.created_at.endsWith("Z") &&
		!notification.created_at.includes("+")
	) {
		date = new Date(`${notification.created_at}Z`);
	} else {
		date = new Date(notification.created_at);
	}

	const diffInSeconds = Math.floor((now - date) / 1000);

	let timeAgo;
	if (diffInSeconds < 60) timeAgo = "just now";
	else if (diffInSeconds < 3600) timeAgo = `${Math.floor(diffInSeconds / 60)}m`;
	else if (diffInSeconds < 86400)
		timeAgo = `${Math.floor(diffInSeconds / 3600)}h`;
	else if (diffInSeconds < 604800)
		timeAgo = `${Math.floor(diffInSeconds / 86400)}d`;
	else timeAgo = date.toLocaleDateString();

	const isUnread = !notification.read;

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
		mention: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
			<circle cx="9" cy="7" r="4"/>
			<path d="M19 8v6"/>
			<path d="M22 11h-6"/>
		</svg>`,
		dm: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>`,
	};

	const iconClasses = {
		like: "like-icon",
		retweet: "retweet-icon",
		reply: "reply-icon",
		follow: "follow-icon",
		quote: "quote-icon",
		mention: "mention-icon",
		dm: "dm-icon",
	};

	const notificationEl = document.createElement("div");
	notificationEl.className = `notification-item ${isUnread ? "unread" : ""}`;
	notificationEl.dataset.id = notification.id;
	notificationEl.dataset.type = notification.type;
	notificationEl.dataset.relatedId = notification.related_id || "";

	const iconEl = document.createElement("div");
	iconEl.className = `notification-icon ${iconClasses[notification.type] || "follow-icon"}`;
	iconEl.innerHTML = icons[notification.type] || icons.like;

	const contentEl = document.createElement("div");
	contentEl.className = "notification-content";

	const contentP = document.createElement("p");
	contentP.innerHTML = `${notification.content} <span class="notification-time">• ${timeAgo}</span>`;

	contentEl.appendChild(contentP);

	if (notification.tweet) {
		if (notification.type === "reply") {
			const tweetElement = createTweetElement(notification.tweet, {
				clickToOpen: false,
				showTopReply: false,
				isTopReply: false,
				size: "preview",
			});
			const tweetPreviewEl = document.createElement("div");
			tweetPreviewEl.className = "notification-tweet-preview";
			tweetPreviewEl.appendChild(tweetElement);
			contentEl.appendChild(tweetPreviewEl);
		} else if (
			["like", "retweet", "quote", "mention"].includes(notification.type)
		) {
			const tweetContent =
				notification.tweet.content.length > 100
					? `${notification.tweet.content.substring(0, 100)}...`
					: notification.tweet.content;
			const tweetSubtitleEl = document.createElement("div");
			tweetSubtitleEl.className = "notification-tweet-subtitle";
			tweetSubtitleEl.textContent = tweetContent;
			contentEl.appendChild(tweetSubtitleEl);
		}
	}

	notificationEl.addEventListener("click", async (e) => {
		const notificationId = e.currentTarget.dataset.id;
		const notificationType = e.currentTarget.dataset.type;
		const relatedId = e.currentTarget.dataset.relatedId;

		if (authToken) {
			try {
				await fetch(`/api/notifications/${notificationId}/read`, {
					method: "PATCH",
					headers: { Authorization: `Bearer ${authToken}` },
				});

				const notification = currentNotifications.find(
					(n) => n.id === notificationId,
				);
				if (notification) {
					notification.read = true;
					renderNotifications();
					updateUnreadCount();
				}
			} catch (error) {
				console.error("Failed to mark notification as read:", error);
			}
		}

		if (!relatedId) return;

		if (notificationType === "dm") {
			// Handle DM notifications - open the conversation
			try {
				const response = await fetch(`/api/dm/conversations/${relatedId}`, {
					headers: { Authorization: `Bearer ${authToken}` },
				});

				if (response.ok) {
					const data = await response.json();
					if (data.conversation) {
						window.location.href = `/dm/${relatedId}`;
					}
				}
			} catch (error) {
				console.error("Failed to open DM conversation:", error);
			}
		} else if (
			["like", "retweet", "reply", "quote", "mention"].includes(
				notificationType,
			)
		) {
			try {
				const response = await fetch(`/api/tweets/${relatedId}`, {
					headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
				});

				if (response.ok) {
					const openTweet = (await import("./tweet.js")).default;
					openTweet({ id: relatedId });
				} else {
					toastQueue.add(`<h1>Tweet not found</h1>`);
				}
			} catch (error) {
				console.error("Failed to load tweet:", error);
				toastQueue.add(`<h1>Failed to load tweet</h1>`);
			}
		} else if (notificationType === "follow") {
			try {
				const { default: openProfile } = await import("./profile.js");
				openProfile(relatedId);
			} catch (error) {
				console.error("Failed to load profile:", error);
				toastQueue.add(`<h1>Failed to load profile</h1>`);
			}
		}
	});

	notificationEl.appendChild(iconEl);
	notificationEl.appendChild(contentEl);

	return notificationEl;
}

async function markAllAsRead() {
	if (!authToken) return;

	await fetch("/api/notifications/mark-all-read", {
		method: "PATCH",
		headers: { Authorization: `Bearer ${authToken}` },
	});

	currentNotifications.forEach((notification) => {
		notification.read = true;
	});
	renderNotifications();
	updateUnreadCount();
}

document
	.querySelector(".notifications .back-button")
	?.addEventListener("click", () => {
		window.location.href = "/";
	});

document
	.getElementById("markAllReadBtn")
	?.addEventListener("click", markAllAsRead);

addRoute((pathname) => pathname === "/notifications", openNotifications);

setInterval(updateUnreadCount, 30000);
updateUnreadCount();

export default { updateUnreadCount };
export { openNotifications, loadNotifications, markAllAsRead };
