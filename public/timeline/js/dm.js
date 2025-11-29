import { showEmojiPickerPopup } from "../../shared/emoji-picker.js";
import { openImageFullscreen } from "../../shared/image-viewer.js";
import {
	createDMConversationSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";

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

function renderReactionEmojiHtml(emoji) {
	if (typeof emoji === "string") {
		const m = emoji.match(/^:([a-zA-Z0-9_+-]+):$/);
		if (m) {
			const name = m[1];
			const url = dmEmojiMap[name];
			if (url) {
				const safeUrl = encodeURI(url);
				const safeAlt = sanitizeHTML(emoji);
				return `<img src="${safeUrl}" alt="${safeAlt}" class="inline-emoji" width="20" height="20" loading="lazy"/>`;
			}
		}
	}
	return sanitizeHTML(emoji);
}

function sanitizeHTML(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
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

function displayDMCount(count) {
	const countElement = document.getElementById("dmCount");
	if (countElement) {
		if (count > 0) {
			countElement.textContent = count > 99 ? "99+" : count.toString();
			countElement.style.display = "flex";
		} else {
			countElement.style.display = "none";
		}
	}
}

function displayNotificationCount(count) {
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
			const p1 = document.createElement("p");
			p1.textContent = "No conversations yet.";
			const p2 = document.createElement("p");
			p2.textContent = "Start a new conversation to get chatting!";
			emptyDiv.appendChild(p1);
			emptyDiv.appendChild(p2);
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
					: p.gold
						? `4px`
						: `50px`;
			const img = document.createElement("img");
			img.src = p.avatar || "/public/shared/assets/default-avatar.svg";
			img.alt = p.name || p.username;
			img.style.borderRadius = radius;
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
				: singleParticipant.gold
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
	try {
		typingIndicators.clear();
		for (const timeout of typingTimeouts.values()) {
			clearTimeout(timeout);
		}
		typingTimeouts.clear();

		const data = await query(`/dm/conversations/${conversationId}`);

		if (data.error) {
			toastQueue.add(data.error);
			return;
		}

		currentConversation = data.conversation;
		currentMessages = (data.messages || []).reverse();
		messageOffset = currentMessages.length;
		hasMoreMessages = true;
		isLoadingMoreMessages = false;
		// Tr, SQLite ASAP!!!!!!!!
		switchPage("dm-conversation", {
			path: `/dm/${conversationId}`,
			recoverState: () => {
				if (currentConversation) {
					renderConversationHeader();
					renderMessages();
					scrollToBottom();
					markConversationAsRead(conversationId);
					setupInfiniteScroll();
				}
			},
		});
	} catch (error) {
		console.error("Failed to open conversation:", error);
		toastQueue.add("Failed to open conversation");
	}
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

	const newAvatarsHTML =
		isGroup && participants.length > 3
			? `${participants
					.slice(0, 3)
					.map((p) => {
						const radius =
							p.avatar_radius !== null && p.avatar_radius !== undefined
								? `${p.avatar_radius}px`
								: p.gold
									? `4px`
									: `50px`;
						return `<img src="${
							p.avatar || "/public/shared/assets/default-avatar.svg"
						}" alt="${
							p.name || p.username
						}" style="border-radius: ${radius};" />`;
					})
					.join("")}<div class="avatar-more">+${participants.length - 3}</div>`
			: participants
					.map((p) => {
						const radius =
							p.avatar_radius !== null && p.avatar_radius !== undefined
								? `${p.avatar_radius}px`
								: p.gold
									? `4px`
									: `50px`;
						return `<img src="${
							p.avatar || "/public/shared/assets/default-avatar.svg"
						}" alt="${p.name || p.username}" style="border-radius: ${radius};" />`;
					})
					.join("");

	if (avatarsElement.innerHTML !== newAvatarsHTML) {
		avatarsElement.innerHTML = newAvatarsHTML;
	}

	if (isGroup) {
		const newTitle = currentConversation.title || "Group Chat";
		const newCount = `${participants.length + 1} participants`;
		if (titleElement.textContent !== newTitle) {
			titleElement.textContent = newTitle;
		}
		if (countElement.textContent !== newCount) {
			countElement.textContent = newCount;
		}

		if (actionsElement) {
			const newActions = `<button class="dm-action-btn" onclick="openGroupSettings()" title="Group Settings">⚙️</button>`;
			if (actionsElement.innerHTML !== newActions) {
				actionsElement.innerHTML = newActions;
			}
		}
	} else {
		let newTitle, newCount;
		if (participants.length === 1) {
			newTitle = participants[0].name || participants[0].username;
			newCount = `@${participants[0].username}`;
		} else {
			newTitle = "Direct Message";
			newCount = "1-on-1 chat";
		}
		if (titleElement.textContent !== newTitle) {
			titleElement.textContent = newTitle;
		}
		if (countElement.textContent !== newCount) {
			countElement.textContent = newCount;
		}

		if (actionsElement) {
			const newActions = `<button class="dm-action-btn" onclick="openDirectSettings()" title="Conversation Settings">⚙️</button>`;
			if (actionsElement.innerHTML !== newActions) {
				actionsElement.innerHTML = newActions;
			}
		}
	}
}

