import {
	convertToWebPAvatar,
	convertToWebPBanner,
	isConvertibleImage,
} from "../../shared/image-utils.js";
import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
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
			const data = await (
				await fetch(`/api/profile/${username}`, {
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				})
			).json();

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
					message: "When they post something, it'll show up here.",
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
				const { error, profile } = await (
					await fetch(`/api/profile/${username}`, {
						headers: {
							Authorization: `Bearer ${authToken}`,
						},
					})
				).json();

				if (error) {
					toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
					return;
				}

				profileCache[username] = profile;
			}
		}),
	);

	for (const post of posts) {
		const authorProfile = profileCache[post.username];

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
				verified: authorProfile?.verified || false,
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
				<span>${currentProfile?.profile?.name || currentProfile?.profile?.username} retweeted</span>
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

			let { error, replies } = await (
				await fetch(`/api/profile/${currentUsername}/replies`, {
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				})
			).json();

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
	console.log("data", data);
	const { profile, posts, isFollowing, isOwnProfile } = data;

	document.getElementById("profileHeaderName").textContent =
		profile.name || profile.username;
	document.getElementById("profileHeaderPostCount").textContent = `${
		profile.post_count || 0
	} posts`;

	// Update banner
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
	avatarImg.src = profile.avatar || `https://unavatar.io/${profile.username}`;
	avatarImg.alt = profile.name || profile.username;

	document.getElementById("profileDisplayName").textContent =
		profile.name || profile.username;
	document.getElementById("profileUsername").textContent =
		`@${profile.username}`;
	document.getElementById("profileBio").textContent = profile.bio || "";
	document.getElementById("profileBio").style.display = profile.bio
		? "block"
		: "none";
	document.getElementById("profileFollowingCount").textContent =
		profile.following_count || 0;
	document.getElementById("profileFollowerCount").textContent =
		profile.follower_count || 0;

	// Add click handlers for followers/following links
	document.getElementById("profileFollowersLink").onclick = () => {
		showFollowersList(profile.username, "followers");
	};
	document.getElementById("profileFollowingLink").onclick = () => {
		showFollowersList(profile.username, "following");
	};

	const meta = [];
	if (profile.location) meta.push(`📍 ${escapeHTML(profile.location)}`);
	if (profile.website) {
		const url = profile.website.startsWith("http")
			? profile.website
			: `https://${profile.website}`;
		meta.push(
			`🔗 <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(profile.website)}</a>`,
		);
	}
	meta.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-icon lucide-calendar"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg> Joined ${new Date(
			profile.created_at,
		).toLocaleDateString("en-US", {
			month: "long",
			year: "numeric",
		})}`,
	);

	document.getElementById("profileMeta").innerHTML = meta
		.map((item) => `<div class="profile-meta-item">${item}</div>`)
		.join("");

	if (isOwnProfile) {
		document.getElementById("editProfileBtn").style.display = "block";
		document.getElementById("followBtn").style.display = "none";
	} else if (authToken) {
		document.getElementById("editProfileBtn").style.display = "none";
		document.getElementById("followBtn").style.display = "block";
		updateFollowButton(isFollowing);
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

			const { success } = await (
				await fetch(`/api/profile/${currentUsername}/follow`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${authToken}` },
				})
			).json();

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

			const { success } = await (
				await fetch(`/api/profile/${currentUsername}/follow`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				})
			).json();

			if (!success) {
				return toastQueue.add(`<h1>Failed to follow user</h1>`);
			}
			updateFollowButton(true);
			const count = document.getElementById("profileFollowerCount");
			count.textContent = parseInt(count.textContent) + 1;
		};
	}
};

const showEditModal = () => {
	if (!currentProfile) return;

	const { profile } = currentProfile;
	document.getElementById("editDisplayName").value = profile.name || "";
	document.getElementById("editBio").value = profile.bio || "";
	document.getElementById("editLocation").value = profile.location || "";
	document.getElementById("editWebsite").value = profile.website || "";

	// Update avatar display
	updateEditAvatarDisplay();

	// Update banner display
	updateEditBannerDisplay();

	updateCharCounts();
	document.getElementById("editProfileModal").classList.add("show");
};

