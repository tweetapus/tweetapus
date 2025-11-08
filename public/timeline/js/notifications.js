import {
  NOTIFICATION_ICON_CLASSES,
  NOTIFICATION_ICON_MAP,
} from "../../shared/notification-icons.js";
import toastQueue from "../../shared/toasts.js";
import { createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
import { openProfile } from "./profile.js";
import { createTweetElement } from "./tweets.js";

let currentNotifications = [];
let isLoadingMoreNotifications = false;
let hasMoreNotifications = true;
let oldestNotificationId = null;
let notificationsScrollHandler = null;

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

async function openNotifications() {
  window.scrollTo(0, 0);
  switchPage("notifications", {
    path: "/notifications",
    recoverState: loadNotifications,
    cleanup: () => {
      if (notificationsScrollHandler) {
        window.removeEventListener("scroll", notificationsScrollHandler);
        notificationsScrollHandler = null;
      }
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
    listElement.innerHTML = "";
  }

  isLoadingMoreNotifications = false;
  hasMoreNotifications = true;
  oldestNotificationId = null;

  try {
    const data = await query("/notifications/");

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
  } catch (error) {
    console.error("Failed to load notifications:", error);
    if (listElement) {
      listElement.innerHTML =
        '<div class="no-notifications">Failed to load notifications</div>';
    }
  }

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

      try {
        const data = await query(
          `/notifications/?before=${oldestNotificationId}&limit=20`
        );

        const newNotifications = (data.notifications || []).map(
          (notification) => {
            if (notification.tweet?.user) {
              notification.tweet.author = notification.tweet.user;
              delete notification.tweet.user;
            }
            return notification;
          }
        );

        if (newNotifications.length > 0) {
          currentNotifications.push(...newNotifications);
          const listElement = document.getElementById("notificationsList");

          newNotifications.forEach((notification) => {
            const notificationEl = createNotificationElement(notification);
            listElement.appendChild(notificationEl);
          });

          oldestNotificationId =
            newNotifications[newNotifications.length - 1].id;
          hasMoreNotifications = data.hasMoreNotifications || false;
        }
      } catch (error) {
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

  const notificationEl = document.createElement("div");
  notificationEl.className = `notification-item ${isUnread ? "unread" : ""}`;
  notificationEl.dataset.id = notification.id;
  notificationEl.dataset.type = notification.type;
  notificationEl.dataset.relatedId = notification.related_id || "";
  notificationEl.dataset.relatedUrl = notification.url || "";

  const iconEl = document.createElement("div");
  const customIcon = notification.customIcon;

  if (customIcon) {
    iconEl.className = "notification-icon custom-icon";
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
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
        NOTIFICATION_ICON_CLASSES[notification.type] || "default-icon";
      iconEl.className = `notification-icon ${iconClassName}`;
      iconEl.innerHTML =
        NOTIFICATION_ICON_MAP[notification.type] ||
        NOTIFICATION_ICON_MAP.default;
    }
  } else {
    const iconClassName =
      NOTIFICATION_ICON_CLASSES[notification.type] || "default-icon";
    iconEl.className = `notification-icon ${iconClassName}`;
    iconEl.innerHTML =
      NOTIFICATION_ICON_MAP[notification.type] || NOTIFICATION_ICON_MAP.default;
  }

  const contentEl = document.createElement("div");
  contentEl.className = "notification-content";

  const contentP = document.createElement("p");

  const actorName =
    notification.actor_name || notification.actor_username || null;
  const actorUsername = notification.actor_username || "";

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  let remainingText = notification.content || "";

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
        const usernameRe = new RegExp(`@?${escapeRegExp(actorUsername)}`, "gi");
        remainingText = remainingText.replace(usernameRe, "");
        const parenRe = new RegExp(
          `\\(\s*@?${escapeRegExp(actorUsername)}\s*\\)`,
          "gi"
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
    restSpan.textContent = remainingText ? ` ${remainingText} ` : " ";

    const timeSpan = document.createElement("span");
    timeSpan.className = "notification-time";
    timeSpan.textContent = `· ${timeAgo}`;

    contentP.appendChild(actorLink);
    contentP.appendChild(restSpan);
    contentP.appendChild(timeSpan);
    contentEl.appendChild(contentP);
  } else {
    contentP.textContent = `${notification.content?.trim() || ""}  `;
    const timeSpan = document.createElement("span");
    timeSpan.className = "notification-time";
    timeSpan.textContent = `· ${timeAgo}`;
    contentP.appendChild(timeSpan);
    contentEl.appendChild(contentP);
  }

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
      ["like", "retweet", "quote", "mention", "fact_check"].includes(
        notification.type
      )
    ) {
      const tweetContent =
        notification.tweet.content.length > 100
          ? `${notification.tweet.content.substring(0, 100)}...`
          : notification.tweet.content;
      const tweetSubtitleEl = document.createElement("div");
      tweetSubtitleEl.className = "notification-tweet-subtitle";
      tweetSubtitleEl.textContent = tweetContent;
      contentEl.appendChild(tweetSubtitleEl);
    } else if (notification.tweet.content) {
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
    const relatedUrl = e.currentTarget.dataset.relatedUrl;

    if (authToken && isUnread) {
      try {
        await query(`/notifications/${notificationId}/read`, {
          method: "PATCH",
        });

        const notification = currentNotifications.find(
          (n) => n.id === notificationId
        );
        if (notification) {
          notification.read = true;
          renderNotifications();
        }
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
      try {
        const response = await query(`/tweets/${relatedId}`);
        if (response.tweet) {
          const tweetModule = await import(`./tweet.js`);
          const openTweet = tweetModule.default;

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
    } else if (
      notificationType === "affiliate_request" ||
      relatedId?.startsWith("affiliate_request:")
    ) {
      const requestId = relatedId?.startsWith("affiliate_request:")
        ? relatedId.split(":")[1]
        : null;
      const notif =
        currentNotifications.find((n) => n.id === notificationId) || {};
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

  notificationEl.appendChild(iconEl);
  notificationEl.appendChild(contentEl);

  return notificationEl;
}

async function markAllAsRead() {
  if (!authToken) return;

  await query("/notifications/mark-all-read", {
    method: "PATCH",
  });

  currentNotifications.forEach((notification) => {
    notification.read = true;
  });

  document
    .querySelectorAll(".notifications-list .notification-item.unread")
    .forEach((el) => {
      el.classList.remove("unread");
    });
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

export default { displayUnreadCount };
export { openNotifications, loadNotifications, markAllAsRead };
