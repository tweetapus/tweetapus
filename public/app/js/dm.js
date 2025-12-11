import { showEmojiPickerPopup } from "../../shared/emoji-picker.js";
import { isConvertibleImage } from "../../shared/image-utils.js";
import { openImageFullscreen } from "../../shared/image-viewer.js";
import {
	createDMConversationSkeleton,
	createDMMessageSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import toastQueue from "../../shared/toasts.js";
import { createModal, createPopup } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import switchPage, {
	addRoute,
	setUnreadCounts,
	updatePageTitle,
} from "./pages.js";

const dmEmojiMap = {};
(async () => {
	try {
		const resp = await fetch("/api/emojis");
		if (!resp.ok) return;
		const data = await resp.json();
		for (const e of data.emojis || []) {
			if (e?.name && e?.file_url) dmEmojiMap[e.name] = e.file_url;
		}
	} catch (_err) {}
})();

function sanitizeHTML(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

function linkifyDMText(text) {
	if (!text) return "";
	const sanitized = sanitizeHTML(text);
	const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
	return sanitized.replace(urlRegex, (url) => {
		const safeUrl = url.replace(/["'<>]/g, "");
		return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="dm-link">${safeUrl}</a>`;
	});
}

let currentConversations = [];
let currentConversation = null;
let currentMessages = [];
let eventSource = null;
let selectedUsers = [];
let pendingFiles = [];
let sseConnectTimeout = null;
let lastSSEConnect = 0;
let sseFailureCount = 0;
let sseReconnectTimer = null;
let sseUnstableNotified = false;
let sseDisabledNotified = false;
let replyingTo = null;
let messageOffset = 0;
let isLoadingMoreMessages = false;
let hasMoreMessages = true;
const typingIndicators = new Map();
const typingTimeouts = new Map();
const MAX_SSE_FAILURES = 5;

function connectSSE() {
	if (!authToken) return;

	if (sseReconnectTimer) {
		clearTimeout(sseReconnectTimer);
		sseReconnectTimer = null;
	}

	if (sseFailureCount >= MAX_SSE_FAILURES) {
		return;
	}

	const now = Date.now();
	const timeSinceLastConnect = now - lastSSEConnect;

	if (timeSinceLastConnect < 1000) {
		if (sseConnectTimeout) clearTimeout(sseConnectTimeout);
		sseConnectTimeout = setTimeout(() => {
			connectSSE();
		}, 1000 - timeSinceLastConnect);
		return;
	}

	if (eventSource && eventSource.readyState === EventSource.OPEN) {
		return;
	}

	lastSSEConnect = now;

	/* biome-ignore lint/suspicious/noDocumentCookie: idgaf */
	document.cookie = `__TWEETAPUS_SECRET_SSE_TOKEN__=${authToken}; path=/; samesite=strict; max-age=60`;
	eventSource = new EventSource(`/api/sse`);

	eventSource.onopen = () => {
		sseFailureCount = 0;
		sseUnstableNotified = false;
		sseDisabledNotified = false;
		if (sseReconnectTimer) {
			clearTimeout(sseReconnectTimer);
			sseReconnectTimer = null;
		}
	};

	eventSource.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			if (data.type === "m") {
				handleNewMessage(data);
			} else if (data.type === "reaction") {
				handleReactionUpdate(data);
			} else if (data.type === "u") {
				if (data.notifications !== undefined) {
					displayNotificationCount(data.notifications);
				}
				if (data.dms !== undefined) {
					displayDMCount(data.dms);
				}
			} else if (data.type === "typing") {
				handleTypingIndicator(data);
			} else if (data.type === "typing-stop") {
				handleTypingStop(data);
			} else if (data.type === "message-edit") {
				handleMessageEdit(data);
			} else if (data.type === "message-delete") {
				handleMessageDelete(data);
			} else if (data.type === "disappearing-update") {
				handleDisappearingUpdate(data);
			} else if (data.type === "notification") {
				handleNewNotification(data.notification);
			}
		} catch (error) {
			console.error("Error parsing SSE message:", error);
		}
	};

	eventSource.onerror = (error) => {
		console.debug("SSE error:", error);

		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		if (sseConnectTimeout) {
			clearTimeout(sseConnectTimeout);
			sseConnectTimeout = null;
		}

		sseFailureCount += 1;

		if (sseFailureCount >= MAX_SSE_FAILURES) {
			if (!sseDisabledNotified) {
				sseDisabledNotified = true;
			}
			return;
		}

		if (sseFailureCount >= 3 && !sseUnstableNotified) {
			toastQueue.add(
				"Connection to messages unstable, switching to slower updates.",
			);
			sseUnstableNotified = true;
		}

		const retryDelay = sseFailureCount >= 3 ? 15000 : 3000;

		if (sseReconnectTimer) {
			clearTimeout(sseReconnectTimer);
		}

		sseReconnectTimer = setTimeout(() => {
			sseReconnectTimer = null;
			connectSSE();
		}, retryDelay);
	};
}

function handleNewMessage(data) {
	const { conversationId, message } = data;

	if (currentConversation && currentConversation.id === conversationId) {
		currentMessages.push(message);
		messageOffset += 1;
		renderMessages();
		scrollToBottom();
	}

	loadConversations();
}

function handleReactionUpdate(data) {
	const { messageId, reactions, conversationId } = data;

	if (currentConversation && currentConversation.id === conversationId) {
		const message = currentMessages.find((m) => m.id === messageId);
		if (message) {
			message.reactions = reactions;
			renderMessages();
		}
	}
}

function handleTypingIndicator(data) {
	const { conversationId, userId, username, name, avatar } = data;

	if (currentConversation && currentConversation.id === conversationId) {
		if (!typingIndicators.has(userId)) {
			typingIndicators.set(userId, { username, name, avatar });
			renderTypingIndicators();
		}

		if (typingTimeouts.has(userId)) {
			clearTimeout(typingTimeouts.get(userId));
		}

		const timeout = setTimeout(() => {
			typingIndicators.delete(userId);
			typingTimeouts.delete(userId);
			renderTypingIndicators();
		}, 3000);

		typingTimeouts.set(userId, timeout);
	}
}

function handleTypingStop(data) {
	const { conversationId, userId } = data;

	if (currentConversation && currentConversation.id === conversationId) {
		if (typingTimeouts.has(userId)) {
			clearTimeout(typingTimeouts.get(userId));
			typingTimeouts.delete(userId);
		}
		typingIndicators.delete(userId);
		renderTypingIndicators();
	}
}

function handleMessageEdit(data) {
	if (!data.conversationId || data.conversationId !== currentConversation?.id)
		return;
	if (!data.message) return;

	const messageIndex = currentMessages.findIndex(
		(m) => m.id === data.message.id,
	);
	if (messageIndex !== -1) {
		currentMessages[messageIndex] = data.message;
		renderMessages();
	}
}

function handleMessageDelete(data) {
	if (!data.conversationId || data.conversationId !== currentConversation?.id)
		return;
	if (!data.messageId) return;

	const messageIndex = currentMessages.findIndex(
		(m) => m.id === data.messageId,
	);
	if (messageIndex !== -1) {
		currentMessages.splice(messageIndex, 1);
		messageOffset -= 1;
		renderMessages();
	}
}

function handleDisappearingUpdate(data) {
	if (!data.conversationId || data.conversationId !== currentConversation?.id)
		return;

	if (currentConversation) {
		currentConversation.disappearing_enabled = data.enabled;
		currentConversation.disappearing_duration = data.duration;

		const statusText = data.enabled
			? `Disappearing messages enabled (${formatDisappearingDuration(data.duration)})`
			: "Disappearing messages disabled";
		toastQueue.add(statusText);
	}
}

function handleNewNotification(notification) {
	window.dispatchEvent(
		new CustomEvent("new-notification", { detail: notification }),
	);
}

function renderTypingIndicators() {
	const messagesElement = document.getElementById("dmMessages");
	if (!messagesElement) return;

	let typingEl = document.getElementById("dmTypingIndicators");

	if (typingIndicators.size === 0) {
		if (typingEl) typingEl.remove();
		return;
	}

	if (!typingEl) {
		typingEl = document.createElement("div");
		typingEl.id = "dmTypingIndicators";
		typingEl.className = "dm-typing-indicators";
		messagesElement.appendChild(typingEl);
	}

	const typingUsers = Array.from(typingIndicators.values());
	typingEl.innerHTML = `
    <div class="dm-typing-container">
      <div class="dm-typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="dm-typing-text">${typingUsers
				.map((u) => u.name || u.username)
				.join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing...</span>
    </div>
  `;
}

let cachedNotificationCount = 0;
let cachedDMCount = 0;

function displayDMCount(count) {
	cachedDMCount = count;
	const countElement = document.getElementById("dmCount");
	if (countElement) {
		if (count > 0) {
			countElement.textContent = count > 99 ? "99+" : count.toString();
			countElement.style.display = "flex";
		} else {
			countElement.style.display = "none";
		}
	}
	setUnreadCounts(cachedNotificationCount, cachedDMCount);
	const currentPage = window.location.pathname.split("/")[1] || "timeline";
	if (
		currentPage === "" ||
		currentPage === "dm" ||
		currentPage === "notifications"
	) {
		updatePageTitle(
			currentPage === ""
				? "timeline"
				: currentPage === "dm"
					? "direct-messages"
					: "notifications",
		);
	}
}

function displayNotificationCount(count) {
	cachedNotificationCount = count;
	const countElement = document.getElementById("notificationCount");
	if (countElement) {
		if (count > 0) {
			countElement.textContent = count > 99 ? "99+" : count.toString();
			countElement.style.display = "flex";
		} else {
			countElement.style.display = "none";
		}
	}
	setUnreadCounts(cachedNotificationCount, cachedDMCount);
	const currentPage = window.location.pathname.split("/")[1] || "timeline";
	if (
		currentPage === "" ||
		currentPage === "dm" ||
		currentPage === "notifications"
	) {
		updatePageTitle(
			currentPage === ""
				? "timeline"
				: currentPage === "dm"
					? "direct-messages"
					: "notifications",
		);
	}
}

async function loadConversations() {
	if (!authToken) {
		console.error("No auth token available for DM");
		return;
	}

	const listElement = document.getElementById("dmConversationsList");
	if (!listElement) return;

	const skeletons = showSkeletons(listElement, createDMConversationSkeleton, 3);

	try {
		const data = await query("/dm/conversations");
		removeSkeletons(skeletons);

		if (data.error) {
			toastQueue.add("An error occurred");
			return;
		}

		currentConversations = data.conversations || [];
		renderConversationsList();
	} catch (error) {
		removeSkeletons(skeletons);
		console.error("Failed to load conversations:", error);
		toastQueue.add("Failed to load conversations");
	}
}

function renderConversationsList() {
	const listElement = document.getElementById("dmConversationsList");
	if (!listElement) return;

	if (currentConversations.length === 0) {
		if (!listElement.querySelector(".no-conversations")) {
			listElement.innerHTML = "";
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "no-conversations";

			emptyDiv.innerHTML = `<img src="/public/shared/assets/img/cats/cat_talk.png" alt="Chatty cat" draggable="false"><p>No conversations yet.</p><p>Start a new conversation to get chatting!</p>`;
			listElement.appendChild(emptyDiv);
		}
		return;
	}

	const existingItems = listElement.querySelectorAll(".dm-conversation-item");
	const existingMap = new Map();
	for (const item of existingItems) {
		const onclick = item.getAttribute("onclick");
		const match = onclick?.match(/openConversation\('([^']+)'\)/);
		if (match) {
			existingMap.set(match[1], item);
		}
	}

	const noConversations = listElement.querySelector(".no-conversations");
	if (noConversations) noConversations.remove();

	const fragment = document.createDocumentFragment();
	const conversationIds = new Set();

	for (const conversation of currentConversations) {
		conversationIds.add(conversation.id);
		const existing = existingMap.get(conversation.id);

		if (existing) {
			updateConversationItem(existing, conversation);
			fragment.appendChild(existing);
		} else {
			const newItem = createConversationItem(conversation);
			fragment.appendChild(newItem);
		}
	}

	for (const [id, item] of existingMap) {
		if (!conversationIds.has(id)) {
			item.remove();
		}
	}

	listElement.innerHTML = "";
	listElement.appendChild(fragment);
}

function updateConversationItem(item, conversation) {
	const unreadCount = conversation.unread_count || 0;
	const isGroup = conversation.type === "group";

	item.classList.toggle("unread", unreadCount > 0);
	item.classList.toggle("group", isGroup);

	const lastMessageEl = item.querySelector(".dm-last-message");
	if (lastMessageEl) {
		const lastMessage = sanitizeHTML(
			conversation.last_message_content || "No messages yet",
		);
		const lastSender = sanitizeHTML(
			conversation.lastMessageSenderName ||
				conversation.last_message_sender ||
				"",
		);
		let messageText = "";
		if (lastSender && isGroup) {
			messageText = `${lastSender.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}: `;
		}
		messageText += lastMessage.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		if (lastMessageEl.textContent.trim() !== messageText.trim()) {
			lastMessageEl.innerHTML = "";
			if (lastSender && isGroup) {
				const senderSpan = document.createElement("span");
				senderSpan.className = "dm-sender";
				senderSpan.textContent = `${lastSender}: `;
				lastMessageEl.appendChild(senderSpan);
			}
			lastMessageEl.appendChild(
				document.createTextNode(
					sanitizeHTML(conversation.last_message_content || "No messages yet"),
				),
			);
		}
	}

	const timeEl = item.querySelector(".dm-time");
	if (timeEl) {
		const time = conversation.last_message_time
			? formatTime(new Date(conversation.last_message_time))
			: "";
		if (timeEl.textContent !== time) {
			timeEl.textContent = time;
		}
	}

	const unreadEl = item.querySelector(".dm-unread-count");
	if (unreadCount > 0) {
		if (unreadEl) {
			if (unreadEl.textContent !== String(unreadCount)) {
				unreadEl.textContent = unreadCount;
			}
		} else {
			const meta = item.querySelector(".dm-conversation-meta");
			if (meta) {
				const newUnread = document.createElement("span");
				newUnread.className = "dm-unread-count";
				newUnread.textContent = unreadCount;
				meta.appendChild(newUnread);
			}
		}
	} else if (unreadEl) {
		unreadEl.remove();
	}
}

function createConversationItem(conversation) {
	const displayAvatar =
		conversation.displayAvatar || "/public/shared/assets/default-avatar.svg";
	const displayName = sanitizeHTML(conversation.displayName || "Unknown");
	const lastMessage = sanitizeHTML(
		conversation.last_message_content || "No messages yet",
	);
	const lastSender = sanitizeHTML(
		conversation.lastMessageSenderName ||
			conversation.last_message_sender ||
			"",
	);
	const time = conversation.last_message_time
		? formatTime(new Date(conversation.last_message_time))
		: "";
	const unreadCount = conversation.unread_count || 0;
	const isGroup = conversation.type === "group";

	const item = document.createElement("div");
	item.className =
		`dm-conversation-item ${unreadCount > 0 ? "unread" : ""} ${isGroup ? "group" : ""}`.trim();
	item.onclick = () => openConversation(conversation.id);

	if (isGroup && conversation.participants.length > 0) {
		const maxAvatars = 3;
		const visibleParticipants = conversation.participants.slice(0, maxAvatars);
		const groupAvatars = document.createElement("div");
		groupAvatars.className = "dm-group-avatars";

		for (const p of visibleParticipants) {
			const radius =
				p.avatar_radius !== null && p.avatar_radius !== undefined
					? `${p.avatar_radius}px`
					: p.gold || p.gray
						? `4px`
						: `50px`;
			const img = document.createElement("img");
			img.src = p.avatar || "/public/shared/assets/default-avatar.svg";
			img.alt = p.name || p.username;
			img.style.borderRadius = radius;
			img.setAttribute("loading", "lazy");
			img.setAttribute("decoding", "async");
			img.setAttribute("draggable", "false");
			groupAvatars.appendChild(img);
		}

		if (conversation.participants.length > maxAvatars) {
			const more = document.createElement("div");
			more.className = "dm-avatar-more";
			more.textContent = `+${conversation.participants.length - maxAvatars}`;
			groupAvatars.appendChild(more);
		}

		item.appendChild(groupAvatars);
	} else {
		const singleParticipant = conversation.participants?.[0] ?? null;
		const radius = singleParticipant
			? singleParticipant.avatar_radius !== null &&
				singleParticipant.avatar_radius !== undefined
				? `${singleParticipant.avatar_radius}px`
				: singleParticipant.gold || singleParticipant.gray
					? `4px`
					: `50px`
			: `50px`;
		const img = document.createElement("img");
		img.src = displayAvatar;
		img.alt = displayName;
		img.className = "dm-avatar";
		img.style.borderRadius = radius;
		item.appendChild(img);
	}

	const info = document.createElement("div");
	info.className = "dm-conversation-info";

	const nameH3 = document.createElement("h3");
	nameH3.className = "dm-conversation-name";
	nameH3.textContent = displayName;
	if (isGroup) {
		const groupIndicator = document.createElement("span");
		groupIndicator.className = "group-indicator";
		groupIndicator.textContent = "👥";
		nameH3.appendChild(groupIndicator);
	}
	info.appendChild(nameH3);

	const lastMessageP = document.createElement("p");
	lastMessageP.className = "dm-last-message";
	if (lastSender && isGroup) {
		const senderSpan = document.createElement("span");
		senderSpan.className = "dm-sender";
		senderSpan.textContent = `${lastSender}: `;
		lastMessageP.appendChild(senderSpan);
	}
	lastMessageP.appendChild(document.createTextNode(lastMessage));
	info.appendChild(lastMessageP);

	item.appendChild(info);

	const meta = document.createElement("div");
	meta.className = "dm-conversation-meta";

	if (time) {
		const timeSpan = document.createElement("span");
		timeSpan.className = "dm-time";
		timeSpan.textContent = time;
		meta.appendChild(timeSpan);
	}

	if (unreadCount > 0) {
		const unreadSpan = document.createElement("span");
		unreadSpan.className = "dm-unread-count";
		unreadSpan.textContent = unreadCount;
		meta.appendChild(unreadSpan);
	}

	item.appendChild(meta);

	return item;
}

async function openConversation(conversationId) {
	typingIndicators.clear();
	for (const timeout of typingTimeouts.values()) {
		clearTimeout(timeout);
	}
	typingTimeouts.clear();

	currentConversation = null;
	currentMessages = [];

	switchPage("dm-conversation", {
		path: `/dm/${conversationId}`,
		recoverState: async () => {
			const messagesElement = document.getElementById("dmMessages");
			if (!messagesElement) return;

			messagesElement.innerHTML = "";

			const skeletons = [];
			for (let i = 0; i < 6; i++) {
				skeletons.push(
					...showSkeletons(
						messagesElement,
						() => createDMMessageSkeleton(i % 3 === 0),
						1,
					),
				);
			}

			try {
				const data = await query(`/dm/conversations/${conversationId}`);

				removeSkeletons(skeletons);

				if (data.error) {
					toastQueue.add(data.error);
					return;
				}

				currentConversation = data.conversation;
				currentMessages = (data.messages || []).reverse();
				messageOffset = currentMessages.length;
				hasMoreMessages = true;
				isLoadingMoreMessages = false;

				renderConversationHeader();
				renderMessages();
				scrollToBottom();
				markConversationAsRead(conversationId);
				setupInfiniteScroll();
			} catch (error) {
				removeSkeletons(skeletons);
				console.error("Failed to open conversation:", error);
				toastQueue.add("Failed to open conversation");
			}
		},
	});
}

function renderConversationHeader() {
	if (!currentConversation) return;

	const avatarsElement = document.getElementById("dmParticipantAvatars");
	const titleElement = document.getElementById("dmConversationTitle");
	const countElement = document.getElementById("dmParticipantCount");
	const actionsElement = document.getElementById("dmConversationActions");

	if (!avatarsElement || !titleElement || !countElement) return;

	const currentUsername = getCurrentUsername();
	const participants = currentConversation.participants.filter(
		(p) => p.username !== currentUsername,
	);
	const isGroup = currentConversation.type === "group";

	avatarsElement.innerHTML = "";
	const visibleParticipants = isGroup ? participants.slice(0, 3) : participants;
	for (const p of visibleParticipants) {
		const radius =
			p.avatar_radius !== null && p.avatar_radius !== undefined
				? `${p.avatar_radius}px`
				: p.gold || p.gray
					? `4px`
					: `50px`;
		const img = document.createElement("img");
		img.src = p.avatar || "/public/shared/assets/default-avatar.svg";
		img.alt = p.name || p.username;
		img.style.borderRadius = radius;
		avatarsElement.appendChild(img);
	}
	if (isGroup && participants.length > 3) {
		const more = document.createElement("div");
		more.className = "avatar-more";
		more.textContent = `+${participants.length - 3}`;
		avatarsElement.appendChild(more);
	}

	if (isGroup) {
		titleElement.textContent = currentConversation.title || "Group Chat";
		countElement.textContent = `${participants.length + 1} participants`;
	} else if (participants.length === 1) {
		titleElement.textContent = participants[0].name || participants[0].username;
		countElement.textContent = `@${participants[0].username}`;
	} else {
		titleElement.textContent = "Direct Message";
		countElement.textContent = "1-on-1 chat";
	}

	if (actionsElement) {
		actionsElement.innerHTML = "";
		const settingsBtn = document.createElement("button");
		settingsBtn.className = "dm-action-btn";
		settingsBtn.title = "Settings";
		settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`;
		settingsBtn.addEventListener(
			"click",
			isGroup ? openGroupSettings : openDirectSettings,
		);
		actionsElement.appendChild(settingsBtn);
	}
}

function renderMessages() {
	const messagesElement = document.getElementById("dmMessages");
	if (!messagesElement || !currentMessages) return;

	const currentUser = getCurrentUsername();
	const existingMessages = new Map();

	for (const el of messagesElement.querySelectorAll(".dm-message")) {
		const id = el.dataset.messageId;
		if (id) existingMessages.set(id, el);
	}

	const messageIds = new Set(currentMessages.map((m) => m.id));

	for (const [id, el] of existingMessages) {
		if (!messageIds.has(id)) {
			el.remove();
		}
	}

	let lastElement = null;
	for (const message of currentMessages) {
		let messageEl = existingMessages.get(message.id);

		if (messageEl) {
			updateMessageElement(messageEl, message, currentUser);
		} else {
			messageEl = createMessageElement(message, currentUser);
		}

		if (lastElement) {
			lastElement.after(messageEl);
		} else if (messagesElement.firstChild !== messageEl) {
			messagesElement.prepend(messageEl);
		}
		lastElement = messageEl;
	}

	if (currentMessages.length === 0) {
		const emptyDiv = document.createElement("div");
		emptyDiv.className = "no-messages";

		emptyDiv.innerHTML = `<img src="/public/shared/assets/img/cats/cat_talk.png" alt="Messaging cat" draggable="false"><p>Send a message to get started</p>`;
		messagesElement.appendChild(emptyDiv);
	}
}

function createMessageElement(message, currentUser) {
	message.content = message.content.trim() || "";

	document
		.querySelector(".dm-conversation .dm-messages .no-messages")
		?.remove();

	const isOwn = message.username === currentUser;
	const avatar = message.avatar || "/public/shared/assets/default-avatar.svg";
	const radius =
		message.avatar_radius !== null && message.avatar_radius !== undefined
			? `${message.avatar_radius}px`
			: message.gold || message.gray
				? `4px`
				: `50px`;
	const time = formatTime(new Date(message.created_at));
	const sanitizedContent = sanitizeHTML(message.content || "");
	const sanitizedName = sanitizeHTML(message.name || message.username);

	const el = document.createElement("div");
	el.className = `dm-message${isOwn ? " own" : ""}`;
	el.dataset.messageId = message.id;

	const avatarImg = document.createElement("img");
	avatarImg.src = avatar;
	avatarImg.alt = sanitizedName;
	avatarImg.className = "dm-message-avatar";
	avatarImg.style.borderRadius = radius;
	el.appendChild(avatarImg);

	const wrapper = document.createElement("div");
	wrapper.className = "dm-message-wrapper";

	if (message.reply_to_message) {
		const replyPreview = document.createElement("div");
		replyPreview.className = "dm-reply-preview";
		const replyAuthor = document.createElement("span");
		replyAuthor.className = "dm-reply-author";
		replyAuthor.textContent =
			message.reply_to_message.name || message.reply_to_message.username;
		const replyText = document.createElement("span");
		replyText.className = "dm-reply-text";
		const replyContent = message.reply_to_message.content || "";
		replyText.textContent =
			replyContent.length > 50
				? `${replyContent.substring(0, 50)}...`
				: replyContent;
		replyPreview.appendChild(replyAuthor);
		replyPreview.appendChild(replyText);
		wrapper.appendChild(replyPreview);
	}

	const content = document.createElement("div");
	content.className = "dm-message-content";

	if (sanitizedContent) {
		const bubble = document.createElement("div");
		bubble.className = "dm-message-bubble";
		bubble.innerHTML = linkifyDMText(message.content || "");
		content.appendChild(bubble);

		const matches =
			message.content.match(
				/^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}(?:\uFE0F)?))*){1,3}$/gu,
			) || [];

		if (matches.length > 0) {
			bubble.style.backgroundColor = "transparent";
			bubble.style.padding = "0";
			bubble.style.fontSize = "40px";
		}
	}

	if (message.attachments?.length > 0) {
		const attachments = document.createElement("div");
		attachments.className = "dm-message-attachments";
		for (const att of message.attachments) {
			const img = document.createElement("img");
			img.src = att.file_url;
			img.alt = att.file_name;
			img.dataset.url = att.file_url;
			img.dataset.name = att.file_name;
			img.className = "dm-attachment-img";
			img.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				openImageFullscreen(att.file_url, att.file_name);
			});
			attachments.appendChild(img);
		}
		content.appendChild(attachments);
	}

	const reactions = createReactionsElement(message);
	content.appendChild(reactions);

	wrapper.appendChild(content);

	const footer = document.createElement("div");
	footer.className = "dm-message-footer";

	const timeSpan = document.createElement("span");
	timeSpan.className = "dm-message-time";
	timeSpan.textContent = time;
	if (message.edited_at) {
		timeSpan.textContent += " (edited)";
	}
	footer.appendChild(timeSpan);

	const actions = document.createElement("div");
	actions.className = "dm-message-actions";

	const replyBtn = document.createElement("button");
	replyBtn.className = "dm-message-action-btn";
	replyBtn.title = "Reply";
	replyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a5 5 0 0 1 5 5v6"/><path d="m3 10 5 5"/><path d="m3 10 5-5"/></svg>`;
	replyBtn.addEventListener("click", () => {
		replyToMessage(
			message.id,
			sanitizedName,
			sanitizedContent.substring(0, 50),
		);
	});
	actions.appendChild(replyBtn);

	if (isOwn) {
		const editBtn = document.createElement("button");
		editBtn.className = "dm-message-action-btn";
		editBtn.title = "Edit";
		editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
		editBtn.addEventListener("click", () => editMessage(message.id));
		actions.appendChild(editBtn);

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "dm-message-action-btn dm-delete-btn";
		deleteBtn.title = "Delete";
		deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
		deleteBtn.addEventListener("click", () => deleteMessage(message.id));
		actions.appendChild(deleteBtn);
	}

	footer.appendChild(actions);
	wrapper.appendChild(footer);
	el.appendChild(wrapper);

	return el;
}

