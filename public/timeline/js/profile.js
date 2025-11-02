import openImageCropper, {
  CROP_CANCELLED,
} from "../../shared/image-cropper.js";
import {
  convertToWebPAvatar,
  convertToWebPBanner,
  isConvertibleImage,
} from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import { createModal, createPopup } from "../../shared/ui-utils.js";
import query from "./api.js";
import getUser, { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

let currentProfile = null;
let currentPosts = [];
let currentReplies = [];
let currentUsername = null;

const escapeHTML = (str) =>
  str ? str.split("").join("").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

export default async function openProfile(username) {
  currentUsername = username;

  switchPage("profile", {
    path: `/@${username}`,
    recoverState: async () => {
      document.getElementById("profileContainer").style.display = "none";
      const data = await query(`/profile/${username}`);

      if (data.error) {
        // If the user is suspended, render a minimal suspended profile view
        if (data.error === "User is suspended") {
          // If the server included a partial profile object alongside the error,
          // prefer those real fields (display name, avatar, banner) when available.
          const pd = data.profile || {};
          const suspendedData = {
            profile: {
              username,
              name: pd.name || username,
              avatar: pd.avatar || null,
              banner: pd.banner || null,
              suspended: true,
              created_at: pd.created_at || null,
              post_count: pd.post_count || 0,
              following_count: pd.following_count || 0,
              follower_count: pd.follower_count || 0,
            },
            posts: [],
            replies: [],
            isFollowing: false,
            isOwnProfile: false,
          };

          currentProfile = suspendedData;
          renderProfile(suspendedData);
          return;
        }

        // For other errors, show a toast as before
        toastQueue.add(`<h1>${escapeHTML(data.error)}</h1>`);
        return null;
      }

      currentProfile = data;
      renderProfile(data);
    },
  });
}

const renderPosts = async (posts, isReplies = false) => {
  const container = document.getElementById("profilePostsContainer");

  if (!posts || posts.length === 0) {
    const emptyMessage = isReplies
      ? {
          title: "No replies yet",
          message: "When they reply to someone, it'll show up here.",
        }
      : {
          title: "No posts yet",
          message: "When they xeet something, it'll show up here.",
        };

    container.innerHTML = `
      <div class="profile-empty-state">
        <h3>${emptyMessage.title}</h3>
        <p>${emptyMessage.message}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  for (const post of posts) {
    const tweetElement = createTweetElement(post, {
      clickToOpen: true,
    });

    if (post.content_type === "retweet") {
      const retweetIndicator = document.createElement("div");
      retweetIndicator.className = "retweet-indicator";
      retweetIndicator.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 1l4 4-4 4"></path>
					<path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
					<path d="M7 23l-4-4 4-4"></path>
					<path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
				</svg>
				<span>${
          currentProfile?.profile?.name || currentProfile?.profile?.username
        } retweeted</span>
			`;
      tweetElement.insertBefore(retweetIndicator, tweetElement.firstChild);
    }

    container.appendChild(tweetElement);
  }
};

const switchTab = async (tabName) => {
  if (tabName === "posts") {
    renderPosts(currentPosts, false);
  } else if (tabName === "replies") {
    if (currentReplies.length === 0 && currentUsername) {
      document.getElementById("profilePostsContainer").innerHTML = "";

      let { error, replies } = await query(
        `/profile/${currentUsername}/replies`
      );

      if (error) {
        toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
        replies = [];
      }

      currentReplies = replies || [];
    }

    renderPosts(currentReplies, true);
  }
};

