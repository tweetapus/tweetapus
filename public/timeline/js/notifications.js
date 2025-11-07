import toastQueue from "../../shared/toasts.js";
import { createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
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

  const icons = {
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c1.1046 0 2-.8954 2-2h-4c0 1.1046.8954 2 2 2z"/><path d="M18.364 16.364A9 9 0 1 0 5.636 16.364L6 15.999V11a6 6 0 1 1 12 0v4.999l.364.365z"/></svg>`,
    // simple single-color reaction icon (uses currentColor so it's one color)
    reaction: `<svg width="16" height="16" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3" />
      <circle cx="22" cy="26" r="2" fill="currentColor" />
      <circle cx="42" cy="26" r="2" fill="currentColor" />
      <path d="M22 40c3 3 7 5 10 5s7-2 10-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none" />
    </svg>`,
    like: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
			<path d="M5.00002 2.54822C8.00003 2.09722 9.58337 4.93428 10 5.87387C10.4167 4.93428 12 2.09722 15 2.54822C18 2.99923 18.75 5.66154 18.75 7.05826C18.75 9.28572 18.1249 10.9821 16.2499 13.244C14.3749 15.506 10 18.3333 10 18.3333C10 18.3333 5.62498 15.506 3.74999 13.244C1.875 10.9821 1.25 9.28572 1.25 7.05826C1.25 5.66154 2 2.99923 5.00002 2.54822Z"/>
		</svg>`,
    retweet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882"/>
		</svg>`,
    reply: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M18.7502 11V7.50097C18.7502 4.73917 16.5131 2.50033 13.7513 2.50042L6.25021 2.50044C3.48848 2.5004 1.25017 4.73875 1.2502 7.50048L1.25021 10.9971C1.2502 13.749 3.47395 15.9836 6.22586 15.9971L6.82888 16V19.0182L12.1067 16H13.7502C16.5116 16 18.7502 13.7614 18.7502 11Z"/>
		</svg>`,
    follow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M18.6471 15.3333V18.6667M18.6471 18.6667L18.6471 22M18.6471 18.6667H22M18.6471 18.6667H15.2941M3 22C3 17.7044 6.69722 14.2222 11.258 14.2222C12.0859 14.2222 12.8854 14.3369 13.6394 14.5505M16.4118 6.44444C16.4118 8.89904 14.4102 10.8889 11.9412 10.8889C9.47214 10.8889 7.47059 8.89904 7.47059 6.44444C7.47059 3.98985 9.47214 2 11.9412 2C14.4102 2 16.4118 3.98985 16.4118 6.44444Z"/>
		</svg>`,
    quote: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
			<path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
		</svg>`,
    mention: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M18.6471 15.3333V18.6667M18.6471 18.6667L18.6471 22M18.6471 18.6667H22M18.6471 18.6667H15.2941M3 22C3 17.7044 6.69722 14.2222 11.258 14.2222C12.0859 14.2222 12.8854 14.3369 13.6394 14.5505M16.4118 6.44444C16.4118 8.89904 14.4102 10.8889 11.9412 10.8889C9.47214 10.8889 7.47059 8.89904 7.47059 6.44444C7.47059 3.98985 9.47214 2 11.9412 2C14.4102 2 16.4118 3.98985 16.4118 6.44444Z"/>
		</svg>`,
    // community related icons
    community_join_request: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3 6 6 .5-4.5 3 1.5 6L12 14l-6 4 1.5-6L3 8.5 9 8 12 2z"/></svg>`,
    affiliate_request: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3 6 6 .5-4.5 3 1.5 6L12 14 6 18l1.5-6L3 8.5 9 8 12 2z"/></svg>`,
    community_join_approved: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    community_join_rejected: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    community_role_change: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l4 4-4 4-4-4 4-4z"/><path d="M6 14v6h12v-6"/></svg>`,
    community_ban: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"/><path d="M9 9l6 6"/></svg>`,
    community_unban: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M8 12h8"/></svg>`,
  };

  const iconClasses = {
    default: "default-icon",
    reaction: "reaction-icon",
    like: "like-icon",
    retweet: "retweet-icon",
    reply: "reply-icon",
    follow: "follow-icon",
    quote: "quote-icon",
    mention: "mention-icon",
    community_join_request: "community-join-request-icon",
    affiliate_request: "affiliate-request-icon",
    community_join_approved: "community-join-approved-icon",
    community_join_rejected: "community-join-rejected-icon",
    community_role_change: "community-role-change-icon",
    community_ban: "community-ban-icon",
    community_unban: "community-unban-icon",
  };

  const notificationEl = document.createElement("div");
  notificationEl.className = `notification-item ${isUnread ? "unread" : ""}`;
  notificationEl.dataset.id = notification.id;
  notificationEl.dataset.type = notification.type;
  notificationEl.dataset.relatedId = notification.related_id || "";
  // expose a direct URL (if present) for click handling/navigation
  notificationEl.dataset.relatedUrl = notification.url || "";

  const iconEl = document.createElement("div");
  iconEl.className = `notification-icon ${
    iconClasses[notification.type] || "default-icon"
  }`;
  iconEl.innerHTML = icons[notification.type] || icons.default;

  const contentEl = document.createElement("div");
  contentEl.className = "notification-content";

  const contentP = document.createElement("p");

  // Use actor display name (if available) and make it a clickable link to the profile.
  // Do NOT insert a generic "Someone" placeholder — if actor metadata is missing,
  // we'll fall back to rendering the server-provided content as-is.
  const actorName =
    notification.actor_name || notification.actor_username || null;
  const actorUsername = notification.actor_username || "";

  // Helper to safely escape regex special chars when removing username from content text
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Prepare the remaining text by normalizing whitespace and removing any
  // @username or display name occurrences so we don't duplicate the actor.
  let remainingText = notification.content || "";

  // Normalize non-breaking spaces and collapse runs of whitespace so
  // matching multi-word display names is more robust (fixes two-word names).
  try {
    remainingText = remainingText
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    // noop: keep the current remainingText if normalization fails
  }

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

  // Build DOM. If we have an actor name, show it as a link and avoid inserting
  // any generic placeholder. If actor metadata is missing, render the server-provided
  // notification content directly.
  if (actorName) {
    const actorLink = document.createElement("a");
    actorLink.className = "notification-actor-link";
    actorLink.href = actorUsername ? `/@${actorUsername}` : "#";
    actorLink.textContent = actorName;
    actorLink.addEventListener("click", (ev) => {
      // stop outer click handler and navigate to profile
      ev.stopPropagation();
      ev.preventDefault();
      if (actorUsername) {
        window.location.href = `/@${actorUsername}`;
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
    // No actor metadata: show server-provided content directly (no 'Someone').
    contentP.textContent = (notification.content || "").trim() + " ";
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
    } else if (notification.tweet.content) {
      // Generic subtitle fallback: render tweet.content as a subtitle even
      // if the notification type doesn't match the typical tweet-related
      // types. This supports admin fake notifications which encode a
      // subtitle into related_id.
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

    // If a direct URL is provided, open it instead of attempting to load a tweet
    if (relatedUrl) {
      try {
        // preserve default behavior for links
        window.location.href = relatedUrl;
        return;
      } catch (err) {
        console.error("Failed to open notification URL:", err);
      }
    }
    // If relatedId is present but encodes meta/subtitle only (no actionable id), do nothing
    if (
      relatedId &&
      (relatedId.startsWith("meta:") || relatedId.startsWith("subtitle:"))
    )
      return;

    if (!relatedId) return;

    if (
      ["like", "retweet", "reply", "quote", "mention", "reaction"].includes(
        notificationType
      )
    ) {
      // If relatedId encodes meta/subtitle (not a real tweet id), don't try to fetch a tweet
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
        // Fallback to direct navigation
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
      (relatedId && relatedId.startsWith("affiliate_request:"))
    ) {
      const requestId =
        relatedId && relatedId.startsWith("affiliate_request:")
          ? relatedId.split(":")[1]
          : null;
      const notif =
        currentNotifications.find((n) => n.id === notificationId) || {};
      const actorName = notif.actor_username || notif.actor_name || "this user";

      const content = document.createElement("div");
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

      yesBtn.addEventListener("click", async (e) => {
        yesBtn.disabled = true;
        try {
          if (!requestId) {
            toastQueue.add("<h1>Invalid request</h1>");
            modal.close();
            return;
          }
          await query(`/profile/affiliate-requests/${requestId}/approve`, {
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

      noBtn.addEventListener("click", async (e) => {
        noBtn.disabled = true;
        try {
          if (!requestId) {
            modal.close();
            return;
          }
          await query(`/profile/affiliate-requests/${requestId}/deny`, {
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
  // renderNotifications();
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