function createReactionsElement(message) {
	const container = document.createElement("div");
	container.className = "dm-reactions";

	if (message.reactions?.length > 0) {
		for (const reaction of message.reactions) {
			const hasReacted = message.user_reacted?.includes(reaction.emoji);
			const btn = document.createElement("button");
			btn.className = `dm-reaction${hasReacted ? " reacted" : ""}`;
			btn.title = (reaction.names || []).join(", ");

			const emojiSpan = document.createElement("span");
			emojiSpan.className = "dm-reaction-emoji";
			const m = reaction.emoji.match(/^:([a-zA-Z0-9_+-]+):$/);
			if (m && dmEmojiMap[m[1]]) {
				const img = document.createElement("img");
				img.src = dmEmojiMap[m[1]];
				img.alt = reaction.emoji;
				img.className = "inline-emoji";
				img.width = 16;
				img.height = 16;
				emojiSpan.appendChild(img);
			} else {
				emojiSpan.textContent = reaction.emoji;
			}
			btn.appendChild(emojiSpan);

			const countSpan = document.createElement("span");
			countSpan.className = "dm-reaction-count";
			countSpan.textContent = reaction.count;
			btn.appendChild(countSpan);

			btn.addEventListener("click", () =>
				toggleReaction(message.id, reaction.emoji),
			);
			container.appendChild(btn);
		}
	}

	const addBtn = document.createElement("button");
	addBtn.className = "dm-add-reaction";
	addBtn.title = "Add reaction";
	addBtn.textContent = "+";
	addBtn.addEventListener("click", () => showReactionPicker(message.id));
	container.appendChild(addBtn);

	return container;
}

