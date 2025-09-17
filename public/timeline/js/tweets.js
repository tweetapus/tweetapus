import DOMPurify from "https://esm.sh/dompurify@2.4.0";
import { marked } from "https://esm.sh/marked@16.3.0";
import confetti from "../../shared/confetti.js";
import createPopup from "../../shared/popup.js";
import toastQueue from "../../shared/toasts.js";
import getUser, { authToken } from "./auth.js";
import openTweet from "./tweet.js";

async function checkReplyPermissions(tweet, replyRestriction) {
	try {
		const response = await fetch(`/api/tweets/can-reply/${tweet.id}`, {
			headers: {
				Authorization: `Bearer ${authToken}`,
			},
		});

		if (!response.ok) {
			return {
				canReply: false,
				restrictionText: "Unable to check reply permissions",
			};
		}

		const data = await response.json();

		let restrictionText = "";
		switch (replyRestriction) {
			case "following":
				restrictionText = `Only people @${tweet.author.username} follows can reply`;
				break;
			case "followers":
				restrictionText = `Only people who follow @${tweet.author.username} can reply`;
				break;
			case "verified":
				restrictionText = "Only verified users can reply";
				break;
			default:
				restrictionText = data.canReply
					? "You can reply"
					: "You cannot reply to this tweet";
		}

		return { canReply: data.canReply, restrictionText };
	} catch (error) {
		console.error("Error checking reply permissions:", error);
		return {
			canReply: false,
			restrictionText: "Error checking reply permissions",
		};
	}
}

async function showInteractionUsers(tweetId, interaction, title) {
	try {
		const response = await fetch(`/api/tweets/${tweetId}/${interaction}`, {
			headers: { Authorization: `Bearer ${authToken}` },
		});

		const data = await response.json();

		if (data.error) {
			toastQueue.add(`<h1>Error</h1><p>${data.error}</p>`);
			return;
		}

		if (!data.users || data.users.length === 0) {
			toastQueue.add(
				`<h1>No ${title.toLowerCase()}</h1><p>This tweet hasn't been ${interaction.slice(0, -1)}ed by anyone yet.</p>`,
			);
			return;
		}

		// Create modal
		const overlay = document.createElement("div");
		overlay.className = "composer-overlay";

		const modal = document.createElement("div");
		modal.className = "modal interactions-modal";

		const closeButton = document.createElement("button");
		closeButton.className = "modal-close";
		closeButton.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		`;

		closeButton.addEventListener("click", () => overlay.remove());

		const modalHeader = document.createElement("div");
		modalHeader.className = "modal-header";
		modalHeader.innerHTML = `<h2>${title}</h2>`;

		const usersList = document.createElement("div");
		usersList.className = "users-list";

		data.users.forEach((user) => {
			const userItem = document.createElement("div");
			userItem.className = "user-item";

			const timeText =
				interaction === "quotes"
					? `quoted ${formatInteractionTime(new Date(user.quoted_at))}`
					: interaction === "likes"
						? `liked ${formatInteractionTime(new Date(user.liked_at))}`
						: `retweeted ${formatInteractionTime(new Date(user.retweeted_at))}`;

			userItem.innerHTML = `
				<div class="user-avatar">
					<img src="${user.avatar || "/public/shared/default-avatar.png"}" alt="${user.name || user.username}" />
				</div>
				<div class="user-info">
					<div class="user-name">${user.name || user.username}</div>
					<div class="user-username">@${user.username}</div>
					<div class="user-time">${timeText}</div>
				</div>
			`;

			userItem.addEventListener("click", async () => {
				overlay.remove();
				const { default: openProfile } = await import("./profile.js");
				openProfile(user.username);
			});

			usersList.appendChild(userItem);
		});

		modal.appendChild(closeButton);
		modal.appendChild(modalHeader);
		modal.appendChild(usersList);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
	} catch (error) {
		console.error("Error fetching interaction users:", error);
		toastQueue.add(
			`<h1>Network Error</h1><p>Failed to load ${title.toLowerCase()}.</p>`,
		);
	}
}

function formatInteractionTime(date) {
	const now = new Date();
	const diff = now - date;
	const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (daysDiff === 0) {
		const hoursDiff = Math.floor(diff / (1000 * 60 * 60));
		if (hoursDiff === 0) {
			const minutesDiff = Math.floor(diff / (1000 * 60));
			return minutesDiff <= 1 ? "now" : `${minutesDiff}m ago`;
		}
		return `${hoursDiff}h ago`;
	} else if (daysDiff === 1) {
		return "yesterday";
	} else if (daysDiff < 7) {
		return `${daysDiff}d ago`;
	} else {
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}
}

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
	if (!data.allowedTags[data.tagName]) {
		const textNode = document.createTextNode(node.outerHTML);
		node.parentNode.replaceChild(textNode, node);
	}
});

const linkifyText = (text) => {
	const mentionRegex = /@([a-zA-Z0-9_]+)/g;

	const html = marked.parse(text.trim(), {
		breaks: true,
		gfm: true,
		html: false,
		headerIds: false,
		mangle: false,
	});

	const el = document.createElement("div");

	el.innerHTML = DOMPurify.sanitize(
		html.replace(
			mentionRegex,
			'<a href="javascript:" class="tweet-mention" data-username="$1">@$1</a>',
		),
		{
			ALLOWED_TAGS: [
				"b",
				"i",
				"u",
				"s",
				"a",
				"p",
				"br",
				"marquee",
				"strong",
				"em",
				"code",
				"pre",
				"blockquote",
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6",
				"ul",
				"ol",
				"li",
				"span",
				"big",
			],
			ALLOWED_ATTR: ["href", "target", "rel", "class"],
		},
	);

	el.querySelectorAll("a").forEach((a) => {
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noopener noreferrer");
	});

	return el.innerHTML;
};

const timeAgo = (date) => {
	const now = new Date();
	let dateObj;

	if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+")) {
		dateObj = new Date(`${date}Z`);
	} else {
		dateObj = new Date(date);
	}

	const seconds = Math.floor((now - dateObj) / 1000);

	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
	if (seconds < 2419200) return `${Math.floor(seconds / 604800)}w`;

	const d = dateObj.getDate().toString().padStart(2, "0");
	const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
	const y = dateObj.getFullYear().toString().slice(-2);

	if (dateObj.getFullYear() === now.getFullYear()) return `${d}/${m}`;
	return `${d}/${m}/${y}`;
};

const formatTimeRemaining = (expiresAt) => {
	const now = new Date();
	const expires = new Date(expiresAt);
	const diff = expires - now;

	if (diff <= 0) return "Ended";

	const minutes = Math.floor(diff / (1000 * 60));
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days > 0) return `${days}d left`;
	if (hours > 0) return `${hours}h left`;
	return `${minutes}m left`;
};

const createPollElement = (poll, tweet) => {
	if (!poll) return null;

	const pollEl = document.createElement("div");
	pollEl.className = "tweet-poll";

	const pollOptionsEl = document.createElement("div");
	pollOptionsEl.className = "poll-options";

	poll.options.forEach((option) => {
		const optionEl = document.createElement("div");
		optionEl.className = `poll-option ${poll.userVote === option.id ? "voted" : ""} ${poll.isExpired ? "expired" : ""}`;

		if (poll.isExpired || poll.userVote) {
			optionEl.innerHTML = `
				<div class="poll-option-bar" style="width: ${option.percentage}%"></div>
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
					<span class="poll-option-percentage">${option.percentage}%</span>
				</div>
			`;
		} else {
			optionEl.innerHTML = `
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
				</div>
			`;
			optionEl.style.cursor = "pointer";
			optionEl.addEventListener("click", () =>
				votePoll(tweet.id, option.id, pollEl),
			);
		}

		pollOptionsEl.appendChild(optionEl);
	});

	const pollMetaEl = document.createElement("div");
	pollMetaEl.className = "poll-meta";

	const pollVotesEl = document.createElement("div");
	pollVotesEl.className = "poll-votes-container";

	if (poll.voters && poll.voters.length > 0) {
		const voterAvatarsEl = document.createElement("div");
		voterAvatarsEl.className = "voter-avatars";

		poll.voters.slice(0, 3).forEach((voter, index) => {
			const avatarEl = document.createElement("img");
			avatarEl.className = "voter-avatar";
			avatarEl.src = voter.avatar || `https://unavatar.io/${voter.username}`;
			avatarEl.alt = voter.name || voter.username;
			avatarEl.title = voter.name || voter.username;
			avatarEl.style.zIndex = poll.voters.length - index;
			voterAvatarsEl.appendChild(avatarEl);
		});

		pollVotesEl.appendChild(voterAvatarsEl);
	}

	const votesTextEl = document.createElement("span");
	votesTextEl.className = "poll-votes-text";
	votesTextEl.textContent = `${poll.totalVotes} vote${poll.totalVotes !== 1 ? "s" : ""}`;
	pollVotesEl.appendChild(votesTextEl);

	const pollTimeEl = document.createElement("span");
	pollTimeEl.className = "poll-time";
	pollTimeEl.textContent = formatTimeRemaining(poll.expires_at);

	pollMetaEl.appendChild(pollVotesEl);
	pollMetaEl.appendChild(pollTimeEl);

	pollEl.appendChild(pollOptionsEl);
	pollEl.appendChild(pollMetaEl);

	return pollEl;
};