function renderMessages() {
	const messagesElement = document.getElementById("dmMessages");
	if (!messagesElement || !currentMessages) return;

	const currentUser = getCurrentUsername();

	messagesElement.innerHTML = currentMessages
		.map((message) => createMessageElement(message, currentUser))
		.join("");

	setupAttachmentClickHandlers();
}

function setupAttachmentClickHandlers() {
	const messagesElement = document.getElementById("dmMessages");
	if (!messagesElement) return;

	messagesElement.querySelectorAll(".dm-attachment-img").forEach((img) => {
		img.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const url = img.dataset.url;
			const name = img.dataset.name;
			if (url) {
				openImageFullscreen(url, name);
			}
		});
	});
}

function createMessageElement(message, currentUser) {
	const isOwn = message.username === currentUser;
	const avatar = message.avatar || "/public/shared/assets/default-avatar.svg";
	const radius =
		message.avatar_radius !== null && message.avatar_radius !== undefined
			? `${message.avatar_radius}px`
			: message.gold
				? `4px`
				: `50px`;
	const time = formatTime(new Date(message.created_at));
	const sanitizedContent = sanitizeHTML(message.content || "");
	const sanitizedName = sanitizeHTML(message.name || message.username);
	const editedIndicator = message.edited_at
		? ' <span style="color: var(--text-secondary); font-size: 11px; font-style: italic;">(edited)</span>'
		: "";

	const expiresIndicator = message.expires_at
		? ` <span class="dm-expires-indicator" data-expires="${message.expires_at}" title="This message will disappear">⏱️</span>`
		: "";

	const attachmentsHtml =
		message.attachments?.length > 0
			? `
    <div class="dm-message-attachments">
      ${message.attachments
				.map(
					(att) => `
        <img src="${sanitizeHTML(att.file_url)}" alt="${sanitizeHTML(
					att.file_name,
				)}" data-url="${sanitizeHTML(att.file_url)}" data-name="${sanitizeHTML(
					att.file_name,
				)}" class="dm-attachment-img" />
      `,
				)
				.join("")}
    </div>
  `
			: "";

	const replyHtml = message.reply_to_message
		? `
    <div class="dm-reply-preview">
      <div class="dm-reply-line"></div>
      <div class="dm-reply-content">
        <span class="dm-reply-author">${sanitizeHTML(
					message.reply_to_message.name || message.reply_to_message.username,
				)}</span>
        <span class="dm-reply-text">${sanitizeHTML(
					(message.reply_to_message.content || "").substring(0, 50),
				)}${message.reply_to_message.content?.length > 50 ? "..." : ""}</span>
      </div>
    </div>
  `
		: "";

	const reactionsHtml =
		message.reactions?.length > 0
			? `
    <div class="dm-reactions">
      ${message.reactions
				.map((reaction) => {
					const hasReacted = message.user_reacted?.includes(reaction.emoji);
					const emojiForOnclick = (reaction.emoji || "").replaceAll("'", "\\'");
					const titleText = sanitizeHTML(
						(reaction.names || []).join(", ") || "",
					);
					const emojiHtml = renderReactionEmojiHtml(reaction.emoji);
					return `
        <button class="dm-reaction ${hasReacted ? "reacted" : ""}" 
                onclick="toggleReaction('${message.id}', '${emojiForOnclick}')" 
                title="${titleText}">
          <span class="dm-reaction-emoji">${emojiHtml}</span>
          <span class="dm-reaction-count">${reaction.count}</span>
        </button>
      `;
				})
				.join("")}
      <button class="dm-add-reaction" onclick="showReactionPicker('${
				message.id
			}')" title="Add reaction">
        <span>+</span>
      </button>
    </div>
  `
			: `
    <div class="dm-reactions">
      <button class="dm-add-reaction" onclick="showReactionPicker('${message.id}')" title="Add reaction">
        <span>+</span>
      </button>
    </div>
  `;

	return `
		<div class="dm-message ${isOwn ? "own" : ""}" data-message-id="${message.id}">
			<img src="${avatar}" alt="${sanitizedName}" class="dm-message-avatar" style="border-radius: ${radius};" />
			<div class="dm-message-wrapper">
				<div class="dm-message-content">
					${replyHtml}
					${sanitizedContent ? `<p class="dm-message-text">${sanitizedContent}</p>` : ""}
					${attachmentsHtml}
				</div>
				${reactionsHtml}
				<div class="dm-message-actions">
					<button class="dm-message-action-btn" onclick="replyToMessage('${
						message.id
					}', '${sanitizedName}', '${sanitizedContent
						.substring(0, 50)
						.replaceAll("'", "\\'")
						.replaceAll('"', "&quot;")}')" title="Reply">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
						</svg>
					</button>
					${
						isOwn
							? `<button class="dm-message-action-btn" onclick="editMessage('${message.id}')" title="Edit">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
						</svg>
					</button>
					<button class="dm-message-action-btn dm-delete-btn" onclick="deleteMessage('${message.id}')" title="Delete">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
						</svg>
					</button>`
							: ""
					}
					<span class="dm-message-time">${time}${editedIndicator}${expiresIndicator}</span>
				</div>
			</div>
		</div>
	`;
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
	const modal = document.getElementById("newMessageModal");
	if (modal) {
		modal.style.display = "flex";
		selectedUsers = [];
		renderSelectedUsers();
		document.getElementById("newMessageTo").value = "";
		document.getElementById("startConversation").disabled = true;

		const groupToggle = document.getElementById("groupChatToggle");
		if (groupToggle) {
			groupToggle.checked = false;
		}
	}
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

	const modal = document.getElementById("groupSettingsModal");
	const groupNameInput = document.getElementById("groupNameInput");
	const disappearingEnabled = document.getElementById("disappearingEnabled");
	const disappearingDuration = document.getElementById("disappearingDuration");
	const disappearingDurationSelect = document.getElementById(
		"disappearingDurationSelect",
	);

	if (modal && groupNameInput) {
		groupNameInput.value = currentConversation.title || "";

		if (disappearingEnabled) {
			disappearingEnabled.checked = !!currentConversation.disappearing_enabled;
			if (disappearingDuration) {
				disappearingDuration.style.display = disappearingEnabled.checked
					? "block"
					: "none";
			}
		}

		if (
			disappearingDurationSelect &&
			currentConversation.disappearing_duration
		) {
			disappearingDurationSelect.value =
				currentConversation.disappearing_duration.toString();
		}

		renderParticipantsList();
		modal.style.display = "flex";
	}
}