function updateMessageElement(el, message, currentUser) {
	const isOwn = message.username === currentUser;
	el.className = `dm-message${isOwn ? " own" : ""}`;

	const bubble = el.querySelector(".dm-message-bubble");
	if (bubble && message.content) {
		bubble.innerHTML = linkifyDMText(message.content);
	}

	const timeSpan = el.querySelector(".dm-message-time");
	if (timeSpan) {
		const time = formatTime(new Date(message.created_at));
		timeSpan.textContent = message.edited_at ? `${time} (edited)` : time;
	}

	const oldReactions = el.querySelector(".dm-reactions");
	if (oldReactions) {
		const newReactions = createReactionsElement(message);
		oldReactions.replaceWith(newReactions);
	}
}

async function sendMessage() {
	if (!currentConversation) return;

	const input = document.getElementById("dmMessageInput");
	const content = input.value.trim();

	if (!content && pendingFiles.length === 0) return;

	await stopTypingIndicator();

	try {
		const requestBody = {
			content: content || "",
		};

		if (pendingFiles.length > 0) {
			requestBody.files = pendingFiles;
		}

		if (replyingTo) {
			requestBody.replyTo = replyingTo.id;
		}

		const data = await query(
			`/dm/conversations/${currentConversation.id}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			},
		);

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		input.value = "";
		pendingFiles = [];
		replyingTo = null;
		renderAttachmentPreviews();
		renderReplyPreview();
		updateSendButton();

		currentMessages.push(data.message);
		messageOffset += 1;
		renderMessages();
		scrollToBottom();
		loadConversations();
	} catch (error) {
		console.error("Failed to send message:", error);
		toastQueue.add("Failed to send message");
	}
}

let typingTimeout = null;
let lastTypingSent = 0;
const TYPING_THROTTLE = 3000;

async function broadcastTypingIndicator() {
	if (!currentConversation) return;

	const now = Date.now();
	if (now - lastTypingSent < TYPING_THROTTLE) {
		return;
	}

	lastTypingSent = now;

	try {
		await query(`/dm/conversations/${currentConversation.id}/typing`, {
			method: "POST",
		});
	} catch (error) {
		console.error("Failed to send typing indicator:", error);
	}
}

async function stopTypingIndicator() {
	if (!currentConversation) return;

	if (typingTimeout) {
		clearTimeout(typingTimeout);
		typingTimeout = null;
	}

	lastTypingSent = 0;

	try {
		await query(`/dm/conversations/${currentConversation.id}/typing-stop`, {
			method: "POST",
		});
	} catch (error) {
		console.error("Failed to send typing stop:", error);
	}
}

function handleTypingInput() {
	if (!currentConversation) return;

	if (typingTimeout) {
		clearTimeout(typingTimeout);
	}

	broadcastTypingIndicator();

	typingTimeout = setTimeout(() => {
		stopTypingIndicator();
		typingTimeout = null;
	}, 3000);
}

async function markConversationAsRead(conversationId) {
	try {
		await query(`/dm/conversations/${conversationId}/read`, {
			method: "PATCH",
			headers: { Authorization: `Bearer ${authToken}` },
		});
		loadConversations();
	} catch (error) {
		console.error("Failed to mark conversation as read:", error);
	}
}

function scrollToBottom() {
	const messagesElement = document.getElementById("dmMessages");
	if (messagesElement) {
		messagesElement.scrollTop = messagesElement.scrollHeight;
	}
}

function setupInfiniteScroll() {
	const messagesElement = document.getElementById("dmMessages");
	if (!messagesElement) return;

	messagesElement.removeEventListener("scroll", handleScroll);
	messagesElement.addEventListener("scroll", handleScroll);
}

async function handleScroll(event) {
	const messagesElement = event.target;
	const scrollTop = messagesElement.scrollTop;
	const threshold = 200;

	if (handleScroll.debounceTimer) {
		clearTimeout(handleScroll.debounceTimer);
	}

	handleScroll.debounceTimer = setTimeout(() => {
		if (
			scrollTop < threshold &&
			!isLoadingMoreMessages &&
			hasMoreMessages &&
			currentMessages.length > 0
		) {
			loadMoreMessages();
		}
	}, 100);
}
handleScroll.debounceTimer = null;

async function loadMoreMessages() {
	if (!currentConversation || isLoadingMoreMessages || !hasMoreMessages) return;

	isLoadingMoreMessages = true;

	try {
		const messagesElement = document.getElementById("dmMessages");
		if (!messagesElement) {
			isLoadingMoreMessages = false;
			return;
		}

		const scrollHeightBefore = messagesElement.scrollHeight;
		const scrollTopBefore = messagesElement.scrollTop;

		const data = await query(
			`/dm/conversations/${currentConversation.id}?limit=50&offset=${messageOffset}`,
		);

		if (data.error) {
			toastQueue.add(data.error);
			isLoadingMoreMessages = false;
			return;
		}

		const newMessages = data.messages || [];

		if (newMessages.length === 0 || newMessages.length < 50) {
			hasMoreMessages = false;
		}

		if (newMessages.length === 0) {
			isLoadingMoreMessages = false;
			return;
		}

		currentMessages = [...newMessages.reverse(), ...currentMessages];
		messageOffset += newMessages.length;
		renderMessages();

		requestAnimationFrame(() => {
			const scrollHeightAfter = messagesElement.scrollHeight;
			const heightDifference = scrollHeightAfter - scrollHeightBefore;
			messagesElement.scrollTop = scrollTopBefore + heightDifference;
		});

		isLoadingMoreMessages = false;
	} catch (error) {
		console.error("Failed to load more messages:", error);
		isLoadingMoreMessages = false;
	}
}

function getCurrentUsername() {
	try {
		const payload = JSON.parse(atob(authToken.split(".")[1]));
		return payload.username;
	} catch {
		return "";
	}
}

function formatTime(date) {
	const now = new Date();
	const diff = now - date;
	const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (daysDiff === 0) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} else if (daysDiff === 1) {
		return "Yesterday";
	} else if (daysDiff < 7) {
		return date.toLocaleDateString([], { weekday: "short" });
	} else {
		const year = date.getFullYear();
		if (year < 1926) {
			return date.toLocaleDateString([], {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		}
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}
}

async function openDMList() {
	if (!authToken) {
		toastQueue.add("Please log in to access messages");
		switchPage("timeline", { path: "/" });
		return;
	}

	switchPage("direct-messages", { path: "/dm" });
	await loadConversations();
}

function openNewMessageModal() {
	selectedUsers = [];

	const content = document.createElement("div");
	content.className = "dm-modal-content";
	content.innerHTML = `
		<div class="form-group">
			<label for="modalNewMessageTo">To:</label>
			<input
				type="text"
				id="modalNewMessageTo"
				placeholder="Enter username..."
				autocomplete="off"
				style="width: 100%; padding: 12px 16px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary); font-size: 14px; outline: none; transition: border-color 0.2s;"
			/>
			<div class="search-suggestions" id="modalUserSuggestions" style="position: absolute; top: 100%; left: 0; right: 0; background-color: var(--bg-primary); border: 1px solid var(--border-primary); border-top: none; border-radius: 0 0 8px 8px; max-height: 200px; overflow-y: auto; z-index: 10; display: none;"></div>
		</div>
		<div class="selected-users" id="modalSelectedUsers" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;"></div>
		<div class="group-chat-options">
			<label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
				<input type="checkbox" id="modalGroupChatToggle" />
				<span>Create group chat</span>
			</label>
			<input
				type="text"
				id="modalGroupTitleInput"
				placeholder="Group name (optional)"
				style="display: none; width: 100%; padding: 12px 16px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary); font-size: 14px; outline: none; margin-top: 12px;"
			/>
		</div>
		<div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
			<button type="button" class="btn-secondary" id="modalCancelNewMessage" style="flex: 1; padding: 12px 24px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: transparent; color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer;">
				Cancel
			</button>
			<button
				type="button"
				class="btn-primary"
				id="modalStartConversation"
				disabled
				style="flex: 1; padding: 12px 24px; border: none; border-radius: 8px; background-color: var(--primary); color: var(--primary-fg); font-size: 14px; font-weight: 600; cursor: pointer;"
			>
				Start
			</button>
		</div>
	`;

	const modal = createModal({
		title: "New Message",
		content,
		className: "dm-new-message-modal",
		closeOnOverlayClick: true,
	});

	const modalInput = document.getElementById("modalNewMessageTo");
	const modalSuggestionsEl = document.getElementById("modalUserSuggestions");
	const modalSelectedUsersEl = document.getElementById("modalSelectedUsers");
	const modalStartBtn = document.getElementById("modalStartConversation");
	const modalCancelBtn = document.getElementById("modalCancelNewMessage");
	const modalGroupToggle = document.getElementById("modalGroupChatToggle");
	const modalGroupTitleInput = document.getElementById("modalGroupTitleInput");

	modalCancelBtn.addEventListener("click", () => modal.close());

	modalStartBtn.addEventListener("click", async () => {
		if (selectedUsers.length === 0) return;

		const isGroup = modalGroupToggle?.checked || selectedUsers.length > 1;
		const title = modalGroupTitleInput?.value?.trim() || null;

		try {
			const data = await query("/dm/conversations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					participantUsernames: selectedUsers.map((u) => u.username),
					title,
					isGroup,
				}),
			});

			if (data.error) {
				toastQueue.add(data.error);
				return;
			}

			modal.close();
			await loadConversations();
			openConversation(data.conversation.id);
		} catch (error) {
			console.error("Failed to start conversation:", error);
			toastQueue.add("Failed to start conversation");
		}
	});

	modalGroupToggle?.addEventListener("change", () => {
		if (modalGroupTitleInput) {
			modalGroupTitleInput.style.display = modalGroupToggle.checked
				? "block"
				: "none";
		}
	});

	const renderModalSelectedUsers = () => {
		modalSelectedUsersEl.innerHTML = selectedUsers
			.map(
				(user) => `
			<div class="selected-user" style="display: flex; align-items: center; gap: 8px; background-color: var(--bg-secondary); padding: 6px 12px; border-radius: 16px; font-size: 14px; color: var(--text-primary);">
				${user.name || user.username}
				<button class="remove-user" data-username="${user.username}" style="background-color: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 16px; line-height: 1;">&times;</button>
			</div>
		`,
			)
			.join("");

		modalSelectedUsersEl.querySelectorAll(".remove-user").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const username = e.target.dataset.username;
				selectedUsers = selectedUsers.filter((u) => u.username !== username);
				renderModalSelectedUsers();
				modalStartBtn.disabled = selectedUsers.length === 0;

				if (
					selectedUsers.length > 1 &&
					modalGroupToggle &&
					!modalGroupToggle.checked
				) {
					modalGroupToggle.checked = true;
					if (modalGroupTitleInput)
						modalGroupTitleInput.style.display = "block";
				}
			});
		});
	};

	const renderModalSuggestions = (users) => {
		if (users.length === 0) {
			modalSuggestionsEl.style.display = "none";
			return;
		}

		modalSuggestionsEl.innerHTML = users
			.map((user) => {
				const radius =
					user.avatar_radius !== null && user.avatar_radius !== undefined
						? `${user.avatar_radius}px`
						: user.gold || user.gray
							? `4px`
							: `50px`;
				return `
					<div class="suggestion-item" data-username="${user.username}" data-name="${user.name || ""}" data-avatar="${user.avatar || ""}" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background-color 0.2s;">
						<img src="${user.avatar || "/public/shared/assets/default-avatar.svg"}" alt="${user.name || user.username}" style="width: 32px; height: 32px; border-radius: ${radius}; object-fit: cover; background-color: var(--bg-tertiary);" />
						<div class="user-info" style="flex: 1;">
							<p class="username" style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0;">${user.name || user.username}</p>
							<p class="name" style="font-size: 12px; color: var(--text-secondary); margin: 0;">@${user.username}</p>
						</div>
					</div>
				`;
			})
			.join("");

		modalSuggestionsEl.style.display = "block";

		modalSuggestionsEl.querySelectorAll(".suggestion-item").forEach((item) => {
			item.addEventListener("click", () => {
				const username = item.dataset.username;
				const name = item.dataset.name;
				const avatar = item.dataset.avatar;

				if (selectedUsers.find((u) => u.username === username)) return;

				selectedUsers.push({ username, name, avatar });
				renderModalSelectedUsers();
				modalInput.value = "";
				modalSuggestionsEl.style.display = "none";
				modalStartBtn.disabled = selectedUsers.length === 0;

				if (
					selectedUsers.length > 1 &&
					modalGroupToggle &&
					!modalGroupToggle.checked
				) {
					modalGroupToggle.checked = true;
					if (modalGroupTitleInput)
						modalGroupTitleInput.style.display = "block";
				}
			});
		});
	};

	let searchTimeout;
	modalInput.addEventListener("input", async () => {
		clearTimeout(searchTimeout);
		const searchQuery = modalInput.value.trim();

		if (!searchQuery) {
			modalSuggestionsEl.style.display = "none";
			return;
		}

		searchTimeout = setTimeout(async () => {
			const users = await searchUsers(searchQuery);
			renderModalSuggestions(users);
		}, 300);
	});

	renderModalSelectedUsers();
}

function goBackToDMList() {
	currentConversation = null;
	currentMessages = [];
	messageOffset = 0;
	isLoadingMoreMessages = false;
	hasMoreMessages = true;

	typingIndicators.clear();
	for (const timeout of typingTimeouts.values()) {
		clearTimeout(timeout);
	}
	typingTimeouts.clear();

	switchPage("direct-messages", { path: "/dm" });

	loadConversations();
}

function openGroupSettings() {
	if (!currentConversation || currentConversation.type !== "group") {
		toastQueue.add("This feature is only available for group chats");
		return;
	}

	const content = document.createElement("div");
	content.className = "dm-modal-content";
	content.innerHTML = `
		<div class="form-group">
			<label for="modalGroupNameInput">Group Name:</label>
			<input
				type="text"
				id="modalGroupNameInput"
				placeholder="Enter group name..."
				value="${currentConversation.title || ""}"
				style="width: 100%; padding: 12px 16px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary); font-size: 14px; outline: none;"
			/>
		</div>

		<div class="form-group">
			<label>Disappearing Messages:</label>
			<div class="disappearing-settings">
				<label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
					<input type="checkbox" id="modalDisappearingEnabled" ${currentConversation.disappearing_enabled ? "checked" : ""} />
					Enable disappearing messages
				</label>
				<div
					class="disappearing-duration"
					id="modalDisappearingDuration"
					style="display: ${currentConversation.disappearing_enabled ? "block" : "none"}; margin-top: 12px;"
				>
					<label for="modalDisappearingDurationSelect">
						Messages disappear after:
					</label>
					<select id="modalDisappearingDurationSelect" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary);">
						<option value="60" ${currentConversation.disappearing_duration === 60 ? "selected" : ""}>1 minute</option>
						<option value="300" ${currentConversation.disappearing_duration === 300 ? "selected" : ""}>5 minutes</option>
						<option value="900" ${currentConversation.disappearing_duration === 900 ? "selected" : ""}>15 minutes</option>
						<option value="3600" ${currentConversation.disappearing_duration === 3600 ? "selected" : ""}>1 hour</option>
						<option value="86400" ${currentConversation.disappearing_duration === 86400 ? "selected" : ""}>24 hours</option>
						<option value="604800" ${currentConversation.disappearing_duration === 604800 ? "selected" : ""}>7 days</option>
					</select>
				</div>
			</div>
		</div>

		<div class="form-group">
			<label>Participants:</label>
			<div class="participants-list" id="modalParticipantsList" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 12px;"></div>
			<button class="btn-secondary" id="modalAddParticipantBtn" type="button" style="width: 100%; padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary); cursor: pointer;">
				Add Participant
			</button>
		</div>
		
		<div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
			<button
				type="button"
				class="btn-secondary"
				id="modalCancelGroupSettings"
				style="flex: 1; padding: 12px 24px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: transparent; color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer;"
			>
				Cancel
			</button>
			<button type="button" class="btn-primary" id="modalSaveGroupSettings" style="flex: 1; padding: 12px 24px; border: none; border-radius: 8px; background-color: var(--primary); color: var(--primary-fg); font-size: 14px; font-weight: 600; cursor: pointer;">
				Save
			</button>
		</div>
	`;

	const modal = createModal({
		title: "Settings",
		content,
		className: "dm-group-settings-modal",
		closeOnOverlayClick: true,
	});

	const modalGroupNameInput = document.getElementById("modalGroupNameInput");
	const modalDisappearingEnabled = document.getElementById(
		"modalDisappearingEnabled",
	);
	const modalDisappearingDuration = document.getElementById(
		"modalDisappearingDuration",
	);
	const modalDisappearingDurationSelect = document.getElementById(
		"modalDisappearingDurationSelect",
	);
	const modalParticipantsList = document.getElementById(
		"modalParticipantsList",
	);
	const modalAddParticipantBtn = document.getElementById(
		"modalAddParticipantBtn",
	);
	const modalCancelBtn = document.getElementById("modalCancelGroupSettings");
	const modalSaveBtn = document.getElementById("modalSaveGroupSettings");

	const renderModalParticipantsList = () => {
		const currentUsername = getCurrentUsername();
		const allParticipants = currentConversation.participants;

		modalParticipantsList.innerHTML = allParticipants
			.map((participant) => {
				const isCurrentUser = participant.username === currentUsername;
				return `
					<div class="participant-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-primary);">
						<img src="${participant.avatar || "/public/shared/assets/default-avatar.svg"}" alt="${participant.name || participant.username}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 12px;" />
						<div class="participant-info" style="flex: 1;">
							<span class="participant-name" style="display: block; font-weight: 600; color: var(--text-primary);">${participant.name || participant.username}</span>
							<span class="participant-username" style="display: block; font-size: 12px; color: var(--text-secondary);">@${participant.username}</span>
						</div>
						${
							!isCurrentUser
								? `<button class="remove-participant-btn" data-user-id="${participant.id}" data-username="${participant.username}" style="padding: 6px 12px; border: 1px solid var(--border-danger); border-radius: 4px; background-color: transparent; color: var(--text-danger); cursor: pointer;">Remove</button>`
								: '<span class="current-user-badge" style="padding: 4px 8px; background-color: var(--bg-tertiary); color: var(--text-secondary); border-radius: 4px; font-size: 12px;">You</span>'
						}
					</div>
				`;
			})
			.join("");

		modalParticipantsList
			.querySelectorAll(".remove-participant-btn")
			.forEach((btn) => {
				btn.addEventListener("click", async () => {
					const userId = btn.dataset.userId;
					const username = btn.dataset.username;
					if (!confirm(`Remove ${username} from this group?`)) return;

					try {
						const data = await query(
							`/dm/conversations/${currentConversation.id}/participants/${userId}`,
							{ method: "DELETE" },
						);

						if (data.error) {
							toastQueue.add(data.error);
							return;
						}

						currentConversation.participants =
							currentConversation.participants.filter((p) => p.id !== userId);
						renderModalParticipantsList();
						renderConversationHeader();
						loadConversations();
					} catch (error) {
						console.error("Failed to remove participant:", error);
						toastQueue.add("Failed to remove participant");
					}
				});
			});
	};

	modalDisappearingEnabled?.addEventListener("change", () => {
		if (modalDisappearingDuration) {
			modalDisappearingDuration.style.display = modalDisappearingEnabled.checked
				? "block"
				: "none";
		}
	});

	modalAddParticipantBtn?.addEventListener("click", () => {
		modal.close();
		openAddParticipantModal();
	});

	modalCancelBtn.addEventListener("click", () => modal.close());

	modalSaveBtn.addEventListener("click", async () => {
		const newTitle = modalGroupNameInput?.value?.trim() || null;

		if (newTitle !== (currentConversation.title || "")) {
			try {
				const data = await query(
					`/dm/conversations/${currentConversation.id}/title`,
					{
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ title: newTitle }),
					},
				);

				if (data.error) {
					toastQueue.add(data.error);
					return;
				}

				currentConversation.title = newTitle;
				renderConversationHeader();
			} catch (error) {
				console.error("Failed to update group settings:", error);
				return;
			}
		}

		if (modalDisappearingEnabled && modalDisappearingDurationSelect) {
			const enabled = modalDisappearingEnabled.checked;
			const duration = enabled
				? parseInt(modalDisappearingDurationSelect.value)
				: null;

			if (
				enabled !== currentConversation.disappearing_enabled ||
				duration !== currentConversation.disappearing_duration
			) {
				try {
					const data = await query(
						`/dm/conversations/${currentConversation.id}/disappearing`,
						{
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ enabled, duration }),
						},
					);

					if (data.error) {
						toastQueue.add(data.error);
						return;
					}

					currentConversation.disappearing_enabled = enabled;
					currentConversation.disappearing_duration = duration;

					const statusText = enabled
						? `Disappearing messages enabled (${formatDisappearingDuration(duration)})`
						: "Disappearing messages disabled";
					toastQueue.add(statusText);
				} catch (error) {
					console.error("Failed to update disappearing messages:", error);
					toastQueue.add("Failed to update disappearing messages");
					return;
				}
			}
		}

		modal.close();
		loadConversations();
	});

	renderModalParticipantsList();
}

function closeGroupSettings() {}

function openDirectSettings() {
	if (!currentConversation || currentConversation.type !== "direct") {
		toastQueue.add("This feature is only available for direct conversations");
		return;
	}

	const content = document.createElement("div");
	content.className = "dm-modal-content";
	content.innerHTML = `
		<div class="form-group">
			<label>Disappearing Messages:</label>
			<div class="disappearing-settings">
				<label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
					<input type="checkbox" id="modalDirectDisappearingEnabled" ${currentConversation.disappearing_enabled ? "checked" : ""} />
					Enable disappearing messages
				</label>
				<div
					class="disappearing-duration"
					id="modalDirectDisappearingDuration"
					style="display: ${currentConversation.disappearing_enabled ? "block" : "none"}; margin-top: 12px;"
				>
					<label for="modalDirectDisappearingDurationSelect">
						Messages disappear after:
					</label>
					<select id="modalDirectDisappearingDurationSelect" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: var(--bg-secondary); color: var(--text-primary);">
						<option value="60" ${currentConversation.disappearing_duration === 60 ? "selected" : ""}>1 minute</option>
						<option value="300" ${currentConversation.disappearing_duration === 300 ? "selected" : ""}>5 minutes</option>
						<option value="900" ${currentConversation.disappearing_duration === 900 ? "selected" : ""}>15 minutes</option>
						<option value="3600" ${currentConversation.disappearing_duration === 3600 ? "selected" : ""}>1 hour</option>
						<option value="86400" ${currentConversation.disappearing_duration === 86400 ? "selected" : ""}>24 hours</option>
						<option value="604800" ${currentConversation.disappearing_duration === 604800 ? "selected" : ""}>7 days</option>
					</select>
				</div>
			</div>
		</div>
		<div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
			<button
				type="button"
				class="btn-secondary"
				id="modalCancelDirectSettings"
				style="flex: 1; padding: 12px 24px; border: 1px solid var(--border-primary); border-radius: 8px; background-color: transparent; color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer;"
			>
				Cancel
			</button>
			<button type="button" class="btn-primary" id="modalSaveDirectSettings" style="flex: 1; padding: 12px 24px; border: none; border-radius: 8px; background-color: var(--primary); color: var(--primary-fg); font-size: 14px; font-weight: 600; cursor: pointer;">
				Save
			</button>
		</div>
	`;

	const modal = createModal({
		title: "Settings",
		content,
		className: "dm-direct-config-modal",
		closeOnOverlayClick: true,
	});

	const modalDirectDisappearingEnabled = document.getElementById(
		"modalDirectDisappearingEnabled",
	);
	const modalDirectDisappearingDuration = document.getElementById(
		"modalDirectDisappearingDuration",
	);
	const modalDirectDisappearingDurationSelect = document.getElementById(
		"modalDirectDisappearingDurationSelect",
	);
	const modalCancelBtn = document.getElementById("modalCancelDirectSettings");
	const modalSaveBtn = document.getElementById("modalSaveDirectSettings");

	modalDirectDisappearingEnabled?.addEventListener("change", () => {
		if (modalDirectDisappearingDuration) {
			modalDirectDisappearingDuration.style.display =
				modalDirectDisappearingEnabled.checked ? "block" : "none";
		}
	});

	modalCancelBtn.addEventListener("click", () => modal.close());

	modalSaveBtn.addEventListener("click", async () => {
		if (
			modalDirectDisappearingEnabled &&
			modalDirectDisappearingDurationSelect
		) {
			const enabled = modalDirectDisappearingEnabled.checked;
			const duration = enabled
				? parseInt(modalDirectDisappearingDurationSelect.value)
				: null;

			if (
				enabled !== currentConversation.disappearing_enabled ||
				duration !== currentConversation.disappearing_duration
			) {
				try {
					const data = await query(
						`/dm/conversations/${currentConversation.id}/disappearing`,
						{
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ enabled, duration }),
						},
					);

					if (data.error) {
						toastQueue.add(data.error);
						return;
					}

					currentConversation.disappearing_enabled = enabled;
					currentConversation.disappearing_duration = duration;

					const statusText = enabled
						? `Disappearing messages enabled (${formatDisappearingDuration(duration)})`
						: "Disappearing messages disabled";
					toastQueue.add(statusText);
				} catch (error) {
					console.error("Failed to update disappearing messages:", error);
					toastQueue.add("Failed to update disappearing messages");
					return;
				}
			}
		}

		modal.close();
		loadConversations();
	});
}

function closeDirectSettings() {}

async function removeParticipantFromGroup(userId, username) {
	if (!currentConversation) return;

	if (!confirm(`Remove ${username} from this group?`)) return;

	try {
		const data = await query(
			`/dm/conversations/${currentConversation.id}/participants/${userId}`,
			{
				method: "DELETE",
			},
		);

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		currentConversation.participants = currentConversation.participants.filter(
			(p) => p.id !== userId,
		);
		renderParticipantsList();
		renderConversationHeader();
		loadConversations();
	} catch (error) {
		console.error("Failed to remove participant:", error);
		toastQueue.add("Failed to remove participant");
	}
}

let selectedParticipants = [];

function openAddParticipantModal() {
	if (!currentConversation || currentConversation.type !== "group") {
		toastQueue.add("This feature is only available for group chats");
		return;
	}

	const modal = document.getElementById("addParticipantModal");
	if (modal) {
		selectedParticipants = [];
		renderSelectedParticipants();
		document.getElementById("addParticipantTo").value = "";
		document.getElementById("confirmAddParticipant").disabled = true;
		modal.style.display = "flex";
	}
}

function closeAddParticipantModal() {
	const modal = document.getElementById("addParticipantModal");
	if (modal) {
		modal.style.display = "none";
		selectedParticipants = [];
	}
}

function renderAddParticipantSuggestions(users) {
	const suggestionsElement = document.getElementById(
		"addParticipantSuggestions",
	);
	if (!suggestionsElement) return;

	if (users.length === 0) {
		suggestionsElement.classList.remove("show");
		return;
	}

	const existingUserIds = currentConversation.participants.map((p) => p.id);
	const availableUsers = users.filter(
		(user) => !existingUserIds.includes(user.id),
	);

	if (availableUsers.length === 0) {
		suggestionsElement.innerHTML =
			'<div class="no-suggestions">All users are already in this group</div>';
		suggestionsElement.classList.add("show");
		return;
	}

	suggestionsElement.innerHTML = availableUsers
		.map((user) => {
			const radius =
				user.avatar_radius !== null && user.avatar_radius !== undefined
					? `${user.avatar_radius}px`
					: user.gold || user.gray
						? `4px`
						: `50px`;
			const escapedUsername = (user.username || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const escapedName = (user.name || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const escapedAvatar = (user.avatar || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const escapedId = (user.id || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const displayName = sanitizeHTML(user.name || user.username);
			const displayUsername = sanitizeHTML(user.username);
			return `
      <div class="suggestion-item" onclick="addParticipantUser('${escapedUsername}', '${escapedName}', '${escapedAvatar}', '${escapedId}')">
        <img src="${
					user.avatar || "/public/shared/assets/default-avatar.svg"
				}" alt="${displayName}" style="border-radius: ${radius};" />
        <div class="user-info">
          <p class="username">${displayName}</p>
          <p class="name">@${displayUsername}</p>
        </div>
      </div>
    `;
		})
		.join("");

	suggestionsElement.classList.add("show");
}

function addParticipantUser(username, name, avatar, id) {
	if (selectedParticipants.find((u) => u.username === username)) return;

	selectedParticipants.push({ username, name, avatar, id });
	renderSelectedParticipants();
	document.getElementById("addParticipantTo").value = "";
	document.getElementById("addParticipantSuggestions").classList.remove("show");
	document.getElementById("confirmAddParticipant").disabled =
		selectedParticipants.length === 0;
}

function removeParticipantUser(username) {
	selectedParticipants = selectedParticipants.filter(
		(u) => u.username !== username,
	);
	renderSelectedParticipants();
	document.getElementById("confirmAddParticipant").disabled =
		selectedParticipants.length === 0;
}

function renderSelectedParticipants() {
	const element = document.getElementById("addParticipantSelectedUsers");
	if (!element) return;

	element.innerHTML = selectedParticipants
		.map(
			(user) => `
      <div class="selected-user">
        ${user.name || user.username}
        <button class="remove-user" onclick="removeParticipantUser('${
					user.username
				}')">&times;</button>
      </div>
    `,
		)
		.join("");
}

async function confirmAddParticipant() {
	if (selectedParticipants.length === 0 || !currentConversation) return;

	try {
		const data = await query(
			`/dm/conversations/${currentConversation.id}/participants`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					usernames: selectedParticipants.map((u) => u.username),
				}),
			},
		);

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		if (data.participants) {
			currentConversation.participants.push(...data.participants);
		}

		closeAddParticipantModal();
		renderParticipantsList();
		renderConversationHeader();
		toastQueue.add(
			"success",
			`Added ${selectedParticipants.length} participant(s) to the group`,
		);
		loadConversations();
	} catch (error) {
		console.error("Failed to add participants:", error);
		toastQueue.add("Failed to add participants");
	}
}
function closeNewMessageModal() {
	const modal = document.getElementById("newMessageModal");
	if (modal) {
		modal.style.display = "none";
		selectedUsers = [];
		renderSelectedUsers();
	}
}

async function searchUsers(searchQuery) {
	if (!searchQuery.trim()) return [];

	try {
		const data = await query(
			`/search/users?q=${encodeURIComponent(searchQuery)}&limit=5`,
		);
		return data.users || [];
	} catch (error) {
		console.error("Failed to search users:", error);
		return [];
	}
}

function renderUserSuggestions(users) {
	const suggestionsElement = document.getElementById("userSuggestions");
	if (!suggestionsElement) return;

	if (users.length === 0) {
		suggestionsElement.classList.remove("show");
		return;
	}

	suggestionsElement.innerHTML = users
		.map((user) => {
			const radius =
				user.avatar_radius !== null && user.avatar_radius !== undefined
					? `${user.avatar_radius}px`
					: user.gold || user.gray
						? `4px`
						: `50px`;
			const escapedUsername = (user.username || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const escapedName = (user.name || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const escapedAvatar = (user.avatar || "")
				.replaceAll("'", "&#39;")
				.replaceAll('"', "&quot;");
			const displayName = sanitizeHTML(user.name || user.username);
			const displayUsername = sanitizeHTML(user.username);
			return `
      <div class="suggestion-item" onclick="addUser('${escapedUsername}', '${escapedName}', '${escapedAvatar}')">
        <img src="${
					user.avatar || "/public/shared/assets/default-avatar.svg"
				}" alt="${displayName}" style="border-radius: ${radius};" />
        <div class="user-info">
          <p class="username">${displayName}</p>
          <p class="name">@${displayUsername}</p>
        </div>
      </div>
    `;
		})
		.join("");

	suggestionsElement.classList.add("show");
}

function addUser(username, name, avatar) {
	if (selectedUsers.find((u) => u.username === username)) return;

	selectedUsers.push({ username, name, avatar });
	renderSelectedUsers();
	document.getElementById("newMessageTo").value = "";
	document.getElementById("userSuggestions").classList.remove("show");
	document.getElementById("startConversation").disabled =
		selectedUsers.length === 0;

	const groupToggle = document.getElementById("groupChatToggle");
	const groupTitleInput = document.getElementById("groupTitleInput");

	if (selectedUsers.length > 1 && groupToggle && !groupToggle.checked) {
		groupToggle.checked = true;
		if (groupTitleInput) {
			groupTitleInput.style.display = "block";
		}
	}
}

function removeUser(username) {
	selectedUsers = selectedUsers.filter((u) => u.username !== username);
	renderSelectedUsers();
	document.getElementById("startConversation").disabled =
		selectedUsers.length === 0;
}

function renderSelectedUsers() {
	const element = document.getElementById("selectedUsers");
	if (!element) return;

	element.innerHTML = selectedUsers
		.map(
			(user) => `
      <div class="selected-user">
        ${user.name || user.username}
        <button class="remove-user" onclick="removeUser('${
					user.username
				}')">&times;</button>
      </div>
    `,
		)
		.join("");
}

async function startConversation() {
	if (selectedUsers.length === 0) return;

	try {
		const groupToggle = document.getElementById("groupChatToggle");
		const isGroup = groupToggle?.checked || selectedUsers.length > 1;
		const titleInput = document.getElementById("groupTitleInput");
		const title = titleInput?.value?.trim() || null;

		const data = await query("/dm/conversations", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				participantUsernames: selectedUsers.map((u) => u.username),
				title: title,
				isGroup: isGroup,
			}),
		});

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		closeNewMessageModal();
		await loadConversations();
		openConversation(data.conversation.id);
	} catch (error) {
		console.error("Failed to start conversation:", error);
		toastQueue.add("Failed to start conversation");
	}
}

const convertToWebP = (file, quality = 0.8) => {
	return new Promise((resolve) => {
		if (!file.type.startsWith("image/")) {
			resolve(file);
			return;
		}

		if (file.type === "image/webp") {
			resolve(file);
			return;
		}

		if (file.type === "image/gif") {
			resolve(file);
			return;
		}

		if (!isConvertibleImage(file)) {
			resolve(file);
			return;
		}

		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d", { alpha: false });
		const img = new Image();

		img.onload = () => {
			canvas.width = img.width;
			canvas.height = img.height;
			ctx.drawImage(img, 0, 0);

			canvas.toBlob(
				(blob) => {
					if (blob) {
						const webpFile = new File(
							[blob],
							file.name.replace(/\.[^/.]+$/, ".webp"),
							{
								type: "image/webp",
								lastModified: Date.now(),
							},
						);
						resolve(webpFile);
					} else {
						resolve(file);
					}

					URL.revokeObjectURL(img.src);
				},
				"image/webp",
				quality,
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(img.src);
			resolve(file);
		};

		img.src = URL.createObjectURL(file);
	});
};

async function handleFileUpload(files) {
	const maxSize = 10 * 1024 * 1024;

	for (const file of files) {
		if (!file || !file.type) {
			toastQueue.add("Invalid file");
			continue;
		}

		if (!isConvertibleImage(file)) {
			toastQueue.add("Only image files are allowed");
			continue;
		}

		if (file.size > maxSize) {
			toastQueue.add("File too large (max 10MB)");
			continue;
		}

		try {
			let processedFile = file;
			if (file.type !== "image/webp" && file.type !== "image/gif") {
				processedFile = await convertToWebP(file);
			}

			const formData = new FormData();
			formData.append("file", processedFile);

			const response = await fetch("/api/upload", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("authToken")}`,
				},
				body: formData,
			});

			const data = await response.json();

			if (!response.ok || data.error) {
				toastQueue.add(data.error || "Upload failed");
				continue;
			}

			if (!data.file || !data.file.url) {
				toastQueue.add("Upload failed - invalid response");
				continue;
			}

			pendingFiles.push({
				hash: data.file.hash,
				name: processedFile.name,
				type: processedFile.type,
				size: processedFile.size,
				url: data.file.url,
			});
		} catch {
			toastQueue.add("Failed to upload file");
		}
	}

	renderAttachmentPreviews();
	updateSendButton();
}

