import { attachHoverCard } from "../../shared/hover-card.js";
import {
	NOTIFICATION_ICON_CLASSES,
	NOTIFICATION_ICON_MAP,
} from "../../shared/notification-icons.js";
import {
	createNotificationSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import { updateTabIndicator } from "../../shared/tab-indicator.js";
import toastQueue from "../../shared/toasts.js";
import { createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import switchPage from "./pages.js";
import { openProfile } from "./profile.js";
import { createTweetElement } from "./tweets.js";

let currentNotifications = [];
let currentFilter = "all";
let isLoadingMoreNotifications = false;
let hasMoreNotifications = true;
let oldestNotificationId = null;
let notificationsScrollHandler = null;
let tabsInitialized = false;

function displayUnreadCount(count) {
	const countElement = document.getElementById("notificationCount");
	if (countElement) {
		if (count > 0) {
			countElement.textContent = count > 99 ? "99+" : count.toString();
			countElement.style.display = "flex";
		} else {
			countElement.style.display = "none";
		}
	}
}

function initializeNotificationTabs() {
	if (tabsInitialized) return;
	tabsInitialized = true;

	const tabContainer = document.querySelector(".notifications-tabs");
	if (!tabContainer) return;

	const buttons = tabContainer.querySelectorAll("button");

	buttons.forEach((btn) => {
		btn.addEventListener("click", () => {
			currentFilter = btn.dataset.filter || "all";
			buttons.forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");
			updateTabIndicator(tabContainer, btn);
			renderNotifications();
		});
	});

	const activeTab = tabContainer.querySelector(".active");
	if (activeTab) {
		currentFilter = activeTab.dataset.filter || "all";
		setTimeout(() => updateTabIndicator(tabContainer, activeTab), 50);
	}
}

async function openNotifications(isDirectClick = true) {
	switchPage("notifications", {
		path: "/notifications",
		noScroll: true,
		recoverState: loadNotifications,
		cleanup: () => {
			if (notificationsScrollHandler) {
				window.removeEventListener("scroll", notificationsScrollHandler);
				notificationsScrollHandler = null;
			}
		},
	});

	initializeNotificationTabs();

	if (isDirectClick) {
		setTimeout(() => window.scrollTo(0, 0), 0);
	}
}

async function loadNotifications() {
	if (!authToken) {
		switchPage("timeline", { path: "/" });
		return;
	}

	isLoadingMoreNotifications = false;
	hasMoreNotifications = true;
	oldestNotificationId = null;

	const listElement = document.getElementById("notificationsList");
	if (!listElement) return;

	const skeletons = showSkeletons(listElement, createNotificationSkeleton, 5);

	const data = await query("/notifications/");

	removeSkeletons(skeletons);

	const notifications = (data.notifications || []).map((notification) => {
		if (notification.tweet?.user) {
			notification.tweet.author = notification.tweet.user;
			delete notification.tweet.user;
		}

		return notification;
	});

	currentNotifications = notifications;
	hasMoreNotifications = data.hasMoreNotifications || false;

	if (notifications.length > 0) {
		oldestNotificationId = notifications[notifications.length - 1].id;
	}

	renderNotifications();

	if (notificationsScrollHandler) {
		window.removeEventListener("scroll", notificationsScrollHandler);
	}

	notificationsScrollHandler = async () => {
		const notificationsPage = document.querySelector(".notifications");
		if (!notificationsPage || notificationsPage.style.display === "none")
			return;

		if (isLoadingMoreNotifications || !hasMoreNotifications) return;

		const scrollPosition = window.innerHeight + window.scrollY;
		const threshold = document.documentElement.scrollHeight - 800;

		if (scrollPosition >= threshold) {
			isLoadingMoreNotifications = true;

			const listElement = document.getElementById("notificationsList");
			const skeletons = showSkeletons(
				listElement,
				createNotificationSkeleton,
				3,
			);

			try {
				const data = await query(
					`/notifications/?before=${oldestNotificationId}&limit=20`,
				);

				removeSkeletons(skeletons);

				const newNotifications = (data.notifications || []).map(
					(notification) => {
						if (notification.tweet?.user) {
							notification.tweet.author = notification.tweet.user;
							delete notification.tweet.user;
						}
						return notification;
					},
				);

				if (newNotifications.length > 0) {
					currentNotifications.push(...newNotifications);

					newNotifications.forEach((notification) => {
						const notificationEl = createNotificationElement(notification);
						listElement.appendChild(notificationEl);
					});

					oldestNotificationId =
						newNotifications[newNotifications.length - 1].id;
					hasMoreNotifications = data.hasMoreNotifications || false;

					requestAnimationFrame(() => {
						checkIfNeedsMoreContent();
					});
				} else {
					hasMoreNotifications = false;
				}
			} catch (error) {
				removeSkeletons(skeletons);
				console.error("Error loading more notifications:", error);
			} finally {
				isLoadingMoreNotifications = false;
			}
		}
	};

	window.addEventListener("scroll", notificationsScrollHandler);
}

function renderNotifications() {
	const listElement = document.getElementById("notificationsList");
	if (!listElement) return;

	listElement.innerHTML = "";

	let filteredNotifications = currentNotifications;
	if (currentFilter === "mentions") {
		filteredNotifications = currentNotifications.filter((n) => {
			const type = n.type || n.notifications?.[0]?.type;
			return type === "mention" || type === "reply";
		});
	}

	if (filteredNotifications.length === 0) {
		const noNotificationsEl = document.createElement("div");
		noNotificationsEl.className = "no-notifications";
		noNotificationsEl.innerHTML = `<img src="/public/shared/assets/img/cats/pit_cat_400.png" draggable="false">${
			currentFilter === "mentions"
				? "No mentions yet!"
				: "No notifications for now!"
		}`;
		listElement.appendChild(noNotificationsEl);
		return;
	}

	const groupedNotifications = groupSimilarNotifications(filteredNotifications);

	groupedNotifications.forEach((group) => {
		const notificationEl = createNotificationElement(group);
		listElement.appendChild(notificationEl);
	});

	requestAnimationFrame(() => {
		checkIfNeedsMoreContent();
	});
}

function checkIfNeedsMoreContent() {
	if (isLoadingMoreNotifications || !hasMoreNotifications) return;

	const notificationsPage = document.querySelector(".notifications");
	if (!notificationsPage || notificationsPage.style.display === "none") return;

	const documentHeight = document.documentElement.scrollHeight;
	const viewportHeight = window.innerHeight;

	if (documentHeight <= viewportHeight + 200 && hasMoreNotifications) {
		if (notificationsScrollHandler) {
			notificationsScrollHandler();
		}
	}
}

function groupSimilarNotifications(notifications) {
	const groups = [];
	const groupableTypes = ["like", "retweet", "follow", "reaction"];
	const timeWindowMs = 24 * 60 * 60 * 1000;

	for (const notification of notifications) {
		if (!groupableTypes.includes(notification.type)) {
			groups.push({
				notifications: [notification],
				type: notification.type,
				related_id: notification.related_id,
				created_at: notification.created_at,
				read: notification.read,
			});
			continue;
		}

		const notifTime = new Date(notification.created_at).getTime();
		const existingGroup = groups.find((g) => {
			if (g.type !== notification.type) return false;
			if (g.related_id !== notification.related_id) return false;

			const groupTime = new Date(g.created_at).getTime();
			return Math.abs(notifTime - groupTime) < timeWindowMs;
		});

		if (existingGroup) {
			existingGroup.notifications.push(notification);
			if (!existingGroup.read && notification.read) {
				existingGroup.read = false;
			}
		} else {
			groups.push({
				notifications: [notification],
				type: notification.type,
				related_id: notification.related_id,
				created_at: notification.created_at,
				read: notification.read,
			});
		}
	}

	return groups;
}

function createNotificationElement(group) {
	const notifications = Array.isArray(group.notifications)
		? group.notifications
		: [group];
	const primaryNotification = notifications[0];
	const isGrouped = notifications.length > 1;

	const now = new Date();
	let date;

	if (
		typeof primaryNotification.created_at === "string" &&
		!primaryNotification.created_at.endsWith("Z") &&
		!primaryNotification.created_at.includes("+")
	) {
		date = new Date(`${primaryNotification.created_at}Z`);
	} else {
		date = new Date(primaryNotification.created_at);
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

	const isUnread = notifications.some((n) => !n.read);

	const notificationEl = document.createElement("div");
	notificationEl.className = `notification-item ${isUnread ? "unread" : ""}`;
	notificationEl.dataset.id = primaryNotification.id;
	notificationEl.dataset.type = primaryNotification.type;
	notificationEl.dataset.relatedId = primaryNotification.related_id || "";
	notificationEl.dataset.relatedUrl = primaryNotification.url || "";

	const hasActors = notifications.some((n) => n.actor_avatar);

	const headerContainer = document.createElement("div");
	headerContainer.className = "notification-header";

	const iconEl = document.createElement("div");
	const customIcon = primaryNotification.customIcon;

	if (customIcon) {
		iconEl.className = "notification-icon custom-icon";
		const img = document.createElement("img");
		img.alt = "";
		img.setAttribute("loading", "lazy");
		let src = "";
		if (customIcon.kind === "svg" && customIcon.dataUri) {
			src = customIcon.dataUri;
		} else if (customIcon.kind === "image") {
			if (
				typeof customIcon.url === "string" &&
				customIcon.url.startsWith("/")
			) {
				src = customIcon.url;
			} else if (customIcon.hash) {
				src = `/api/uploads/${customIcon.hash}.webp`;
			}
		}

		if (src) {
			img.src = src;
			iconEl.appendChild(img);
		} else {
			const iconClassName =
				NOTIFICATION_ICON_CLASSES[primaryNotification.type] || "default-icon";
			iconEl.className = `notification-icon ${iconClassName}`;
			iconEl.innerHTML =
				NOTIFICATION_ICON_MAP[primaryNotification.type] ||
				NOTIFICATION_ICON_MAP.default;
		}
	} else {
		const iconClassName =
			NOTIFICATION_ICON_CLASSES[primaryNotification.type] || "default-icon";
		iconEl.className = `notification-icon ${iconClassName}`;
		iconEl.innerHTML =
			NOTIFICATION_ICON_MAP[primaryNotification.type] ||
			NOTIFICATION_ICON_MAP.default;
	}

	headerContainer.appendChild(iconEl);

	if (hasActors) {
		const avatarsContainer = document.createElement("div");
		avatarsContainer.className = "notification-avatars";

		const maxAvatars = 3;
		const displayNotifications = notifications.slice(0, maxAvatars);

		displayNotifications.forEach((notif, index) => {
			if (notif.actor_avatar) {
				const avatarWrapper = document.createElement("div");
				avatarWrapper.className = "notification-avatar-wrapper";
				avatarWrapper.style.zIndex = maxAvatars - index;

				const avatar = document.createElement("img");
				avatar.className = "notification-avatar";
				avatar.src = notif.actor_avatar;
				avatar.alt = notif.actor_name || notif.actor_username || "";
				avatar.setAttribute("loading", "lazy");
				avatar.setAttribute("draggable", "false");

				if (
					notif.actor_avatar_radius !== undefined &&
					notif.actor_avatar_radius !== null
				) {
					avatar.style.borderRadius = `${notif.actor_avatar_radius}%`;
				}

				if (notif.actor_username) {
					avatarWrapper.style.cursor = "pointer";
					avatarWrapper.addEventListener("click", (e) => {
						e.stopPropagation();
						openProfile(notif.actor_username);
					});
					attachHoverCard(avatarWrapper, notif.actor_username);
				}

				avatarWrapper.appendChild(avatar);
				avatarsContainer.appendChild(avatarWrapper);
			}
		});

		headerContainer.appendChild(avatarsContainer);
	}

	notificationEl.appendChild(headerContainer);

	const mainSection = document.createElement("div");
	mainSection.className = "notification-main";

	const contentEl = document.createElement("div");
	contentEl.className = "notification-content";

	const contentP = document.createElement("p");

	function escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	if (isGrouped) {
		const actors = notifications.map((n) => ({
			name: n.actor_name,
			username: n.actor_username,
		}));

		const maxDisplay = 3;
		const displayActors = actors.slice(0, maxDisplay);
		const remaining = actors.length - maxDisplay;

		displayActors.forEach((actor, index) => {
			if (actor.name) {
				const actorLink = document.createElement("a");
				actorLink.className = "notification-actor-link";
				actorLink.href = actor.username ? `/@${actor.username}` : "#";
				actorLink.textContent = actor.name;
				actorLink.addEventListener("click", (ev) => {
					ev.stopPropagation();
					ev.preventDefault();
					if (actor.username) {
						openProfile(actor.username);
					}
				});

				contentP.appendChild(actorLink);

				if (index < displayActors.length - 1) {
					contentP.appendChild(document.createTextNode(", "));
				}
			}
		});

		if (remaining > 0) {
			contentP.appendChild(
				document.createTextNode(
					` and ${remaining} other${remaining > 1 ? "s" : ""}`,
				),
			);
		}

		let actionText = "";
		switch (primaryNotification.type) {
			case "like":
				actionText = " liked your tweet";
				break;
			case "retweet":
				actionText = " retweeted your tweet";
				break;
			case "follow":
				actionText = " followed you";
				break;
			case "reaction":
				actionText = " reacted to your tweet";
				break;
			default:
				actionText = ` ${primaryNotification.content}`;
		}

		const restSpan = document.createElement("span");
		restSpan.className = "notification-rest";
		restSpan.textContent = actionText;

		contentP.appendChild(restSpan);
	} else {
		const actorName =
			primaryNotification.actor_name ||
			primaryNotification.actor_username ||
			null;
		const actorUsername = primaryNotification.actor_username || "";

		let remainingText = primaryNotification.content || "";

		try {
			remainingText = remainingText
				.replace(/\u00A0/g, " ")
				.replace(/\s+/g, " ")
				.trim();
		} catch {}

		if (actorName && remainingText) {
			try {
				const normActorName = actorName
					.replace(/\u00A0/g, " ")
					.replace(/\s+/g, " ")
					.trim();

				const displayNameRe = new RegExp(escapeRegExp(normActorName), "gi");
				remainingText = remainingText.replace(displayNameRe, "");

				if (actorUsername) {
					const usernameRe = new RegExp(
						`@?${escapeRegExp(actorUsername)}`,
						"gi",
					);
					remainingText = remainingText.replace(usernameRe, "");
					const parenRe = new RegExp(
						`\\(s*@?${escapeRegExp(actorUsername)}s*\\)`,
						"gi",
					);
					remainingText = remainingText.replace(parenRe, "");
				}

				remainingText = remainingText.replace(/\s+/g, " ").trim();
				remainingText = remainingText.replace(/^[:;\-\s()]+/, "").trim();
			} catch {}
		}

		if (actorName) {
			const actorLink = document.createElement("a");
			actorLink.className = "notification-actor-link";
			actorLink.href = actorUsername ? `/@${actorUsername}` : "#";
			actorLink.textContent = actorName;
			actorLink.addEventListener("click", (ev) => {
				ev.stopPropagation();
				ev.preventDefault();
				if (actorUsername) {
					openProfile(actorUsername);
				}
			});

			const restSpan = document.createElement("span");
			restSpan.className = "notification-rest";
			restSpan.textContent = remainingText ? ` ${remainingText}` : "";

			contentP.appendChild(actorLink);
			contentP.appendChild(restSpan);
		} else {
			contentP.textContent = `${primaryNotification.content?.trim() || ""}`;
		}
	}

	const timeSpan = document.createElement("span");
	timeSpan.className = "notification-time";
	timeSpan.textContent = ` · ${timeAgo}`;
	contentP.appendChild(timeSpan);

	contentEl.appendChild(contentP);

	if (primaryNotification.tweet) {
		if (primaryNotification.type === "reply") {
			const tweetElement = createTweetElement(primaryNotification.tweet, {
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
			["like", "retweet", "quote", "mention", "fact_check"].includes(
				primaryNotification.type,
			)
		) {
			const tweetContent =
				primaryNotification.tweet.content.length > 100
					? `${primaryNotification.tweet.content.substring(0, 100)}...`
					: primaryNotification.tweet.content;
			const tweetSubtitleEl = document.createElement("div");
			tweetSubtitleEl.className = "notification-tweet-subtitle";
			tweetSubtitleEl.textContent = tweetContent;
			contentEl.appendChild(tweetSubtitleEl);

			if (
				primaryNotification.tweet.attachments &&
				primaryNotification.tweet.attachments.length > 0
			) {
				const imageAttachments = primaryNotification.tweet.attachments.filter(
					(a) => a.file_type?.startsWith("image/"),
				);
				if (imageAttachments.length > 0) {
					const imagesContainer = document.createElement("div");
					imagesContainer.className = "notification-tweet-images";
					const maxImages = Math.min(imageAttachments.length, 4);
					for (let i = 0; i < maxImages; i++) {
						const img = document.createElement("img");
						img.src = imageAttachments[i].file_url;
						img.alt = "";
						img.loading = "lazy";
						imagesContainer.appendChild(img);
					}
					contentEl.appendChild(imagesContainer);
				}
			}
		} else if (primaryNotification.tweet.content) {
			const tweetContent =
				primaryNotification.tweet.content.length > 100
					? `${primaryNotification.tweet.content.substring(0, 100)}...`
					: primaryNotification.tweet.content;
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
		const relatedUrl = e.currentTarget.dataset.relatedUrl;

		if (authToken && isUnread) {
			try {
				for (const notif of notifications) {
					if (!notif.read) {
						await query(`/notifications/${notif.id}/read`, {
							method: "PATCH",
						});
						notif.read = true;
					}
				}
				renderNotifications();
			} catch (error) {
				console.error("Failed to mark notification as read:", error);
			}
		}

		if (relatedUrl) {
			try {
				window.location.href = relatedUrl;
				return;
			} catch (err) {
				console.error("Failed to open notification URL:", err);
			}
		}
		if (
			relatedId &&
			(relatedId.startsWith("meta:") || relatedId.startsWith("subtitle:"))
		)
			return;

		if (!relatedId) return;

		if (
			[
				"like",
				"retweet",
				"reply",
				"quote",
				"mention",
				"reaction",
				"fact_check",
			].includes(notificationType)
		) {
			if (relatedId.startsWith("meta:") || relatedId.startsWith("subtitle:"))
				return;

			if (
				(notificationType === "like" || notificationType === "retweet") &&
				isGrouped &&
				notifications.length > 1
			) {
				const uniqueTweetIds = [
					...new Set(notifications.map((n) => n.related_id).filter(Boolean)),
				];

				if (uniqueTweetIds.length > 1) {
					try {
						const { createModal } = await import("../../shared/ui-utils.js");
						const { default: openTweet } = await import("./tweet.js");

						const modal = createModal({
							title: `${uniqueTweetIds.length} ${notificationType === "like" ? "liked tweets" : "retweeted tweets"}`,
							content: document.createElement("div"),
						});

						const content = modal.modal.querySelector(".modal-content > div");
						content.style.cssText =
							"padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;";

						for (const tweetId of uniqueTweetIds) {
							try {
								const tweetData = await query(`/tweets/${tweetId}`);
								if (!tweetData) continue;

								const tweetBtn = document.createElement("button");
								const previewText =
									tweetData.content?.substring(0, 60) || "View tweet";
								tweetBtn.textContent =
									previewText.length < tweetData.content?.length
										? `${previewText}...`
										: previewText;
								tweetBtn.className = "profile-btn profile-btn-secondary";
								tweetBtn.style.cssText =
									"width: 100%; text-align: left; padding: 0.75rem 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
								tweetBtn.onclick = () => {
									modal.close();
									openTweet(tweetData);
								};
								content.appendChild(tweetBtn);
							} catch (err) {
								console.error(`Failed to fetch tweet ${tweetId}:`, err);
							}
						}

						modal.show();
						return;
					} catch (error) {
						console.error("Failed to show tweet list:", error);
					}
				}
			}

			try {
				const tweetModule = await import(`./tweet.js`);
				const openTweet = tweetModule.default;

				openTweet({ id: relatedId });
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
		} else if (notificationType?.startsWith("community_")) {
			try {
				const mod = await import("./communities.js");
				if (mod.loadCommunityDetail) mod.loadCommunityDetail(relatedId);
				else window.location.href = `/communities/${relatedId}`;
			} catch (error) {
				console.error("Failed to open community:", error);
				window.location.href = `/communities/${relatedId}`;
			}
		} else if (
			["group_invite", "group_message", "dm_message"].includes(notificationType)
		) {
			try {
				await import("./dm.js");
				if (window.openConversation) window.openConversation(relatedId);
				else window.location.href = `/dm/${relatedId}`;
			} catch (error) {
				console.error("Failed to open DM:", error);
				window.location.href = `/dm/${relatedId}`;
			}
		} else if (notificationType === "delegate_invite") {
			const inviteId = relatedId;

			const content = document.createElement("div");
			content.style.margin = "16px 18px";
			content.style.textAlign = "center";

			const actions = document.createElement("div");
			actions.className = "modal-actions";

			const yesBtn = document.createElement("button");
			yesBtn.type = "button";
			yesBtn.className = "btn primary";
			yesBtn.textContent = "Accept";

			const noBtn = document.createElement("button");
			noBtn.type = "button";
			noBtn.className = "btn";
			noBtn.textContent = "Decline";

			actions.appendChild(yesBtn);
			actions.appendChild(noBtn);
			content.appendChild(actions);

			const modal = createModal({
				title: "Delegate Invitation",
				content,
				closeOnOverlayClick: true,
			});

			yesBtn.addEventListener("click", async () => {
				yesBtn.disabled = true;
				try {
					await query(`/delegates/invitations/${inviteId}/accept`, {
						method: "POST",
					});
					toastQueue.add(
						"<h1>Invitation Accepted</h1><p>You are now a delegate</p>",
					);
					const n = currentNotifications.find((x) => x.id === notificationId);
					if (n) n.read = true;
					renderNotifications();
					modal.close();
				} catch (err) {
					console.error(err);
					toastQueue.add("<h1>Failed to accept invitation</h1>");
					yesBtn.disabled = false;
				}
			});

			noBtn.addEventListener("click", async () => {
				noBtn.disabled = true;
				try {
					await query(`/delegates/invitations/${inviteId}/decline`, {
						method: "POST",
					});
					toastQueue.add("<h1>Invitation Declined</h1>");
					const n = currentNotifications.find((x) => x.id === notificationId);
					if (n) n.read = true;
					renderNotifications();
					modal.close();
				} catch (err) {
					console.error(err);
					toastQueue.add("<h1>Failed to decline invitation</h1>");
					noBtn.disabled = false;
				}
			});
		} else if (
			notificationType === "affiliate_request" ||
			relatedId?.startsWith("affiliate_request:")
		) {
			const requestId = relatedId?.startsWith("affiliate_request:")
				? relatedId.split(":")[1]
				: null;
			const notif = notifications.find((n) => n.id === notificationId) || {};
			const actorName = notif.actor_username || notif.actor_name || "this user";

			const content = document.createElement("div");
			content.style.margin = "16px 18px";
			content.style.textAlign = "center";

			const text = document.createElement("p");
			text.textContent = `Do you want to be affiliated with ${
				actorName.startsWith("@") ? actorName : `@${actorName}`
			}?`;
			content.appendChild(text);

			const actions = document.createElement("div");
			actions.className = "modal-actions";

			const yesBtn = document.createElement("button");
			yesBtn.type = "button";
			yesBtn.className = "btn primary";
			yesBtn.textContent = "Yes";

			const noBtn = document.createElement("button");
			noBtn.type = "button";
			noBtn.className = "btn";
			noBtn.textContent = "No";

			actions.appendChild(yesBtn);
			actions.appendChild(noBtn);
			content.appendChild(actions);

			const modal = createModal({
				title: "Affiliation request",
				content,
				closeOnOverlayClick: true,
			});

			yesBtn.addEventListener("click", async () => {
				yesBtn.disabled = true;
				try {
					let resolvedId = requestId;
					if (!resolvedId) {
						try {
							const data = await query(`/profile/affiliate-requests`);
							const list = data.requests || data || [];
							const found = list.find((r) => {
								if (!r) return false;
								const uname =
									r.username || r.requester_username || r.actor_username;
								const name = r.name || r.requester_name || r.actor_name;
								return (
									(notif.actor_username && uname === notif.actor_username) ||
									(notif.actor_name && uname === notif.actor_name) ||
									(notif.actor_username && name === notif.actor_username) ||
									(notif.actor_name && name === notif.actor_name)
								);
							});
							if (found?.id) resolvedId = found.id;
						} catch (err) {
							console.error("Failed to resolve affiliate request id:", err);
						}
					}

					if (!resolvedId) {
						toastQueue.add("<h1>Invalid request</h1>");
						modal.close();
						return;
					}

					await query(`/profile/affiliate-requests/${resolvedId}/approve`, {
						method: "POST",
					});
					toastQueue.add("<h1>Affiliation approved</h1>");
					const n = currentNotifications.find((x) => x.id === notificationId);
					if (n) n.read = true;
					renderNotifications();
					modal.close();
				} catch (err) {
					console.error(err);
					toastQueue.add("<h1>Failed to approve</h1>");
					yesBtn.disabled = false;
				}
			});

			noBtn.addEventListener("click", async () => {
				noBtn.disabled = true;
				try {
					let resolvedId = requestId;
					if (!resolvedId) {
						try {
							const data = await query(`/profile/affiliate-requests`);
							const list = data.requests || data || [];
							const found = list.find((r) => {
								if (!r) return false;
								const uname =
									r.username || r.requester_username || r.actor_username;
								const name = r.name || r.requester_name || r.actor_name;
								return (
									(notif.actor_username && uname === notif.actor_username) ||
									(notif.actor_name && uname === notif.actor_name) ||
									(notif.actor_username && name === notif.actor_username) ||
									(notif.actor_name && name === notif.actor_name)
								);
							});
							if (found?.id) resolvedId = found.id;
						} catch (err) {
							console.error("Failed to resolve affiliate request id:", err);
						}
					}

					if (!resolvedId) {
						modal.close();
						return;
					}

					await query(`/profile/affiliate-requests/${resolvedId}/deny`, {
						method: "POST",
					});
					toastQueue.add("<h1>Affiliation denied</h1>");
					const n = currentNotifications.find((x) => x.id === notificationId);
					if (n) n.read = true;
					renderNotifications();
					modal.close();
				} catch (err) {
					console.error(err);
					toastQueue.add("<h1>Failed to deny</h1>");
					noBtn.disabled = false;
				}
			});
		}
	});

	mainSection.appendChild(contentEl);
	notificationEl.appendChild(mainSection);

	return notificationEl;
}

async function markAllAsRead() {
	if (!authToken) return;

	currentNotifications.forEach((notification) => {
		notification.read = true;
	});

	document
		.querySelectorAll(".notifications-list .notification-item.unread")
		.forEach((el) => {
			el.classList.remove("unread");
		});

	query("/notifications/mark-all-read", {
		method: "PATCH",
	});
}

document
	.querySelector(".notifications .back-button")
	?.addEventListener("click", async () => {
		const indexModule = await import("./index.js");
		const savedScroll = indexModule.getTimelineScroll?.() || 0;

		switchPage("timeline", {
			path: "/",
			noScroll: true,
		});

		setTimeout(() => window.scrollTo(0, savedScroll), 0);
	});

window.addEventListener("new-notification", (e) => {
	const notification = e.detail;
	if (!notification) return;

	if (notification.tweet?.user) {
		notification.tweet.author = notification.tweet.user;
		delete notification.tweet.user;
	}

	const exists = currentNotifications.some((n) => n.id === notification.id);
	if (exists) return;

	currentNotifications.unshift(notification);

	const notificationsPage = document.querySelector(".notifications");
	if (notificationsPage && notificationsPage.style.display !== "none") {
		renderNotifications();
	}
});

export const handleMarkAllRead = markAllAsRead;

export default { displayUnreadCount };
export { openNotifications, loadNotifications, markAllAsRead };