function closeGroupSettings() {
	const modal = document.getElementById("groupSettingsModal");
	if (modal) {
		modal.style.display = "none";
	}
}

function openDirectSettings() {
	if (!currentConversation || currentConversation.type !== "direct") {
		toastQueue.add("This feature is only available for direct conversations");
		return;
	}

	const modal = document.getElementById("directSettingsModal");
	const disappearingEnabled = document.getElementById(
		"directDisappearingEnabled",
	);
	const disappearingDuration = document.getElementById(
		"directDisappearingDuration",
	);
	const disappearingDurationSelect = document.getElementById(
		"directDisappearingDurationSelect",
	);

	if (modal) {
		if (disappearingEnabled) {
			disappearingEnabled.checked = !!currentConversation.disappearing_enabled;
			if (disappearingDuration) {
				disappearingDuration.style.display = disappearingEnabled.checked
					? "block"
					: "none";
			}
		}

		if (
			disappearingDurationSelect &&
			currentConversation.disappearing_duration
		) {
			disappearingDurationSelect.value =
				currentConversation.disappearing_duration.toString();
		}

		modal.style.display = "flex";
	}
}

function closeDirectSettings() {
	const modal = document.getElementById("directSettingsModal");
	if (modal) {
		modal.style.display = "none";
	}
}