const renderProfile = (data) => {
  const { profile, posts, isFollowing, isOwnProfile } = data;

  const suspended = !!profile.suspended;

  // Header: name and post count
  const headerNameEl = document.getElementById("profileHeaderName");
  const headerCountEl = document.getElementById("profileHeaderPostCount");
  if (headerNameEl) headerNameEl.textContent = profile.name || profile.username;
  // Also update the main profile display name (h2) if present
  const displayNameEl = document.getElementById("profileDisplayName");
  if (displayNameEl)
    displayNameEl.textContent = profile.name || profile.username;
  if (headerCountEl)
    headerCountEl.textContent = `${profile.post_count || 0} posts`;

  // Toggle suspended class on container so CSS can handle visuals
  const profileContainerEl = document.getElementById("profileContainer");
  if (profileContainerEl)
    profileContainerEl.classList.toggle("suspended", suspended);

  // Banner handling: only set inline background if there's a real banner and not suspended
  const bannerElement = document.querySelector(".profile-banner");
  if (bannerElement) {
    bannerElement.style.display = "block";
    if (profile.banner && !suspended) {
      bannerElement.style.backgroundImage = `url(${profile.banner})`;
      bannerElement.style.backgroundSize = "cover";
      bannerElement.style.backgroundPosition = "center";
      bannerElement.style.backgroundRepeat = "no-repeat";
      bannerElement.style.height = "200px";
    } else {
      bannerElement.style.backgroundImage = "none";
      bannerElement.style.height = "200px";
    }
  }

  // Avatar: for suspended, use transparent src and mark dataset; visuals driven by CSS
  const avatarImg = document.getElementById("profileAvatar");
  if (avatarImg) {
    if (suspended) {
      avatarImg.src =
        "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      avatarImg.alt = "";
      avatarImg.dataset.suspended = "true";
      avatarImg.style.pointerEvents = "none";
      avatarImg.style.objectFit = "cover";
      avatarImg.style.opacity = "1";
      // keep rounded shape based on profile hint or default to circle
      if (
        profile.avatar_radius !== null &&
        profile.avatar_radius !== undefined
      ) {
        avatarImg.style.borderRadius = `${profile.avatar_radius}px`;
      } else if (profile.gold) {
        avatarImg.style.borderRadius = "4px";
      } else {
        avatarImg.style.borderRadius = "50%";
      }
    } else {
      delete avatarImg.dataset.suspended;
      avatarImg.src = profile.avatar || "/public/shared/default-avatar.png";
      avatarImg.alt = profile.name || profile.username;
      avatarImg.style.pointerEvents = "";
      avatarImg.style.objectFit = "cover";
      avatarImg.style.opacity = "";
      if (
        profile.avatar_radius !== null &&
        profile.avatar_radius !== undefined
      ) {
        avatarImg.style.borderRadius = `${profile.avatar_radius}px`;
      } else if (profile.gold) {
        avatarImg.style.borderRadius = "4px";
      } else {
        avatarImg.style.borderRadius = "50%";
      }
    }
  }

  // Profile name and verification badge (show only for non-suspended profiles)
  const profileNameEl = document.getElementById("profileHeaderName");
  if (profileNameEl) {
    profileNameEl.textContent = profile.name || profile.username;
    // verification badge (only if not suspended)
    const existingBadge = profileNameEl.querySelector(".verification-badge");
    if (!suspended && (profile.verified || profile.gold)) {
      const badgeColor = profile.gold ? "#D4AF37" : "#1185FE";
      if (!existingBadge) {
        const verificationBadge = document.createElement("span");
        verificationBadge.className = "verification-badge";
        verificationBadge.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.566 5.747C2.469 5.308 2.484 4.853 2.61 4.422C2.736 3.991 2.968 3.598 3.286 3.281C3.604 2.964 3.997 2.732 4.428 2.607C4.859 2.482 5.315 2.468 5.753 2.567C5.994 2.19 6.327 1.879 6.719 1.664C7.112 1.449 7.552 1.337 8.000 1.337C8.448 1.337 8.888 1.449 9.281 1.664C9.673 1.879 10.005 2.19 10.246 2.567C10.685 2.468 11.142 2.482 11.574 2.607C12.006 2.732 12.399 2.965 12.717 3.283C13.035 3.601 13.268 3.994 13.393 4.426C13.518 4.858 13.532 5.314 13.433 5.753C13.811 5.994 14.121 6.327 14.336 6.719C14.551 7.112 14.664 7.552 14.664 8.000C14.664 8.448 14.551 8.888 14.336 9.281C14.121 9.673 13.811 10.006 13.433 10.247C13.532 10.685 13.518 11.141 13.393 11.572C13.268 12.003 13.036 12.396 12.719 12.714C12.402 13.032 12.009 13.264 11.578 13.39C11.147 13.516 10.692 13.531 10.253 13.434C10.012 13.812 9.68 14.124 9.287 14.34C8.893 14.556 8.452 14.669 8.003 14.669C7.555 14.669 7.113 14.556 6.72 14.34C6.327 14.124 5.994 13.812 5.753 13.434C5.315 13.532 4.859 13.518 4.428 13.393C3.997 13.268 3.604 13.036 3.286 12.719C2.968 12.401 2.736 12.009 2.61 11.578C2.484 11.147 2.469 10.692 2.567 10.253C2.187 10.013 1.874 9.68 1.657 9.286C1.44 8.892 1.326 8.45 1.326 8.000C1.326 7.55 1.44 7.108 1.657 6.714C1.874 6.32 2.187 5.987 2.567 5.747Z" fill="${badgeColor}"/>
            <path d="M6 8L7.333 9.333L10 6.667" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        profileNameEl.appendChild(verificationBadge);
      } else {
        // update color if needed
        const pathEl = existingBadge.querySelector("path");
        if (pathEl) pathEl.setAttribute("fill", badgeColor);
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  }

  // Also add a verification badge to the main display name (h2) for non-suspended verified/gold users
  const mainDisplayNameEl = document.getElementById("profileDisplayName");
  if (mainDisplayNameEl) {
    // ensure we don't show badge on suspended profiles
    const existingMainBadge = mainDisplayNameEl.querySelector(
      ".verification-badge"
    );
    if (!suspended && (profile.verified || profile.gold)) {
      const badgeColor = profile.gold ? "#D4AF37" : "#1185FE";
      if (!existingMainBadge) {
        const verificationBadge = document.createElement("span");
        verificationBadge.className = "verification-badge";
        verificationBadge.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.566 5.747C2.469 5.308 2.484 4.853 2.61 4.422C2.736 3.991 2.968 3.598 3.286 3.281C3.604 2.964 3.997 2.732 4.428 2.607C4.859 2.482 5.315 2.468 5.753 2.567C5.994 2.19 6.327 1.879 6.719 1.664C7.112 1.449 7.552 1.337 8.000 1.337C8.448 1.337 8.888 1.449 9.281 1.664C9.673 1.879 10.005 2.19 10.246 2.567C10.685 2.468 11.142 2.482 11.574 2.607C12.006 2.732 12.399 2.965 12.717 3.283C13.035 3.601 13.268 3.994 13.393 4.426C13.518 4.858 13.532 5.314 13.433 5.753C13.811 5.994 14.121 6.327 14.336 6.719C14.551 7.112 14.664 7.552 14.664 8.000C14.664 8.448 14.551 8.888 14.336 9.281C14.121 9.673 13.811 10.006 13.433 10.247C13.532 10.685 13.518 11.141 13.393 11.572C13.268 12.003 13.036 12.396 12.719 12.714C12.402 13.032 12.009 13.264 11.578 13.39C11.147 13.516 10.692 13.531 10.253 13.434C10.012 13.812 9.68 14.124 9.287 14.34C8.893 14.556 8.452 14.669 8.003 14.669C7.555 14.669 7.113 14.556 6.72 14.34C6.327 14.124 5.994 13.812 5.753 13.434C5.315 13.532 4.859 13.518 4.428 13.393C3.997 13.268 3.604 13.036 3.286 12.719C2.968 12.401 2.736 12.009 2.61 11.578C2.484 11.147 2.469 10.692 2.567 10.253C2.187 10.013 1.874 9.68 1.657 9.286C1.44 8.892 1.326 8.45 1.326 8.000C1.326 7.55 1.44 7.108 1.657 6.714C1.874 6.32 2.187 5.987 2.567 5.747Z" fill="${badgeColor}"/>
            <path d="M6 8L7.333 9.333L10 6.667" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        // If a follows-me badge exists, insert the verification badge before it so it does NOT appear after follows-me-badge
        const followsBadge =
          mainDisplayNameEl.querySelector(".follows-me-badge");
        if (followsBadge) {
          mainDisplayNameEl.insertBefore(verificationBadge, followsBadge);
        } else {
          mainDisplayNameEl.appendChild(verificationBadge);
        }
      } else {
        // update color if needed
        const pathEl = existingMainBadge.querySelector("path");
        if (pathEl)
          pathEl.setAttribute("fill", profile.gold ? "#D4AF37" : "#1185FE");
      }
    } else if (existingMainBadge) {
      existingMainBadge.remove();
    }
  }

  // Username and labels
  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) {
    usernameEl.textContent = `@${profile.username}`;
    // clear existing labels
    const existingLabels = usernameEl.querySelectorAll(".profile-label");
    existingLabels.forEach((l) => l.remove());
    // Only show account labels for non-suspended profiles
    if (!suspended) {
      if (profile.label_type) {
        const labelEl = document.createElement("span");
        labelEl.className = `profile-label label-${profile.label_type}`;
        labelEl.textContent =
          profile.label_type.charAt(0).toUpperCase() +
          profile.label_type.slice(1);
        usernameEl.appendChild(labelEl);
      }
      if (profile.label_automated) {
        const automatedEl = document.createElement("span");
        automatedEl.className = "profile-label label-automated";
        automatedEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;
        usernameEl.appendChild(automatedEl);
      }
    }
  }

  // expose current profile username on the container for other modules
  if (profileContainerEl)
    profileContainerEl.dataset.profileUsername = profile.username;

  // show blocked banner if this profile has blocked the current viewer
  const blockedBanner = document.getElementById("profileBlockedBanner");
  if (blockedBanner) {
    if (profile.blockedByProfile) {
      blockedBanner.style.display = "flex";
      if (profileContainerEl)
        profileContainerEl.dataset.blockedByProfile = "true";
    } else {
      blockedBanner.style.display = "none";
      if (profileContainerEl)
        delete profileContainerEl.dataset.blockedByProfile;
    }
  }

  // Hide tab navigation (posts/replies switch) for suspended accounts
  const tabNav = document.querySelector(".profile-tab-nav");
  if (tabNav) tabNav.style.display = suspended ? "none" : "flex";

  // Show follows-me badge where appropriate (header and main display name)
  // Only show for non-suspended profiles and when viewing someone else's profile
  if (currentProfile?.followsMe && !isOwnProfile && !suspended) {
    const createFollowsBadge = () => {
      const el = document.createElement("span");
      el.className = "follows-me-badge";
      el.textContent = "Follows you";
      el.style.cssText =
        "margin: -5px 0 4px 0; padding: 4px 10px; background: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap; flex-shrink: 0;";
      return el;
    };

    // Append to the compact header (near the back button) if missing
    const headerTarget = document.getElementById("profileHeaderName");
    if (headerTarget && !headerTarget.querySelector(".follows-me-badge")) {
      headerTarget.appendChild(createFollowsBadge());
    }

    // Also append to the main display name (the visible h2 on the profile card)
    const displayNameEl = document.getElementById("profileDisplayName");
    if (displayNameEl && !displayNameEl.querySelector(".follows-me-badge")) {
      displayNameEl.appendChild(createFollowsBadge());
    }
  }

  // Pronouns
  const pronounsEl = document.getElementById("profilePronouns");
  if (pronounsEl) {
    pronounsEl.textContent = profile.pronouns || "";
    pronounsEl.style.display = profile.pronouns ? "block" : "none";
  }

  // When suspended, hide bio/meta and show suspension notice
  const bioEl = document.getElementById("profileBio");
  const metaEl = document.getElementById("profileMeta");
  const suspendedNotice = document.getElementById("profileSuspendedNotice");
  if (suspended) {
    if (bioEl) {
      bioEl.textContent = "";
      bioEl.style.display = "none";
    }
    if (metaEl) metaEl.innerHTML = "";
    if (suspendedNotice) suspendedNotice.style.display = "block";
  } else {
    if (bioEl) {
      bioEl.textContent = profile.bio || "";
      bioEl.style.display = profile.bio ? "block" : "none";
    }
    if (suspendedNotice) suspendedNotice.style.display = "none";
  }

  // Followers/following counts and links: hide links for suspended
  const followersCountEl = document.getElementById("profileFollowerCount");
  const followingCountEl = document.getElementById("profileFollowingCount");
  if (followersCountEl)
    followersCountEl.textContent = profile.follower_count || 0;
  if (followingCountEl)
    followingCountEl.textContent = profile.following_count || 0;

  const followersLink = document.getElementById("profileFollowersLink");
  const followingLink = document.getElementById("profileFollowingLink");
  if (suspended) {
    if (followersLink) followersLink.style.display = "none";
    if (followingLink) followingLink.style.display = "none";
  } else {
    if (followersLink) {
      followersLink.style.display = "inline-block";
      followersLink.onclick = () =>
        showFollowersList(profile.username, "followers");
    }
    if (followingLink) {
      followingLink.style.display = "inline-block";
      followingLink.onclick = () =>
        showFollowersList(profile.username, "following");
    }
  }

  // Meta items: location / website / joined
  const meta = [];
  if (!suspended) {
    if (profile.location)
      meta.push(
        `<span class="meta-item-location">${escapeHTML(
          profile.location
        )}</span>`
      );
    if (profile.website) {
      const url = profile.website.startsWith("http")
        ? profile.website
        : `https://${profile.website}`;
      meta.push(
        `<span class="meta-item-website"><a href="${escapeHTML(
          url
        )}" target="_blank" rel="noopener noreferrer">${escapeHTML(
          profile.website
        )}</a></span>`
      );
    }
    try {
      if (profile.created_at) {
        const joinedDate = new Date(profile.created_at);
        if (!Number.isNaN(joinedDate.getTime())) {
          meta.push(
            `<span class="meta-item-joined"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg> Joined ${joinedDate.toLocaleDateString(
              "en-US",
              { month: "long", year: "numeric" }
            )}</span>`
          );
        }
      }
    } catch (_) {}
  }
  if (metaEl)
    metaEl.innerHTML = meta
      .map((item) => `<div class="profile-meta-item">${item}</div>`)
      .join("");

  // Action buttons
  if (isOwnProfile) {
    const editBtn = document.getElementById("editProfileBtn");
    const followBtn = document.getElementById("followBtn");
    const dmBtn = document.getElementById("profileDmBtn");
    const dropdown = document.getElementById("profileDropdown");
    if (editBtn) editBtn.style.display = "block";
    if (followBtn) followBtn.style.display = "none";
    if (dmBtn) dmBtn.style.display = "none";
    if (dropdown) dropdown.style.display = "none";
  } else if (authToken) {
    const editBtn = document.getElementById("editProfileBtn");
    const followBtn = document.getElementById("followBtn");
    const dmBtn = document.getElementById("profileDmBtn");
    const dropdown = document.getElementById("profileDropdown");
    if (editBtn) editBtn.style.display = "none";
    if (followBtn) followBtn.style.display = "block";
    if (dmBtn) dmBtn.style.display = "flex";
    if (dropdown) dropdown.style.display = "block";
    updateFollowButton(isFollowing);
    setupDmButton(profile.username);
    try {
      const dmBtnCheck = document.getElementById("profileDmBtn");
      const pc = document.getElementById("profileContainer");
      const isBlocked = pc?.dataset?.blockedByProfile === "true";
      if (dmBtnCheck) {
        if (isBlocked) {
          dmBtnCheck.disabled = true;
          dmBtnCheck.setAttribute("aria-disabled", "true");
          dmBtnCheck.classList.add("blocked-interaction");
          dmBtnCheck.title = "You have been blocked by this user";
        } else {
          dmBtnCheck.disabled = false;
          dmBtnCheck.removeAttribute("aria-disabled");
          dmBtnCheck.classList.remove("blocked-interaction");
          dmBtnCheck.title = "";
        }
      }
    } catch (_) {}
  } else {
    const dmBtn = document.getElementById("profileDmBtn");
    const dropdown = document.getElementById("profileDropdown");
    if (dmBtn) dmBtn.style.display = "flex";
    if (dropdown) dropdown.style.display = "none";
  }

  // If suspended, ensure interactive buttons are hidden
  if (suspended) {
    const editBtn = document.getElementById("editProfileBtn");
    const followBtn = document.getElementById("followBtn");
    const dmBtn = document.getElementById("profileDmBtn");
    const dropdown = document.getElementById("profileDropdown");
    if (editBtn) editBtn.style.display = "none";
    if (followBtn) followBtn.style.display = "none";
    if (dmBtn) dmBtn.style.display = "none";
    if (dropdown) dropdown.style.display = "none";
  }

  currentPosts = posts;
  currentReplies = [];

  document
    .querySelectorAll(".profile-tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  const postTabBtn = document.querySelector(
    '.profile-tab-btn[data-tab="posts"]'
  );
  if (postTabBtn) postTabBtn.classList.add("active");

  renderPosts(posts);
  if (profileContainerEl) profileContainerEl.style.display = "block";
};

function updateFollowButton(isFollowing) {
  const btn = document.getElementById("followBtn");
  if (isFollowing) {
    btn.textContent = "Following";
    btn.className = "profile-btn profile-btn-following";

    btn.onclick = async () => {
      if (!authToken) {
        location.href = "/account";
        return;
      }

      const { success } = await query(`/profile/${currentUsername}/follow`, {
        method: "DELETE",
      });

      if (!success) {
        return toastQueue.add(`<h1>Failed to unfollow user</h1>`);
      }

      updateFollowButton(false);
      const count = document.getElementById("profileFollowerCount");
      count.textContent = Math.max(0, parseInt(count.textContent) - 1);
    };
  } else {
    btn.textContent = "Follow";
    btn.className = "profile-btn profile-btn-primary profile-btn-follow";
    btn.onclick = async () => {
      if (!authToken) {
        location.href = "/account";
        return;
      }

      // prevent following if this profile has blocked the current viewer
      try {
        const pc = document.getElementById("profileContainer");
        const isBlocked = pc?.dataset?.blockedByProfile === "true";
        if (isBlocked) {
          toastQueue.add(`<h1>You have been blocked by this user</h1>`);
          return;
        }
      } catch (_) {}

      const { success } = await query(`/profile/${currentUsername}/follow`, {
        method: "POST",
      });

      if (!success) {
        return toastQueue.add(`<h1>Failed to follow user</h1>`);
      }
      updateFollowButton(true);
      const count = document.getElementById("profileFollowerCount");
      count.textContent = parseInt(count.textContent) + 1;
    };
  }
}

// Dismiss blocked banner
document
  .getElementById("profileBlockedBannerDismiss")
  ?.addEventListener("click", () => {
    const b = document.getElementById("profileBlockedBanner");
    if (b) b.style.display = "none";
  });

function setupDmButton(username) {
  const btn = document.getElementById("profileDmBtn");
  btn.onclick = async () => {
    try {
      const pc = document.getElementById("profileContainer");
      const isBlocked = pc?.dataset?.blockedByProfile === "true";
      if (isBlocked) {
        toastQueue.add(`<h1>You have been blocked by this user</h1>`);
        return;
      }
    } catch (_) {}

    const { openOrCreateConversation } = await import("./dm.js");
    openOrCreateConversation(username);
  };
}

const showEditModal = () => {
  if (!currentProfile) return;

  const { profile } = currentProfile;
  document.getElementById("editDisplayName").value = profile.name || "";
  document.getElementById("editBio").value = profile.bio || "";
  document.getElementById("editPronouns").value = profile.pronouns || "";
  document.getElementById("editLocation").value = profile.location || "";
  document.getElementById("editWebsite").value = profile.website || "";
  document.getElementById("editLabelType").value = profile.label_type || "";
  document.getElementById("editLabelAutomated").checked =
    profile.label_automated || false;

  // Update avatar display
  updateEditAvatarDisplay();

  // Avatar radius controls
  const avatarRadiusControls = document.getElementById("avatarRadiusControls");
  const radiusInput = document.getElementById("radius-input");
  const presetSquare = document.getElementById("radius-preset-square");
  const presetDefault = document.getElementById("radius-preset-default");
  // Show radius controls only for gold users
  if (profile.gold) {
    avatarRadiusControls.style.display = "block";
  } else {
    avatarRadiusControls.style.display = "none";
  }
  const currentRadius =
    profile.avatar_radius !== null && profile.avatar_radius !== undefined
      ? profile.avatar_radius
      : profile.gold
      ? 4
      : 50;
  radiusInput.value = currentRadius;
  const avatarImg = document.getElementById("edit-current-avatar");
  const avatarPreviewContainer = document.querySelector(".avatar-preview");
  if (avatarImg) avatarImg.style.borderRadius = `${currentRadius}px`;
  if (avatarPreviewContainer)
    avatarPreviewContainer.style.borderRadius = `${currentRadius}px`;

  // If user is not gold, disable custom editing (presets + input)
  if (!profile.gold) {
    radiusInput.disabled = true;
    presetSquare.disabled = true;
    presetDefault.disabled = true;
  } else {
    radiusInput.disabled = false;
    presetSquare.disabled = false;
    presetDefault.disabled = false;
  }

  // Preset handlers
  presetSquare?.addEventListener("click", () => {
    radiusInput.value = 4;
    const avatarImg = document.getElementById("edit-current-avatar");
    const avatarPreviewContainer = document.querySelector(".avatar-preview");
    if (avatarImg) avatarImg.style.borderRadius = `4px`;
    if (avatarPreviewContainer)
      avatarPreviewContainer.style.borderRadius = `4px`;
  });

  presetDefault?.addEventListener("click", () => {
    radiusInput.value = 50;
    const avatarImg = document.getElementById("edit-current-avatar");
    const avatarPreviewContainer = document.querySelector(".avatar-preview");
    if (avatarImg) avatarImg.style.borderRadius = `50px`;
    if (avatarPreviewContainer)
      avatarPreviewContainer.style.borderRadius = `50px`;
  });

  radiusInput?.addEventListener("input", () => {
    const val = parseInt(radiusInput.value, 10);
    if (Number.isNaN(val)) return;
    const avatarImg = document.getElementById("edit-current-avatar");
    const avatarPreviewContainer = document.querySelector(".avatar-preview");
    if (avatarImg) avatarImg.style.borderRadius = `${val}px`;
    if (avatarPreviewContainer)
      avatarPreviewContainer.style.borderRadius = `${val}px`;
  });

  updateEditBannerDisplay();

  updateCharCounts();
  const modalEl = document.getElementById("editProfileModal");
  modalEl.classList.add("show");

  modalEl.setAttribute("role", "dialog");
  modalEl.setAttribute("aria-modal", "true");
  modalEl.setAttribute("aria-hidden", "false");
  document
    .querySelectorAll(".main-content, nav")
    .forEach((el) => el.setAttribute("aria-hidden", "true"));

  setTimeout(() => {
    const firstInput = document.getElementById("editDisplayName");
    if (firstInput) firstInput.focus();
  }, 0);

  const escHandler = (e) => {
    if (e.key === "Escape") closeEditModal();
  };
  modalEl._escHandler = escHandler;
  document.addEventListener("keydown", escHandler);
};

const closeEditModal = () => {
  const modalEl = document.getElementById("editProfileModal");
  modalEl.classList.remove("show");

  modalEl.setAttribute("aria-hidden", "true");
  document
    .querySelectorAll(".main-content, nav")
    .forEach((el) => el.removeAttribute("aria-hidden"));

  if (modalEl._escHandler) {
    document.removeEventListener("keydown", modalEl._escHandler);
    delete modalEl._escHandler;
  }
};

const updateCharCounts = () => {
  const fields = [
    { id: "editDisplayName", countId: "displayNameCount" },
    { id: "editBio", countId: "bioCount" },
    { id: "editPronouns", countId: "pronounsCount" },
    { id: "editLocation", countId: "locationCount" },
    { id: "editWebsite", countId: "websiteCount" },
  ];

  fields.forEach((field) => {
    const input = document.getElementById(field.id);
    const counter = document.getElementById(field.countId);
    if (input && counter) {
      counter.textContent = input.value.length;
    }
  });
};

const updateEditBannerDisplay = () => {
  if (!currentProfile) return;

  const { profile } = currentProfile;
  const bannerPreview = document.getElementById("edit-current-banner");
  const removeBtn = document.getElementById("edit-remove-banner");

  if (bannerPreview) {
    if (profile.banner) {
      bannerPreview.style.backgroundImage = `url(${profile.banner})`;
      bannerPreview.style.backgroundSize = "cover";
      bannerPreview.style.backgroundPosition = "center";
      bannerPreview.style.backgroundRepeat = "no-repeat";
    } else {
      bannerPreview.style.backgroundImage = "none";
      bannerPreview.style.backgroundColor = "var(--bg-secondary)";
    }
  }

  if (removeBtn) {
    removeBtn.style.display = profile.banner ? "inline-block" : "none";
  }
};

const handleEditBannerUpload = async (file) => {
  if (!file) return;

  // Validate file size (10MB max for banners)
  if (file.size > 10 * 1024 * 1024) {
    toastQueue.add(
      `<h1>File too large</h1><p>Please choose an image smaller than 10MB.</p>`
    );
    return;
  }

  // Check if it's a convertible image format
  if (!isConvertibleImage(file)) {
    toastQueue.add(
      `<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`
    );
    return;
  }

  const changeBtn = document.getElementById("edit-change-banner");
  if (changeBtn) {
    changeBtn.disabled = true;
    changeBtn.textContent = "Processing...";
  }

  try {
    // Offer cropping UI for banners (skip for unsupported animated GIF preservation)
    let processedFile = file;
    try {
      const cropResult = await openImageCropper(file, {
        aspect: 3,
        size: 1500,
      });
      if (cropResult === CROP_CANCELLED) {
        // user cancelled cropping — do not proceed
        if (changeBtn) {
          changeBtn.disabled = false;
          changeBtn.textContent = "Change Banner";
        }
        return;
      }
      processedFile = cropResult || file;
    } catch (err) {
      // if cropper fails, fall back to original file but continue
      console.warn("Cropper error, using original file:", err);
      processedFile = file;
    }

    // Convert to WebP and resize to 1500x500 for banner
    const webpFile = await convertToWebPBanner(processedFile, 1500, 500, 0.8);

    // Update progress text
    if (changeBtn) {
      changeBtn.textContent = "Uploading...";
    }

    const formData = new FormData();
    formData.append("banner", webpFile);

    const result = await query(
      `/profile/${currentProfile.profile.username}/banner`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (result.success) {
      currentProfile.profile.banner = result.banner;
      updateEditBannerDisplay();
      // Also update the main profile display
      const profileBanner = document.querySelector(".profile-banner");
      if (profileBanner) {
        profileBanner.style.backgroundImage = `url(${result.banner})`;
        profileBanner.style.backgroundSize = "cover";
        profileBanner.style.backgroundPosition = "center";
        profileBanner.style.backgroundRepeat = "no-repeat";
      }
      toastQueue.add(
        `<h1>Banner updated!</h1><p>Your profile banner has been uploaded and changed.</p>`
      );
    } else {
      toastQueue.add(
        `<h1>Upload failed</h1><p>${
          result.error || "Failed to upload banner"
        }</p>`
      );
    }
  } catch (error) {
    console.error("Banner upload error:", error);
    toastQueue.add(
      `<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`
    );
  } finally {
    if (changeBtn) {
      changeBtn.disabled = false;
      changeBtn.textContent = "Change Banner";
    }
  }
};

const handleEditBannerRemoval = async () => {
  const removeBtn = document.getElementById("edit-remove-banner");
  if (removeBtn) {
    removeBtn.disabled = true;
    removeBtn.textContent = "Removing...";
  }

  try {
    const result = await query(
      `/profile/${currentProfile.profile.username}/banner`,
      {
        method: "DELETE",
      }
    );

    if (result.success) {
      currentProfile.profile.banner = null;
      updateEditBannerDisplay();

      const profileBanner = document.querySelector(".profile-banner");
      if (profileBanner) {
        profileBanner.style.backgroundImage = "none";
        profileBanner.style.backgroundColor = "var(--bg-secondary)";
      }
      toastQueue.add(
        `<h1>Banner removed</h1><p>Your profile banner has been reset to default.</p>`
      );
    } else {
      toastQueue.add(
        `<h1>Failed to remove banner</h1><p>${
          result.error || "An error occurred"
        }</p>`
      );
    }
  } catch (error) {
    console.error("Banner removal error:", error);
    toastQueue.add(
      `<h1>Network error</h1><p>Failed to remove banner. Please try again.</p>`
    );
  } finally {
    if (removeBtn) {
      removeBtn.disabled = false;
      removeBtn.textContent = "Remove Banner";
    }
  }
};

const updateEditAvatarDisplay = () => {
  if (!currentProfile) return;

  const { profile } = currentProfile;
  const avatarImg = document.getElementById("edit-current-avatar");
  const removeBtn = document.getElementById("edit-remove-avatar");
  const avatarPreviewContainer = document.querySelector(".avatar-preview");

  if (avatarImg) {
    const avatarSrc = profile.avatar || `/public/shared/default-avatar.png`;
    avatarImg.src = avatarSrc;
    avatarImg.alt = profile.name || profile.username;
  }

  // Apply radius to both image and its container so preview shape updates
  if (avatarPreviewContainer) {
    if (profile.avatar_radius !== null && profile.avatar_radius !== undefined) {
      avatarPreviewContainer.style.borderRadius = `${profile.avatar_radius}px`;
      if (avatarImg)
        avatarImg.style.borderRadius = `${profile.avatar_radius}px`;
    } else if (profile.gold) {
      avatarPreviewContainer.style.borderRadius = `4px`;
      if (avatarImg) avatarImg.style.borderRadius = `4px`;
    } else {
      avatarPreviewContainer.style.borderRadius = `50px`;
      if (avatarImg) avatarImg.style.borderRadius = `50px`;
    }
  }

  if (removeBtn) {
    removeBtn.style.display = profile.avatar ? "inline-block" : "none";
  }
};

const handleEditAvatarUpload = async (file) => {
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    toastQueue.add(
      `<h1>File too large</h1><p>Please choose an image smaller than 5MB.</p>`
    );
    return;
  }

  // Check if it's a convertible image format
  if (!isConvertibleImage(file)) {
    toastQueue.add(
      `<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`
    );
    return;
  }

  const changeBtn = document.getElementById("edit-change-avatar");
  if (changeBtn) {
    changeBtn.disabled = true;
    changeBtn.textContent = "Processing...";
  }

  try {
    // If original file is GIF and the current profile is Gold, preserve it (upload GIF)
    let uploadFile = null;
    if (file.type === "image/gif" && currentProfile?.profile?.gold) {
      // preserve GIFs for gold accounts, do not offer cropper (animated GIF cropping unsupported)
      uploadFile = file;
    } else {
      // Offer cropping UI for avatars where useful
      let processedFile = file;
      try {
        const cropResult = await openImageCropper(file, {
          aspect: 1,
          size: 250,
        });
        if (cropResult === CROP_CANCELLED) {
          // user cancelled cropping — do not proceed
          if (changeBtn) {
            changeBtn.disabled = false;
            changeBtn.textContent = "Change Avatar";
          }
          return;
        }
        processedFile = cropResult || file;
      } catch (err) {
        console.warn("Cropper error, using original file:", err);
        processedFile = file;
      }

      // Convert to WebP and resize to 250x250 for non-GIF or non-gold
      const webpFile = await convertToWebPAvatar(processedFile, 250, 0.8);
      uploadFile = webpFile;
    }

    // Update progress text
    if (changeBtn) {
      changeBtn.textContent = "Uploading...";
    }

    const formData = new FormData();
    formData.append("avatar", uploadFile);

    const result = await query(
      `/profile/${currentProfile.profile.username}/avatar`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (result.success) {
      currentProfile.profile.avatar = result.avatar;
      updateEditAvatarDisplay();
      // Also update the main profile display
      const profileAvatar = document.getElementById("profileAvatar");
      if (profileAvatar) {
        profileAvatar.src = result.avatar;
        if (
          currentProfile.profile.avatar_radius !== null &&
          currentProfile.profile.avatar_radius !== undefined
        ) {
          profileAvatar.style.borderRadius = `${currentProfile.profile.avatar_radius}px`;
        } else if (currentProfile.profile.gold) {
          profileAvatar.style.borderRadius = `4px`;
        } else {
          profileAvatar.style.borderRadius = `50px`;
        }
      }
      toastQueue.add(
        `<h1>Avatar updated!</h1><p>Your profile picture has been uploaded and changed.</p>`
      );
    } else {
      toastQueue.add(
        `<h1>Upload failed</h1><p>${
          result.error || "Failed to upload avatar"
        }</p>`
      );
    }
  } catch (error) {
    console.error("Avatar upload error:", error);
    toastQueue.add(
      `<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`
    );
  } finally {
    if (changeBtn) {
      changeBtn.disabled = false;
      changeBtn.textContent = "Change Avatar";
    }
  }
};

const handleEditAvatarRemoval = async () => {
  const removeBtn = document.getElementById("edit-remove-avatar");
  if (removeBtn) {
    removeBtn.disabled = true;
    removeBtn.textContent = "Removing...";
  }

  try {
    const response = await query(
      `/profile/${currentProfile.profile.username}/avatar`,
      {
        method: "DELETE",
      }
    );

    const result = await response.json();

    if (result.success) {
      currentProfile.profile.avatar = null;
      updateEditAvatarDisplay();
      const profileAvatar = document.getElementById("profileAvatar");
      if (profileAvatar) {
        profileAvatar.src = `/public/shared/default-avatar.png`;
        if (
          currentProfile.profile.avatar_radius !== null &&
          currentProfile.profile.avatar_radius !== undefined
        ) {
          profileAvatar.style.borderRadius = `${currentProfile.profile.avatar_radius}px`;
        } else if (currentProfile.profile.gold) {
          profileAvatar.style.borderRadius = `4px`;
        } else {
          profileAvatar.style.borderRadius = `50px`;
        }
      }
      toastQueue.add(
        `<h1>Avatar removed</h1><p>Your profile picture has been reset to default.</p>`
      );
    } else {
      toastQueue.add(
        `<h1>Failed to remove avatar</h1><p>${
          result.error || "An error occurred"
        }</p>`
      );
    }
  } catch (error) {
    console.error("Avatar removal error:", error);
    toastQueue.add(
      `<h1>Network error</h1><p>Failed to remove avatar. Please try again.</p>`
    );
  } finally {
    if (removeBtn) {
      removeBtn.disabled = false;
      removeBtn.textContent = "Remove Avatar";
    }
  }
};

const saveProfile = async (event) => {
  event.preventDefault();

  if (!localStorage.getItem("authToken")) {
    switchPage("timeline", { path: "/" });
    return;
  }

  if (!currentProfile || !currentProfile.profile) return;

  const formData = {
    name: document.getElementById("editDisplayName").value.trim(),
    bio: document.getElementById("editBio").value.trim(),
    pronouns: document.getElementById("editPronouns").value.trim(),
    location: document.getElementById("editLocation").value.trim(),
    website: document.getElementById("editWebsite").value.trim(),
    label_type: document.getElementById("editLabelType").value || null,
    label_automated: document.getElementById("editLabelAutomated").checked,
  };

  const avatarRadiusControls = document.getElementById("avatarRadiusControls");
  const radiusInput = document.getElementById("radius-input");
  if (avatarRadiusControls && avatarRadiusControls.style.display !== "none") {
    const val = parseInt(radiusInput.value, 10);
    if (!Number.isNaN(val)) {
      // Only include avatar_radius when the user actually changed it.
      // Calculate the original radius the same way the UI displays it.
      const origProfile = currentProfile.profile || {};
      const originalRadius =
        origProfile.avatar_radius !== null &&
        origProfile.avatar_radius !== undefined
          ? origProfile.avatar_radius
          : origProfile.gold
          ? 4
          : 50;

      if (val !== originalRadius) {
        formData.avatar_radius = val;
      }
    }
  }

  try {
    const result = await query(`/profile/${currentProfile.profile.username}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (result?.success) {
      if (result.profile) {
        currentProfile = { ...(currentProfile || {}), profile: result.profile };
        try {
          renderProfile({
            profile: result.profile,
            posts: currentPosts,
            isFollowing: false,
            isOwnProfile: true,
          });
        } catch (_err) {
          openProfile(currentProfile.profile.username);
        }
      } else {
        openProfile(currentProfile.profile.username);
      }

      closeEditModal();
      toastQueue.add(
        `<h1>Profile Updated!</h1><p>Your profile has been successfully updated</p>`
      );
    } else {
      toastQueue.add(
        `<h1>Update Failed</h1><p>${
          result.error || "Failed to update profile"
        }</p>`
      );
    }
  } catch (error) {
    console.error("Profile update error:", error);
    toastQueue.add(`<h1>Update Failed</h1><p>Failed to update profile</p>`);
  }
};

document.querySelector(".back-button").addEventListener("click", (e) => {
  e.preventDefault();
  history.back();
});

document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".profile-tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    switchTab(btn.dataset.tab);
  });
});

document
  .getElementById("editProfileBtn")
  .addEventListener("click", showEditModal);
document
  .getElementById("closeEditModalBtn")
  .addEventListener("click", closeEditModal);
document
  .getElementById("cancelEditBtn")
  .addEventListener("click", closeEditModal);
document
  .getElementById("editProfileForm")
  .addEventListener("submit", saveProfile);

[
  "editDisplayName",
  "editBio",
  "editPronouns",
  "editLocation",
  "editWebsite",
].forEach((id) => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener("input", updateCharCounts);
  }
});

const editChangeAvatarBtn = document.getElementById("edit-change-avatar");
const editAvatarUpload = document.getElementById("edit-avatar-upload");
const editRemoveAvatarBtn = document.getElementById("edit-remove-avatar");
const editAvatarPreview = document.querySelector(".avatar-preview");

editChangeAvatarBtn?.addEventListener("click", () => {
  editAvatarUpload?.click();
});

editAvatarPreview?.addEventListener("click", () => {
  editAvatarUpload?.click();
});

editAvatarUpload?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    handleEditAvatarUpload(file);
  }
  e.target.value = ""; // Reset input
});

editRemoveAvatarBtn?.addEventListener("click", handleEditAvatarRemoval);

// Banner upload event listeners
const editChangeBannerBtn = document.getElementById("edit-change-banner");
const editBannerUpload = document.getElementById("edit-banner-upload");
const editRemoveBannerBtn = document.getElementById("edit-remove-banner");
const editBannerPreview = document.querySelector(".banner-preview");

editChangeBannerBtn?.addEventListener("click", () => {
  editBannerUpload?.click();
});

editBannerPreview?.addEventListener("click", () => {
  editBannerUpload?.click();
});

editBannerUpload?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    handleEditBannerUpload(file);
  }
  e.target.value = ""; // Reset input
});

editRemoveBannerBtn?.addEventListener("click", handleEditBannerRemoval);

// Profile dropdown event listeners
document
  .getElementById("profileDropdownBtn")
  ?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const triggerEl = e.currentTarget;

    getUser()
      .then(async (currentUser) => {
        try {
          const baseItems = [
            {
              title: "Copy link",
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,

              action: () => {
                const profileUrl = `${location.origin}/@${currentUsername}`;

                navigator.clipboard.writeText(profileUrl);
              },
            },
          ];

          const items = [...baseItems];

          if (
            currentUser &&
            currentProfile &&
            currentProfile.profile &&
            currentUser.id !== currentProfile.profile.id
          ) {
            const checkResp = await query(
              `/blocking/check/${currentProfile.profile.id}`
            );
            const isBlocked = checkResp?.blocked || false;

            const blockItem = {
              id: isBlocked ? "unblock-user" : "block-user",
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
              title: isBlocked
                ? `Unblock @${currentProfile.profile.username}`
                : `Block @${currentProfile.profile.username}`,
              onClick: async () => {
                try {
                  const action = isBlocked ? "Unblock" : "Block";
                  if (
                    !confirm(
                      `Do you want to ${action} @${currentProfile.profile.username}?`
                    )
                  )
                    return;

                  const endpoint = isBlocked
                    ? "/blocking/unblock"
                    : "/blocking/block";
                  const result = await query(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentProfile.profile.id }),
                  });

                  if (result.success) {
                    toastQueue.add(
                      `<h1>${
                        isBlocked ? "User unblocked" : "User blocked"
                      }</h1>`
                    );
                  } else {
                    toastQueue.add(
                      `<h1>${
                        result.error || "Failed to update block status"
                      }</h1>`
                    );
                  }
                } catch (err) {
                  console.error("Block/unblock error:", err);
                  toastQueue.add(`<h1>Network error. Please try again.</h1>`);
                }
              },
            };

            items.push(blockItem);
          }

          createPopup({
            triggerElement: triggerEl,
            items,
          });
        } catch (err) {
          console.error("Error building profile dropdown:", err);
          createPopup({
            triggerElement: triggerEl,
            items: [
              {
                title: "Copy link",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,

                action: () => {
                  const profileUrl = `${location.origin}/@${currentUsername}`;

                  navigator.clipboard.writeText(profileUrl);
                },
              },
            ],
          });
        }
      })
      .catch((err) => {
        console.error("Error fetching current user for dropdown:", err);
        createPopup({
          triggerElement: triggerEl,
          items: [
            {
              title: "Copy link",
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,

              action: () => {
                const profileUrl = `${location.origin}/@${currentUsername}`;

                navigator.clipboard.writeText(profileUrl);
              },
            },
          ],
        });
      });
  });

document.getElementById("editProfileModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

addRoute(
  (pathname) => pathname.startsWith("/@") && pathname.length > 2,
  (pathname) => {
    const username = pathname.substring(2);
    openProfile(username);
  }
);

async function showFollowersList(username, type) {
  try {
    const endpoint = `/profile/${username}/${type}`;
    const { error, followers, following } = await query(endpoint, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (error) {
      toastQueue.add(
        `<h1>Error loading ${type}</h1><p>${escapeHTML(error)}</p>`
      );
      return;
    }

    const users = type === "followers" ? followers : following;
    const title = type === "followers" ? "Followers" : "Following";

    const followersList = document.createElement("div");
    followersList.className = "followers-list";

    if (users.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-followers";
      emptyDiv.textContent = `No ${type} yet`;
      followersList.appendChild(emptyDiv);
    } else {
      users.forEach((user) => {
        const followerItem = document.createElement("div");
        followerItem.className = "follower-item";
        followerItem.dataset.username = user.username;

        const avatar = document.createElement("img");
        avatar.src = user.avatar || "/avatars/default.png";
        avatar.alt = user.name;
        avatar.className = "follower-avatar";
        const radius =
          user.avatar_radius !== null && user.avatar_radius !== undefined
            ? `${user.avatar_radius}px`
            : user.gold
            ? `4px`
            : `50px`;
        avatar.style.borderRadius = radius;

        const followerInfo = document.createElement("div");
        followerInfo.className = "follower-info";

        const followerName = document.createElement("div");
        followerName.className = "follower-name";
        followerName.textContent = user.name;

        const followerUsername = document.createElement("div");
        followerUsername.className = "follower-username";
        followerUsername.textContent = `@${user.username}`;

        followerInfo.appendChild(followerName);
        followerInfo.appendChild(followerUsername);

        if (user.bio) {
          const followerBio = document.createElement("div");
          followerBio.className = "follower-bio";
          followerBio.textContent = user.bio;
          followerInfo.appendChild(followerBio);
        }

        followerItem.appendChild(avatar);
        followerItem.appendChild(followerInfo);

        followerItem.addEventListener("click", () => {
          modal.close();
          openProfile(user.username);
        });

        followersList.appendChild(followerItem);
      });
    }

    const modalContent = document.createElement("div");
    modalContent.className = "followers-modal";
    modalContent.appendChild(followersList);

    const modal = createModal({
      title,
      content: modalContent,
      className: "modal-overlay",
    });
  } catch (error) {
    console.error("Error loading followers:", error);
    toastQueue.add(`<h1>Error loading ${type}</h1><p>Please try again</p>`);
  }
}

export { openProfile };