const votePoll = async (tweetId, optionId, pollElement) => {
	try {
		const response = await fetch(`/api/tweets/${tweetId}/poll/vote`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ optionId }),
		});

		const result = await response.json();

		if (result.success) {
			updatePollDisplay(pollElement, result.poll);
			toastQueue.add(`<h1>Vote recorded!</h1>`);
		} else {
			toastQueue.add(`<h1>${result.error || "Failed to vote"}</h1>`);
		}
	} catch (error) {
		console.error("Vote error:", error);
		toastQueue.add(`<h1>Network error. Please try again.</h1>`);
	}
};

const updatePollDisplay = (pollElement, poll) => {
	const optionsContainer = pollElement.querySelector(".poll-options");
	const metaContainer = pollElement.querySelector(".poll-meta");

	optionsContainer.innerHTML = "";

	poll.options.forEach((option) => {
		const optionEl = document.createElement("div");
		optionEl.className = `poll-option voted ${poll.isExpired ? "expired" : ""}`;
		optionEl.innerHTML = `
			<div class="poll-option-bar" style="width: ${option.percentage}%"></div>
			<div class="poll-option-content">
				<span class="poll-option-text">${option.option_text.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
				<span class="poll-option-percentage">${option.percentage}%</span>
			</div>
		`;

		if (option.id === poll.userVote) {
			optionEl.classList.add("user-voted");
		}

		optionsContainer.appendChild(optionEl);
	});

	metaContainer.innerHTML = "";

	const pollVotesEl = document.createElement("div");
	pollVotesEl.className = "poll-votes-container";

	if (poll.voters && poll.voters.length > 0) {
		const voterAvatarsEl = document.createElement("div");
		voterAvatarsEl.className = "voter-avatars";

		poll.voters.slice(0, 3).forEach((voter, index) => {
			const avatarEl = document.createElement("img");
			avatarEl.className = "voter-avatar";
			avatarEl.src = voter.avatar || `https://unavatar.io/${voter.username}`;
			avatarEl.alt = voter.name || voter.username;
			avatarEl.title = voter.name || voter.username;
			avatarEl.style.zIndex = poll.voters.length - index;
			voterAvatarsEl.appendChild(avatarEl);
		});

		pollVotesEl.appendChild(voterAvatarsEl);
	}

	const votesTextEl = document.createElement("span");
	votesTextEl.className = "poll-votes-text";
	votesTextEl.textContent = `${poll.totalVotes} vote${poll.totalVotes !== 1 ? "s" : ""}`;
	pollVotesEl.appendChild(votesTextEl);

	const pollTimeEl = document.createElement("span");
	pollTimeEl.className = "poll-time";
	pollTimeEl.textContent = formatTimeRemaining(poll.expires_at);

	metaContainer.appendChild(pollVotesEl);
	metaContainer.appendChild(pollTimeEl);
};