const closeEditModal = () => {
	document.getElementById("editProfileModal").classList.remove("show");
};

const updateCharCounts = () => {
	const fields = [
		{ id: "editDisplayName", countId: "displayNameCount" },
		{ id: "editBio", countId: "bioCount" },
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
			`<h1>File too large</h1><p>Please choose an image smaller than 10MB.</p>`,
		);
		return;
	}

	// Check if it's a convertible image format
	if (!isConvertibleImage(file)) {
		toastQueue.add(
			`<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`,
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

		const response = await fetch(
			`/api/profile/${currentProfile.profile.username}/banner`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
				body: formData,
			},
		);

		const result = await response.json();

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
				`<h1>Banner updated!</h1><p>Your profile banner has been uploaded and changed.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Upload failed</h1><p>${result.error || "Failed to upload banner"}</p>`,
			);
		}
	} catch (error) {
		console.error("Banner upload error:", error);
		toastQueue.add(
			`<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`,
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
		const response = await fetch(
			`/api/profile/${currentProfile.profile.username}/banner`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			},
		);

		const result = await response.json();

		if (result.success) {
			currentProfile.profile.banner = null;
			updateEditBannerDisplay();
			// Also update the main profile display
			const profileBanner = document.querySelector(".profile-banner");
			if (profileBanner) {
				profileBanner.style.backgroundImage = "none";
				profileBanner.style.backgroundColor = "var(--bg-secondary)";
			}
			toastQueue.add(
				`<h1>Banner removed</h1><p>Your profile banner has been reset to default.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Failed to remove banner</h1><p>${result.error || "An error occurred"}</p>`,
			);
		}
	} catch (error) {
		console.error("Banner removal error:", error);
		toastQueue.add(
			`<h1>Network error</h1><p>Failed to remove banner. Please try again.</p>`,
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

	if (avatarImg) {
		const avatarSrc =
			profile.avatar || `https://unavatar.io/${profile.username}`;
		avatarImg.src = avatarSrc;
		avatarImg.alt = profile.name || profile.username;
	}

	if (removeBtn) {
		removeBtn.style.display = profile.avatar ? "inline-block" : "none";
	}
};

const handleEditAvatarUpload = async (file) => {
	if (!file) return;

	// Validate file size (5MB max for input)
	if (file.size > 5 * 1024 * 1024) {
		toastQueue.add(
			`<h1>File too large</h1><p>Please choose an image smaller than 5MB.</p>`,
		);
		return;
	}

	// Check if it's a convertible image format
	if (!isConvertibleImage(file)) {
		toastQueue.add(
			`<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`,
		);
		return;
	}

	const changeBtn = document.getElementById("edit-change-avatar");
	if (changeBtn) {
		changeBtn.disabled = true;
		changeBtn.textContent = "Processing...";
	}

	try {
		// Convert to WebP and resize to 250x250
		const webpFile = await convertToWebPAvatar(file, 250, 0.8);

		// Update progress text
		if (changeBtn) {
			changeBtn.textContent = "Uploading...";
		}

		const formData = new FormData();
		formData.append("avatar", webpFile);

		const response = await fetch(
			`/api/profile/${currentProfile.profile.username}/avatar`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
				body: formData,
			},
		);

		const result = await response.json();

		if (result.success) {
			currentProfile.profile.avatar = result.avatar;
			updateEditAvatarDisplay();
			// Also update the main profile display
			const profileAvatar = document.getElementById("profileAvatar");
			if (profileAvatar) {
				profileAvatar.src = result.avatar;
			}
			toastQueue.add(
				`<h1>Avatar updated!</h1><p>Your profile picture has been uploaded and changed.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Upload failed</h1><p>${result.error || "Failed to upload avatar"}</p>`,
			);
		}
	} catch (error) {
		console.error("Avatar upload error:", error);
		toastQueue.add(
			`<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`,
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
		const response = await fetch(
			`/api/profile/${currentProfile.profile.username}/avatar`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			},
		);

		const result = await response.json();

		if (result.success) {
			currentProfile.profile.avatar = null;
			updateEditAvatarDisplay();
			// Also update the main profile display
			const profileAvatar = document.getElementById("profileAvatar");
			if (profileAvatar) {
				profileAvatar.src = `https://unavatar.io/${currentProfile.profile.username}`;
			}
			toastQueue.add(
				`<h1>Avatar removed</h1><p>Your profile picture has been reset to default.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Failed to remove avatar</h1><p>${result.error || "An error occurred"}</p>`,
			);
		}
	} catch (error) {
		console.error("Avatar removal error:", error);
		toastQueue.add(
			`<h1>Network error</h1><p>Failed to remove avatar. Please try again.</p>`,
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

	if (!authToken) {
		switchPage("timeline", { path: "/" });
		return;
	}

	const formData = {
		name: document.getElementById("editDisplayName").value.trim(),
		bio: document.getElementById("editBio").value.trim(),
		location: document.getElementById("editLocation").value.trim(),
		website: document.getElementById("editWebsite").value.trim(),
	};

	try {
		const response = await fetch(`/api/profile/${currentUsername}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${authToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(formData),
		});

		const data = await response.json();
		if (data.success) {
			closeEditModal();
			loadProfile(currentUsername);
		} else {
			alert(data.error || "Failed to update profile");
		}
	} catch {
		alert("Failed to update profile");
	}
};

const loadProfile = async (username) => {
	openProfile(username);
};

document.querySelector(".back-button").addEventListener("click", () => {
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

["editDisplayName", "editBio", "editLocation", "editWebsite"].forEach((id) => {
	const element = document.getElementById(id);
	if (element) {
		element.addEventListener("input", updateCharCounts);
	}
});

// Avatar upload event listeners
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

document.getElementById("editProfileModal").addEventListener("click", (e) => {
	if (e.target === e.currentTarget) closeEditModal();
});

addRoute(
	(pathname) => pathname.startsWith("/@") && pathname.length > 2,
	(pathname) => {
		const username = pathname.substring(2);
		openProfile(username);
	},
);

async function showFollowersList(username, type) {
	try {
		const endpoint = `/api/profile/${username}/${type}`;
		const { error, followers, following } = await (
			await fetch(endpoint, {
				headers: { Authorization: `Bearer ${authToken}` },
			})
		).json();

		if (error) {
			toastQueue.add(
				`<h1>Error loading ${type}</h1><p>${escapeHTML(error)}</p>`,
			);
			return;
		}

		const users = type === "followers" ? followers : following;
		const title = type === "followers" ? "Followers" : "Following";

		// Create modal content
		const modalContent = `
			<div class="followers-modal">
				<div class="followers-modal-header">
					<h2>${title}</h2>
					<button class="close-btn" onclick="this.closest('.followers-modal').style.display='none'">&times;</button>
				</div>
				<div class="followers-list">
					${
						users.length === 0
							? `<div class="empty-followers">No ${type} yet</div>`
							: users
									.map(
										(user) => `
							<div class="follower-item" data-username="${escapeHTML(user.username)}">
								<img src="${user.avatar || "/api/avatars/default.png"}" alt="${escapeHTML(user.name)}" class="follower-avatar">
								<div class="follower-info">
									<div class="follower-name">${escapeHTML(user.name)}</div>
									<div class="follower-username">@${escapeHTML(user.username)}</div>
									${user.bio ? `<div class="follower-bio">${escapeHTML(user.bio)}</div>` : ""}
								</div>
							</div>
						`,
									)
									.join("")
					}
				</div>
			</div>
		`;

		// Show modal
		const modal = document.createElement("div");
		modal.className = "modal-overlay";
		modal.innerHTML = modalContent;
		modal.onclick = (e) => {
			if (e.target === modal) modal.remove();
		};

		document.body.appendChild(modal);

		// Add click handlers to follower items
		modal.querySelectorAll(".follower-item").forEach((item) => {
			item.onclick = () => {
				const username = item.dataset.username;
				modal.remove();
				openProfile(username);
			};
		});
	} catch (error) {
		console.error("Error loading followers:", error);
		toastQueue.add(`<h1>Error loading ${type}</h1><p>Please try again</p>`);
	}
}

export { loadProfile };
