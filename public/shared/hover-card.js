import query from "../timeline/js/api.js";
import {
	applyAvatarOutline,
	createVerificationBadge,
} from "./badge-utils.js";

let activeHoverCard = null;
let hoverTimeout = null;
let isMouseInCard = false;

function formatFollowerCount(count) {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}M`;
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(1)}K`;
	}
	return count.toString();
}

function avatarPxToPercent(px) {
	const n = Number(px) || 0;
	const pct = (n / 100) * 100;
	return `${Math.max(0, Math.min(100, pct))}%`;
}

export function attachHoverCard(element, username) {
	let isMouseInTrigger = false;

	element.addEventListener("mouseenter", () => {
		isMouseInTrigger = true;
		if (hoverTimeout) clearTimeout(hoverTimeout);

		hoverTimeout = setTimeout(async () => {
			if (!isMouseInTrigger) return;

			if (activeHoverCard) {
				activeHoverCard.remove();
				activeHoverCard = null;
			}

			try {
				const userData = await query(`/profile/@${username}`);
				if (!userData || userData.error || !isMouseInTrigger) return;

				const user = userData.user;
				const card = document.createElement("div");
				card.className = "hover-card";

				const avatarRadiusValue = user.avatar_radius
					? avatarPxToPercent(user.avatar_radius)
					: user.gold || user.gray
						? "4px"
						: "50%";

				const avatar = document.createElement("img");
				avatar.src = user.avatar || "/public/shared/assets/default-avatar.svg";
				avatar.alt = user.name || user.username;
				avatar.className = "hover-card-avatar";
				avatar.style.borderRadius = avatarRadiusValue;

				if (user.gray) {
					applyAvatarOutline(
						avatar,
						user.avatar_outline || "",
						avatarRadiusValue,
						3,
					);
				}

				const header = document.createElement("div");
				header.className = "hover-card-header";
				header.appendChild(avatar);

				const nameContainer = document.createElement("div");
				nameContainer.className = "hover-card-name-container";

				const name = document.createElement("div");
				name.className = "hover-card-name";
				name.textContent = user.name || user.username;

				if (user.gold) {
					const badge = createVerificationBadge({ type: "gold" });
					name.appendChild(badge);
				} else if (user.gray) {
					const badge = createVerificationBadge({
						type: "gray",
						checkmarkOutline: user.checkmark_outline || "",
					});
					name.appendChild(badge);
				} else if (user.verified) {
					const badge = createVerificationBadge({ type: "verified" });
					name.appendChild(badge);
				}

				const usernameEl = document.createElement("div");
				usernameEl.className = "hover-card-username";
				usernameEl.textContent = `@${user.username}`;

				nameContainer.appendChild(name);
				nameContainer.appendChild(usernameEl);
				header.appendChild(nameContainer);

				if (user.bio) {
					const bio = document.createElement("div");
					bio.className = "hover-card-bio";
					bio.textContent = user.bio;
					card.appendChild(header);
					card.appendChild(bio);
				} else {
					card.appendChild(header);
				}

				const stats = document.createElement("div");
				stats.className = "hover-card-stats";

				const following = document.createElement("div");
				following.className = "hover-card-stat";
				following.innerHTML = `<strong>${formatFollowerCount(user.following_count || 0)}</strong> Following`;

				const followers = document.createElement("div");
				followers.className = "hover-card-stat";
				followers.innerHTML = `<strong>${formatFollowerCount(user.followers_count || 0)}</strong> Followers`;

				stats.appendChild(following);
				stats.appendChild(followers);
				card.appendChild(stats);

				document.body.appendChild(card);
				activeHoverCard = card;

				const rect = element.getBoundingClientRect();
				const cardRect = card.getBoundingClientRect();

				let left = rect.left + rect.width / 2 - cardRect.width / 2;
				let top = rect.bottom + 8;

				if (left < 12) left = 12;
				if (left + cardRect.width > window.innerWidth - 12) {
					left = window.innerWidth - cardRect.width - 12;
				}

				if (top + cardRect.height > window.innerHeight - 12) {
					top = rect.top - cardRect.height - 8;
				}

				card.style.left = `${left}px`;
				card.style.top = `${top}px`;

				requestAnimationFrame(() => {
					card.classList.add("visible");
				});

				card.addEventListener("mouseenter", () => {
					isMouseInCard = true;
				});

				card.addEventListener("mouseleave", () => {
					isMouseInCard = false;
					if (hoverTimeout) clearTimeout(hoverTimeout);
					hoverTimeout = setTimeout(() => {
						if (!isMouseInCard && !isMouseInTrigger && activeHoverCard) {
							activeHoverCard.classList.remove("visible");
							setTimeout(() => {
								if (activeHoverCard) {
									activeHoverCard.remove();
									activeHoverCard = null;
								}
							}, 150);
						}
					}, 200);
				});

				card.addEventListener("click", () => {
					import("../timeline/js/profile.js").then(
						({ default: openProfile }) => {
							openProfile(user.username);
							if (activeHoverCard) {
								activeHoverCard.remove();
								activeHoverCard = null;
							}
						},
					);
				});
			} catch (error) {
				console.error("Error loading hover card:", error);
			}
		}, 600);
	});

	element.addEventListener("mouseleave", () => {
		isMouseInTrigger = false;
		if (hoverTimeout) clearTimeout(hoverTimeout);

		hoverTimeout = setTimeout(() => {
			if (!isMouseInCard && !isMouseInTrigger && activeHoverCard) {
				activeHoverCard.classList.remove("visible");
				setTimeout(() => {
					if (activeHoverCard) {
						activeHoverCard.remove();
						activeHoverCard = null;
					}
				}, 150);
			}
		}, 200);
	});
}
