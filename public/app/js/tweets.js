import DOMPurify from "../../shared/assets/js/dompurify.js";
import { marked } from "../../shared/assets/js/marked.js";
import {
	applyAvatarOutline,
	createVerificationBadge,
} from "../../shared/badge-utils.js";
import { attachHoverCard } from "../../shared/hover-card.js";
import toastQueue from "../../shared/toasts.js";
import {
	createConfirmModal,
	createModal,
	createPopup,
} from "../../shared/ui-utils.js";
import query from "./api.js";
import getUser from "./auth.js";
import switchPage from "./pages.js";
import { searchQuery } from "./search.js";
import { maybeAddTranslation } from "./translate.js";
import openTweet from "./tweet.js";

const DOMPURIFY_CONFIG = {
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
		"sub",
		"sup",
		"del",
	],
	ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

const attachCheckmarkPopup = (badgeEl, type) => {
	if (!badgeEl) return;
	const message =
		type === "gold"
			? "This user has a gold checkmark and is verified."
			: type === "gray"
				? "This user has a gray checkmark and is verified"
				: "This user is verified.";
	const showPopup = (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		createPopup({
			items: [
				{
					title: message,
					onClick: () => {},
				},
			],
			triggerElement: badgeEl,
		});
	};
	badgeEl.addEventListener("click", showPopup);
	badgeEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") showPopup(e);
	});
};

const handleCustomBadgeAction = (badge, badgeEl, userId, username) => {
	const type = badge?.action_type || "none";
	if (type === "url") {
		const url = badge?.action_value || "";
		if (url && /^https?:\/\//i.test(url)) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
		return;
	}
	if (type === "modal") {
		let config = {};
		try {
			config = JSON.parse(badge?.action_value || "{}");
		} catch {
			config = { content: badge?.action_value || "" };
		}
		const wrapper = document.createElement("div");
		wrapper.className = "badge-modal-content";
		if (config.css) {
			const styleEl = document.createElement("style");
			styleEl.textContent = config.css;
			wrapper.appendChild(styleEl);
		}
		const contentDiv = document.createElement("div");
		if (config.content) {
			if (badge?.allow_raw_html) {
				if (typeof marked !== "undefined") {
					contentDiv.innerHTML = marked.parse(config.content);
				} else {
					contentDiv.innerHTML = config.content;
				}
			} else if (typeof marked !== "undefined") {
				contentDiv.innerHTML = DOMPurify.sanitize(
					marked.parse(config.content),
					DOMPURIFY_CONFIG,
				);
			} else {
				contentDiv.innerHTML = DOMPurify.sanitize(
					config.content.replace(/\n/g, "<br>"),
					DOMPURIFY_CONFIG,
				);
			}
		}
		wrapper.appendChild(contentDiv);
		const { modal: modalEl, close } = createModal({
			title: config.title || badge?.name || "Badge",
			content: wrapper,
		});
		if (config.js) {
			try {
				const fn = new Function(
					"modalEl",
					"badge",
					"userId",
					"username",
					"closeModal",
					config.js,
				);
				fn(modalEl, badge, userId, username, close);
			} catch (err) {
				console.error("Badge modal JS error:", err);
			}
		}
		return;
	}
	if (type === "popup") {
		let config = {};
		try {
			config = JSON.parse(badge?.action_value || "{}");
		} catch {
			config = { entries: [] };
		}
		const entries = config.entries || [];
		if (entries.length === 0) return;
		const popupEl = document.createElement("div");
		popupEl.className = "badge-popup-menu";
		if (config.title) {
			const titleEl = document.createElement("div");
			titleEl.className = "badge-popup-title";
			titleEl.textContent = config.title;
			popupEl.appendChild(titleEl);
		}
		entries.forEach((entry) => {
			const item = document.createElement("button");
			item.className = "badge-popup-item";
			item.type = "button";
			if (entry.icon) {
				const icon = document.createElement("i");
				icon.className = entry.icon.startsWith("bi-")
					? `bi ${entry.icon}`
					: entry.icon;
				item.appendChild(icon);
			}
			const labelSpan = document.createElement("span");
			labelSpan.textContent = entry.label || "";
			item.appendChild(labelSpan);
			item.addEventListener("click", () => {
				popupEl.remove();
				if (entry.type === "js" && entry.value) {
					try {
						const fn = new Function("badge", "userId", "username", entry.value);
						fn(badge, userId, username);
					} catch (err) {
						console.error("Badge popup JS error:", err);
					}
				} else if (entry.type === "url" && entry.value) {
					if (/^https?:\/\//i.test(entry.value)) {
						window.open(entry.value, "_blank", "noopener,noreferrer");
					}
				}
			});
			popupEl.appendChild(item);
		});
		document.body.appendChild(popupEl);
		const rect = badgeEl.getBoundingClientRect();
		popupEl.style.position = "fixed";
		popupEl.style.top = `${rect.bottom + 4}px`;
		popupEl.style.left = `${rect.left}px`;
		popupEl.style.zIndex = "10000";
		const closePopup = (e) => {
			if (!popupEl.contains(e.target) && e.target !== badgeEl) {
				popupEl.remove();
				document.removeEventListener("click", closePopup);
			}
		};
		setTimeout(() => document.addEventListener("click", closePopup), 0);
		return;
	}
	if (type === "client_js") {
		try {
			const fn = new Function(
				"badge",
				"badgeEl",
				"userId",
				"username",
				badge?.action_value || "",
			);
			fn(badge, badgeEl, userId, username);
		} catch (err) {
			console.error("Badge JS failed", err);
		}
	}
};

const renderCustomBadge = (badge, userId, username) => {
	const badgeEl = document.createElement("span");
	badgeEl.className = "custom-badge";
	badgeEl.title = badge?.name || "Custom Badge";
	badgeEl.tabIndex = 0;

	if (badge?.svg_content) {
		badgeEl.innerHTML = badge.svg_content;
		const svg = badgeEl.querySelector("svg");
		if (svg) {
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.style.verticalAlign = "middle";
		}
	} else if (badge?.image_url) {
		const img = document.createElement("img");
		img.src = badge.image_url;
		img.alt = badge?.name || "Badge";
		img.width = 16;
		img.height = 16;
		img.style.verticalAlign = "middle";
		img.draggable = false;
		badgeEl.appendChild(img);
	}

	if ((badge?.action_type || "none") !== "none") {
		badgeEl.addEventListener("click", (e) => {
			e.stopPropagation();
			e.preventDefault();
			handleCustomBadgeAction(badge, badgeEl, userId, username);
		});
		badgeEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleCustomBadgeAction(badge, badgeEl, userId, username);
			}
		});
	}

	return badgeEl;
};

const createBlockedModal = () => {
	createModal({
		content: `<div style="padding: 24px; text-align: center;">
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-ban-icon lucide-shield-ban" style="margin-top: 1em;margin-bottom: 0.5em;"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m4.243 5.21 14.39 12.472"></path></svg>
<h2 style="margin: 3px 0 15px; font-size: 20px;color:var(--error-color)">This user has blocked you</h2>
<p style="margin: 0; color: var(--text-secondary); line-height: 1.5;text-align:left">
<strong>What this means for you:</strong></p>
<ul style="margin-top:6px;text-align:left;display:flex;gap:6px;flex-direction: column;    padding-left: 18px;">
<li>You will not be able to interact with tweets from this user</li>
<li>You will not be able to follow or DM this user</li>
<li>This may impact your engagement and algorithm score negatively. You can learn more about your score in "Algorithm Impact" in Settings.</li>
</ul>
<p style="margin: 0; color: var(--text-secondary); line-height: 1.5;text-align:left">
<strong>What this means for the user:</strong></p>
<ul style="margin-top:6px;text-align:left;display:flex;gap:6px;flex-direction: column;    padding-left: 18px;">
<li>They will not be able to see your tweets in their timeline</li>
<li>They won't be able to interact with your profile either</li>
<li>They won't get notifications for your tweets</li>
</ul>
<p style="margin: 0; color: var(--text-secondary); line-height: 1.5;text-align:left">If you believe this is part of an algorithm manipulation campaign, please contact us.</p>
</div>`,
	});
};

