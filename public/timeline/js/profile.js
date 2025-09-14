import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

let currentProfile = null;
let currentPosts = [];
let currentReplies = [];
let currentUsername = null;

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
				toastQueue.add(`<h1>${escapeHtml(data.error)}</h1>`);
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
					toastQueue.add(`<h1>${escapeHtml(error)}</h1>`);
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
			author: {
				username: post.username,
				name: authorProfile?.name || post.username,
				avatar: authorProfile?.avatar,
				verified: authorProfile?.verified || false,
			},
		};

		const tweetElement = createTweetElement(transformedPost);
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
				toastQueue.add(`<h1>${escapeHtml(error)}</h1>`);
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

	const meta = [];
	if (profile.location) meta.push(`📍 ${escapeHtml(profile.location)}`);
	if (profile.website) {
		const url = profile.website.startsWith("http")
			? profile.website
			: `https://${profile.website}`;
		meta.push(
			`🔗 <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(profile.website)}</a>`,
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

const saveProfile = async (event) => {
	event.preventDefault();

	if (!authToken) {
		switchPage("timeline", { path: "/" });
		return;
	}

	const formData = {
		display_name: document.getElementById("editDisplayName").value.trim(),
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

export { loadProfile };