function renderAttachmentPreviews() {
	const element = document.getElementById("dmComposerAttachments");
	if (!element) return;

	element.innerHTML = "";
	pendingFiles.forEach((file, index) => {
		const preview = document.createElement("div");
		preview.className = "dm-attachment-preview";

		const img = document.createElement("img");
		img.src = file.url;
		img.alt = sanitizeHTML(file.name);
		preview.appendChild(img);

		const removeBtn = document.createElement("button");
		removeBtn.className = "remove-attachment";
		removeBtn.textContent = "×";
		removeBtn.addEventListener("click", () => removePendingFile(index));
		preview.appendChild(removeBtn);

		element.appendChild(preview);
	});
}

function removePendingFile(index) {
	pendingFiles.splice(index, 1);
	renderAttachmentPreviews();
	updateSendButton();
}

function updateSendButton() {
	const button = document.getElementById("dmSendBtn");
	const input = document.getElementById("dmMessageInput");

	if (button && input) {
		button.disabled = !input.value.trim() && pendingFiles.length === 0;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	const dmBtn = document.getElementById("dmBtn");
	if (dmBtn) {
		dmBtn.addEventListener("click", openDMList);
	} else {
		console.error("DM button not found in DOM!");
	}

	setTimeout(() => {
		const dmBtnDelayed = document.getElementById("dmBtn");
		if (dmBtnDelayed && !dmBtnDelayed.onclick) {
			dmBtnDelayed.addEventListener("click", openDMList);
		}
	}, 1000);

	const newMessageBtn = document.getElementById("newMessageBtn");
	const newMessageModalClose = document.getElementById("newMessageModalClose");
	const cancelNewMessage = document.getElementById("cancelNewMessage");
	const startConversationBtn = document.getElementById("startConversation");
	const dmSendBtn = document.getElementById("dmSendBtn");
	const dmMessageInput = document.getElementById("dmMessageInput");
	const dmAttachmentBtn = document.getElementById("dmAttachmentBtn");
	const dmFileInput = document.getElementById("dmFileInput");
	const newMessageTo = document.getElementById("newMessageTo");
	const groupChatToggle = document.getElementById("groupChatToggle");
	const groupTitleInput = document.getElementById("groupTitleInput");
	const groupSettingsModalClose = document.getElementById(
		"groupSettingsModalClose",
	);
	const cancelGroupSettings = document.getElementById("cancelGroupSettings");
	const saveGroupSettingsBtn = document.getElementById("saveGroupSettings");
	const addParticipantBtn = document.getElementById("addParticipantBtn");
	const addParticipantModalClose = document.getElementById(
		"addParticipantModalClose",
	);
	const cancelAddParticipant = document.getElementById("cancelAddParticipant");
	const confirmAddParticipantBtn = document.getElementById(
		"confirmAddParticipant",
	);
	const addParticipantTo = document.getElementById("addParticipantTo");

	dmBtn?.addEventListener("click", openDMList);
	newMessageBtn?.addEventListener("click", openNewMessageModal);
	newMessageModalClose?.addEventListener("click", closeNewMessageModal);
	cancelNewMessage?.addEventListener("click", closeNewMessageModal);
	startConversationBtn?.addEventListener("click", startConversation);
	dmSendBtn?.addEventListener("click", sendMessage);

	const dmGifPicker = document.getElementById("dmGifPicker");
	const dmGifSearchInput = document.getElementById("dmGifSearchInput");
	const dmGifResults = document.getElementById("dmGifResults");
	const dmGifPickerClose = document.getElementById("dmGifPickerClose");

	if (dmAttachmentBtn) {
		dmAttachmentBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			e.preventDefault();

			const fileInput = document.getElementById("dmFileInput");
			const gifPicker = document.getElementById("dmGifPicker");
			const gifSearchInput = document.getElementById("dmGifSearchInput");

			const menuItems = [
				{
					title: "Upload from device",
					icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
					onClick: () => {
						if (
							pendingFiles.length > 0 &&
							pendingFiles.some(
								(f) => f.type === "image/gif" && f.hash === null,
							)
						) {
							toastQueue.add("Remove the GIF first to upload files");
							return;
						}
						if (fileInput) {
							fileInput.click();
						}
					},
				},
				{
					title: "Search GIFs",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M144,72V184a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm88-8H176a8,8,0,0,0-8,8V184a8,8,0,0,0,16,0V136h40a8,8,0,0,0,0-16H184V80h48a8,8,0,0,0,0-16ZM96,120H72a8,8,0,0,0,0,16H88v16a24,24,0,0,1-48,0V104A24,24,0,0,1,64,80c11.19,0,21.61,7.74,24.25,18a8,8,0,0,0,15.5-4C99.27,76.62,82.56,64,64,64a40,40,0,0,0-40,40v48a40,40,0,0,0,80,0V128A8,8,0,0,0,96,120Z"></path></svg>`,
					onClick: () => {
						if (
							pendingFiles.length > 0 &&
							pendingFiles.some((f) => f.hash !== null)
						) {
							toastQueue.add("Remove uploaded files first to select a GIF");
							return;
						}
						if (gifPicker) {
							const isVisible = gifPicker.style.display === "block";
							gifPicker.style.display = isVisible ? "none" : "block";
							if (!isVisible && gifSearchInput) {
								gifSearchInput.focus();
							}
						}
					},
				},
				{
					title: "Search Unsplash",
					icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
					onClick: () => {
						if (
							pendingFiles.length > 0 &&
							pendingFiles.some((f) => f.hash === null)
						) {
							toastQueue.add("Remove the GIF first to select a photo");
							return;
						}
						showUnsplashPicker();
					},
				},
			];

			createPopup({
				items: menuItems,
				triggerElement: dmAttachmentBtn,
			});
		});
	}

	let gifSearchTimeout;

	dmGifPickerClose?.addEventListener("click", () => {
		if (dmGifPicker) dmGifPicker.style.display = "none";
	});

	dmGifSearchInput?.addEventListener("input", (e) => {
		clearTimeout(gifSearchTimeout);
		gifSearchTimeout = setTimeout(() => {
			searchDMGifs(e.target.value);
		}, 500);
	});

	async function searchDMGifs(q) {
		if (!q || q.trim().length === 0) {
			if (dmGifResults) dmGifResults.innerHTML = "";
			return;
		}

		if (dmGifResults)
			dmGifResults.innerHTML = `
			<div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
				<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path><path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="currentColor"></path></svg>
			</div>
		`;

		try {
			const { results, error } = await query(
				`/tenor/search?q=${encodeURIComponent(q)}&limit=12`,
			);

			if (error || !results || results.length === 0) {
				if (dmGifResults)
					dmGifResults.innerHTML = `
					<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
						<p>${error ? "Failed to load GIFs" : "No GIFs found"}</p>
					</div>
				`;
				return;
			}

			if (dmGifResults) dmGifResults.innerHTML = "";
			for (const gif of results) {
				const gifUrl =
					gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url;
				const previewUrl =
					gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url;

				const gifEl = document.createElement("div");
				gifEl.className = "dm-gif-item";
				const img = document.createElement("img");
				img.src = previewUrl;
				img.alt = gif.content_description || "GIF";
				img.loading = "lazy";
				gifEl.appendChild(img);

				gifEl.addEventListener("click", () => {
					pendingFiles = [];
					pendingFiles.push({
						hash: null,
						name: "gif",
						type: "image/gif",
						size: 0,
						url: gifUrl,
					});
					renderAttachmentPreviews();
					updateSendButton();
					if (dmGifPicker) dmGifPicker.style.display = "none";
					if (dmGifSearchInput) dmGifSearchInput.value = "";
				});

				if (dmGifResults) dmGifResults.appendChild(gifEl);
			}
		} catch (error) {
			console.error("GIF search error:", error);
			if (dmGifResults)
				dmGifResults.innerHTML = `
				<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
					<p>Failed to load GIFs</p>
				</div>
			`;
		}
	}

	groupSettingsModalClose?.addEventListener("click", closeGroupSettings);
	cancelGroupSettings?.addEventListener("click", closeGroupSettings);
	saveGroupSettingsBtn?.addEventListener("click", saveGroupSettings);
	addParticipantBtn?.addEventListener("click", openAddParticipantModal);

	async function showUnsplashPicker() {
		const existingPicker = document.getElementById("dmUnsplashPicker");
		if (existingPicker) {
			existingPicker.remove();
		}

		const picker = document.createElement("div");
		picker.id = "dmUnsplashPicker";
		picker.className = "dm-gif-picker";
		picker.style.display = "block";

		const header = document.createElement("div");
		header.className = "dm-gif-picker-header";

		const searchInput = document.createElement("input");
		searchInput.type = "text";
		searchInput.placeholder = "Search Unsplash...";

		const closeBtn = document.createElement("button");
		closeBtn.type = "button";
		closeBtn.textContent = "×";
		closeBtn.addEventListener("click", () => picker.remove());

		header.appendChild(searchInput);
		header.appendChild(closeBtn);

		const results = document.createElement("div");
		results.className = "dm-gif-results";

		picker.appendChild(header);
		picker.appendChild(results);

		const composerInput = document.querySelector(".dm-composer-input");
		composerInput?.appendChild(picker);

		searchInput.focus();

		let searchTimeout;
		searchInput.addEventListener("input", (e) => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(
				() => searchUnsplash(e.target.value, results, picker),
				500,
			);
		});
	}

	async function searchUnsplash(q, resultsEl, pickerEl) {
		if (!q || q.trim().length === 0) {
			resultsEl.innerHTML = "";
			return;
		}

		resultsEl.innerHTML = `
			<div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
				<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"></path><path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="currentColor"></path></svg>
			</div>
		`;

		try {
			const { results: images, error } = await query(
				`/unsplash/search?q=${encodeURIComponent(q)}&limit=12`,
			);

			if (error || !images || images.length === 0) {
				resultsEl.innerHTML = `
					<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
						<p>${error ? "Failed to load images" : "No images found"}</p>
					</div>
				`;
				return;
			}

			resultsEl.innerHTML = "";
			for (const img of images) {
				const imgEl = document.createElement("div");
				imgEl.className = "dm-gif-item";
				const preview = document.createElement("img");
				preview.src = img.thumb;
				preview.alt = img.description || "Unsplash image";
				preview.loading = "lazy";
				imgEl.appendChild(preview);

				imgEl.addEventListener("click", async () => {
					pendingFiles = [];
					try {
						const response = await fetch(img.url);
						const blob = await response.blob();
						const file = new File([blob], "unsplash-image.jpg", {
							type: "image/jpeg",
						});
						const webpFile = await convertToWebP(file);

						const formData = new FormData();
						formData.append("file", webpFile);

						const uploadResponse = await fetch("/api/upload", {
							method: "POST",
							headers: {
								Authorization: `Bearer ${localStorage.getItem("authToken")}`,
							},
							body: formData,
						});

						const data = await uploadResponse.json();

						if (!uploadResponse.ok || data.error) {
							toastQueue.add(data.error || "Upload failed");
							return;
						}

						if (!data.file || !data.file.url) {
							toastQueue.add("Upload failed - invalid response");
							return;
						}

						pendingFiles.push({
							hash: data.file.hash,
							name: webpFile.name,
							type: webpFile.type,
							size: webpFile.size,
							url: data.file.url,
						});

						await query(
							`/unsplash/download?download_location=${encodeURIComponent(img.download_location)}`,
						);
					} catch {
						toastQueue.add("Failed to add image");
						return;
					}

					renderAttachmentPreviews();
					updateSendButton();
					pickerEl.remove();
				});

				resultsEl.appendChild(imgEl);
			}
		} catch (error) {
			console.error("Unsplash search error:", error);
			resultsEl.innerHTML = `
				<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
					<p>Failed to load images</p>
				</div>
			`;
		}
	}

	const dmComposerInput = document.querySelector(".dm-composer-input");

	if (dmComposerInput) {
		dmComposerInput.addEventListener("dragover", (e) => {
			e.preventDefault();
			dmComposerInput.classList.add("drag-over");
		});

		dmComposerInput.addEventListener("dragleave", (e) => {
			e.preventDefault();
			if (!dmComposerInput.contains(e.relatedTarget)) {
				dmComposerInput.classList.remove("drag-over");
			}
		});

		dmComposerInput.addEventListener("drop", async (e) => {
			e.preventDefault();
			dmComposerInput.classList.remove("drag-over");

			const files = Array.from(e.dataTransfer.files);
			const validFiles = files.filter((file) => isConvertibleImage(file));

			if (validFiles.length > 0) {
				if (
					pendingFiles.length > 0 &&
					pendingFiles.some((f) => f.type === "image/gif" && f.hash === null)
				) {
					toastQueue.add("Remove the GIF first to upload files");
					return;
				}
				await handleFileUpload(validFiles);
			}
		});
	}

	if (dmMessageInput) {
		dmMessageInput.addEventListener("paste", async (e) => {
			if (e.clipboardData?.items) {
				const items = Array.from(e.clipboardData.items);
				const fileItems = items.filter((item) => item.kind === "file");

				if (fileItems.length > 0) {
					e.preventDefault();

					if (
						pendingFiles.length > 0 &&
						pendingFiles.some((f) => f.type === "image/gif" && f.hash === null)
					) {
						toastQueue.add("Remove the GIF first to upload files");
						return;
					}

					const files = [];
					for (const item of fileItems) {
						const file = item.getAsFile();
						if (file && isConvertibleImage(file)) {
							files.push(file);
						}
					}
					if (files.length > 0) {
						await handleFileUpload(files);
					}
				}
			}
		});
	}

	addParticipantModalClose?.addEventListener("click", closeAddParticipantModal);
	cancelAddParticipant?.addEventListener("click", closeAddParticipantModal);
	confirmAddParticipantBtn?.addEventListener("click", confirmAddParticipant);

	groupChatToggle?.addEventListener("change", (e) => {
		if (groupTitleInput) {
			groupTitleInput.style.display = e.target.checked ? "block" : "none";
		}
	});

	const disappearingEnabled = document.getElementById("disappearingEnabled");
	const disappearingDuration = document.getElementById("disappearingDuration");
	disappearingEnabled?.addEventListener("change", (e) => {
		if (disappearingDuration) {
			disappearingDuration.style.display = e.target.checked ? "block" : "none";
		}
	});

	const directDisappearingEnabled = document.getElementById(
		"directDisappearingEnabled",
	);
	const directDisappearingDuration = document.getElementById(
		"directDisappearingDuration",
	);
	directDisappearingEnabled?.addEventListener("change", (e) => {
		if (directDisappearingDuration) {
			directDisappearingDuration.style.display = e.target.checked
				? "block"
				: "none";
		}
	});

	const directSettingsModalClose = document.getElementById(
		"directSettingsModalClose",
	);
	const cancelDirectSettings = document.getElementById("cancelDirectSettings");
	const saveDirectSettingsBtn = document.getElementById("saveDirectSettings");

	directSettingsModalClose?.addEventListener("click", closeDirectSettings);
	cancelDirectSettings?.addEventListener("click", closeDirectSettings);
	saveDirectSettingsBtn?.addEventListener("click", saveDirectSettings);
	dmFileInput?.addEventListener("change", (e) => {
		if (e.target.files.length > 0) {
			handleFileUpload(Array.from(e.target.files));
			e.target.value = "";
		}
	});

	dmMessageInput?.addEventListener("input", updateSendButton);
	dmMessageInput?.addEventListener("input", handleTypingInput);
	dmMessageInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	});

	let searchTimeout;
	newMessageTo?.addEventListener("input", (e) => {
		clearTimeout(searchTimeout);
		const query = e.target.value.trim();

		if (query.length === 0) {
			document.getElementById("userSuggestions").classList.remove("show");
			return;
		}

		searchTimeout = setTimeout(async () => {
			const users = await searchUsers(query);
			renderUserSuggestions(users);
		}, 300);
	});

	let addParticipantSearchTimeout;
	addParticipantTo?.addEventListener("input", (e) => {
		clearTimeout(addParticipantSearchTimeout);
		const query = e.target.value.trim();

		if (query.length === 0) {
			document
				.getElementById("addParticipantSuggestions")
				.classList.remove("show");
			return;
		}

		addParticipantSearchTimeout = setTimeout(async () => {
			const users = await searchUsers(query);
			renderAddParticipantSuggestions(users);
		}, 300);
	});
	document.addEventListener("click", (e) => {
		const suggestionsElement = document.getElementById("userSuggestions");
		const inputElement = document.getElementById("newMessageTo");
		const addParticipantSuggestionsElement = document.getElementById(
			"addParticipantSuggestions",
		);
		const addParticipantInputElement =
			document.getElementById("addParticipantTo");

		if (
			suggestionsElement &&
			!suggestionsElement.contains(e.target) &&
			e.target !== inputElement
		) {
			suggestionsElement.classList.remove("show");
		}

		if (
			addParticipantSuggestionsElement &&
			!addParticipantSuggestionsElement.contains(e.target) &&
			e.target !== addParticipantInputElement
		) {
			addParticipantSuggestionsElement.classList.remove("show");
		}
	});

	if (authToken) {
		connectSSE();
	}
});