async function createExpandedStats(tweetId) {
	const statsContainer = document.createElement("div");
	statsContainer.className = "expanded-tweet-stats";

	try {
		const [likesResponse, retweetsResponse, quotesResponse] = await Promise.all(
			[
				fetch(`/api/tweets/${tweetId}/likes?limit=3`, {
					headers: { Authorization: `Bearer ${authToken}` },
				}),
				fetch(`/api/tweets/${tweetId}/retweets?limit=3`, {
					headers: { Authorization: `Bearer ${authToken}` },
				}),
				fetch(`/api/tweets/${tweetId}/quotes?limit=3`, {
					headers: { Authorization: `Bearer ${authToken}` },
				}),
			],
		);

		const [likesData, retweetsData, quotesData] = await Promise.all([
			likesResponse.json(),
			retweetsResponse.json(),
			quotesResponse.json(),
		]);

		const stats = [];

		if (likesData.users && likesData.users.length > 0) {
			stats.push({
				type: "likes",
				users: likesData.users,
			});
		}

		if (retweetsData.users && retweetsData.users.length > 0) {
			stats.push({
				type: "retweets",
				users: retweetsData.users,
			});
		}

		if (quotesData.users && quotesData.users.length > 0) {
			stats.push({
				type: "quotes",
				users: quotesData.users,
			});
		}

		stats.forEach((stat) => {
			const statElement = document.createElement("div");
			statElement.className = "tweet-stat-item";

			const avatars = stat.users
				.slice(0, 3)
				.map(
					(user) =>
						`<img src="${user.avatar || "/public/shared/default-avatar.png"}" alt="${user.name || user.username}" class="stat-avatar" />`,
				)
				.join("");

			const names = stat.users
				.slice(0, 2)
				.map((user) => user.name || user.username)
				.join(", ");
			const moreCount = stat.users.length > 2 ? stat.users.length - 2 : 0;

			statElement.innerHTML = `
				<div class="stat-avatars">${avatars}</div>
				<div class="stat-text">
					${names}${moreCount > 0 ? ` and ${moreCount} others` : ""} ${stat.type === "likes" ? "liked" : stat.type === "retweets" ? "retweeted" : "quoted"} this
				</div>
			`;

			statElement.addEventListener("click", async () => {
				const title = stat.type.charAt(0).toUpperCase() + stat.type.slice(1);
				await showInteractionUsers(tweetId, stat.type, title);
			});

			statsContainer.appendChild(statElement);
		});
	} catch (error) {
		console.error("Error loading stats:", error);
	}

	return statsContainer;
}

