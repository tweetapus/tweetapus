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

  const uniqueUsernames = [...new Set(posts.map((post) => post.username))];

  const profileCache = {};
  await Promise.all(
    uniqueUsernames.map(async (username) => {
      if (username === currentUsername && currentProfile) {
        profileCache[username] = currentProfile.profile;
      } else {
        const { error, profile } = await query(`/profile/${username}`);

        if (error) {
          if (error === "User is suspended") {
            profileCache[username] = null;
            return;
          }
          toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
          return;
        }

        profileCache[username] = profile;
      }
    })
  );

  for (const post of posts) {
    const authorProfile = profileCache[post.username];

    if (!authorProfile) {
      if (post.content_type === "retweet") {
        continue;
      }
    }

    const transformedPost = {
      id: post.id,
      content: post.content,
      created_at: post.created_at,
      like_count: post.like_count || 0,
      reply_count: post.reply_count || 0,
      retweet_count: post.retweet_count || 0,
      liked_by_user: post.liked_by_user || false,
      retweeted_by_user: post.retweeted_by_user || false,
      source: post.source,
      poll: post.poll,
      quoted_tweet: post.quoted_tweet,
      attachments: post.attachments,
      author: {
        username: post.username,
        name: authorProfile?.name || post.username,
        avatar: authorProfile?.avatar,
        avatar_radius: authorProfile?.avatar_radius ?? null,
        verified: authorProfile?.verified || false,
        gold: authorProfile?.gold || false,
      },
    };

    const tweetElement = createTweetElement(transformedPost, {
      clickToOpen: true,
    });

    // Add retweet indicator if this is a retweet
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

  document.getElementById("profileHeaderName").textContent =
    profile.name || profile.username;
  document.getElementById("profileHeaderPostCount").textContent = `${
    profile.post_count || 0
  } posts`;

  const bannerElement = document.querySelector(".profile-banner");
  if (profile.banner) {
    bannerElement.style.backgroundImage = `url(${profile.banner})`;
    bannerElement.style.backgroundSize = "cover";
    bannerElement.style.backgroundPosition = "center";
    bannerElement.style.backgroundRepeat = "no-repeat";
  } else {
    bannerElement.style.backgroundImage = "none";
    bannerElement.style.backgroundColor = "var(--bg-secondary)";
  }

  const avatarImg = document.getElementById("profileAvatar");
  avatarImg.src = profile.avatar || `/public/shared/default-avatar.png`;
  avatarImg.alt = profile.name || profile.username;
  if (profile.avatar_radius !== null && profile.avatar_radius !== undefined) {
    avatarImg.style.borderRadius = `${profile.avatar_radius}px`;
  } else if (profile.gold) {
    avatarImg.style.borderRadius = "4px";
  } else {
    avatarImg.style.borderRadius = "50px";
  }

  const profileNameEl = document.getElementById("profileDisplayName");
  profileNameEl.textContent = profile.name || profile.username;

  if (profile.verified || profile.gold) {
    const existingBadge = profileNameEl.querySelector(".verification-badge");

    if (!existingBadge) {
      const verificationBadge = document.createElement("span");
      verificationBadge.className = "verification-badge";
      const badgeColor = profile.gold ? "#D4AF37" : "#1185FE";
      verificationBadge.innerHTML = `
				<svg
					width="20"
					height="20"
					viewBox="0 0 16 16"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					title="Verified Account"
				>
					<path
						d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z"
						fill="${badgeColor}"
					/>
					<path
						d="M6 8.00002L7.33333 9.33335L10 6.66669"
						stroke="white"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			`;
      profileNameEl.appendChild(verificationBadge);
    } else {
      const badgeColor = profile.gold ? "#D4AF37" : "#1185FE";
      const pathElement = existingBadge.querySelector("path");
      if (pathElement) {
        pathElement.setAttribute("fill", badgeColor);
      }
    }
  } else {
    const existingBadge = profileNameEl.querySelector(".verification-badge");
    if (existingBadge) {
      existingBadge.remove();
    }
  }

  const usernameEl = document.getElementById("profileUsername");
  usernameEl.textContent = `@${profile.username}`;

  if (profile.label_type) {
    const labelEl = document.createElement("span");
    labelEl.className = `profile-label label-${profile.label_type}`;
    const labelText =
      profile.label_type.charAt(0).toUpperCase() + profile.label_type.slice(1);
    labelEl.textContent = labelText;
    usernameEl.appendChild(labelEl);
  }

  if (profile.label_automated) {
    const automatedEl = document.createElement("span");
    automatedEl.className = "profile-label label-automated";
    automatedEl.textContent = "Automated";
    usernameEl.appendChild(automatedEl);
  }

  // expose current profile username on the container for other modules
  const profileContainerEl2 = document.getElementById("profileContainer");
  if (profileContainerEl2)
    profileContainerEl2.dataset.profileUsername = profile.username;

  // show blocked banner if this profile has blocked the current viewer
  const blockedBanner = document.getElementById("profileBlockedBanner");
  if (blockedBanner) {
    if (profile.blockedByProfile) {
      blockedBanner.style.display = "flex";
      profileContainerEl2.dataset.blockedByProfile = "true";
    } else {
      blockedBanner.style.display = "none";
      if (profileContainerEl2)
        delete profileContainerEl2.dataset.blockedByProfile;
    }
  }

  if (currentProfile.followsMe && !isOwnProfile) {
    const followsBadge = document.createElement("span");
    followsBadge.className = "follows-me-badge";
    followsBadge.textContent = "Follows you";
    followsBadge.style.cssText =
      "margin-left: 8px; padding: 2px 8px; background: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-radius: 4px; font-size: 12px; font-weight: 500;";
    usernameEl.appendChild(followsBadge);
  }

  document.getElementById("profilePronouns").textContent =
    profile.pronouns || "";
  document.getElementById("profilePronouns").style.display = profile.pronouns
    ? "block"
    : "none";
  document.getElementById("profileBio").textContent = profile.bio || "";
  document.getElementById("profileBio").style.display = profile.bio
    ? "block"
    : "none";
  document.getElementById("profileFollowingCount").textContent =
    profile.following_count || 0;
  document.getElementById("profileFollowerCount").textContent =
    profile.follower_count || 0;

  document.getElementById("profileFollowersLink").onclick = () => {
    showFollowersList(profile.username, "followers");
  };
  document.getElementById("profileFollowingLink").onclick = () => {
    showFollowersList(profile.username, "following");
  };

  const meta = [];
  if (profile.location)
    meta.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-icon lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg> ${escapeHTML(
        profile.location
      )}`
    );
  if (profile.website) {
    const url = profile.website.startsWith("http")
      ? profile.website
      : `https://${profile.website}`;
    meta.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-icon lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> <a href="${escapeHTML(
        url
      )}" target="_blank" rel="noopener noreferrer">${escapeHTML(
        profile.website
      )}</a>`
    );
  }
  meta.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-icon lucide-calendar"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg> Joined ${new Date(
      profile.created_at
    ).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })}`
  );

  document.getElementById("profileMeta").innerHTML = meta
    .map((item) => `<div class="profile-meta-item">${item}</div>`)
    .join("");

  if (isOwnProfile) {
    document.getElementById("editProfileBtn").style.display = "block";
    document.getElementById("followBtn").style.display = "none";
    document.getElementById("profileDmBtn").style.display = "none";
    document.getElementById("profileDropdown").style.display = "none";
  } else if (authToken) {
    document.getElementById("editProfileBtn").style.display = "none";
    document.getElementById("followBtn").style.display = "block";
    document.getElementById("profileDmBtn").style.display = "flex";
    document.getElementById("profileDropdown").style.display = "block";
    updateFollowButton(isFollowing);
    setupDmButton(profile.username);

    // If profile has blocked the current viewer, disable DM button and annotate it
    try {
      const dmBtn = document.getElementById("profileDmBtn");
      const pc = document.getElementById("profileContainer");
      const isBlocked = pc?.dataset?.blockedByProfile === "true";
      if (dmBtn) {
        if (isBlocked) {
          dmBtn.disabled = true;
          dmBtn.setAttribute("aria-disabled", "true");
          dmBtn.classList.add("blocked-interaction");
          dmBtn.title = "You have been blocked by this user";
        } else {
          dmBtn.disabled = false;
          dmBtn.removeAttribute("aria-disabled");
          dmBtn.classList.remove("blocked-interaction");
          dmBtn.title = "";
        }
      }
    } catch (_) {}
  } else {
    document.getElementById("profileDmBtn").style.display = "flex";
    document.getElementById("profileDropdown").style.display = "none";
  }

  currentPosts = posts;
  currentReplies = [];

  document
    .querySelectorAll(".profile-tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelector('.profile-tab-btn[data-tab="posts"]')
    .classList.add("active");

  renderPosts(posts);
  document.getElementById("profileContainer").style.display = "block";
};

const updateFollowButton = (isFollowing) => {
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
};

// Dismiss blocked banner
document
  .getElementById("profileBlockedBannerDismiss")
  ?.addEventListener("click", () => {
    const b = document.getElementById("profileBlockedBanner");
    if (b) b.style.display = "none";
  });

const setupDmButton = (username) => {
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
};

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
    // Convert to WebP and resize to 1500x500 for banner
    const webpFile = await convertToWebPBanner(file, 1500, 500, 0.8);

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
      uploadFile = file; // preserve animation for gold accounts
    } else {
      // Convert to WebP and resize to 250x250 for non-GIF or non-gold
      const webpFile = await convertToWebPAvatar(file, 250, 0.8);
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
          loadProfile(currentProfile.profile.username);
        }
      } else {
        loadProfile(currentProfile.profile.username);
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

const loadProfile = async (username) => {
  openProfile(username);
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
            triggerElement: e.currentTarget,
            items,
          });
        } catch (err) {
          console.error("Error building profile dropdown:", err);
          createPopup({
            triggerElement: e.currentTarget,
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
          triggerElement: e.currentTarget,
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

export { loadProfile };