addRoute((pathname) => pathname === "/dm", openDMList);
addRoute(
	(pathname) => pathname.startsWith("/dm/"),
	() => {
		const conversationId = window.location.pathname.split("/dm/")[1];
		if (conversationId) {
			openConversation(conversationId);
		}
	},
);

window.addEventListener("popstate", (event) => {
	const currentPath = window.location.pathname;

	if (currentPath === "/dm") {
		currentConversation = null;
		currentMessages = [];

		if (event.state && event.state.page === "direct-messages") {
			setTimeout(() => loadConversations(), 0);
		}
	} else if (currentPath.startsWith("/dm/")) {
		const conversationId = currentPath.split("/dm/")[1];
		if (
			conversationId &&
			event.state &&
			event.state.page === "dm-conversation"
		) {
			setTimeout(() => openConversation(conversationId), 0);
		}
	}
});

window.openConversation = openConversation;
window.addUser = addUser;
window.removeUser = removeUser;
window.removePendingFile = removePendingFile;
window.goBackToDMList = goBackToDMList;
window.openGroupSettings = openGroupSettings;
window.removeParticipantFromGroup = removeParticipantFromGroup;
window.addParticipantUser = addParticipantUser;
window.removeParticipantUser = removeParticipantUser;
async function openOrCreateConversation(username) {
	if (!authToken) {
		toastQueue.add("Please log in to send messages");
		return;
	}

	await loadConversations();

	const currentUsername = getCurrentUsername();
	const existing = currentConversations.find((conv) => {
		if (conv.type === "group") return false;
		return conv.participants.some(
			(p) => p.username === username && p.username !== currentUsername,
		);
	});

	if (existing) {
		openConversation(existing.id);
	} else {
		try {
			const data = await query("/dm/conversations", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					participantUsernames: [username],
					isGroup: false,
				}),
			});

			if (data.error) {
				toastQueue.add(data.error);
				return;
			}

			await loadConversations();
			openConversation(data.conversation.id);
		} catch (error) {
			console.error("Failed to create conversation:", error);
			toastQueue.add("Failed to create conversation");
		}
	}
}