const createFactCheck = (fact_check) => {
	const factCheckEl = document.createElement("div");
	factCheckEl.className = "fact-check-banner";
	factCheckEl.dataset.severity = fact_check.severity || "warning";

	const icon = document.createElement("span");
	icon.className = "fact-check-icon";
	icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

	const content = document.createElement("div");
	content.className = "fact-check-content";

	const title = document.createElement("strong");
	title.textContent =
		fact_check.severity === "danger"
			? "Misleading or misinformation"
			: fact_check.severity === "warning"
				? "Potentially misleading post"
				: "Additional context";

	const note = document.createElement("p");

	const linkRegex = /https?:\/\/[^\s<>"']+/g;
	const htmlString = fact_check.note
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\n", "<br>")
		.replace(
			linkRegex,
			(url) =>
				`<a href="${
					url.startsWith("http") ? url : `https://${url}`
				}" target="_blank" rel="noopener noreferrer">${
					url.length > 60 ? `${url.slice(0, 50)}…` : url
				}</a>`,
		);
	note.innerHTML = DOMPurify.sanitize(htmlString, DOMPURIFY_CONFIG);

	content.appendChild(title);
	content.appendChild(note);

	factCheckEl.appendChild(icon);
	factCheckEl.appendChild(content);

	return factCheckEl;
};

const emojiMapPromise = (async () => {
	try {
		const resp = await fetch("/api/emojis");
		if (!resp.ok) return {};
		const data = await resp.json();
		const map = {};
		for (const e of data.emojis || []) map[e.name] = e.file_url;
		return map;
	} catch (_err) {
		return {};
	}
})();

async function replaceEmojiShortcodesInElement(container) {
	try {
		const map = await emojiMapPromise;
		if (!map || Object.keys(map).length === 0) return;

		const regex = /:([a-zA-Z0-9_+-]+):/g;

		const walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode(node) {
					if (!node.nodeValue || !node.nodeValue.includes(":"))
						return NodeFilter.FILTER_REJECT;
					const parentTag = node.parentNode?.nodeName?.toLowerCase();
					if (
						["code", "pre", "a", "textarea", "script", "style"].includes(
							parentTag,
						)
					)
						return NodeFilter.FILTER_REJECT;
					return NodeFilter.FILTER_ACCEPT;
				},
			},
			false,
		);

		const nodes = [];
		while (walker.nextNode()) nodes.push(walker.currentNode);

		for (const textNode of nodes) {
			const text = textNode.nodeValue;
			regex.lastIndex = 0;
			if (!regex.test(text)) continue;

			regex.lastIndex = 0;
			const frag = document.createDocumentFragment();
			let lastIndex = 0;
			for (;;) {
				const m = regex.exec(text);
				if (!m) break;
				const [full, name] = m;
				const idx = m.index;
				if (idx > lastIndex) {
					frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
				}
				const url = map[name];
				if (url) {
					const img = document.createElement("img");
					img.src = url;
					img.alt = `:${name}:`;
					img.className = "inline-emoji";
					img.width = 20;
					img.height = 20;
					img.setAttribute("loading", "lazy");
					img.style.verticalAlign = "middle";
					img.style.margin = "0 2px";
					frag.appendChild(img);
				} else {
					frag.appendChild(document.createTextNode(full));
				}
				lastIndex = idx + full.length;
			}
			if (lastIndex < text.length) {
				frag.appendChild(document.createTextNode(text.slice(lastIndex)));
			}

			textNode.parentNode.replaceChild(frag, textNode);
		}
	} catch {}
}

const PROFILE_AVATAR_PX = 100;
function avatarPxToPercent(px) {
	const n = Number(px) || 0;
	const pct = (n / PROFILE_AVATAR_PX) * 100;

	const clamped = Math.max(0, Math.min(100, pct));
	return `${clamped}%`;
}

async function checkReplyPermissions(tweet, replyRestriction) {
	try {
		const data = await query(`/tweets/can-reply/${tweet.id}`);

		if (data.error) {
			return {
				canReply: false,
				restrictionText: "Unable to check reply permissions",
			};
		}

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
	if (!data.allowedTags || data.allowedTags[data.tagName]) {
		return;
	}

	const textNode = document.createTextNode(node.outerHTML);
	node.parentNode.replaceChild(textNode, node);
});

const linkifyText = (text) => {
	const normalizeListMarkers = (md) => {
		const lines = md.split("\n");
		let inFence = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (/^```/.test(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
			if (/^[ \t]{4,}/.test(line)) continue;
			const mDash = line.match(/^([ \t]{0,3})(-)(\s+)(.*)$/);
			if (mDash) {
				lines[i] = `${mDash[1]}\\-${mDash[3]}${mDash[4]}`;
			}
			const mPlus = line.match(/^([ \t]{0,3})([+])(\s+)(.*)$/);
			if (mPlus) {
				lines[i] = `${mPlus[1]}*${mPlus[3]}${mPlus[4]}`;
			}
		}
		return lines.join("\n");
	};

	const processCustomMarkdown = (text) => {
		return text
			.replace(/~([^~\n]+)~/g, "<sub>$1</sub>")
			.replace(/\^([^^\n]+)\^/g, "<sup>$1</sup>");
	};

	let processedText = text.replace(
		/(^|[\s])@([a-zA-Z0-9_]+)/g,
		'$1<span data-mention="$2">@$2</span>',
	);
	processedText = processedText.replace(
		/(^|[\s])#([a-zA-Z0-9_]+)/g,
		'$1<span data-hashtag="$2">#$2</span>',
	);

	const html = marked.parse(normalizeListMarkers(processedText.trim()), {
		breaks: true,
		gfm: true,
		html: true,
		headerIds: false,
		mangle: false,
	});

	let processedHtml = html.replace(
		/<span data-mention="([^"]+)">@\1<\/span>/g,
		'<a href="javascript:" class="tweet-mention" data-username="$1">@$1</a>',
	);
	processedHtml = processedHtml.replace(
		/<span data-hashtag="([^"]+)">#\1<\/span>/g,
		'<a href="javascript:" class="tweet-hashtag" data-hashtag="$1">#$1</a>',
	);

	processedHtml = processCustomMarkdown(processedHtml);

	const el = document.createElement("div");
	el.innerHTML = DOMPurify.sanitize(processedHtml, DOMPURIFY_CONFIG);

	el.querySelectorAll("a").forEach((a) => {
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noopener noreferrer");
		if (a.innerText.length > 60) {
			a.innerText = `${a.innerText.slice(0, 60)}…`;
		}
		if (a.href.startsWith("javascript:") || a.href.startsWith("data:")) {
			a.removeAttribute("href");
		}
		if (a.href.startsWith("http://") || a.href.startsWith("https://")) {
			a.innerText = a.href.startsWith("http://")
				? a.innerText.replace("http://", "")
				: a.innerText.replace("https://", "");
		}
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

	if (seconds === -1 || seconds === 0) return "just now";

	if (seconds < 60) return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
	if (seconds < 3600) {
		const mins = Math.floor(seconds / 60);
		return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
	}
	if (seconds < 86400) {
		const hours = Math.floor(seconds / 3600);
		return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
	}
	if (seconds < 604800) {
		const days = Math.floor(seconds / 86400);
		return `${days} day${days !== 1 ? "s" : ""} ago`;
	}

	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const day = dateObj.getDate();
	const year = dateObj.getFullYear();
	const month = monthNames[dateObj.getMonth()];

	const daySuffix = (d) => {
		if (d >= 11 && d <= 13) return "th";
		switch (d % 10) {
			case 1:
				return "st";
			case 2:
				return "nd";
			case 3:
				return "rd";
			default:
				return "th";
		}
	};

	if (year === now.getFullYear()) return `${month} ${day}${daySuffix(day)}`;
	return `${month} ${day}${daySuffix(day)} ${year}`;
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
		optionEl.className = `poll-option ${
			poll.userVote === option.id ? "voted" : ""
		} ${poll.isExpired ? "expired" : ""}`;

		if (poll.isExpired || poll.userVote) {
			optionEl.innerHTML = `
				<div class="poll-option-bar" style="width: ${option.percentage}%"></div>
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text
						.replaceAll("<", "&lt;")
						.replaceAll(
							">",
							"&gt;",
						)}${poll.userVote === option.id ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check-icon lucide-circle-check"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>` : ""}</span>
					<span class="poll-option-percentage">${option.percentage}%</span>
				</div>
			`;
		} else {
			optionEl.classList.add("poll-option-clickable");
			optionEl.innerHTML = `
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text
						.replaceAll("<", "&lt;")
						.replaceAll(
							">",
							"&gt;",
						)}${poll.userVote === option.id ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check-icon lucide-circle-check"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>` : ""}</span>
				</div>
			`;
			optionEl.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				votePoll(tweet.id, option.id, pollEl);
			});
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
			avatarEl.src = voter.avatar || `/public/shared/assets/default-avatar.svg`;
			avatarEl.alt = voter.name || voter.username;
			avatarEl.title = voter.name || voter.username;
			avatarEl.setAttribute("loading", "lazy");
			const voterRadius =
				voter.avatar_radius !== null && voter.avatar_radius !== undefined
					? avatarPxToPercent(voter.avatar_radius)
					: voter.gold || voter.gray
						? "4px"
						: "50px";
			avatarEl.style.borderRadius = voterRadius;
			avatarEl.style.zIndex = poll.voters.length - index;
			voterAvatarsEl.appendChild(avatarEl);
		});

		pollVotesEl.appendChild(voterAvatarsEl);
	}

	const votesTextEl = document.createElement("span");
	votesTextEl.className = "poll-votes-text";
	votesTextEl.textContent = `${poll.totalVotes} vote${
		poll.totalVotes !== 1 ? "s" : ""
	}`;
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
		const result = await query(`/tweets/${tweetId}/poll/vote`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ optionId }),
		});

		if (result.success) {
			updatePollDisplay(pollElement, result.poll);
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
				<span class="poll-option-text">${option.option_text
					.replaceAll("<", "&lt;")
					.replaceAll(
						">",
						"&gt;",
					)} <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check-icon lucide-circle-check"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></span>
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
			avatarEl.src = voter.avatar || `/public/shared/assets/default-avatar.svg`;
			avatarEl.alt = voter.name || voter.username;
			avatarEl.title = voter.name || voter.username;
			avatarEl.setAttribute("loading", "lazy");
			const voterRadius2 =
				voter.avatar_radius !== null && voter.avatar_radius !== undefined
					? avatarPxToPercent(voter.avatar_radius)
					: voter.gold || voter.gray
						? "4px"
						: "50px";
			avatarEl.style.borderRadius = voterRadius2;
			avatarEl.style.zIndex = poll.voters.length - index;
			voterAvatarsEl.appendChild(avatarEl);
		});

		pollVotesEl.appendChild(voterAvatarsEl);
	}

	const votesTextEl = document.createElement("span");
	votesTextEl.className = "poll-votes-text";
	votesTextEl.textContent = `${poll.totalVotes} vote${
		poll.totalVotes !== 1 ? "s" : ""
	}`;
	pollVotesEl.appendChild(votesTextEl);

	const pollTimeEl = document.createElement("span");
	pollTimeEl.className = "poll-time";
	pollTimeEl.textContent = formatTimeRemaining(poll.expires_at);

	metaContainer.appendChild(pollVotesEl);
	metaContainer.appendChild(pollTimeEl);
};

async function showInteractionsModal(tweetId, initialTab = "likes") {
	const { observeTabContainer, updateTabIndicator } = await import(
		"../../shared/tab-indicator.js"
	);
	const {
		createTweetSkeleton,
		createUserSkeleton,
		removeSkeletons,
		showSkeletons,
	} = await import("../../shared/skeleton-utils.js");

	const modalContent = document.createElement("div");
	modalContent.className = "interactions-modal-content";

	const tabsContainer = document.createElement("div");
	tabsContainer.className = "interactions-tabs tab-nav";

	const tabs = [
		{ id: "likes", label: "Likes" },
		{ id: "retweets", label: "Retweets" },
		{ id: "quotes", label: "Quotes" },
	];

	const contentContainer = document.createElement("div");
	contentContainer.className = "interactions-content";

	let activeTab = initialTab;
	let modal = null;
	let currentSkeletons = [];

	const loadTabContent = async (tabId) => {
		contentContainer.innerHTML = "";
		if (currentSkeletons.length) removeSkeletons(currentSkeletons);

		const isQuotes = tabId === "quotes";
		const skeletonCreator = isQuotes ? createTweetSkeleton : createUserSkeleton;

		currentSkeletons = showSkeletons(contentContainer, skeletonCreator, 3);

		try {
			const data = await query(`/tweets/${tweetId}/${tabId}`);

			contentContainer.innerHTML = "";
			currentSkeletons = [];

			if (isQuotes) {
				if (!data.tweets || data.tweets.length === 0) {
					contentContainer.innerHTML = `<div class="empty-state">No quotes yet</div>`;
					return;
				}

				data.tweets.forEach((tweet) => {
					const tweetEl = createTweetElement(tweet, {
						clickToOpen: true,
						showTopReply: false,
						isTopReply: false,
						size: "normal",
					});
					contentContainer.appendChild(tweetEl);
				});
			} else {
				if (!data.users || data.users.length === 0) {
					contentContainer.innerHTML = `<div class="empty-state">No ${tabId} yet</div>`;
					return;
				}

				const usersList = document.createElement("div");
				usersList.className = "users-list";

				data.users.forEach((user) => {
					const userItem = document.createElement("div");
					userItem.className = "user-item";

					const timeText =
						tabId === "likes"
							? `liked ${formatInteractionTime(new Date(user.liked_at))}`
							: `retweeted ${formatInteractionTime(
									new Date(user.retweeted_at),
								)}`;

					userItem.innerHTML = `
            <div class="user-avatar">
              <img src="${
								user.avatar || "/public/shared/assets/default-avatar.svg"
							}" alt="${user.name || user.username}" />
            </div>
            <div class="user-info">
              <div class="user-name">${user.name || user.username}</div>
              <div class="user-username">@${user.username}</div>
              <div class="user-time">${timeText}</div>
            </div>
          `;

					userItem.addEventListener("click", async () => {
						modal?.close();
						const { default: openProfile } = await import("./profile.js");
						openProfile(user.username);
					});

					usersList.appendChild(userItem);
				});

				contentContainer.appendChild(usersList);
			}
		} catch (error) {
			console.error("Error loading interactions:", error);
			removeSkeletons(currentSkeletons);
			currentSkeletons = [];
			contentContainer.innerHTML = `<div class="empty-state">Failed to load ${tabId}</div>`;
		}
	};

	tabs.forEach((tab) => {
		const tabButton = document.createElement("button");
		tabButton.className = "tab-button";
		tabButton.dataset.tab = tab.id;
		tabButton.textContent = tab.label;

		if (tab.id === activeTab) {
			tabButton.classList.add("active");
		}

		tabButton.addEventListener("click", () => {
			tabsContainer.querySelectorAll(".tab-button").forEach((btn) => {
				btn.classList.remove("active");
			});
			tabButton.classList.add("active");
			activeTab = tab.id;
			updateTabIndicator(tabsContainer, tabButton);
			loadTabContent(tab.id);
		});

		tabsContainer.appendChild(tabButton);
	});

	modalContent.appendChild(tabsContainer);
	modalContent.appendChild(contentContainer);

	modal = createModal({
		title: "Interactions",
		content: modalContent,
		className: "interactions-tabbed-modal",
	});

	setTimeout(() => {
		observeTabContainer(tabsContainer);
		const activeButton = tabsContainer.querySelector(".tab-button.active");
		if (activeButton) {
			updateTabIndicator(tabsContainer, activeButton);
		}
	}, 50);

	await loadTabContent(activeTab);
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
	} = config;

	if (tweet.author.blocked_by_user) {
		const blockedEl = document.createElement("div");
		blockedEl.className = "tweet blocked-tweet";
		blockedEl.style.cssText =
			"display: flex; align-items: center; justify-content: space-between; padding: 16px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 12px; margin-bottom: 1px;";
		blockedEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                <span>You blocked this user.</span>
            </div>
            <button class="unblock-btn" style="background: transparent; border: 1px solid var(--border); color: var(--text-primary); padding: 4px 12px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600;">Unblock</button>
        `;

		blockedEl
			.querySelector(".unblock-btn")
			.addEventListener("click", async (e) => {
				e.stopPropagation();
				e.preventDefault();
				try {
					const result = await query("/blocking/unblock", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ userId: tweet.author.id }),
					});
					if (result.success) {
						toastQueue.add("<h1>Unblocked user</h1>");
						tweet.author.blocked_by_user = false;
						const newEl = createTweetElement(tweet, config);
						blockedEl.replaceWith(newEl);
					} else {
						toastQueue.add(`<h1>${result.error || "Failed to unblock"}</h1>`);
					}
				} catch (err) {
					console.error(err);
					toastQueue.add("<h1>Error unblocking user</h1>");
				}
			});
		return blockedEl;
	}

	if (!tweet.reaction_count) {
		if (typeof tweet.total_reactions === "number") {
			tweet.reaction_count = tweet.total_reactions;
		} else if (typeof tweet.reactions_count === "number") {
			tweet.reaction_count = tweet.reactions_count;
		} else if (Array.isArray(tweet.reactions)) {
			tweet.reaction_count = tweet.reactions.length;
		}
	}

	const tweetEl = document.createElement("div");
	tweetEl.className = isTopReply ? "tweet top-reply" : "tweet";

	if (size === "preview") {
		tweetEl.classList.add("tweet-preview");
		tweetEl.classList.add("clickable");
	}

	if (tweet.outline && tweet.author.gray) {
		if (tweet.outline.includes("gradient")) {
			tweetEl.style.setProperty("border", "2px solid transparent", "important");
			tweetEl.style.setProperty(
				"border-image",
				`${tweet.outline} 1`,
				"important",
			);
		} else {
			tweetEl.style.setProperty(
				"border",
				`2px solid ${tweet.outline}`,
				"important",
			);
		}
		tweetEl.style.setProperty("border-radius", "12px", "important");
	}

	const tweetHeaderEl = document.createElement("div");
	tweetHeaderEl.className = "tweet-header";

	const tweetHeaderAvatarEl = document.createElement("img");
	tweetHeaderAvatarEl.src =
		tweet.author.avatar || `/public/shared/assets/default-avatar.svg`;
	tweetHeaderAvatarEl.alt = tweet.author.name || tweet.author.username;
	tweetHeaderAvatarEl.classList.add("tweet-header-avatar");
	tweetHeaderAvatarEl.setAttribute("loading", "lazy");
	tweetHeaderAvatarEl.loading = "lazy";
	tweetHeaderAvatarEl.width = 48;
	tweetHeaderAvatarEl.height = 48;
	tweetHeaderAvatarEl.draggable = false;

	let avatarRadiusValue;
	if (
		tweet.author.avatar_radius !== null &&
		tweet.author.avatar_radius !== undefined
	) {
		avatarRadiusValue = avatarPxToPercent(tweet.author.avatar_radius);
	} else if (tweet.author.gold || tweet.author.gray) {
		avatarRadiusValue = "4px";
	} else {
		avatarRadiusValue = "50px";
	}

	tweetHeaderAvatarEl.style.setProperty(
		"border-radius",
		avatarRadiusValue,
		"important",
	);

	if (tweet.author.gray) {
		applyAvatarOutline(
			tweetHeaderAvatarEl,
			tweet.author.avatar_outline || "",
			avatarRadiusValue,
			2,
		);
	} else {
		applyAvatarOutline(tweetHeaderAvatarEl, "", avatarRadiusValue, 2);
	}
	tweetHeaderAvatarEl.setAttribute("loading", "lazy");
	tweetHeaderAvatarEl.addEventListener("click", (e) => {
		e.stopPropagation();

		if (tweet.author?.suspended) {
			switchPage("timeline", { path: "/" });
			return;
		}
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	attachHoverCard(tweetHeaderAvatarEl, tweet.author.username);

	tweetHeaderEl.appendChild(tweetHeaderAvatarEl);

	const tweetHeaderInfoEl = document.createElement("div");
	tweetHeaderInfoEl.className = "tweet-header-info";

	const tweetHeaderNameEl = document.createElement("p");
	tweetHeaderNameEl.className = "name";
	tweetHeaderNameEl.textContent =
		tweet.author.name || `@${tweet.author.username}`;
	tweetHeaderNameEl.classList.add("tweet-header-name");
	tweetHeaderNameEl.addEventListener("click", (e) => {
		const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
		if (isMobile) {
			return;
		}
		e.stopPropagation();
		if (tweet.author?.suspended) {
			switchPage("timeline", { path: "/" });
			return;
		}
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	attachHoverCard(tweetHeaderNameEl, tweet.author.username);

	if (tweet.author.gold) {
		const badge = createVerificationBadge({ type: "gold" });
		tweetHeaderNameEl.appendChild(badge);
		attachCheckmarkPopup(badge, "gold");
	} else if (tweet.author.gray) {
		const badge = createVerificationBadge({
			type: "gray",
			checkmarkOutline: tweet.author.checkmark_outline || "",
		});
		tweetHeaderNameEl.appendChild(badge);
		attachCheckmarkPopup(badge, "gray");
	} else if (tweet.author.verified) {
		const badge = createVerificationBadge({ type: "verified" });
		tweetHeaderNameEl.appendChild(badge);
		attachCheckmarkPopup(badge, "verified");
	}

	if (Array.isArray(tweet.author.custom_badges)) {
		for (const badge of tweet.author.custom_badges) {
			const badgeEl = renderCustomBadge(
				badge,
				tweet.author.id,
				tweet.author.username,
			);
			tweetHeaderNameEl.appendChild(badgeEl);
		}
	}

	if (tweet.author.affiliate && tweet.author.affiliate_with_profile) {
		const affiliateEl = document.createElement("a");
		affiliateEl.href = `/@${tweet.author.affiliate_with_profile.username}`;
		affiliateEl.className = "role-badge affiliate-with";
		affiliateEl.title = `Affiliated with @${tweet.author.affiliate_with_profile.username}`;

		affiliateEl.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			import("./profile.js").then(({ default: openProfile }) => {
				openProfile(tweet.author.affiliate_with_profile.username);
			});
		});

		const affiliateImg = document.createElement("img");
		affiliateImg.src =
			tweet.author.affiliate_with_profile.avatar ||
			"/public/shared/assets/default-avatar.svg";
		affiliateImg.alt =
			tweet.author.affiliate_with_profile.name ||
			tweet.author.affiliate_with_profile.username;
		affiliateImg.className = "affiliate-with-avatar";
		affiliateImg.draggable = false;

		if (
			tweet.author.affiliate_with_profile.avatar_radius !== null &&
			tweet.author.affiliate_with_profile.avatar_radius !== undefined
		) {
			affiliateImg.style.setProperty(
				"border-radius",
				`${tweet.author.affiliate_with_profile.avatar_radius}px`,
			);
		} else if (
			tweet.author.affiliate_with_profile.gold ||
			tweet.author.affiliate_with_profile.gray
		) {
			affiliateImg.style.setProperty("border-radius", "4px");
		} else {
			affiliateImg.style.setProperty("border-radius", "50%");
		}

		affiliateEl.appendChild(affiliateImg);
		tweetHeaderNameEl.appendChild(affiliateEl);
	}

	if (tweet.author.label_type) {
		const labelEl = document.createElement("span");
		labelEl.className = `tweet-label label-${tweet.author.label_type}`;
		const labelText =
			tweet.author.label_type.charAt(0).toUpperCase() +
			tweet.author.label_type.slice(1);
		labelEl.textContent = labelText;
		tweetHeaderNameEl.appendChild(labelEl);
	}

	if (tweet.author.community_tag) {
		const communityTagEl = document.createElement("a");
		communityTagEl.href = `/communities/${tweet.author.community_tag.community_id}`;
		communityTagEl.className = "community-tag";
		communityTagEl.title = `Member of ${tweet.author.community_tag.community_name}`;
		communityTagEl.textContent = [
			tweet.author.community_tag.emoji || "",
			tweet.author.community_tag.text,
		]
			.join(" ")
			.trim();

		communityTagEl.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			import("./communities.js").then(({ loadCommunityDetail }) => {
				loadCommunityDetail(tweet.author.community_tag.community_id);
			});
		});

		tweetHeaderNameEl.appendChild(communityTagEl);
	}

	if (tweet.author.username !== tweet.author.name && tweet.author.name) {
		const usernameEl = document.createElement("span");
		usernameEl.textContent = `@${tweet.author.username}`;
		usernameEl.classList.add("tweet-header-username-span");
		tweetHeaderNameEl.appendChild(usernameEl);
	}

	const source_icons = {
		desktop_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tweet-source-icon lucide lucide-monitor-icon lucide-monitor"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
		mobile_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tweet-source-icon lucide lucide-smartphone-icon lucide-smartphone"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
		scheduled: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock-icon lucide-clock"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>`,
		articles: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-newspaper-icon lucide-newspaper"><path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/></svg>`,
	};

	const tweetHeaderUsernameEl = document.createElement("p");
	tweetHeaderUsernameEl.className = "username";
	tweetHeaderUsernameEl.textContent = timeAgo(tweet.created_at);
	tweetHeaderUsernameEl.classList.add("tweet-header-username");
	tweetHeaderUsernameEl.addEventListener("click", (e) => {
		e.stopPropagation();
		if (tweet.author?.suspended) {
			switchPage("timeline", { path: "/" });
			return;
		}
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(tweet.author.username);
		});
	});

	if (tweet.source && source_icons[tweet.source]) {
		const sourceIconEl = document.createElement("span");
		sourceIconEl.className = "tweet-source-icon-wrapper";
		sourceIconEl.innerHTML = `${source_icons[tweet.source]}`;
		tweetHeaderUsernameEl.appendChild(sourceIconEl);
	} else if (tweet.source) {
		tweetHeaderUsernameEl.textContent += ` · ${tweet.source}`;
	}

	if (tweet.edited_at) {
		const editedIndicator = document.createElement("span");
		editedIndicator.className = "tweet-edited-indicator";
		editedIndicator.textContent = " (edited)";
		editedIndicator.title = "Click to view edit history";
		editedIndicator.addEventListener("click", async (e) => {
			e.stopPropagation();
			try {
				const history = await query(`/tweets/${tweet.id}/edit-history`);

				if (history.error) {
					toastQueue.add(`<h1>${history.error}</h1>`);
					return;
				}

				const historyContainer = document.createElement("div");
				historyContainer.className = "edit-history-list";
				historyContainer.style.cssText = `
					max-height: 500px;
					overflow-y: auto;
					padding: 16px;
				`;

				if (history.history && history.history.length > 0) {
					history.history.forEach((version) => {
						const versionEl = document.createElement("div");
						versionEl.className = "edit-history-item";
						versionEl.style.cssText = `
							padding: 16px;
							border-radius: 8px;
							background: ${version.is_current ? "var(--secondary-bg)" : "var(--primary-bg)"};
							margin-bottom: 12px;
							border: ${version.is_current ? "2px solid var(--primary)" : "1px solid var(--border)"};
						`;

						const headerEl = document.createElement("div");
						headerEl.style.cssText = `
							display: flex;
							justify-content: space-between;
							align-items: center;
							margin-bottom: 8px;
						`;

						const timeEl = document.createElement("span");
						timeEl.style.cssText = `
							font-size: 13px;
							color: var(--text-secondary);
							font-weight: 600;
						`;
						timeEl.textContent = timeAgo(version.edited_at);

						headerEl.appendChild(timeEl);

						if (version.is_current) {
							const badge = document.createElement("span");
							badge.textContent = "Current";
							badge.style.cssText = `
								background: var(--primary);
								color: var(--primary-fg);
								padding: 4px 8px;
								border-radius: 4px;
								font-size: 11px;
								font-weight: 600;
							`;
							headerEl.appendChild(badge);
						}

						const contentEl = document.createElement("div");
						contentEl.style.cssText = `
							color: var(--text-primary);
							line-height: 1.5;
							word-wrap: break-word;
						`;
						contentEl.textContent = version.content;

						versionEl.appendChild(headerEl);
						versionEl.appendChild(contentEl);
						historyContainer.appendChild(versionEl);
					});
				} else {
					historyContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">No edit history available</p>`;
				}

				createModal({
					title: "Edit history",
					content: historyContainer,
					className: "edit-history-modal",
				});
			} catch (error) {
				console.error("Error fetching edit history:", error);
				toastQueue.add(`<h1>Failed to load edit history</h1>`);
			}
		});
		tweetHeaderUsernameEl.appendChild(editedIndicator);
	}

	tweetHeaderInfoEl.appendChild(tweetHeaderNameEl);
	tweetHeaderInfoEl.appendChild(tweetHeaderUsernameEl);

	tweetHeaderEl.appendChild(tweetHeaderInfoEl);

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

	tweetEl.appendChild(tweetHeaderEl);

	const isArticlePost = Boolean(
		tweet.is_article && tweet.article_body_markdown,
	);
	const showFullArticle = isArticlePost && clickToOpen === false;

	if (isArticlePost) {
		const articleContainer = document.createElement("div");
		articleContainer.className = "tweet-content tweet-article";

		if (tweet.article_title) {
			const titleEl = document.createElement("h2");
			titleEl.textContent = tweet.article_title;
			articleContainer.appendChild(titleEl);
		}

		const coverAttachment = Array.isArray(tweet.attachments)
			? tweet.attachments.find((item) => item.file_type?.startsWith("image/"))
			: null;

		if (coverAttachment) {
			const coverEl = document.createElement("div");
			coverEl.classList.add("article-cover");
			coverEl.innerHTML = `<img src="${coverAttachment.file_url}" alt="${coverAttachment.file_name}" loading="lazy" />`;

			const coverImg = coverEl.querySelector("img");
			if (coverImg) {
				coverEl.appendChild(coverImg);
			}
			articleContainer.appendChild(coverEl);
		}

		if (showFullArticle) {
			const articleBody = document.createElement("div");
			articleBody.className = "tweet-article-body";
			articleBody.innerHTML = DOMPurify.sanitize(
				marked.parse(tweet.article_body_markdown, {
					breaks: true,
					gfm: true,
					headerIds: false,
					mangle: false,
				}),
				DOMPURIFY_CONFIG,
			);

			articleBody.querySelectorAll("a").forEach((anchor) => {
				anchor.setAttribute("target", "_blank");
				anchor.setAttribute("rel", "noopener noreferrer");
			});

			articleBody.querySelectorAll("img").forEach((img) => {
				if (!img.hasAttribute("loading")) {
					img.setAttribute("loading", "lazy");
				}
			});

			articleContainer.appendChild(articleBody);
		} else {
			const previewBody = document.createElement("div");
			previewBody.className = "tweet-article-preview";
			const previewSource =
				tweet.article_preview?.excerpt ||
				tweet.article_title ||
				tweet.content ||
				"";
			let previewText = previewSource.trim();
			if (previewText.length > 260) {
				previewText = `${previewText.slice(0, 257)}…`;
			}
			previewBody.innerHTML = linkifyText(previewText);
			replaceEmojiShortcodesInElement(previewBody);

			previewBody.querySelectorAll("a.tweet-hashtag").forEach((tag) => {
				const hashtag = tag.getAttribute("data-hashtag");

				tag.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();

					searchQuery(`#${hashtag}`);
				});
			});

			articleContainer.appendChild(previewBody);

			const readMoreButton = document.createElement("button");
			readMoreButton.type = "button";
			readMoreButton.textContent = "Read article";
			readMoreButton.className = "tweet-article-read-more";
			readMoreButton.addEventListener("click", async (event) => {
				event.preventDefault();
				event.stopPropagation();
				await openTweet(tweet);
			});
			articleContainer.appendChild(readMoreButton);
		}

		tweetEl.appendChild(articleContainer);

		if (tweet.fact_check) {
			tweetEl.appendChild(createFactCheck(tweet.fact_check));
		}
	} else {
		const tweetContentEl = document.createElement("div");
		tweetContentEl.className = "tweet-content";

		const rawContent = tweet.content ? tweet.content.trim() : "";

		const tweetLinkRegex = new RegExp(
			`https?://(?:www\\.)?(?:${location.host.replace(".", "\\.")})/tweet/([a-zA-Z0-9_-]+)`,
			"g",
		);
		let contentWithoutLinks = rawContent;
		const extractedTweetIds = [];
		let match = tweetLinkRegex.exec(rawContent);

		while (match !== null) {
			extractedTweetIds.push(match[1]);
			contentWithoutLinks = contentWithoutLinks.replace(match[0], "").trim();
			match = tweetLinkRegex.exec(rawContent);
		}

		const isExpandedView = clickToOpen === false && size !== "preview";
		const shouldTrim =
			contentWithoutLinks.length > 300 &&
			!isExpandedView &&
			!tweet.extended &&
			!tweet.isExpanded;

		const applyLinkified = (text) => {
			tweetContentEl.innerHTML = linkifyText(text);
			replaceEmojiShortcodesInElement(tweetContentEl);

			tweetContentEl.querySelectorAll("a.tweet-hashtag").forEach((tag) => {
				const hashtag = tag.getAttribute("data-hashtag");

				tag.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();

					searchQuery(`#${hashtag}`);
				});
			});
		};

		if (shouldTrim) {
			let trimmed = contentWithoutLinks.slice(0, 300);
			const lastSpace = Math.max(
				trimmed.lastIndexOf(" "),
				trimmed.lastIndexOf("\n"),
			);
			if (lastSpace > 0) trimmed = trimmed.slice(0, lastSpace);

			applyLinkified(trimmed);

			const ellipsis = document.createElement("span");
			ellipsis.className = "tweet-ellipsis";
			ellipsis.innerText = "Show more…";
			ellipsis.title = "Show more";
			ellipsis.setAttribute("role", "button");
			ellipsis.tabIndex = 0;

			const expand = () => {
				applyLinkified(contentWithoutLinks);
				ellipsis.remove();

				const collapse = document.createElement("span");
				collapse.className = "tweet-ellipsis";
				collapse.innerText = "Show less";
				collapse.addEventListener("click", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					applyLinkified(trimmed);
					tweetContentEl.appendChild(ellipsis);
					collapse.remove();
				});

				tweetContentEl.appendChild(collapse);
			};

			ellipsis.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				expand();
			});
			ellipsis.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					expand();
				}
			});

			tweetContentEl.appendChild(ellipsis);
		} else {
			applyLinkified(contentWithoutLinks);
		}

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

		if (tweet.fact_check) {
			tweetEl.appendChild(createFactCheck(tweet.fact_check));
		}

		maybeAddTranslation(tweet, tweetEl, tweetContentEl);

		if (extractedTweetIds.length > 0 && !tweet.quoted_tweet) {
			const tweetId = extractedTweetIds[0];
			query(`/tweets/${tweetId}`)
				.then((response) => {
					if (response?.tweet) {
						const quotedTweetEl = createTweetElement(response.tweet, {
							size: "preview",
							clickToOpen: true,
						});
						quotedTweetEl.classList.add("tweet-preview");

						const existingQuote = tweetEl.querySelector(".tweet-preview");
						if (!existingQuote) {
							const pollEl = tweetEl.querySelector(".poll-container");
							const attachmentsEl = tweetEl.querySelector(".tweet-attachments");

							if (pollEl) {
								tweetEl.insertBefore(quotedTweetEl, pollEl);
							} else if (attachmentsEl) {
								tweetEl.insertBefore(quotedTweetEl, attachmentsEl);
							} else {
								tweetEl.appendChild(quotedTweetEl);
							}
						}
					}
				})
				.catch((err) => {
					console.error("Failed to load embedded tweet:", err);
				});
		}

		tweetContentEl.querySelectorAll("a").forEach((a) => {
			const url = new URL(a.href, location.origin);

			if (url.host === "youtube.com" || url.host === "www.youtube.com") {
				const videoId = url.searchParams.get("v");
				if (videoId) {
					const videoFrame = document.createElement("iframe");

					videoFrame.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
					videoFrame.width = "200";
					videoFrame.height = "113";
					videoFrame.classList.add("tweet-youtube-iframe");
					videoFrame.setAttribute("frameborder", "0");
					videoFrame.setAttribute(
						"allow",
						"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
					);
					videoFrame.setAttribute(
						"referrerpolicy",
						"strict-origin-when-cross-origin",
					);
					videoFrame.setAttribute("allowfullscreen", "true");
					videoFrame.title = "YouTube video player";
					videoFrame.setAttribute("loading", "lazy");

					tweetContentEl.appendChild(videoFrame);
				}
			}
		});
	}

	if (tweet.poll) {
		const pollEl = createPollElement(tweet.poll, tweet);
		if (pollEl) {
			tweetEl.appendChild(pollEl);
		}
	}

	if (tweet.interactive_card?.options) {
		const cardEl = document.createElement("div");
		cardEl.className = "interactive-card";

		const mediaEl = document.createElement("div");
		mediaEl.className = "card-media";

		if (
			tweet.interactive_card.media_type === "image" ||
			tweet.interactive_card.media_type === "gif"
		) {
			const img = document.createElement("img");
			img.src = tweet.interactive_card.media_url;
			img.alt = "Card media";
			img.setAttribute("loading", "lazy");
			mediaEl.appendChild(img);
		} else if (tweet.interactive_card.media_type === "video") {
			const video = document.createElement("video");
			video.src = tweet.interactive_card.media_url;
			video.controls = true;
			video.setAttribute("loading", "lazy");
			mediaEl.appendChild(video);
		}

		cardEl.appendChild(mediaEl);

		const optionsEl = document.createElement("div");
		optionsEl.className = "card-options";

		tweet.interactive_card.options.forEach((option) => {
			const optionBtn = document.createElement("button");
			optionBtn.type = "button";
			optionBtn.className = "card-option-button";
			optionBtn.textContent = `Tweet ${option.description}`;

			optionBtn.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();

				const { createComposer } = await import("./composer.js");
				const composer = await createComposer({
					placeholder: "Confirm your tweet...",
					autofocus: true,
					interactiveCard: tweet.interactive_card,
					callback: async () => {
						modal.close();
						toastQueue.add(`<h1>Tweet posted!</h1>`);
					},
				});

				const textarea = composer.querySelector("#tweet-textarea");
				if (textarea) {
					textarea.value = option.tweet_text;
					textarea.dispatchEvent(new Event("input"));
				}

				const modal = createModal({
					title: "Confirm Tweet",
					content: composer,
				});
			});

			optionsEl.appendChild(optionBtn);
		});

		cardEl.appendChild(optionsEl);
		tweetEl.appendChild(cardEl);
	}

	if (!isArticlePost && tweet.attachments && tweet.attachments.length > 0) {
		const attachmentsEl = document.createElement("div");
		attachmentsEl.className = "tweet-attachments";

		tweet.attachments.forEach((attachment) => {
			const attachmentEl = document.createElement("div");
			attachmentEl.className = "tweet-attachment";

			if (attachment.file_type.startsWith("image/")) {
				const img = document.createElement("img");
				img.src = attachment.file_url;
				img.alt = attachment.file_name;
				img.setAttribute("loading", "lazy");

				if (attachment.file_name === "unsplash.jpg" && attachment.file_hash) {
					try {
						const attribution = JSON.parse(attachment.file_hash);
						if (attribution?.user_name) {
							const attributionEl = document.createElement("div");
							attributionEl.className = "unsplash-attribution-badge";
							attributionEl.innerHTML = `
								via <a href="${attribution.user_link}?utm_source=tweetapus&utm_medium=referral" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${attribution.user_name}</a> / <a href="https://unsplash.com/?utm_source=tweetapus&utm_medium=referral" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">Unsplash</a>
							`;
							attachmentEl.appendChild(attributionEl);
						}
					} catch (e) {
						console.error("Failed to parse Unsplash attribution", e);
					}
				}

				if (attachment.is_spoiler) {
					attachmentEl.classList.add("spoiler");
					const spoilerOverlay = document.createElement("div");
					spoilerOverlay.className = "spoiler-overlay";
					spoilerOverlay.innerHTML = `
            <div class="spoiler-content">
              <span>Spoiler</span>
            </div>
          `;
					spoilerOverlay.addEventListener("click", (e) => {
						e.preventDefault();
						e.stopPropagation();
						attachmentEl.classList.toggle("spoiler-revealed");
					});
					attachmentEl.appendChild(spoilerOverlay);
				}

				img.addEventListener("click", async (e) => {
					if (
						attachment.is_spoiler &&
						!attachmentEl.classList.contains("spoiler-revealed")
					) {
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					e.preventDefault();
					e.stopPropagation();

					const { openImageFullscreen } = await import(
						"../../shared/image-viewer.js"
					);
					openImageFullscreen(attachment.file_url, attachment.file_name);
				});

				if (attachment.file_url.startsWith("https://emojik.vercel.app/s/")) {
					img.style.width = "160px";
					img.style.height = "160px";
					img.style.borderRadius = "none";
					img.style.pointerEvents = "none";
					img.style.border = "none";
					img.draggable = false;
					img.src = `${attachment.file_url}?size=260`;
					tweetEl.appendChild(img);
				} else {
					attachmentEl.appendChild(img);
				}
			} else if (attachment.file_type === "video/mp4") {
				const video = document.createElement("video");
				video.src = attachment.file_url;
				video.controls = true;
				attachmentEl.appendChild(video);
			}

			attachmentsEl.appendChild(attachmentEl);
		});

		if (attachmentsEl.querySelectorAll("img, video").length)
			tweetEl.appendChild(attachmentsEl);
	}

	if (tweet.quoted_tweet) {
		if (tweet.quoted_tweet.unavailable_reason === "suspended") {
			const suspendedQuoteEl = document.createElement("div");
			suspendedQuoteEl.className =
				"tweet-preview unavailable-quote suspended-quote";
			suspendedQuoteEl.textContent = "This tweet is from a suspended account.";

			suspendedQuoteEl.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
			});
			suspendedQuoteEl.style.cursor = "default";
			tweetEl.appendChild(suspendedQuoteEl);
		} else if (!tweet.quoted_tweet.author) {
			const unavailableQuoteEl = document.createElement("div");
			unavailableQuoteEl.className = "tweet-preview unavailable-quote";
			unavailableQuoteEl.textContent = "Quote tweet unavailable";
			unavailableQuoteEl.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
			});
			unavailableQuoteEl.style.cursor = "default";
			tweetEl.appendChild(unavailableQuoteEl);
		} else {
			const quotedTweetEl = createTweetElement(tweet.quoted_tweet, {
				clickToOpen: true,
				showTopReply: false,
				isTopReply: false,
				size: "preview",
			});
			tweetEl.appendChild(quotedTweetEl);
		}
	}

	function formatNumber(num) {
		if (num >= 1_000_000_000_000) {
			return `${(num / 1_000_000_000_000).toFixed(2).replace(/\.?0+$/, "")}T`;
		} else if (num >= 1_000_000_000) {
			return `${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
		} else if (num >= 1_000_000) {
			return `${(num / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
		} else if (num >= 10_000) {
			return `${(num / 1_000).toFixed(1).replace(/\.?0+$/, "")}k`;
		}
		return num;
	}

	const tweetInteractionsEl = document.createElement("div");
	tweetInteractionsEl.className = "tweet-interactions";

	const tweetInteractionsLikeEl = document.createElement("button");
	tweetInteractionsLikeEl.className = "engagement";
	tweetInteractionsLikeEl.dataset.liked = tweet.liked_by_user;
	tweetInteractionsLikeEl.dataset.likeCount = tweet.like_count || 0;
	tweetInteractionsLikeEl.style.setProperty("--color", "249, 25, 128");

	tweetInteractionsLikeEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="${tweet.liked_by_user ? "#F91980" : "none"}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.00002 2.54822C8.00003 2.09722 9.58337 4.93428 10 5.87387C10.4167 4.93428 12 2.09722 15 2.54822C18 2.99923 18.75 5.66154 18.75 7.05826C18.75 9.28572 18.1249 10.9821 16.2499 13.244C14.3749 15.506 10 18.3333 10 18.3333C10 18.3333 5.62498 15.506 3.74999 13.244C1.875 10.9821 1.25 9.28572 1.25 7.05826C1.25 5.66154 2 2.99923 5.00002 2.54822Z"
            stroke="${tweet.liked_by_user ? "#F91980" : "currentColor"}"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> <span class="like-count">${
					tweet.like_count ? formatNumber(tweet.like_count) : ""
				}</span>`;

	tweetInteractionsLikeEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		const wasLiked = tweetInteractionsLikeEl.dataset.liked === "true";
		const newIsLiked = !wasLiked;
		tweetInteractionsLikeEl.dataset.liked = newIsLiked;

		const svg = tweetInteractionsLikeEl.querySelector("svg path");
		const likeCountSpan = tweetInteractionsLikeEl.querySelector(".like-count");
		const currentCount = parseInt(
			tweetInteractionsLikeEl.dataset.likeCount || "0",
			10,
		);

		tweet.liked_by_user = newIsLiked;
		tweet.like_count = newIsLiked
			? currentCount + 1
			: Math.max(0, currentCount - 1);

		if (newIsLiked) {
			svg.setAttribute("fill", "#F91980");
			svg.setAttribute("stroke", "#F91980");
			tweetInteractionsLikeEl.dataset.likeCount = currentCount + 1;
			likeCountSpan.textContent =
				currentCount + 1 === 0 ? "" : formatNumber(currentCount + 1);

			tweetInteractionsLikeEl.querySelector("svg").classList.add("like-bump");

			setTimeout(() => {
				tweetInteractionsLikeEl
					.querySelector("svg")
					.classList.remove("like-bump");
			}, 500);
		} else {
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", "currentColor");
			tweetInteractionsLikeEl.dataset.likeCount = Math.max(0, currentCount - 1);
			likeCountSpan.textContent =
				Math.max(0, currentCount - 1) === 0
					? ""
					: formatNumber(Math.max(0, currentCount - 1));
		}

		const result = await query(`/tweets/${tweet.id}/like`, {
			method: "POST",
		});

		if (!result.success) {
			if (result.error === "You cannot interact with this user") {
				tweetInteractionsLikeEl.dataset.liked = wasLiked;
				tweetInteractionsLikeEl.dataset.likeCount = currentCount;

				if (wasLiked) {
					svg.setAttribute("fill", "#F91980");
					svg.setAttribute("stroke", "#F91980");
				} else {
					svg.setAttribute("fill", "none");
					svg.setAttribute("stroke", "currentColor");
				}
				likeCountSpan.textContent =
					currentCount === 0 ? "" : formatNumber(currentCount);

				createBlockedModal();
			} else {
				toastQueue.add(`<h1>${result.error || "Failed to like tweet"}</h1>`);
			}
		}
	});

	const tweetInteractionsReplyEl = document.createElement("button");
	tweetInteractionsReplyEl.className = "engagement";
	tweetInteractionsReplyEl.style.setProperty("--color", "17, 133, 254");
	tweetInteractionsReplyEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18.7502 11V7.50097C18.7502 4.73917 16.5131 2.50033 13.7513 2.50042L6.25021 2.50044C3.48848 2.5004 1.25017 4.73875 1.2502 7.50048L1.25021 10.9971C1.2502 13.749 3.47395 15.9836 6.22586 15.9971L6.82888 16V19.0182L12.1067 16H13.7502C16.5116 16 18.7502 13.7614 18.7502 11Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> ${tweet.reply_count ? formatNumber(tweet.reply_count) : ""}`;

	tweetInteractionsReplyEl.addEventListener("click", async (e) => {
		if (!clickToOpen) return;

		e.stopPropagation();
		e.preventDefault();

		await openTweet(tweet);

		requestAnimationFrame(() => {
			if (document.querySelector(".tweetPage #tweet-textarea")) {
				document.querySelector(".tweetPage #tweet-textarea").focus();
			}
		});
	});

	const tweetInteractionsRetweetEl = document.createElement("button");
	tweetInteractionsRetweetEl.className = "engagement";
	tweetInteractionsRetweetEl.dataset.retweeted = tweet.retweeted_by_user;
	tweetInteractionsRetweetEl.dataset.retweetCount = tweet.retweet_count || 0;
	tweetInteractionsRetweetEl.style.setProperty("--color", "0, 186, 124");

	const retweetColor = tweet.retweeted_by_user ? "#00BA7C" : "currentColor";

	tweetInteractionsRetweetEl.innerHTML = `
            <svg
              width="19"
              height="19"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882"
                stroke="${retweetColor}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg> <span class="retweet-count">${
							tweet.retweet_count ? formatNumber(tweet.retweet_count) : ""
						}</span>`;

	tweetInteractionsRetweetEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		const menuItems = [
			{
				id: "retweet-option",
				icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
				title: "Retweet",
				onClick: async () => {
					try {
						const svgPaths =
							tweetInteractionsRetweetEl.querySelectorAll("svg path");
						const retweetCountSpan =
							tweetInteractionsRetweetEl.querySelector(".retweet-count");
						const currentCount = parseInt(
							tweetInteractionsRetweetEl.dataset.retweetCount || "0",
							10,
						);

						const result = await query(`/tweets/${tweet.id}/retweet`, {
							method: "POST",
						});

						if (result.success) {
							const newIsRetweeted = result.retweeted;
							tweet.retweeted_by_user = newIsRetweeted;
							tweet.retweet_count = newIsRetweeted
								? tweet.retweet_count + 1
								: tweet.retweet_count - 1;
							tweetInteractionsRetweetEl.dataset.retweeted = newIsRetweeted;

							if (newIsRetweeted) {
								svgPaths.forEach((path) => {
									path.setAttribute("stroke", "#00BA7C");
								});
								tweetInteractionsRetweetEl.dataset.retweetCount =
									currentCount + 1;
								retweetCountSpan.textContent =
									currentCount + 1 === 0 ? "" : formatNumber(currentCount + 1);
							} else {
								svgPaths.forEach((path) => {
									path.setAttribute("stroke", "currentColor");
								});
								const newCount = Math.max(0, currentCount - 1);
								tweetInteractionsRetweetEl.dataset.retweetCount = newCount;
								retweetCountSpan.textContent =
									newCount === 0 ? "" : formatNumber(newCount);
							}
						} else {
							if (result.error === "You cannot interact with this user") {
								createBlockedModal();
							} else {
								toastQueue.add(
									`<h1>${result.error || "Failed to retweet"}</h1>`,
								);
							}
						}
					} catch (error) {
						console.error("Error retweeting:", error);
						toastQueue.add(`<h1>Network error. Please try again.</h1>`);
					}
				},
			},
			{
				id: "quote-option",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>
          <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>
        </svg>`,
				title: "Quote",
				onClick: async () => {
					const { createComposer } = await import("./composer.js");

					const composer = await createComposer({
						placeholder: "Add your thoughts about this tweet...",
						quoteTweet: tweet,
						autofocus: true,
						callback: async (newTweet) => {
							addTweetToTimeline(newTweet, true).classList.add("created");
							setTimeout(() => {
								modal.close();
							}, 10);
						},
					});

					const { modal } = createModal({
						content: composer,
					});
					modal.querySelector("textarea")?.focus();
				},
			},
		];

		if (tweet.quote_count && tweet.quote_count > 0) {
			menuItems.push({
				id: "view-quotes-option",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>`,
				title: "View quotes",
				onClick: async () => {
					await showInteractionsModal(tweet.id, "quotes");
				},
			});
		}

		createPopup({
			triggerElement: tweetInteractionsRetweetEl,
			items: menuItems,
		});
	});

	const tweetInteractionsOptionsEl = document.createElement("button");
	tweetInteractionsOptionsEl.className = "engagement";
	tweetInteractionsOptionsEl.style.setProperty("--color", "17, 133, 254");

	tweetInteractionsOptionsEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M15.498 8.50159C16.3254 8.50159 16.9959 9.17228 16.9961 9.99963C16.9961 10.8271 16.3256 11.4987 15.498 11.4987C14.6705 11.4987 14 10.8271 14 9.99963C14.0002 9.17228 14.6706 8.50159 15.498 8.50159Z"></path><path d="M4.49805 8.50159C5.32544 8.50159 5.99689 9.17228 5.99707 9.99963C5.99707 10.8271 5.32555 11.4987 4.49805 11.4987C3.67069 11.4985 3 10.827 3 9.99963C3.00018 9.17239 3.6708 8.50176 4.49805 8.50159Z"></path><path d="M10.0003 8.50159C10.8276 8.50176 11.4982 9.17239 11.4984 9.99963C11.4984 10.827 10.8277 11.4985 10.0003 11.4987C9.17283 11.4987 8.50131 10.8271 8.50131 9.99963C8.50149 9.17228 9.17294 8.50159 10.0003 8.50159Z"></path></svg>`;

	tweetInteractionsOptionsEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		const defaultItems = [
			{
				id: "see-interactions",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
				title: "See interactions",
				onClick: async () => {
					await showInteractionsModal(tweet.id);
				},
			},
			{
				id: "bookmark",
				icon: `
        <svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.625 3.125H14.375C14.9963 3.125 15.5 3.62868 15.5 4.25V16.5073C15.5 16.959 15.0134 17.2422 14.6301 17.011L10 14.2222L5.36986 17.011C4.98664 17.2422 4.5 16.959 4.5 16.5073V4.25C4.5 3.62868 5.00368 3.125 5.625 3.125Z"
            stroke="${tweet.bookmarked_by_user ? "#FFA900" : "currentColor"}"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="${tweet.bookmarked_by_user ? "#FFA900" : "none"}"
          />
        </svg>`,
				title: `${tweet.bookmarked_by_user ? "Un-b" : "B"}ookmark ${
					tweet.bookmark_count ? `(${tweet.bookmark_count || "0"})` : ""
				}`,
				onClick: async () => {
					e.preventDefault();
					e.stopPropagation();

					const isBookmarked = tweet.bookmarked_by_user;

					const result = await query(
						isBookmarked ? "/bookmarks/remove" : "/bookmarks/add",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ postId: tweet.id }),
						},
					);

					if (result.success) {
						tweet.bookmarked_by_user = result.bookmarked;
					} else {
						toastQueue.add(
							`<h1>${result.error || "Failed to bookmark tweet"}</h1>`,
						);
					}
				},
			},

			{
				id: "copy-link",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
				title: "Copy link",
				onClick: () => {
					const tweetUrl = `${window.location.origin}/tweet/${tweet.id}`;

					navigator.clipboard.writeText(tweetUrl);
				},
			},

			{
				id: "share",
				icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.2171 2.2793L10.2171 12.9745M10.2171 2.2793L13.333 4.99984M10.2171 2.2793L7.08301 4.99984M2.49967 10.9925L2.49967 14.1592C2.49967 16.011 4.00084 17.5121 5.85261 17.5121L14.9801 17.5121C16.8318 17.5121 18.333 16.011 18.333 14.1592L18.333 10.9925" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
				title: "Share",
				onClick: async () => {
					const tweetUrl = `${window.location.origin}/tweet/${tweet.id}?ref=share`;
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
						} else {
							await navigator.clipboard.writeText(tweetUrl);
							toastQueue.add(`<h1>Link copied to clipboard!</h1>`);
						}
					} catch {
						toastQueue.add(`<h1>Unable to share tweet</h1>`);
					}
				},
			},

			{
				id: "share-image",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`,
				title: "Share as image",
				onClick: async () => {
					const tweetElClone = document.createElement("div");
					tweetElClone.innerHTML = tweetEl.outerHTML;

					tweetElClone.querySelectorAll(".tweet-actions").forEach((el) => {
						el.remove();
					});
					tweetElClone.querySelectorAll(".tweet-menu-btn").forEach((el) => {
						el.remove();
					});
					tweetElClone.querySelectorAll(".spoiler-overlay").forEach((el) => {
						el.remove();
					});

					const computedPrimary = getComputedStyle(document.documentElement)
						.getPropertyValue("--primary")
						.trim();
					const computedPrimaryFg =
						getComputedStyle(document.documentElement)
							.getPropertyValue("--primary-fg")
							.trim() || "#ffffff";
					const computedBgPrimary =
						getComputedStyle(document.documentElement)
							.getPropertyValue("--bg-primary")
							.trim() || "#ffffff";
					const computedTextPrimary =
						getComputedStyle(document.documentElement)
							.getPropertyValue("--text-primary")
							.trim() || "#0f1419";

					tweetElClone
						.querySelectorAll(".verification-badge svg path")
						.forEach((path) => {
							const fill = path.getAttribute("fill");
							const stroke = path.getAttribute("stroke");
							if (fill === "var(--primary)")
								path.setAttribute("fill", computedPrimary);
							if (stroke === "var(--primary-fg)")
								path.setAttribute("stroke", computedPrimaryFg);
						});

					const wrapper = document.createElement("div");
					wrapper.className = "tweet-share-wrapper";
					wrapper.style.backgroundColor = computedPrimary;

					const attribution = document.createElement("div");
					attribution.className = "tweet-share-attribution";
					attribution.innerHTML = `Tweetapus`;
					attribution.style.color = computedPrimaryFg;
					wrapper.appendChild(attribution);

					const tweetContainer = document.createElement("div");
					tweetContainer.className = "tweet-share-container";
					tweetContainer.style.backgroundColor = computedBgPrimary;
					tweetContainer.style.color = computedTextPrimary;

					tweetContainer.appendChild(tweetElClone);
					wrapper.appendChild(tweetContainer);

					document.body.appendChild(wrapper);

					const allImages = wrapper.querySelectorAll("img");
					const imagePromises = Array.from(allImages).map((img) => {
						return new Promise((resolve) => {
							if (img.complete && img.naturalHeight !== 0) {
								resolve();
							} else {
								img.onload = resolve;
								img.onerror = resolve;
							}
						});
					});

					await Promise.all(imagePromises);

					const runCapture = () => {
						window
							.html2canvas(wrapper, {
								backgroundColor: computedPrimary,
								scale: 3,
								width: wrapper.offsetWidth,
								useCORS: true,
								allowTaint: true,
								logging: false,
							})
							.then((canvas) => {
								canvas.toBlob((blob) => {
									const url = URL.createObjectURL(blob);
									const a = document.createElement("a");
									a.href = url;
									a.download = `tweetapus_${tweet.id}.png`;
									a.click();
									wrapper.remove();
								});
							});
					};

					if (window.html2canvas) {
						runCapture();
					} else {
						const script = document.createElement("script");
						script.src = "/public/shared/assets/js/html2canvas.min.js";
						script.onload = runCapture;
						document.head.appendChild(script);
					}
				},
			},
		];

		const userItems = [
			{
				id: tweet.pinned ? "unpin-option" : "pin-option",
				icon: tweet.pinned
					? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5"></path>
                  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
                </svg>`
					: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5"></path>
                  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17H16.1a2 2 0 0 0 1.78-2.55l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1z"></path>
                </svg>`,
				title: tweet.pinned ? "Unpin from profile" : "Pin to profile",
				onClick: async () => {
					try {
						const method = tweet.pinned ? "DELETE" : "POST";
						const result = await query(`/profile/pin/${tweet.id}`, {
							method,
						});

						if (result.success) {
							tweet.pinned = !tweet.pinned;
							toastQueue.add(
								`<h1>Tweet ${
									tweet.pinned ? "pinned" : "unpinned"
								} successfully</h1>`,
							);

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
								const existingIndicator =
									tweetEl.querySelector(".pinned-indicator");
								if (!existingIndicator) {
									tweetEl.insertBefore(pinnedIndicatorEl, tweetEl.firstChild);
								}
							} else {
								const pinnedIndicator =
									tweetEl.querySelector(".pinned-indicator");
								if (pinnedIndicator) {
									pinnedIndicator.remove();
								}
							}
						} else {
							toastQueue.add(
								`<h1>${result.error || "Failed to update pin status"}</h1>`,
							);
						}
					} catch (error) {
						console.error("Error updating pin status:", error);
						toastQueue.add(`<h1>Network error. Please try again.</h1>`);
					}
				},
			},
			{
				id: "change-reply-restriction",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>`,
				title: "Change who can reply",
				onClick: async () => {
					const currentRestriction = tweet.reply_restriction || "everyone";

					const restrictionMenu = document.createElement("div");
					restrictionMenu.className = "reply-restriction-modal";
					restrictionMenu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-primary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 20px;
            z-index: 10000;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
          `;

					const title = document.createElement("h2");
					title.textContent = "Who can reply?";
					title.style.cssText = "margin: 0 0 16px; font-size: 18px;";
					restrictionMenu.appendChild(title);

					const modalOverlay = document.createElement("div");
					modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
          `;

					const closeModal = () => {
						if (modalOverlay.parentNode === document.body) {
							document.body.removeChild(modalOverlay);
						}
						if (restrictionMenu.parentNode === document.body) {
							document.body.removeChild(restrictionMenu);
						}
					};

					modalOverlay.addEventListener("click", closeModal);

					const options = [
						{ value: "everyone", label: "Everyone" },
						{ value: "following", label: "People you follow" },
						{ value: "followers", label: "Your followers" },
						{ value: "verified", label: "Verified accounts" },
					];

					options.forEach((option) => {
						const optionBtn = document.createElement("button");
						optionBtn.type = "button";
						optionBtn.style.cssText = `
              display: block;
              width: 100%;
              padding: 12px;
              margin-bottom: 8px;
              text-align: left;
              border: 1px solid ${
								option.value === currentRestriction
									? "var(--primary)"
									: "var(--border-primary)"
							};
              background: ${
								option.value === currentRestriction
									? "rgba(var(--primary-rgb), 0.1)"
									: "transparent"
							};
              border-radius: 8px;
              cursor: pointer;
              color: var(--text-primary);
              font-size: 14px;
              transition: all 0.2s ease;
            `;

						if (option.value === currentRestriction) {
							optionBtn.innerHTML = `<strong>✓ ${option.label}</strong>`;
						} else {
							optionBtn.textContent = option.label;
						}

						optionBtn.addEventListener("click", async () => {
							try {
								const result = await query(
									`/tweets/${tweet.id}/reply-restriction`,
									{
										method: "PATCH",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ reply_restriction: option.value }),
									},
								);

								if (result.success) {
									tweet.reply_restriction = option.value;
									closeModal();
									toastQueue.add(`<h1>Reply restriction updated</h1>`);
								} else {
									toastQueue.add(
										`<h1>${
											result.error || "Failed to update reply restriction"
										}</h1>`,
									);
								}
							} catch (err) {
								console.error("Error updating reply restriction:", err);
								toastQueue.add(`<h1>Network error. Please try again.</h1>`);
							}
						});

						restrictionMenu.appendChild(optionBtn);
					});

					const cancelBtn = document.createElement("button");
					cancelBtn.type = "button";
					cancelBtn.textContent = "Cancel";
					cancelBtn.style.cssText = `
            display: block;
            width: 100%;
            padding: 12px;
            margin-top: 12px;
            border: 1px solid var(--border-primary);
            background: transparent;
            border-radius: 8px;
            cursor: pointer;
            color: var(--text-primary);
            font-size: 14px;
          `;
					cancelBtn.addEventListener("click", closeModal);
					restrictionMenu.appendChild(cancelBtn);

					document.body.appendChild(modalOverlay);
					document.body.appendChild(restrictionMenu);
				},
			},
			{
				id: "edit-option",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>`,
				title: "Edit tweet",
				onClick: async () => {
					if (tweet.poll_id) {
						toastQueue.add(`<h1>Cannot edit tweets with polls</h1>`);
						return;
					}

					const currentUser = await getUser();
					let maxTweetLength = currentUser.character_limit || 400;
					if (!currentUser.character_limit) {
						maxTweetLength = currentUser.gray
							? 37500
							: currentUser.gold
								? 16500
								: currentUser.verified
									? 5500
									: 400;
					}

					const editForm = document.createElement("form");
					editForm.className = "edit-tweet-form";

					const textarea = document.createElement("textarea");
					textarea.className = "edit-tweet-textarea";
					textarea.value = tweet.content || "";
					textarea.placeholder = "What's happening?";

					const charCounter = document.createElement("div");
					charCounter.className = "edit-tweet-char-counter";

					const updateCharCounter = () => {
						const remaining = maxTweetLength - textarea.value.length;
						charCounter.textContent = `${remaining}`;
						charCounter.classList.toggle(
							"warning",
							remaining < 50 && remaining >= 0,
						);
						charCounter.classList.toggle("error", remaining < 0);
					};

					textarea.addEventListener("input", updateCharCounter);
					updateCharCounter();

					const buttonContainer = document.createElement("div");
					buttonContainer.className = "edit-tweet-buttons";

					const cancelButton = document.createElement("button");
					cancelButton.type = "button";
					cancelButton.className = "edit-tweet-cancel";
					cancelButton.textContent = "Cancel";

					const saveButton = document.createElement("button");
					saveButton.type = "submit";
					saveButton.className = "edit-tweet-save";
					saveButton.textContent = "Save";

					buttonContainer.appendChild(cancelButton);
					buttonContainer.appendChild(saveButton);

					editForm.appendChild(textarea);
					editForm.appendChild(charCounter);
					editForm.appendChild(buttonContainer);

					const { createModal } = await import("../../shared/ui-utils.js");
					const editModal = createModal({
						title: "Edit tweet",
						content: editForm,
						className: "edit-tweet-modal",
					});

					cancelButton.addEventListener("click", () => editModal.close());

					editForm.addEventListener("submit", async (e) => {
						e.preventDefault();

						const newContent = textarea.value.trim();
						if (!newContent) {
							toastQueue.add(`<h1>Tweet content cannot be empty</h1>`);
							return;
						}

						if (newContent.length > maxTweetLength) {
							toastQueue.add(`<h1>Tweet content is too long</h1>`);
							return;
						}

						saveButton.disabled = true;
						saveButton.textContent = "Saving...";

						const result = await query(`/tweets/${tweet.id}`, {
							method: "PUT",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ content: newContent }),
						});

						if (result.success) {
							tweet.content = newContent;
							tweet.edited_at = result.tweet.edited_at;

							const contentEl = tweetEl.querySelector(".tweet-content");
							if (contentEl) {
								contentEl.innerHTML = linkifyText(newContent);
								replaceEmojiShortcodesInElement(contentEl);

								const editedIndicator = document.createElement("span");
								editedIndicator.className = "tweet-edited-indicator";
								editedIndicator.textContent = " (edited)";
								const usernameEl = tweetEl.querySelector(
									".tweet-header-username",
								);
								if (
									usernameEl &&
									!usernameEl.querySelector(".tweet-edited-indicator")
								) {
									usernameEl.appendChild(editedIndicator);
								}
							}

							editModal.close();
							toastQueue.add(`<h1>Tweet updated successfully</h1>`);
						} else {
							toastQueue.add(
								`<h1>${result.error || "Failed to update tweet"}</h1>`,
							);
							saveButton.disabled = false;
							saveButton.textContent = "Save";
						}
					});

					textarea.focus();
				},
			},
			{
				id: "change-outline",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a7 7 0 0 1 7 7"></path>
              <path d="M12 22a7 7 0 0 0 7-7"></path>
            </svg>`,
				title: "Change tweet outline",
				requiresGray: true,
				onClick: async () => {
					const { createModal } = await import("../../shared/ui-utils.js");

					const formContainer = document.createElement("div");
					formContainer.style.cssText =
						"display: flex; flex-direction: column; gap: 12px;";

					const label = document.createElement("label");
					label.textContent = "Outline (CSS color or gradient)";
					label.style.cssText =
						"font-size: 14px; color: var(--text-secondary);";

					const input = document.createElement("input");
					input.type = "text";
					input.placeholder = "e.g. red, #ff0000, linear-gradient(...)";
					input.value = tweet.outline || "";
					input.style.cssText =
						"padding: 10px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;";

					const hint = document.createElement("p");
					hint.textContent =
						"Leave empty to remove outline. Supports solid colors and gradients.";
					hint.style.cssText =
						"font-size: 12px; color: var(--text-tertiary); margin: 0;";

					const buttonContainer = document.createElement("div");
					buttonContainer.style.cssText =
						"display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;";

					const cancelBtn = document.createElement("button");
					cancelBtn.type = "button";
					cancelBtn.textContent = "Cancel";
					cancelBtn.style.cssText =
						"padding: 8px 16px; border: 1px solid var(--border-primary); background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-primary);";

					const saveBtn = document.createElement("button");
					saveBtn.type = "button";
					saveBtn.textContent = "Save";
					saveBtn.style.cssText =
						"padding: 8px 16px; border: none; background: var(--primary); border-radius: 8px; cursor: pointer; color: white;";

					buttonContainer.appendChild(cancelBtn);
					buttonContainer.appendChild(saveBtn);

					formContainer.appendChild(label);
					formContainer.appendChild(input);
					formContainer.appendChild(hint);
					formContainer.appendChild(buttonContainer);

					const modal = createModal({
						title: "Change Tweet Outline",
						content: formContainer,
						className: "change-outline-modal",
					});

					cancelBtn.addEventListener("click", () => modal.close());

					saveBtn.addEventListener("click", async () => {
						const outline = input.value.trim() || null;
						saveBtn.disabled = true;
						saveBtn.textContent = "Saving...";

						const result = await query(`/tweets/${tweet.id}/outline`, {
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ outline }),
						});

						if (result.success) {
							tweet.outline = outline;
							if (outline) {
								tweetEl.style.border = `2px solid transparent`;
								tweetEl.style.borderImage = outline.includes("gradient")
									? `${outline} 1`
									: `linear-gradient(${outline}, ${outline}) 1`;
								tweetEl.style.borderRadius = "16px";
							} else {
								tweetEl.style.border = "";
								tweetEl.style.borderImage = "";
							}
							modal.close();
							toastQueue.add(`<h1>Tweet outline updated</h1>`);
						} else {
							toastQueue.add(
								`<h1>${result.error || "Failed to update outline"}</h1>`,
							);
							saveBtn.disabled = false;
							saveBtn.textContent = "Save";
						}
					});
				},
			},
			{
				id: "delete-option",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0,0 1,-2,2H7a2,2 0,0 1,-2,-2V6m3,0V4a2,2 0,0 1,2,-2h4a2,2 0,0 1,2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>`,
				title: "Delete tweet",
				onClick: async () => {
					createConfirmModal({
						title: "Delete tweet",
						message:
							"Are you sure you want to delete this tweet? This action cannot be undone.",
						confirmText: "Delete",
						cancelText: "Cancel",
						danger: true,
						onConfirm: async () => {
							tweetEl.remove();

							const result = await query(`/tweets/${tweet.id}`, {
								method: "DELETE",
							});

							if (!result.success) {
								toastQueue.add(
									`<h1>${result.error || "Failed to delete tweet"}</h1>`,
								);
							}
						},
					});
				},
			},
		];

		getUser().then(async (currentUser) => {
			const isOwnTweet =
				currentUser && String(currentUser.id) === String(tweet.author?.id);

			let filteredUserItems = [];
			if (isOwnTweet) {
				filteredUserItems = userItems.filter((item) => {
					if (item.requiresGray && !currentUser.gray) return false;
					return true;
				});
			}

			const items = isOwnTweet
				? [...defaultItems, ...filteredUserItems]
				: [...defaultItems];

			if (currentUser && tweet.author && !isOwnTweet) {
				const checkResp = await query(`/blocking/check/${tweet.author.id}`);
				const isBlocked = checkResp?.blocked || false;

				const blockItem = {
					id: isBlocked ? "unblock-user" : "block-user",
					icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
					title: isBlocked
						? `Unblock @${tweet.author.username}`
						: `Block @${tweet.author.username}`,
					onClick: async () => {
						try {
							if (
								!confirm(
									`${isBlocked ? "Unblock" : "Block"} @${
										tweet.author.username
									}?`,
								)
							)
								return;
							const endpoint = isBlocked
								? "/blocking/unblock"
								: "/blocking/block";
							const result = await query(endpoint, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									userId: tweet.author.id,
									sourceTweetId: isBlocked ? undefined : tweet.id,
								}),
							});

							if (result.success) {
								toastQueue.add(
									`<h1>${isBlocked ? "User unblocked" : "User blocked"}</h1>`,
								);
							} else {
								toastQueue.add(
									`<h1>${result.error || "Failed to update block status"}</h1>`,
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

			const reportItem = {
				id: "report-tweet",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flag-icon lucide-flag"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>`,
				title: "Report tweet",
				onClick: async () => {
					const { showReportModal } = await import(
						"../../shared/report-modal.js"
					);
					showReportModal({
						type: "post",
						id: tweet.id,
						username: tweet.author.username,
						content: tweet.content,
					});
				},
			};

			items.push(reportItem);

			createPopup({
				triggerElement: tweetInteractionsOptionsEl,
				items,
			});
		});
	});

	const replyRestriction = tweet.reply_restriction || "everyone";
	let restrictionEl = null;

	const createRestrictionElement = () => {
		if (replyRestriction !== "everyone") {
			import("./auth.js").then(async ({ authToken }) => {
				if (authToken) {
					const getUser = (await import("./auth.js")).default;
					const currentUser = await getUser();

					if (currentUser && currentUser.id === tweet.author.id) {
						if (!restrictionEl) {
							restrictionEl = document.createElement("div");
							restrictionEl.className = "reply-restriction-info";
							const existingRestriction = tweetEl.querySelector(
								".reply-restriction-info",
							);
							if (!existingRestriction && tweetInteractionsEl.parentNode) {
								tweetEl.insertBefore(restrictionEl, tweetInteractionsEl);
							}
						}
						restrictionEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.7502 11V7.50097C18.7502 4.73917 16.5131 2.50033 13.7513 2.50042L6.25021 2.50044C3.48848 2.5004 1.25017 4.73875 1.2502 7.50048L1.25021 10.9971C1.2502 13.749 3.47395 15.9836 6.22586 15.9971L6.82888 16V19.0182L12.1067 16H13.7502C16.5116 16 18.7502 13.7614 18.7502 11Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg> You can reply to your own tweet`;
						return;
					}

					checkReplyPermissions(tweet, replyRestriction).then(
						({ canReply: allowed, restrictionText }) => {
							if (!allowed) {
								tweetInteractionsReplyEl.disabled = true;
								tweetInteractionsReplyEl.classList.add("reply-restricted");
								tweetInteractionsReplyEl.title =
									"You cannot reply to this tweet";
							}

							if (restrictionText) {
								if (!restrictionEl) {
									restrictionEl = document.createElement("div");
									restrictionEl.className = "reply-restriction-info";
									const existingRestriction = tweetEl.querySelector(
										".reply-restriction-info",
									);
									if (!existingRestriction && tweetInteractionsEl.parentNode) {
										tweetEl.insertBefore(restrictionEl, tweetInteractionsEl);
									}
								}
								restrictionEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.7502 11V7.50097C18.7502 4.73917 16.5131 2.50033 13.7513 2.50042L6.25021 2.50044C3.48848 2.5004 1.25017 4.73875 1.2502 7.50048L1.25021 10.9971C1.2502 13.749 3.47395 15.9836 6.22586 15.9971L6.82888 16V19.0182L12.1067 16H13.7502C16.5116 16 18.7502 13.7614 18.7502 11Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${restrictionText}`;
							}
						},
					);
				}
			});
		}
	};

	tweetInteractionsEl.appendChild(tweetInteractionsLikeEl);
	tweetInteractionsEl.appendChild(tweetInteractionsRetweetEl);
	tweetInteractionsEl.appendChild(tweetInteractionsReplyEl);

	const tweetInteractionsRightEl = document.createElement("div");
	tweetInteractionsRightEl.className = "tweet-interactions-right";

	const tweetInteractionsViewsEl = document.createElement("span");
	tweetInteractionsViewsEl.className = "engagement views-count";
	tweetInteractionsViewsEl.innerHTML = `
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 5C5 5 2 10 2 10s3 5 8 5 8-5 8-5-3-5-8-5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
    <span>${tweet.view_count > 0 ? formatNumber(tweet.view_count) : "1"}</span>`;
	tweetInteractionsViewsEl.style.setProperty("--color", "119, 119, 119");
	tweetInteractionsViewsEl.title = `${tweet.view_count || 0} views`;

	const reactionCountSpan = document.createElement("span");
	reactionCountSpan.className = "reaction-count"; // Tr cursor shouldn't be stuck It's not stuck, Opua YT  Opuadmin i see, Tr. TRdS. Tr✅ OPUADMIN HAMOOD HABIBI UNOFFICIAL HAS HAPPIES HABIBI✅✅ // why does my opus have a warning look at discord and you will see why

	const topReactionsSpan = document.createElement("span"); // NOOOOOO TR STUCK CURSOR
	topReactionsSpan.className = "top-reactions";

	const tweetInteractionsReactionEl = document.createElement("button");
	tweetInteractionsReactionEl.className = "engagement reaction-btn";
	tweetInteractionsReactionEl.dataset.bookmarked = "false";
	tweetInteractionsReactionEl.title = "React";
	tweetInteractionsReactionEl.style.setProperty("--color", "255, 180, 0");
	tweetInteractionsReactionEl.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-smile-plus-icon lucide-smile-plus"><path d="M22 11v1a10 10 0 1 1-9-10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/><path d="M16 5h6"/><path d="M19 2v6"/></svg>`;

	const updateReactionDisplay = () => {
		const topReactions = tweet.top_reactions || [];

		if (topReactions.length > 0) {
			topReactionsSpan.innerHTML = topReactions.map((r) => r.emoji).join("");
			// Replace any :shortcode: text inside the top reactions with image elements
			replaceEmojiShortcodesInElement(topReactionsSpan);
			topReactionsSpan.style.display = "inline";
		} else {
			topReactionsSpan.innerHTML = "";
			topReactionsSpan.style.display = "none";
		}

		if (tweet.reaction_count > 0) {
			reactionCountSpan.textContent = String(tweet.reaction_count);
			reactionCountSpan.style.display = "inline";
		} else {
			reactionCountSpan.textContent = "";
			reactionCountSpan.style.display = "none";
		}
	};

	updateReactionDisplay();

	tweetInteractionsReactionEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		try {
			const { showEmojiPickerPopup } = await import(
				"../../shared/emoji-picker.js"
			);
			const { triggerReactionBurst } = await import(
				"../../shared/reactions.js"
			);

			const rect = tweetInteractionsReactionEl.getBoundingClientRect();
			await showEmojiPickerPopup(
				async (emoji) => {
					try {
						triggerReactionBurst(tweetInteractionsReactionEl, emoji, 6);
						console.debug("React: sending", { tweetId: tweet.id, emoji });

						const result = await query(`/tweets/${tweet.id}/reaction`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ emoji }),
						});

						console.debug("React: response", result);

						if (result?.success) {
							// Only update counts if the server returned numeric totals
							if (typeof result.total_reactions === "number") {
								tweet.reaction_count = result.total_reactions;
							}
							if (Array.isArray(result.top_reactions)) {
								tweet.top_reactions = result.top_reactions;
							}
							updateReactionDisplay();
						} else {
							// Keep the UI stable and surface the server error
							console.warn("Reaction failed:", result);
							toastQueue.add(`<h1>${result?.error || "Failed to react"}</h1>`);
						}
					} catch (err) {
						console.error("Reaction error:", err);
						toastQueue.add(`<h1>Network error. Please try again.</h1>`);
					}
				},
				{ x: rect.left, y: rect.bottom + 8 },
			);
		} catch (err) {
			console.error("Failed to open emoji picker:", err);
		}
	});

	tweetInteractionsRightEl.appendChild(tweetInteractionsViewsEl);

	const reactionWrapper = document.createElement("div");
	reactionWrapper.className = "reaction-wrapper";

	reactionWrapper.appendChild(tweetInteractionsReactionEl);
	reactionWrapper.appendChild(topReactionsSpan);
	reactionWrapper.appendChild(reactionCountSpan);

	const showReactionsModal = async () => {
		const reactionsData = await query(`/tweets/${tweet.id}/reactions`);
		const container = document.createElement("div");
		container.className = "reactions-list";

		if (
			!reactionsData ||
			!reactionsData.reactions ||
			reactionsData.reactions.length === 0
		) {
			container.innerHTML = `<p>No reactions yet.</p>`;
		} else {
			const currentUser = await getUser();

			reactionsData.reactions.forEach((r) => {
				const item = document.createElement("div");
				item.className = "reaction-item";
				const avatarSrc =
					r.avatar || "/public/shared/assets/default-avatar.svg";
				const displayName = r.name || r.username || "Unknown";
				const usernameText = r.username || "";
				const isOwnReaction = currentUser && r.user_id === currentUser.id;

				item.innerHTML = `
          <div class="reaction-user-avatar"><img src="${avatarSrc}" alt="${displayName
						.replaceAll("<", "&lt;")
						.replaceAll(">", "&gt;")}" loading="lazy"/></div>
          <div class="reaction-content">
            <div class="reaction-emoji">${r.emoji}</div>
            <div class="reaction-user-info">
              <div class="reaction-user-name">${displayName
								.replaceAll("<", "&lt;")
								.replaceAll(">", "&gt;")}</div>
              <div class="reaction-user-username">${
								usernameText
									? `@${usernameText
											.replaceAll("<", "&lt;")
											.replaceAll(">", "&gt;")}`
									: ""
							}</div>
            </div>
          </div>
          ${
						isOwnReaction
							? `<button class="reaction-remove-btn" title="Remove reaction"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`
							: ""
					}
        `;

				if (isOwnReaction) {
					const removeBtn = item.querySelector(".reaction-remove-btn");
					const emoji = r.emoji;
					removeBtn.addEventListener("click", async (e) => {
						e.stopPropagation();

						try {
							const result = await query(`/tweets/${tweet.id}/reaction`, {
								method: "POST",
								body: { emoji },
							});

							if (result.success) {
								item.style.transition = "opacity 0.2s, transform 0.2s";
								item.style.opacity = "0";
								item.style.transform = "scale(0.95)";
								setTimeout(() => {
									item.remove();
									if (
										container.querySelectorAll(".reaction-item").length === 0
									) {
										container.innerHTML = `<p>No reactions yet.</p>`;
									}
								}, 200);

								if (result.total_reactions !== undefined) {
									reactionCountSpan.textContent = result.total_reactions || "";
								}

								if (result.top_reactions) {
									topReactionsSpan.innerHTML = result.top_reactions
										.map((tr) => tr.emoji)
										.join("");
									replaceEmojiShortcodesInElement(topReactionsSpan);
								}
							}
						} catch (err) {
							console.error("Error removing reaction:", err);
						}
					});
				}

				container.appendChild(item);
			});
			replaceEmojiShortcodesInElement(container);
		}

		createModal({
			title: "Reactions",
			content: container,
			className: "reactions-modal",
		});
	};

	topReactionsSpan.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		showReactionsModal();
	});

	reactionCountSpan.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		showReactionsModal();
	});

	tweetInteractionsRightEl.appendChild(reactionWrapper);
	tweetInteractionsRightEl.appendChild(tweetInteractionsOptionsEl);

	tweetInteractionsEl.appendChild(tweetInteractionsRightEl);

	if (size !== "preview") {
		(async () => {
			try {
				const getUser = (await import("./auth.js")).default;
				const currentUser = await getUser();

				if (currentUser?.restricted) {
					const disableButton = (btn) => {
						if (btn) {
							btn.disabled = true;
							btn.setAttribute("aria-disabled", "true");
							btn.classList.add("reply-restricted");
							btn.style.opacity = "0.5";
							btn.style.cursor = "not-allowed";
						}
					};
					disableButton(tweetInteractionsLikeEl);
					disableButton(tweetInteractionsRetweetEl);
					disableButton(tweetInteractionsReplyEl);
					disableButton(tweetInteractionsReactionEl);
					disableButton(tweetInteractionsOptionsEl);
				}
			} catch {}
		})();

		tweetEl.appendChild(tweetInteractionsEl);
		createRestrictionElement();
	}
	if (tweet.top_reply && showTopReply) {
		const topReplyEl = createTweetElement(tweet.top_reply, {
			clickToOpen: true,
			showTopReply: false,
			isTopReply: true,
		});

		tweetEl.appendChild(topReplyEl);

		if (tweet.top_reply.author_response) {
			const authorResponseEl = createTweetElement(
				tweet.top_reply.author_response,
				{
					clickToOpen: true,
					showTopReply: false,
					isTopReply: true,
				},
			);

			tweetEl.appendChild(authorResponseEl);
		}
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

	(async () => {
		try {
			if (tweet.reaction_count === undefined) {
				const resp = await query(`/tweets/${tweet.id}/reactions`);
				if (
					resp &&
					Array.isArray(resp.reactions) &&
					resp.reactions.length > 0
				) {
					tweet.reaction_count = resp.reactions.length;
					const reactionWrapper = tweetEl.querySelector(".reaction-wrapper");
					const reactionCountSpan = reactionWrapper
						? reactionWrapper.querySelector(".reaction-count")
						: null;
					if (reactionWrapper && reactionCountSpan) {
						reactionCountSpan.textContent = String(tweet.reaction_count);
						if (!reactionCountSpan.parentNode)
							reactionWrapper.appendChild(reactionCountSpan);
					}
				}
			}
		} catch {}
	})();

	return tweetEl;
};
