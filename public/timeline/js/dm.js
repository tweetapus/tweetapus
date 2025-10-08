import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";

function sanitizeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let currentConversations = [];
let currentConversation = null;
let currentMessages = [];
let socket = null;
let selectedUsers = [];
let pendingFiles = [];
let _wsSendQueue = [];

function _safeSend(message) {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      return true;
    }

    _wsSendQueue.push(message);
    return false;
  } catch (err) {
    console.error("_safeSend error:", err);

    _wsSendQueue.push(message);
    return false;
  }
}

function connectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  
  const ws = new WebSocket(wsUrl);
  socket = ws;

  ws.onopen = () => {
    console.log("WebSocket connected");

    if (authToken) {
      _safeSend(JSON.stringify({ type: "authenticate", token: authToken }));
    }

    if (_wsSendQueue.length > 0) {
      for (const msg of _wsSendQueue) {
        try {
          ws.send(msg);
        } catch (e) {
          console.error("Failed to send queued WebSocket message:", e);
        }
      }
      _wsSendQueue = [];
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket disconnected");
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case "authenticated":
      if (data.success) {
        console.log("WebSocket authenticated");
      } else {
        console.error("WebSocket authentication failed:", data.error);
      }
      break;

    case "new_message":
      handleNewMessage(data);
      break;

    default:
      console.log("Unknown WebSocket message type:", data.type);
  }
}

function handleNewMessage(data) {
  const { conversationId, message } = data;

  if (currentConversation && currentConversation.id === conversationId) {
    currentMessages.push(message);
    renderMessages();
    scrollToBottom();
  }

  loadConversations();
  updateUnreadCount();
}