export const createTweetElement = (tweet, config = {}) => {
	if (!tweet || !tweet.author) {
		console.error("Invalid tweet object provided to createTweetElement");
		return document.createElement("div");
	}

	const {
		clickToOpen = true,
		showTopReply = false,
		isTopReply = false,
		size = "normal",
		showStats = false,
	} = config;

	const tweetEl = document.createElement("div");
	tweetEl.className = isTopReply ? "tweet top-reply" : "tweet";

	if (size === "preview") {
		tweetEl.classList.add("tweet-preview");
		tweetEl.classList.add("clickable");
	}

	const tweetHeaderEl = document.createElement("div");
	tweetHeaderEl.className = "tweet-header";

	const tweetHeaderAvatarEl = document.createElement("img");
	tweetHeaderAvatarEl.src =
		tweet.author.avatar || `https://unavatar.io/${tweet.author.username}`;
	tweetHeaderAvatarEl.alt = tweet.author.name || tweet.author.username;
	tweetHeaderAvatarEl.loading = "lazy";
	tweetHeaderAvatarEl.style.cursor = "pointer";
	tweetHeaderAvatarEl.addEventListener("click", (e) => {
		e.stopPropagation();
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	tweetHeaderEl.appendChild(tweetHeaderAvatarEl);

	const tweetHeaderInfoEl = document.createElement("div");
	tweetHeaderInfoEl.className = "tweet-header-info";

	const tweetHeaderNameEl = document.createElement("p");
	tweetHeaderNameEl.className = "name";
	tweetHeaderNameEl.textContent = tweet.author.name || tweet.author.username;
	tweetHeaderNameEl.style.cursor = "pointer";
	tweetHeaderNameEl.addEventListener("click", (e) => {
		e.stopPropagation();
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	if (tweet.author.verified) {
		const svgWrapper = document.createElement("div");
		tweetHeaderNameEl.appendChild(svgWrapper);

		svgWrapper.outerHTML = `
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            title="Verified Account"
          >
            <path
              d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z"
              fill="#1185FE"
            />
            <path
              d="M6 8.00002L7.33333 9.33335L10 6.66669"
              stroke="white"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>`;
	}

	const source_icons = {
		desktop_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor-icon lucide-monitor" style="margin-left:4px"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
		mobile_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-smartphone-icon lucide-smartphone" style="margin-left:4px"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
	};

	const tweetHeaderUsernameEl = document.createElement("p");
	tweetHeaderUsernameEl.className = "username";
	tweetHeaderUsernameEl.textContent = `@${tweet.author.username} · ${timeAgo(tweet.created_at)}`;
	tweetHeaderUsernameEl.style.cursor = "pointer";
	tweetHeaderUsernameEl.addEventListener("click", (e) => {
		e.stopPropagation();
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	if (tweet.source && source_icons[tweet.source]) {
		const sourceIconEl = document.createElement("span");
		sourceIconEl.innerHTML = `${source_icons[tweet.source]}`;
		tweetHeaderUsernameEl.appendChild(sourceIconEl);
	} else if (tweet.source) {
		tweetHeaderUsernameEl.textContent += ` • ${tweet.source}`;
	}

	tweetHeaderInfoEl.appendChild(tweetHeaderNameEl);
	tweetHeaderInfoEl.appendChild(tweetHeaderUsernameEl);

	tweetHeaderEl.appendChild(tweetHeaderInfoEl);

	// Add pinned indicator if tweet is pinned
	if (tweet.pinned) {
		const pinnedIndicatorEl = document.createElement("div");
		pinnedIndicatorEl.className = "pinned-indicator";
		pinnedIndicatorEl.innerHTML = `
			<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 17v5"></path>
				<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
			</svg>
			<span>Pinned</span>
		`;
		tweetEl.appendChild(pinnedIndicatorEl);
	}

	// Add delete button for user's own tweets
	getUser().then((currentUser) => {
		if (
			currentUser &&
			currentUser.id === tweet.author.id &&
			size !== "preview"
		) {
			// Pin/Unpin button
			const pinButtonEl = document.createElement("button");
			pinButtonEl.className = "tweet-pin-btn";
			pinButtonEl.innerHTML = tweet.pinned
				? `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 17v5"></path>
					<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
				</svg>
			`
				: `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 17v5"></path>
					<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
				</svg>
			`;
			pinButtonEl.title = tweet.pinned ? "Unpin tweet" : "Pin to profile";
			pinButtonEl.style.cssText = `
				position: absolute;
				right: 50px;
				top: 10px;
				background: none;
				border: none;
				color: ${tweet.pinned ? "#1da1f2" : "#777"};
				cursor: pointer;
				padding: 4px;
				border-radius: 4px;
				opacity: 0.7;
				transition: all 0.2s ease;
			`;

			pinButtonEl.addEventListener("mouseover", () => {
				pinButtonEl.style.backgroundColor = tweet.pinned
					? "#1da1f2"
					: "#1da1f2";
				pinButtonEl.style.color = "white";
				pinButtonEl.style.opacity = "1";
			});

			pinButtonEl.addEventListener("mouseout", () => {
				pinButtonEl.style.backgroundColor = "transparent";
				pinButtonEl.style.color = tweet.pinned ? "#1da1f2" : "#777";
				pinButtonEl.style.opacity = "0.7";
			});

			pinButtonEl.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();

				try {
					const method = tweet.pinned ? "DELETE" : "POST";
					const response = await fetch(
						`/api/profile/${currentUser.username}/pin/${tweet.id}`,
						{
							method,
							headers: { Authorization: `Bearer ${authToken}` },
						},
					);

					const result = await response.json();

					if (result.success) {
						tweet.pinned = !tweet.pinned;
						pinButtonEl.innerHTML = tweet.pinned
							? `
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 17v5"></path>
								<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
							</svg>
						`
							: `
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 17v5"></path>
								<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
							</svg>
						`;
						pinButtonEl.title = tweet.pinned ? "Unpin tweet" : "Pin to profile";
						pinButtonEl.style.color = tweet.pinned ? "#1da1f2" : "#777";

						toastQueue.add(
							`<h1>Tweet ${tweet.pinned ? "pinned" : "unpinned"} successfully</h1>`,
						);
					} else {
						toastQueue.add(
							`<h1>${result.error || "Failed to update pin status"}</h1>`,
						);
					}
				} catch (error) {
					console.error("Error updating pin status:", error);
					toastQueue.add(`<h1>Network error. Please try again.</h1>`);
				}
			});

			const deleteButtonEl = document.createElement("button");
			deleteButtonEl.className = "tweet-delete-btn";
			deleteButtonEl.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="3,6 5,6 21,6"></polyline>
					<path d="m19,6v14a2,2 0,0 1,-2,2H7a2,2 0,0 1,-2,-2V6m3,0V4a2,2 0,0 1,2,-2h4a2,2 0,0 1,2,2v2"></path>
					<line x1="10" y1="11" x2="10" y2="17"></line>
					<line x1="14" y1="11" x2="14" y2="17"></line>
				</svg>
			`;
			deleteButtonEl.title = "Delete tweet";
			deleteButtonEl.style.cssText = `
				position: absolute;
				right: 10px;
				top: 10px;
				background: none;
				border: none;
				color: #777;
				cursor: pointer;
				padding: 4px;
				border-radius: 4px;
				opacity: 0.7;
				transition: all 0.2s ease;
			`;

			deleteButtonEl.addEventListener("mouseover", () => {
				deleteButtonEl.style.backgroundColor = "#ff4444";
				deleteButtonEl.style.color = "white";
				deleteButtonEl.style.opacity = "1";
			});

			deleteButtonEl.addEventListener("mouseout", () => {
				deleteButtonEl.style.backgroundColor = "transparent";
				deleteButtonEl.style.color = "#777";
				deleteButtonEl.style.opacity = "0.7";
			});

			deleteButtonEl.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();

				if (!confirm("Are you sure you want to delete this tweet?")) {
					return;
				}

				try {
					const response = await fetch(`/api/tweets/${tweet.id}`, {
						method: "DELETE",
						headers: { Authorization: `Bearer ${authToken}` },
					});

					const result = await response.json();

					if (result.success) {
						tweetEl.style.opacity = "0.5";
						tweetEl.style.transform = "scale(0.95)";
						tweetEl.style.transition = "all 0.3s ease";

						setTimeout(() => {
							tweetEl.remove();
						}, 300);

						toastQueue.add(`<h1>Tweet deleted successfully</h1>`);
					} else {
						toastQueue.add(
							`<h1>${result.error || "Failed to delete tweet"}</h1>`,
						);
					}
				} catch (error) {
					console.error("Error deleting tweet:", error);
					toastQueue.add(`<h1>Network error. Please try again.</h1>`);
				}
			});

			// Make tweet container position relative for absolute positioning
			tweetEl.style.position = "relative";
			tweetHeaderEl.appendChild(pinButtonEl);
			tweetHeaderEl.appendChild(deleteButtonEl);
		}
	});

	tweetEl.appendChild(tweetHeaderEl);

	const tweetContentEl = document.createElement("div");
	tweetContentEl.className = "tweet-content";
	tweetContentEl.innerHTML = linkifyText(tweet.content.trim());

	tweetContentEl.addEventListener("click", (e) => {
		if (e.target.classList.contains("tweet-mention")) {
			e.preventDefault();
			e.stopPropagation();
			const username = e.target.dataset.username;
			import("./profile.js").then(({ default: openProfile }) => {
				openProfile(username);
			});
		}
	});

	tweetEl.appendChild(tweetContentEl);

	if (tweet.poll) {
		const pollEl = createPollElement(tweet.poll, tweet);
		if (pollEl) {
			tweetEl.appendChild(pollEl);
		}
	}

	if (tweet.attachments && tweet.attachments.length > 0) {
		const attachmentsEl = document.createElement("div");
		attachmentsEl.className = "tweet-attachments";

		tweet.attachments.forEach((attachment) => {
			const attachmentEl = document.createElement("div");
			attachmentEl.className = "tweet-attachment";

			if (attachment.file_type.startsWith("image/")) {
				attachmentEl.innerHTML = `<img src="${attachment.file_url}" alt="${attachment.file_name}" loading="lazy" />`;
			} else if (attachment.file_type === "video/mp4") {
				attachmentEl.innerHTML = `<video src="${attachment.file_url}" controls></video>`;
			}

			attachmentsEl.appendChild(attachmentEl);
		});

		tweetEl.appendChild(attachmentsEl);
	}

	if (tweet.quoted_tweet) {
		const quotedTweetEl = createTweetElement(tweet.quoted_tweet, {
			clickToOpen: true,
			showTopReply: false,
			isTopReply: false,
			size: "preview",
		});

		tweetEl.appendChild(quotedTweetEl);
	}

	const tweetInteractionsEl = document.createElement("div");
	tweetInteractionsEl.className = "tweet-interactions";

	const tweetInteractionsLikeEl = document.createElement("button");
	tweetInteractionsLikeEl.className = "engagement";
	tweetInteractionsLikeEl.dataset.liked = tweet.liked_by_user;
	tweetInteractionsLikeEl.style.setProperty("--color", "249, 25, 128");

	tweetInteractionsLikeEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 19 19"
          fill="${tweet.liked_by_user ? "#F91980" : "none"}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1.57852 7.51938C1.57854 6.63788 1.84594 5.77712 2.34542 5.05078C2.8449 4.32445 3.55296 3.76671 4.37607 3.45123C5.19918 3.13575 6.09863 3.07738 6.95561 3.28381C7.8126 3.49024 8.58681 3.95177 9.17599 4.60745C9.21749 4.65182 9.26766 4.68719 9.32339 4.71138C9.37912 4.73556 9.43922 4.74804 9.49997 4.74804C9.56073 4.74804 9.62083 4.73556 9.67656 4.71138C9.73229 4.68719 9.78246 4.65182 9.82396 4.60745C10.4113 3.94751 11.1857 3.4821 12.0441 3.27316C12.9024 3.06422 13.8041 3.12166 14.629 3.43783C15.4539 3.75401 16.163 4.31392 16.6619 5.04305C17.1607 5.77218 17.4256 6.63594 17.4214 7.51938C17.4214 9.33339 16.2332 10.688 15.045 11.8762L10.6945 16.0848C10.5469 16.2544 10.3649 16.3905 10.1607 16.4843C9.95638 16.5781 9.73448 16.6273 9.50971 16.6288C9.28494 16.6302 9.06243 16.5838 8.85698 16.4926C8.65153 16.4014 8.46783 16.2675 8.31809 16.0999L3.95496 11.8762C2.76674 10.688 1.57852 9.34131 1.57852 7.51938Z"
            stroke="${tweet.liked_by_user ? "#F91980" : "currentColor"}"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> <span class="like-count">${tweet.like_count}</span>`;

	tweetInteractionsLikeEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		try {
			if (Math.random() < 0.0067) {
				// six seven :skull:
				confetti(tweetInteractionsLikeEl, {
					count: 30,
					fade: true,
				});
			}

			const response = await fetch(`/api/tweets/${tweet.id}/like`, {
				method: "POST",
				headers: { Authorization: `Bearer ${authToken}` },
			});

			const result = await response.json();

			if (result.success) {
				const newIsLiked = result.liked;
				tweetInteractionsLikeEl.dataset.liked = newIsLiked;

				const svg = tweetInteractionsLikeEl.querySelector("svg path");
				const likeCountSpan =
					tweetInteractionsLikeEl.querySelector(".like-count");
				const currentCount = parseInt(likeCountSpan.textContent);

				if (newIsLiked) {
					svg.setAttribute("fill", "#F91980");
					svg.setAttribute("stroke", "#F91980");
					likeCountSpan.textContent = currentCount + 1;
				} else {
					svg.setAttribute("fill", "none");
					svg.setAttribute("stroke", "currentColor");
					likeCountSpan.textContent = Math.max(0, currentCount - 1);
				}
			} else {
				toastQueue.add(`<h1>${result.error || "Failed to like tweet"}</h1>`);
			}
		} catch (error) {
			console.error("Error liking tweet:", error);
			toastQueue.add(`<h1>Network error. Please try again.</h1>`);
		}
	});

	const tweetInteractionsRetweetEl = document.createElement("button");
	tweetInteractionsRetweetEl.className = "engagement";
	tweetInteractionsRetweetEl.dataset.retweeted = tweet.retweeted_by_user;
	tweetInteractionsRetweetEl.style.setProperty("--color", "0, 186, 124");

	const retweetColor = tweet.retweeted_by_user ? "#00BA7C" : "currentColor";

	tweetInteractionsRetweetEl.innerHTML = `
            <svg
              width="19"
              height="19"
              viewBox="0 0 19 19"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1.58333 7.125L3.95833 4.75L6.33333 7.125"
                stroke="${retweetColor}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M10.2917 14.25H5.54166C5.12174 14.25 4.71901 14.0832 4.42208 13.7863C4.12514 13.4893 3.95833 13.0866 3.95833 12.6667V4.75"
                stroke="${retweetColor}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M17.4167 11.875L15.0417 14.25L12.6667 11.875"
                stroke="${retweetColor}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M8.70833 4.75H13.4583C13.8783 4.75 14.281 4.91681 14.5779 5.21375C14.8748 5.51068 15.0417 5.91341 15.0417 6.33333V14.25"
                stroke="${retweetColor}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg> <span class="retweet-count">${tweet.retweet_count}</span>`;

	tweetInteractionsRetweetEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		createPopup({
			triggerElement: tweetInteractionsRetweetEl,
			onRetweet: async () => {
				try {
					const response = await fetch(`/api/tweets/${tweet.id}/retweet`, {
						method: "POST",
						headers: { Authorization: `Bearer ${authToken}` },
					});

					const result = await response.json();

					if (result.success) {
						const newIsRetweeted = result.retweeted;
						tweetInteractionsRetweetEl.dataset.retweeted = newIsRetweeted;

						const svgPaths =
							tweetInteractionsRetweetEl.querySelectorAll("svg path");
						const retweetCountSpan =
							tweetInteractionsRetweetEl.querySelector(".retweet-count");
						const currentCount = parseInt(retweetCountSpan.textContent);

						if (newIsRetweeted) {
							svgPaths.forEach((path) =>
								path.setAttribute("stroke", "#00BA7C"),
							);
							retweetCountSpan.textContent = currentCount + 1;
							toastQueue.add(`<h1>Tweet retweeted</h1>`);
						} else {
							svgPaths.forEach((path) =>
								path.setAttribute("stroke", "currentColor"),
							);
							retweetCountSpan.textContent = Math.max(0, currentCount - 1);
							toastQueue.add(`<h1>Retweet removed</h1>`);
						}
					} else {
						toastQueue.add(`<h1>${result.error || "Failed to retweet"}</h1>`);
					}
				} catch (error) {
					console.error("Error retweeting:", error);
					toastQueue.add(`<h1>Network error. Please try again.</h1>`);
				}
			},
			onQuote: async () => {
				try {
					const { createComposer } = await import("./composer.js");

					const composer = await createComposer({
						placeholder: "Add your thoughts about this tweet...",
						quoteTweet: tweet,
						callback: async (newTweet) => {
							addTweetToTimeline(newTweet, true).classList.add("created");
							setTimeout(() => {
								overlay.remove();
							}, 10);
						},
					});

					const overlay = document.createElement("div");
					overlay.className = "composer-overlay";

					const modal = document.createElement("div");
					modal.classList.add("modal");

					const closeButton = document.createElement("button");
					closeButton.className = "modal-close";
					closeButton.type = "button";
					closeButton.innerHTML = `
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					`;

					closeButton.addEventListener("click", () => {
						overlay.remove();
					});

					modal.appendChild(closeButton);
					modal.appendChild(composer);
					overlay.appendChild(modal);
					document.body.appendChild(overlay);

					overlay.addEventListener("click", (e) => {
						if (e.target === overlay) {
							overlay.remove();
						}
					});
				} catch (error) {
					console.error("Error creating quote composer:", error);
					toastQueue.add(`<h1>Error opening quote composer</h1>`);
				}
			},
		});
	});

	const tweetInteractionsReplyEl = document.createElement("button");
	tweetInteractionsReplyEl.className = "engagement";
	tweetInteractionsReplyEl.style.setProperty("--color", "17, 133, 254");
	tweetInteractionsReplyEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 19 19"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.795 12.25C3.88813 12.4849 3.90886 12.7423 3.85454 12.9891L3.18004 15.0728C3.1583 15.1784 3.16392 15.2879 3.19636 15.3908C3.2288 15.4937 3.28698 15.5866 3.36539 15.6607C3.4438 15.7348 3.53984 15.7876 3.6444 15.8142C3.74895 15.8408 3.85856 15.8402 3.96284 15.8125L6.1244 15.1804C6.35729 15.1342 6.59847 15.1544 6.82044 15.2387C8.17285 15.8703 9.70487 16.0039 11.1462 15.616C12.5875 15.2281 13.8455 14.3436 14.6983 13.1185C15.551 11.8935 15.9437 10.4066 15.807 8.92028C15.6703 7.43394 15.013 6.04363 13.9512 4.99466C12.8893 3.94569 11.4911 3.30546 10.0032 3.18694C8.51527 3.06842 7.03332 3.47921 5.81878 4.34685C4.60424 5.21449 3.73517 6.48321 3.3649 7.92917C2.99463 9.37513 3.14696 10.9054 3.795 12.25Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> ${tweet.reply_count}`;

	tweetInteractionsReplyEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		try {
			const { createComposer } = await import("./composer.js");

			const composer = await createComposer({
				placeholder: `Reply to @${tweet.author.username}...`,
				replyTo: tweet.id,
				callback: async (newTweet) => {
					if (!newTweet.reply_to) {
						addTweetToTimeline(newTweet, true).classList.add("created");
					}
					setTimeout(() => {
						overlay.remove();
					}, 10);
				},
			});

			const overlay = document.createElement("div");
			overlay.className = "composer-overlay";

			const modal = document.createElement("div");
			modal.classList.add("modal");

			const closeButton = document.createElement("button");
			closeButton.className = "modal-close";
			closeButton.type = "button";
			closeButton.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			`;

			closeButton.addEventListener("click", () => {
				overlay.remove();
			});

			modal.appendChild(closeButton);
			modal.appendChild(composer);
			overlay.appendChild(modal);
			document.body.appendChild(overlay);

			overlay.addEventListener("click", (e) => {
				if (e.target === overlay) {
					overlay.remove();
				}
			});
		} catch (error) {
			console.error("Error creating reply composer:", error);
			toastQueue.add(`<h1>Error opening reply composer</h1>`);
		}
	});

	const tweetInteractionsShareEl = document.createElement("button");
	tweetInteractionsShareEl.className = "engagement";
	tweetInteractionsShareEl.style.setProperty("--color", "119, 119, 119");
	tweetInteractionsShareEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.3068 16.4011C11.3338 16.4686 11.3809 16.5261 11.4416 16.5661C11.5023 16.606 11.5738 16.6264 11.6465 16.6246C11.7192 16.6227 11.7895 16.5987 11.8481 16.5557C11.9067 16.5127 11.9508 16.4528 11.9744 16.384L16.6056 2.8465C16.6284 2.78337 16.6328 2.71505 16.6182 2.64953C16.6036 2.58402 16.5706 2.52402 16.5231 2.47656C16.4757 2.42909 16.4157 2.39613 16.3502 2.38152C16.2846 2.36691 16.2163 2.37126 16.1532 2.39406L2.61569 7.02531C2.54693 7.04889 2.48703 7.09294 2.44403 7.15155C2.40102 7.21015 2.37698 7.28051 2.37512 7.35318C2.37326 7.42584 2.39367 7.49734 2.43361 7.55807C2.47356 7.6188 2.53112 7.66586 2.59859 7.69293L8.24871 9.95868C8.42733 10.0302 8.58961 10.1371 8.72578 10.2731C8.86194 10.409 8.96918 10.5711 9.04101 10.7496L11.3068 16.4011Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16.5213 2.47974L8.72656 10.2738" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
`;

	tweetInteractionsShareEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		const tweetUrl = `${window.location.origin}/tweet/${tweet.id}`;
		const shareData = {
			title: `${tweet.author.name || tweet.author.username} on Tweetapus`,
			text: tweet.content,
			url: tweetUrl,
		};

		try {
			if (
				navigator.share &&
				navigator.canShare &&
				navigator.canShare(shareData)
			) {
				await navigator.share(shareData);
				toastQueue.add(`<h1>Tweet shared!</h1>`);
			} else {
				await navigator.clipboard.writeText(tweetUrl);
				toastQueue.add(`<h1>Link copied to clipboard!</h1>`);
			}
		} catch (error) {
			console.error("Error sharing tweet:", error);
			const textArea = document.createElement("textarea");
			textArea.value = tweetUrl;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			toastQueue.add(`<h1>Link copied to clipboard!</h1>`);
		}
	});

	const tweetInteractionsBookmarkEl = document.createElement("button");
	tweetInteractionsBookmarkEl.className = "engagement";
	tweetInteractionsBookmarkEl.dataset.bookmarked =
		tweet.bookmarked_by_user || false;
	tweetInteractionsBookmarkEl.style.setProperty("--color", "255, 169, 0");

	const bookmarkColor = tweet.bookmarked_by_user ? "#FFA900" : "currentColor";
	const bookmarkFill = tweet.bookmarked_by_user ? "#FFA900" : "none";

	tweetInteractionsBookmarkEl.innerHTML = `<svg
		width="19"
		height="19"
		viewBox="0 0 19 19"
		fill="${bookmarkFill}"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M3.95833 16.625L9.5 12.2917L15.0417 16.625V4.75C15.0417 4.33008 14.8749 3.92735 14.5779 3.63041C14.281 3.33348 13.8783 3.16667 13.4583 3.16667H5.54167C5.12174 3.16667 4.71901 3.33348 4.42208 3.63041C4.12514 3.92735 3.95833 4.33008 3.95833 4.75V16.625Z"
			stroke="${bookmarkColor}"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>`;

	tweetInteractionsBookmarkEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		if (!authToken) {
			toastQueue.add(`<h1>Please log in to bookmark tweets</h1>`);
			return;
		}

		try {
			const isBookmarked =
				tweetInteractionsBookmarkEl.dataset.bookmarked === "true";
			const endpoint = isBookmarked
				? "/api/bookmarks/remove"
				: "/api/bookmarks/add";

			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${authToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ postId: tweet.id }),
			});

			const result = await response.json();

			if (result.success) {
				const newIsBookmarked = result.bookmarked;
				tweetInteractionsBookmarkEl.dataset.bookmarked = newIsBookmarked;

				const svg = tweetInteractionsBookmarkEl.querySelector("svg");
				const path = svg.querySelector("path");

				if (newIsBookmarked) {
					path.setAttribute("fill", "#FFA900");
					path.setAttribute("stroke", "#FFA900");
					toastQueue.add(`<h1>Tweet bookmarked!</h1>`);
				} else {
					path.setAttribute("fill", "none");
					path.setAttribute("stroke", "currentColor");
					toastQueue.add(`<h1>Bookmark removed</h1>`);
				}
			} else {
				toastQueue.add(
					`<h1>${result.error || "Failed to bookmark tweet"}</h1>`,
				);
			}
		} catch (error) {
			console.error("Error bookmarking tweet:", error);
			toastQueue.add(`<h1>Network error. Please try again.</h1>`);
		}
	});

	// Check reply restrictions and modify reply button accordingly
	const replyRestriction = tweet.reply_restriction || "everyone";

	if (replyRestriction !== "everyone") {
		// Get current user info to check permissions
		import("./auth.js").then(async ({ authToken }) => {
			if (authToken) {
				// Check if this is user's own tweet first
				const getUser = (await import("./auth.js")).default;
				const currentUser = await getUser();

				if (currentUser && currentUser.id === tweet.author.id) {
					// User can always reply to their own tweets
					const restrictionEl = document.createElement("div");
					restrictionEl.className = "reply-restriction-info";
					restrictionEl.textContent = "You can reply to your own tweet";
					restrictionEl.style.cssText = `
						font-size: 13px;
						color: var(--text-secondary);
						margin-top: 8px;
						padding-left: 20px;
					`;
					tweetInteractionsEl.appendChild(restrictionEl);
					return;
				}

				// This is async but we'll handle the UI update
				checkReplyPermissions(tweet, replyRestriction).then(
					({ canReply: allowed, restrictionText }) => {
						if (!allowed) {
							tweetInteractionsReplyEl.disabled = true;
							tweetInteractionsReplyEl.style.opacity = "0.5";
							tweetInteractionsReplyEl.style.cursor = "not-allowed";
							tweetInteractionsReplyEl.title = "You cannot reply to this tweet";
						}

						// Add restriction text below interactions
						if (restrictionText) {
							const restrictionEl = document.createElement("div");
							restrictionEl.className = "reply-restriction-info";
							restrictionEl.textContent = restrictionText;
							restrictionEl.style.cssText = `
							font-size: 13px;
							color: var(--text-secondary);
							margin-top: 8px;
							padding-left: 20px;
						`;
							tweetInteractionsEl.appendChild(restrictionEl);
						}
					},
				);
			}
		});
	}

	tweetInteractionsEl.appendChild(tweetInteractionsLikeEl);
	tweetInteractionsEl.appendChild(tweetInteractionsRetweetEl);
	tweetInteractionsEl.appendChild(tweetInteractionsReplyEl);
	tweetInteractionsEl.appendChild(tweetInteractionsBookmarkEl);
	tweetInteractionsEl.appendChild(tweetInteractionsShareEl);

	if (size !== "preview") {
		tweetEl.appendChild(tweetInteractionsEl);
	}
	if (tweet.top_reply && showTopReply) {
		const topReplyEl = createTweetElement(tweet.top_reply, {
			clickToOpen: true,
			showTopReply: false,
			isTopReply: true,
		});

		const replyIndicator = document.createElement("div");
		replyIndicator.className = "reply-indicator";
		replyIndicator.innerText = `Replying to @${tweet.author.username}`;
		topReplyEl.insertBefore(replyIndicator, topReplyEl.firstChild);

		tweetEl.appendChild(topReplyEl);
	}

	if (clickToOpen) {
		tweetEl.classList.add("clickable");

		tweetEl.addEventListener("click", (e) => {
			if (e.target.closest("button, a, .engagement")) {
				return;
			}
			if (size === "preview") {
				e.stopPropagation();
			}
			openTweet(tweet);
		});
	}

	// Add expanded stats for tweets when requested
	if (showStats) {
		createExpandedStats(tweet.id).then((statsEl) => {
			if (statsEl && statsEl.children.length > 0) {
				tweetEl.appendChild(statsEl);
			}
		});
	}

	return tweetEl;
};

export const addTweetToTimeline = (tweet, prepend = false) => {
	if (!tweet) {
		console.error("No tweet provided to addTweetToTimeline");
		return null;
	}

	// Handle tweets without author property (fallback)
	if (!tweet.author && tweet.user) {
		tweet.author = tweet.user;
	}

	if (!tweet.author) {
		console.error(
			"Invalid tweet object provided to addTweetToTimeline - missing author",
			tweet,
		);
		return null;
	}

	const tweetEl = createTweetElement(tweet, {
		clickToOpen: true,
		showTopReply: true,
	});

	const tweetsContainer = document.querySelector(".tweets");
	if (!tweetsContainer) {
		console.error("Tweets container not found");
		return null;
	}

	if (prepend) {
		tweetsContainer.insertBefore(tweetEl, tweetsContainer.firstChild);
	} else {
		tweetsContainer.appendChild(tweetEl);
	}

	return tweetEl;
};