window.goBackToDMList = goBackToDMList;
window.openGroupSettings = openGroupSettings;
window.openDirectSettings = openDirectSettings;

async function toggleReaction(messageId, emoji) {
	try {
		const data = await query(`/dm/messages/${messageId}/reactions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ emoji }),
		});

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		const message = currentMessages.find((m) => m.id === messageId);
		if (message) {
			message.reactions = data.reactions;
			if (data.removed) {
				message.user_reacted =
					message.user_reacted?.filter((e) => e !== emoji) || [];
			} else {
				message.user_reacted = [
					...(message.user_reacted || []).filter((e) => e !== emoji),
					emoji,
				];
			}
			renderMessages();
		}
	} catch (error) {
		console.error("Failed to toggle reaction:", error);
		toastQueue.add("Failed to add reaction");
	}
}

function showReactionPicker(messageId) {
	const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
	if (!messageEl) return;

	const btnRect = messageEl
		.querySelector(".dm-add-reaction")
		?.getBoundingClientRect();
	if (!btnRect) return;

	const existingPicker = document.getElementById("reactionPicker");
	if (existingPicker) {
		existingPicker.remove();
	}

	showEmojiPickerPopup(
		(emoji) => {
			toggleReaction(messageId, emoji);
		},
		{
			x: btnRect.left,
			y: btnRect.bottom + 8,
		},
	);
}

function replyToMessage(messageId, authorName, messagePreview) {
	replyingTo = {
		id: messageId,
		authorName,
		messagePreview: messagePreview.replace(/&quot;/g, '"').replace(/\\'/g, "'"),
	};

	renderReplyPreview();

	const input = document.getElementById("dmMessageInput");
	if (input) {
		input.focus();
	}
}

function cancelReply() {
	replyingTo = null;
	renderReplyPreview();
}

function renderReplyPreview() {
	const replyPreviewEl = document.getElementById("dmReplyPreview");
	if (!replyPreviewEl) return;

	if (!replyingTo) {
		replyPreviewEl.classList.remove("active");
		replyPreviewEl.innerHTML = "";
		return;
	}

	replyPreviewEl.classList.add("active");
	replyPreviewEl.innerHTML = "";

	const line = document.createElement("div");
	line.className = "dm-reply-preview-line";
	replyPreviewEl.appendChild(line);

	const content = document.createElement("div");
	content.className = "dm-reply-preview-content";

	const label = document.createElement("span");
	label.className = "dm-reply-preview-label";
	label.textContent = `Replying to ${replyingTo.authorName}`;
	content.appendChild(label);

	const text = document.createElement("span");
	text.className = "dm-reply-preview-text";
	text.textContent = replyingTo.messagePreview;
	content.appendChild(text);

	replyPreviewEl.appendChild(content);

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "dm-reply-preview-cancel";
	cancelBtn.type = "button";
	cancelBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
	cancelBtn.addEventListener("click", cancelReply);
	replyPreviewEl.appendChild(cancelBtn);
}

window.toggleReaction = toggleReaction;
window.showReactionPicker = showReactionPicker;
window.replyToMessage = replyToMessage;
window.cancelReply = cancelReply;
window.setupInfiniteScroll = setupInfiniteScroll;

async function editMessage(messageId) {
	const message = currentMessages.find((m) => m.id === messageId);
	if (!message) {
		toastQueue.add("Message not found");
		return;
	}

	const modalContent = document.createElement("div");
	modalContent.style.padding = "20px";

	const textarea = document.createElement("textarea");
	textarea.value = message.content || "";
	textarea.style.cssText = `
    width: 100%;
    min-height: 120px;
    padding: 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
    margin-bottom: 12px;
  `;

	const buttonContainer = document.createElement("div");
	buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  `;

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.textContent = "Cancel";
	cancelButton.style.cssText = `
    padding: 8px 16px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  `;

	const saveButton = document.createElement("button");
	saveButton.type = "button";
	saveButton.textContent = "Save";
	saveButton.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-fg);
    cursor: pointer;
    font-weight: 600;
  `;

	modalContent.appendChild(textarea);
	buttonContainer.appendChild(cancelButton);
	buttonContainer.appendChild(saveButton);
	modalContent.appendChild(buttonContainer);

	const { close } = createModal({
		title: "Edit message",
		content: modalContent,
		closeOnOverlayClick: true,
	});

	cancelButton.addEventListener("click", close);

	saveButton.addEventListener("click", async () => {
		const newContent = textarea.value.trim();
		if (!newContent) {
			toastQueue.add("Message content cannot be empty");
			return;
		}

		saveButton.disabled = true;
		saveButton.textContent = "Saving...";

		const result = await query(`/dm/messages/${messageId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: newContent }),
		});

		if (result.success) {
			const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
			if (messageIndex !== -1) {
				currentMessages[messageIndex] = result.message;
				renderMessages();
			}
			close();
		} else {
			toastQueue.add(result.error || "Failed to update message");
			saveButton.disabled = false;
			saveButton.textContent = "Save";
		}
	});

	setTimeout(() => textarea.focus(), 100);
}

window.editMessage = editMessage;

async function deleteMessage(messageId) {
	const message = currentMessages.find((m) => m.id === messageId);
	if (!message) {
		toastQueue.add("Message not found");
		return;
	}

	if (
		!confirm(
			"Are you sure you want to delete this message? This cannot be undone.",
		)
	) {
		return;
	}

	try {
		const result = await query(`/dm/messages/${messageId}`, {
			method: "DELETE",
		});

		if (result.success) {
			const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
			if (messageIndex !== -1) {
				currentMessages.splice(messageIndex, 1);
				messageOffset -= 1;
				renderMessages();
			}
			toastQueue.add("Message deleted");
		} else {
			toastQueue.add(result.error || "Failed to delete message");
		}
	} catch (error) {
		console.error("Delete message error:", error);
		toastQueue.add("Failed to delete message");
	}
}

function formatDisappearingDuration(seconds) {
	if (!seconds) return "Unknown";
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	return `${Math.floor(seconds / 86400)}d`;
}

window.deleteMessage = deleteMessage;

export default {
	loadConversations,
	connectSSE,
};

export { openOrCreateConversation };