async function loadConversations() {
  if (!authToken) {
    console.log("No auth token available for DM");
    return;
  }

  try {
    console.log("Loading conversations...");
    const response = await fetch("/api/dm/conversations", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await response.json();

    if (data.error) {
      console.error("DM API error:", data.error);
      toastQueue.add("error", data.error);
      return;
    }

    currentConversations = data.conversations || [];
    console.log("Loaded conversations:", currentConversations.length);
    renderConversations();
    updateUnreadCount();
  } catch (error) {
    console.error("Failed to load conversations:", error);
    toastQueue.add("error", "Failed to load conversations");
  }
}

function renderConversations() {
  const listElement = document.getElementById("dmConversationsList");
  if (!listElement) return;

  if (currentConversations.length === 0) {
    listElement.innerHTML = `
      <div class="no-conversations">
        <p>No conversations yet.</p>
        <p>Start a new conversation to get chatting!</p>
      </div>
    `;
    return;
  }

  listElement.innerHTML = currentConversations
    .map((conversation) => createConversationElement(conversation))
    .join("");
}

function createConversationElement(conversation) {
  const displayAvatar =
    conversation.displayAvatar || "/public/shared/default-avatar.png";
  const displayName = sanitizeHTML(conversation.displayName || "Unknown");
  const lastMessage = sanitizeHTML(
    conversation.last_message_content || "No messages yet"
  );
  const lastSender = sanitizeHTML(
    conversation.lastMessageSenderName || conversation.last_message_sender || ""
  );
  const time = conversation.last_message_time
    ? formatTime(new Date(conversation.last_message_time))
    : "";
  const unreadCount = conversation.unread_count || 0;
  const isGroup = conversation.type === "group";


  let avatarHtml;
  if (isGroup && conversation.participants.length > 0) {
    const maxAvatars = 3;
    const visibleParticipants = conversation.participants.slice(0, maxAvatars);
    avatarHtml = `
      <div class="dm-group-avatars">
        ${visibleParticipants
          .map(
            (p) =>
              `<img src="${
                p.avatar || "/public/shared/default-avatar.png"
              }" alt="${p.name || p.username}" />`
          )
          .join("")}
        ${
          conversation.participants.length > maxAvatars
            ? `<div class="dm-avatar-more">+${
                conversation.participants.length - maxAvatars
              }</div>`
            : ""
        }
      </div>
    `;
  } else {
    avatarHtml = `<img src="${displayAvatar}" alt="${displayName}" class="dm-avatar" />`;
  }

  return `
    <div class="dm-conversation-item ${unreadCount > 0 ? "unread" : ""} ${
    isGroup ? "group" : ""
  }" 
         onclick="openConversation('${conversation.id}')">
      ${avatarHtml}
      <div class="dm-conversation-info">
        <h3 class="dm-conversation-name">
          ${displayName.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}
          ${isGroup ? '<span class="group-indicator">👥</span>' : ""}
        </h3>
        <p class="dm-last-message">
          ${
            lastSender && isGroup
              ? `<span class="dm-sender">${lastSender
                  .replaceAll("<", "&lt;")
                  .replaceAll(">", "&gt;")}:</span> `
              : ""
          }
          ${lastMessage.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}
        </p>
      </div>
      <div class="dm-conversation-meta">
        ${time ? `<span class="dm-time">${time}</span>` : ""}
        ${
          unreadCount > 0
            ? `<span class="dm-unread-count">${unreadCount}</span>`
            : ""
        }
      </div>
    </div>
  `;
}

async function openConversation(conversationId) {
  try {
    const response = await fetch(`/api/dm/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await response.json();

    if (data.error) {
      toastQueue.add("error", data.error);
      return;
    }

    currentConversation = data.conversation;
    currentMessages = data.messages || [];

    switchPage("dm-conversation", { path: `/dm/${conversationId}` });
    renderConversationHeader();
    renderMessages();
    scrollToBottom();
    markConversationAsRead(conversationId);
  } catch (error) {
    console.error("Failed to open conversation:", error);
    toastQueue.add("error", "Failed to open conversation");
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
    (p) => p.username !== currentUsername
  );
  const isGroup = currentConversation.type === "group";

  if (isGroup && participants.length > 3) {

    const visibleParticipants = participants.slice(0, 3);
    avatarsElement.innerHTML = `
      ${visibleParticipants
        .map(
          (p) =>
            `<img src="${
              p.avatar || "/public/shared/default-avatar.png"
            }" alt="${p.name || p.username}" />`
        )
        .join("")}
      <div class="avatar-more">+${participants.length - 3}</div>
    `;
  } else {
    avatarsElement.innerHTML = participants
      .map(
        (p) =>
          `<img src="${p.avatar || "/public/shared/default-avatar.png"}" alt="${
            p.name || p.username
          }" />`
      )
      .join("");
  }


  if (isGroup) {
    titleElement.textContent = currentConversation.title || "Group Chat";
    countElement.textContent = `${participants.length + 1} participants`;


    if (actionsElement) {
      actionsElement.innerHTML = `
        <button class="dm-action-btn" onclick="openGroupSettings()" title="Group Settings">
          ⚙️
        </button>
      `;
    }
  } else {
    if (participants.length === 1) {
      titleElement.textContent =
        participants[0].name || participants[0].username;
      countElement.textContent = `@${participants[0].username}`;
    } else {
      titleElement.textContent = "Direct Message";
      countElement.textContent = "1-on-1 chat";
    }

    if (actionsElement) {
      actionsElement.innerHTML = "";
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
}

function createMessageElement(message, currentUser) {
  const isOwn = message.username === currentUser;
  const avatar = message.avatar || "/public/shared/default-avatar.png";
  const time = formatTime(new Date(message.created_at));
  const sanitizedContent = sanitizeHTML(message.content || "");
  const sanitizedName = sanitizeHTML(message.name || message.username);

  const attachmentsHtml =
    message.attachments?.length > 0
      ? `
    <div class="dm-message-attachments">
      ${message.attachments
        .map(
          (att) => `
        <img src="${sanitizeHTML(att.file_url)}" alt="${sanitizeHTML(
            att.file_name
          )}" onclick="window.open('${sanitizeHTML(
            att.file_url
          )}', '_blank')" />
      `
        )
        .join("")}
    </div>
  `
      : "";

  return `
    <div class="dm-message ${isOwn ? "own" : ""}">
      <img src="${avatar}" alt="${sanitizedName}" class="dm-message-avatar" />
      <div class="dm-message-content">
        ${
          sanitizedContent
            ? `<p class="dm-message-text">${sanitizedContent}</p>`
            : ""
        }
        ${attachmentsHtml}
      </div>
      <div class="dm-message-time">${time}</div>
    </div>
  `;
}