async function saveDirectSettings() {
	if (!currentConversation) return;

	const disappearingEnabled = document.getElementById(
		"directDisappearingEnabled",
	);
	const disappearingDurationSelect = document.getElementById(
		"directDisappearingDurationSelect",
	);

	if (disappearingEnabled && disappearingDurationSelect) {
		const enabled = disappearingEnabled.checked;
		const duration = enabled
			? parseInt(disappearingDurationSelect.value)
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
						headers: {
							"Content-Type": "application/json",
						},
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

	closeDirectSettings();
	loadConversations();
}

function renderParticipantsList() {
	if (!currentConversation) return;

	const participantsList = document.getElementById("participantsList");
	if (!participantsList) return;

	const currentUsername = getCurrentUsername();
	const allParticipants = currentConversation.participants;

	participantsList.innerHTML = allParticipants
		.map((participant) => {
			const isCurrentUser = participant.username === currentUsername;
			return `
        <div class="participant-item">
          <img src="${
						participant.avatar || "/public/shared/assets/default-avatar.svg"
					}" alt="${participant.name || participant.username}" />
          <div class="participant-info">
            <span class="participant-name">${
							participant.name || participant.username
						}</span>
            <span class="participant-username">@${participant.username}</span>
          </div>
          ${
						!isCurrentUser
							? `
            <button class="remove-participant-btn" onclick="removeParticipantFromGroup('${participant.id}', '${participant.username}')">
              Remove
            </button>
          `
							: '<span class="current-user-badge">You</span>'
					}
        </div>
      `;
		})
		.join("");
}

async function saveGroupSettings() {
	if (!currentConversation) return;

	const groupNameInput = document.getElementById("groupNameInput");
	const newTitle = groupNameInput?.value?.trim() || null;
	const disappearingEnabled = document.getElementById("disappearingEnabled");
	const disappearingDurationSelect = document.getElementById(
		"disappearingDurationSelect",
	);

	if (newTitle !== (currentConversation.title || "")) {
		try {
			const data = await query(
				`/dm/conversations/${currentConversation.id}/title`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
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

	if (disappearingEnabled && disappearingDurationSelect) {
		const enabled = disappearingEnabled.checked;
		const duration = enabled
			? parseInt(disappearingDurationSelect.value)
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
						headers: {
							"Content-Type": "application/json",
						},
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

	closeGroupSettings();
	loadConversations();
}

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
					: user.gold
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
					: user.gold
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

async function handleFileUpload(files) {
	const allowedTypes = ["image/webp", "image/jpeg", "image/png", "image/gif"];
	const maxSize = 10 * 1024 * 1024;

	for (const file of files) {
		if (!allowedTypes.includes(file.type)) {
			toastQueue.add("Only image files are allowed");
			continue;
		}

		if (file.size > maxSize) {
			toastQueue.add("File too large (max 10MB)");
			continue;
		}

		try {
			const formData = new FormData();
			formData.append("file", file);

			const data = await query("/upload", {
				method: "POST",
				body: formData,
			});

			if (data.error) {
				toastQueue.add(data.error);
				continue;
			}

			pendingFiles.push({
				hash: data.hash,
				name: file.name,
				type: file.type,
				size: file.size,
				url: data.url,
			});
		} catch (error) {
			console.error("Failed to upload file:", error);
			toastQueue.add("Failed to upload file");
		}
	}

	renderAttachmentPreviews();
	updateSendButton();
}

function renderAttachmentPreviews() {
	const element = document.getElementById("dmComposerAttachments");
	if (!element) return;

	element.innerHTML = pendingFiles
		.map(
			(file, index) => `
      <div class="dm-attachment-preview">
        <img src="${file.url}" alt="${file.name}" />
        <button class="remove-attachment" onclick="removePendingFile(${index})">&times;</button>
      </div>
    `,
		)
		.join("");
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
	dmAttachmentBtn?.addEventListener("click", () => dmFileInput?.click());

	groupSettingsModalClose?.addEventListener("click", closeGroupSettings);
	cancelGroupSettings?.addEventListener("click", closeGroupSettings);
	saveGroupSettingsBtn?.addEventListener("click", saveGroupSettings);
	addParticipantBtn?.addEventListener("click", openAddParticipantModal);

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
window.saveGroupSettings = saveGroupSettings;
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
	const composerElement = document.querySelector(".dm-composer");
	if (!composerElement) return;

	let replyPreviewEl = document.getElementById("dmReplyPreview");

	if (!replyingTo) {
		if (replyPreviewEl) {
			replyPreviewEl.remove();
		}
		return;
	}

	if (!replyPreviewEl) {
		replyPreviewEl = document.createElement("div");
		replyPreviewEl.id = "dmReplyPreview";
		replyPreviewEl.className = "dm-reply-preview-composer";
		composerElement.insertBefore(replyPreviewEl, composerElement.firstChild);
	}

	replyPreviewEl.innerHTML = `
    <div class="dm-reply-preview-line"></div>
    <div class="dm-reply-preview-content">
      <span class="dm-reply-preview-label">Replying to ${sanitizeHTML(
				replyingTo.authorName,
			)}</span>
      <span class="dm-reply-preview-text">${sanitizeHTML(
				replyingTo.messagePreview,
			)}</span>
    </div>
    <button class="dm-reply-preview-cancel" onclick="cancelReply()" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;
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

	const overlay = document.createElement("div");
	overlay.className = "modal-overlay";
	overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

	const modal = document.createElement("div");
	modal.style.cssText = `
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    padding: 20px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;

	const title = document.createElement("h2");
	title.textContent = "Edit message";
	title.style.cssText = `
    margin: 0 0 16px 0;
    color: var(--text-primary);
  `;

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

	const closeModal = () => {
		document.body.removeChild(overlay);
	};

	cancelButton.addEventListener("click", closeModal);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) closeModal();
	});

	saveButton.addEventListener("click", async () => {
		const newContent = textarea.value.trim();
		if (!newContent) {
			toastQueue.add("Message content cannot be empty");
			return;
		}

		saveButton.disabled = true;
		saveButton.textContent = "Saving...";
		// Tr
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
			closeModal();
		} else {
			toastQueue.add(result.error || "Failed to update message");
			saveButton.disabled = false;
			saveButton.textContent = "Save";
		}
	});

	buttonContainer.appendChild(cancelButton);
	buttonContainer.appendChild(saveButton);

	modal.appendChild(title);
	modal.appendChild(textarea);
	modal.appendChild(buttonContainer);
	overlay.appendChild(modal);

	document.body.appendChild(overlay);
	textarea.focus();
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