async function sendMessage() {
  if (!currentConversation) return;

  const input = document.getElementById("dmMessageInput");
  const content = input.value.trim();

  if (!content && pendingFiles.length === 0) return;

  try {
    const requestBody = {
      content: content || "",
    };

    if (pendingFiles.length > 0) {
      requestBody.files = pendingFiles;
    }

    const response = await fetch(
      `/api/dm/conversations/${currentConversation.id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (data.error) {
      toastQueue.add("error", data.error);
      return;
    }

    input.value = "";
    pendingFiles = [];
    renderAttachmentPreviews();
    updateSendButton();

    currentMessages.push(data.message);
    renderMessages();
    scrollToBottom();
    loadConversations();
  } catch (error) {
    console.error("Failed to send message:", error);
    toastQueue.add("error", "Failed to send message");
  }
}

async function markConversationAsRead(conversationId) {
  try {
    await fetch(`/api/dm/conversations/${conversationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    loadConversations();
  } catch (error) {
    console.error("Failed to mark conversation as read:", error);
  }
}

function updateUnreadCount() {
  const unreadCount = currentConversations.reduce(
    (sum, conv) => sum + (conv.unread_count || 0),
    0
  );
  const countElement = document.getElementById("dmCount");

  if (countElement) {
    if (unreadCount > 0) {
      countElement.textContent = unreadCount;
      countElement.style.display = "flex";
    } else {
      countElement.style.display = "none";
    }
  }
}

function scrollToBottom() {
  const messagesElement = document.getElementById("dmMessages");
  if (messagesElement) {
    messagesElement.scrollTop = messagesElement.scrollHeight;
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
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

async function openDMList() {
  console.log("Opening DM list, authToken:", !!authToken);

  if (!authToken) {
    console.log("No auth token, redirecting to timeline");
    toastQueue.add("error", "Please log in to access messages");
    switchPage("timeline", { path: "/" });
    return;
  }

  console.log("Switching to DM page");
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


  switchPage("direct-messages", { path: "/dm" });


  loadConversations();
}

function openGroupSettings() {
  if (!currentConversation || currentConversation.type !== "group") {
    toastQueue.add("error", "This feature is only available for group chats");
    return;
  }

  const modal = document.getElementById("groupSettingsModal");
  const groupNameInput = document.getElementById("groupNameInput");

  if (modal && groupNameInput) {
    groupNameInput.value = currentConversation.title || "";
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
            participant.avatar || "/public/shared/default-avatar.png"
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

  if (newTitle !== (currentConversation.title || "")) {
    try {
      const response = await fetch(
        `/api/dm/conversations/${currentConversation.id}/title`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ title: newTitle }),
        }
      );

      const data = await response.json();

      if (data.error) {
        toastQueue.add("error", data.error);
        return;
      }

      currentConversation.title = newTitle;
      renderConversationHeader();
      toastQueue.add("success", "Group settings updated");
    } catch (error) {
      console.error("Failed to update group settings:", error);
      toastQueue.add("error", "Failed to update group settings");
      return;
    }
  }

  closeGroupSettings();
  loadConversations();
}

async function removeParticipantFromGroup(userId, username) {
  if (!currentConversation) return;

  if (!confirm(`Remove ${username} from this group?`)) return;

  try {
    const response = await fetch(
      `/api/dm/conversations/${currentConversation.id}/participants/${userId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    const data = await response.json();

    if (data.error) {
      toastQueue.add("error", data.error);
      return;
    }


    currentConversation.participants = currentConversation.participants.filter(
      (p) => p.id !== userId
    );
    renderParticipantsList();
    renderConversationHeader();
    toastQueue.add("success", `${username} has been removed from the group`);
    loadConversations();
  } catch (error) {
    console.error("Failed to remove participant:", error);
    toastQueue.add("error", "Failed to remove participant");
  }
}

let selectedParticipants = [];

function openAddParticipantModal() {
  if (!currentConversation || currentConversation.type !== "group") {
    toastQueue.add("error", "This feature is only available for group chats");
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
    "addParticipantSuggestions"
  );
  if (!suggestionsElement) return;

  if (users.length === 0) {
    suggestionsElement.classList.remove("show");
    return;
  }

  const existingUserIds = currentConversation.participants.map((p) => p.id);
  const availableUsers = users.filter(
    (user) => !existingUserIds.includes(user.id)
  );

  if (availableUsers.length === 0) {
    suggestionsElement.innerHTML =
      '<div class="no-suggestions">All users are already in this group</div>';
    suggestionsElement.classList.add("show");
    return;
  }

  suggestionsElement.innerHTML = availableUsers
    .map(
      (user) => `
      <div class="suggestion-item" onclick="addParticipantUser('${
        user.username
      }', '${user.name || ""}', '${user.avatar || ""}', '${user.id}')">
        <img src="${user.avatar || "/public/shared/default-avatar.png"}" alt="${
        user.name || user.username
      }" />
        <div class="user-info">
          <p class="username">${user.name || user.username}</p>
          <p class="name">@${user.username}</p>
        </div>
      </div>
    `
    )
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
    (u) => u.username !== username
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
    `
    )
    .join("");
}

async function confirmAddParticipant() {
  if (selectedParticipants.length === 0 || !currentConversation) return;

  try {
    const response = await fetch(
      `/api/dm/conversations/${currentConversation.id}/participants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          usernames: selectedParticipants.map((u) => u.username),
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      toastQueue.add("error", data.error);
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
      `Added ${selectedParticipants.length} participant(s) to the group`
    );
    loadConversations();
  } catch (error) {
    console.error("Failed to add participants:", error);
    toastQueue.add("error", "Failed to add participants");
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

async function searchUsers(query) {
  if (!query.trim()) return [];

  try {
    const response = await fetch(
      `/api/search/users?q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    const data = await response.json();
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
    .map(
      (user) => `
      <div class="suggestion-item" onclick="addUser('${user.username}', '${
        user.name || ""
      }', '${user.avatar || ""}')">
        <img src="${user.avatar || "/public/shared/default-avatar.png"}" alt="${
        user.name || user.username
      }" />
        <div class="user-info">
          <p class="username">${user.name || user.username}</p>
          <p class="name">@${user.username}</p>
        </div>
      </div>
    `
    )
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
    `
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

    const response = await fetch("/api/dm/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        participantUsernames: selectedUsers.map((u) => u.username),
        title: title,
        isGroup: isGroup,
      }),
    });

    const data = await response.json();

    if (data.error) {
      toastQueue.add("error", data.error);
      return;
    }

    closeNewMessageModal();
    await loadConversations();
    openConversation(data.conversation.id);
  } catch (error) {
    console.error("Failed to start conversation:", error);
    toastQueue.add("error", "Failed to start conversation");
  }
}

async function handleFileUpload(files) {
  const allowedTypes = ["image/webp", "image/jpeg", "image/png", "image/gif"];
  const maxSize = 10 * 1024 * 1024;

  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      toastQueue.add("error", "Only image files are allowed");
      continue;
    }

    if (file.size > maxSize) {
      toastQueue.add("error", "File too large (max 10MB)");
      continue;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        toastQueue.add("error", data.error);
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
      toastQueue.add("error", "Failed to upload file");
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
    `
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
  console.log("DM module: DOM loaded, setting up event listeners");

  const dmBtn = document.getElementById("dmBtn");
  if (dmBtn) {
    console.log("DM button found, adding event listener");
    dmBtn.addEventListener("click", openDMList);
  } else {
    console.error("DM button not found in DOM!");
  }


  setTimeout(() => {
    const dmBtnDelayed = document.getElementById("dmBtn");
    if (dmBtnDelayed && !dmBtnDelayed.onclick) {
      console.log("Adding delayed DM button event listener");
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
    "groupSettingsModalClose"
  );
  const cancelGroupSettings = document.getElementById("cancelGroupSettings");
  const saveGroupSettingsBtn = document.getElementById("saveGroupSettings");
  const addParticipantBtn = document.getElementById("addParticipantBtn");
  const addParticipantModalClose = document.getElementById(
    "addParticipantModalClose"
  );
  const cancelAddParticipant = document.getElementById("cancelAddParticipant");
  const confirmAddParticipantBtn = document.getElementById(
    "confirmAddParticipant"
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
  dmFileInput?.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(Array.from(e.target.files));
      e.target.value = "";
    }
  });

  dmMessageInput?.addEventListener("input", updateSendButton);
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
      "addParticipantSuggestions"
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
    connectWebSocket();
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
  }
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
window.goBackToDMList = goBackToDMList;
window.openGroupSettings = openGroupSettings;

export default {
  loadConversations,
  updateUnreadCount,
  connectWebSocket,
};
