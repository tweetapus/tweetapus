import DOMPurify from "https://esm.sh/dompurify@2.4.0";
import { marked } from "https://esm.sh/marked@16.3.0";
import toastQueue from "../../shared/toasts.js";
import { createModal, createPopup } from "../../shared/ui-utils.js";
import query from "./api.js";
import getUser from "./auth.js";
import openTweet from "./tweet.js";

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

async function showInteractionUsers(tweetId, interaction, title) {
  try {
    const data = await query(`/tweets/${tweetId}/${interaction}`);

    if (data.error) {
      toastQueue.add(`<h1>Error</h1><p>${data.error}</p>`);
      return;
    }

    const contentContainer = document.createElement("div");

    if (interaction === "quotes") {
      if (!data.tweets || data.tweets.length === 0) {
        toastQueue.add(
          `<h1>No ${title.toLowerCase()}</h1><p>This tweet hasn't been quoted by anyone yet.</p>`
        );
        return;
      }

      contentContainer.className = "quotes-list";

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
        toastQueue.add(
          `<h1>No ${title.toLowerCase()}</h1><p>This tweet hasn't been ${interaction.slice(
            0,
            -1
          )}ed by anyone yet.</p>`
        );
        return;
      }
      contentContainer.className = "users-list";

      data.users.forEach((user) => {
        const userItem = document.createElement("div");
        userItem.className = "user-item";

        const timeText =
          interaction === "likes"
            ? `liked ${formatInteractionTime(new Date(user.liked_at))}`
            : `retweeted ${formatInteractionTime(new Date(user.retweeted_at))}`;

        userItem.innerHTML = `
          <div class="user-avatar">
            <img src="${
              user.avatar || "/public/shared/default-avatar.png"
            }" alt="${user.name || user.username}" />
          </div>
          <div class="user-info">
            <div class="user-name">${user.name || user.username}</div>
            <div class="user-username">@${user.username}</div>
            <div class="user-time">${timeText}</div>
          </div>
        `;

        userItem.addEventListener("click", async () => {
          modal.close();
          const { default: openProfile } = await import("./profile.js");
          openProfile(user.username);
        });

        contentContainer.appendChild(userItem);
      });
    }

    const modal = createModal({
      title,
      content: contentContainer,
      className: "interactions-modal",
    });
  } catch (error) {
    console.error("Error querying interaction users:", error);
    toastQueue.add(
      `<h1>Network Error</h1><p>Failed to load ${title.toLowerCase()}.</p>`
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
  if (!data.allowedTags || data.allowedTags[data.tagName]) {
    return;
  }

  const textNode = document.createTextNode(node.outerHTML);
  node.parentNode.replaceChild(textNode, node);
});

// Cache per-author block status to avoid repeated network calls when rendering timelines
const authorBlockCache = new Map();

const checkAuthorBlockedByProfile = async (username) => {
  try {
    if (!username) return false;
    if (authorBlockCache.has(username)) return authorBlockCache.get(username);

    const resp = await query(`/profile/${username}`);
    const blocked = !!resp?.profile?.blockedByProfile;
    authorBlockCache.set(username, blocked);
    return blocked;
  } catch (_) {
    authorBlockCache.set(username, false);
    return false;
  }
};

const linkifyText = (text) => {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g;

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

  const html = marked.parse(normalizeListMarkers(text.trim()), {
    breaks: true,
    gfm: true,
    html: false,
    headerIds: false,
    mangle: false,
  });

  let processedHtml = html.replace(
    mentionRegex,
    '<a href="javascript:" class="tweet-mention" data-username="$1">@$1</a>'
  );

  processedHtml = processedHtml.replace(
    hashtagRegex,
    (match, tag, offset, str) => {
      if (offset > 0 && str[offset - 1] === "&") return match;
      return `<a href="javascript:" class="tweet-hashtag" data-hashtag="${tag}">#${tag}</a>`;
    }
  );

  const el = document.createElement("div");

  el.innerHTML = DOMPurify.sanitize(processedHtml, {
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
  });

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
    optionEl.className = `poll-option ${
      poll.userVote === option.id ? "voted" : ""
    } ${poll.isExpired ? "expired" : ""}`;

    if (poll.isExpired || poll.userVote) {
      optionEl.innerHTML = `
				<div class="poll-option-bar" style="width: ${option.percentage}%"></div>
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</span>
					<span class="poll-option-percentage">${option.percentage}%</span>
				</div>
			`;
    } else {
      optionEl.classList.add("poll-option-clickable");
      optionEl.innerHTML = `
				<div class="poll-option-content">
					<span class="poll-option-text">${option.option_text
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</span>
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
      avatarEl.src = voter.avatar || `/public/shared/default-avatar.png`;
      avatarEl.alt = voter.name || voter.username;
      avatarEl.title = voter.name || voter.username;
      const voterRadius =
        voter.avatar_radius !== null && voter.avatar_radius !== undefined
          ? `${voter.avatar_radius}px`
          : voter.gold
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
				<span class="poll-option-text">${option.option_text
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</span>
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
      avatarEl.src = voter.avatar || `/public/shared/default-avatar.png`;
      avatarEl.alt = voter.name || voter.username;
      avatarEl.title = voter.name || voter.username;
      const voterRadius2 =
        voter.avatar_radius !== null && voter.avatar_radius !== undefined
          ? `${voter.avatar_radius}px`
          : voter.gold
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

async function createExpandedStats(
  tweetId,
  extendedStats = {
    likes: [],
    quotes: [],
    retweets: [],
  }
) {
  const statsContainer = document.createElement("div");
  statsContainer.className = "expanded-tweet-stats";

  try {
    const likesData = { users: extendedStats?.likes || [] };
    const retweetsData = { users: extendedStats?.retweets || [] };
    const quotesData = { users: extendedStats?.quotes || [] };

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
        .map((user) => {
          const radius =
            user.avatar_radius !== null && user.avatar_radius !== undefined
              ? `${user.avatar_radius}px`
              : user.gold
              ? "4px"
              : "50px";
          return `<img src="${
            user.avatar || "/public/shared/default-avatar.png"
          }" alt="${
            user.name || user.username
          }" class="stat-avatar" style="border-radius: ${radius};" />`;
        })
        .join("");

      const names = stat.users
        .slice(0, 2)
        .map((user) => user.name || user.username)
        .join(", ");
      const moreCount = stat.users.length > 2 ? stat.users.length - 2 : 0;

      statElement.innerHTML = `
				<div class="stat-avatars">${avatars}</div>
				<div class="stat-text">
					${names}${moreCount > 0 ? ` and ${moreCount} others` : ""} ${
        stat.type === "likes"
          ? "liked"
          : stat.type === "retweets"
          ? "retweeted"
          : "quoted"
      } this
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
    extendedStats = null,
  } = config;

  const tweetEl = document.createElement("div");
  tweetEl.className = isTopReply ? "tweet top-reply" : "tweet";

  const isBlockedByProfile = (() => {
    try {
      const pc = document.getElementById("profileContainer");
      return pc?.dataset?.blockedByProfile === "true";
    } catch (_) {
      return false;
    }
  })();

  if (isBlockedByProfile) tweetEl.classList.add("blocked-by-profile");

  if (size === "preview") {
    tweetEl.classList.add("tweet-preview");
    tweetEl.classList.add("clickable");
  }

  const tweetHeaderEl = document.createElement("div");
  tweetHeaderEl.className = "tweet-header";

  const tweetHeaderAvatarEl = document.createElement("img");
  tweetHeaderAvatarEl.src =
    tweet.author.avatar || `/public/shared/default-avatar.png`;
  tweetHeaderAvatarEl.alt = tweet.author.name || tweet.author.username;
  tweetHeaderAvatarEl.classList.add("tweet-header-avatar");

  if (
    tweet.author.avatar_radius !== null &&
    tweet.author.avatar_radius !== undefined
  ) {
    tweetHeaderAvatarEl.style.borderRadius = `${tweet.author.avatar_radius}px`;
  } else if (tweet.author.gold) {
    tweetHeaderAvatarEl.style.borderRadius = "4px";
  } else {
    tweetHeaderAvatarEl.style.borderRadius = "50px";
  }
  tweetHeaderAvatarEl.loading = "lazy";
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
  tweetHeaderNameEl.classList.add("tweet-header-name");
  tweetHeaderNameEl.addEventListener("click", (e) => {
    e.stopPropagation();
    import("./profile.js").then(({ default: openProfile }) => {
      openProfile(tweet.author.username);
    });
  });

  if (tweet.author.gold) {
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
              fill="#D4AF37"
            />
            <path
              d="M6 8.00002L7.33333 9.33335L10 6.66669"
              stroke="white"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>`;
  } else if (tweet.author.verified) {
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
    desktop_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tweet-source-icon lucide lucide-monitor-icon lucide-monitor"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
    mobile_web: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tweet-source-icon lucide lucide-smartphone-icon lucide-smartphone"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
  };

  const tweetHeaderUsernameEl = document.createElement("p");
  tweetHeaderUsernameEl.className = "username";
  tweetHeaderUsernameEl.textContent = `@${tweet.author.username} · ${timeAgo(
    tweet.created_at
  )}`;
  tweetHeaderUsernameEl.classList.add("tweet-header-username");
  tweetHeaderUsernameEl.addEventListener("click", (e) => {
    e.stopPropagation();
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

  const menuButtonEl = document.createElement("button");
  menuButtonEl.className = "tweet-menu-btn";
  menuButtonEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M10.001 7.8a2.2 2.2 0 1 0 0 4.402A2.2 2.2 0 0 0 10 7.8zm-7 0a2.2 2.2 0 1 0 0 4.402A2.2 2.2 0 0 0 3 7.8zm14 0a2.2 2.2 0 1 0 0 4.402A2.2 2.2 0 0 0 17 7.8z"/></svg>
      `;
  menuButtonEl.title = "More options";

  menuButtonEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const defaultItems = [
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
        id: "share-image",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`,
        title: "Share as image",
        onClick: async () => {
          const tweetElClone = document.createElement("div");
          tweetElClone.innerHTML = tweetEl.outerHTML;

          const wrapper = document.createElement("div");
          wrapper.className = "tweet-share-wrapper";

          const tweetContainer = document.createElement("div");
          tweetContainer.className = "tweet-share-container";

          const stats = tweetElClone.querySelector(".expanded-tweet-stats");
          if (stats) stats.remove();

          tweetContainer.appendChild(tweetElClone);
          wrapper.appendChild(tweetContainer);

          document.body.appendChild(wrapper);

          // load html2canvas
          const script = document.createElement("script");
          script.src =
            "https://html2canvas.hertzen.com/dist/html2canvas.min.js";
          script.onload = () => {
            window
              .html2canvas(wrapper, {
                backgroundColor: "transparent",
                scale: 3,
                width: wrapper.offsetWidth,
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
          document.head.appendChild(script);
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
                } successfully</h1>`
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
                `<h1>${result.error || "Failed to update pin status"}</h1>`
              );
            }
          } catch (error) {
            console.error("Error updating pin status:", error);
            toastQueue.add(`<h1>Network error. Please try again.</h1>`);
          }
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
          if (!confirm("Are you sure you want to delete this tweet?")) {
            return;
          }

          try {
            const result = await query(`/tweets/${tweet.id}`, {
              method: "DELETE",
            });

            if (result.success) {
              tweetEl.classList.add("tweet-removing");

              setTimeout(() => {
                tweetEl.remove();
              }, 300);

              toastQueue.add(`<h1>Tweet deleted successfully</h1>`);
            } else {
              toastQueue.add(
                `<h1>${result.error || "Failed to delete tweet"}</h1>`
              );
            }
          } catch (error) {
            console.error("Error deleting tweet:", error);
            toastQueue.add(`<h1>Network error. Please try again.</h1>`);
          }
        },
      },
    ];

    getUser().then(async (currentUser) => {
      try {
        // Build base items
        const items =
          currentUser?.id === tweet.author.id
            ? [...defaultItems, ...userItems]
            : [...defaultItems];

        // If not the author, add block/unblock option
        if (currentUser && tweet.author && currentUser.id !== tweet.author.id) {
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
                    }?`
                  )
                )
                  return;
                const endpoint = isBlocked
                  ? "/blocking/unblock"
                  : "/blocking/block";
                const result = await query(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: tweet.author.id }),
                });

                if (result.success) {
                  toastQueue.add(
                    `<h1>${isBlocked ? "User unblocked" : "User blocked"}</h1>`
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
          triggerElement: menuButtonEl,
          items,
        });
      } catch (e) {
        console.error("Error building menu items:", e);
        createPopup({
          triggerElement: menuButtonEl,
          items:
            currentUser?.id === tweet.author.id
              ? [...defaultItems, ...userItems]
              : defaultItems,
        });
      }
    });

    tweetHeaderEl.appendChild(menuButtonEl);
  });

  if (size !== "preview") tweetHeaderEl.appendChild(menuButtonEl);

  tweetEl.appendChild(tweetHeaderEl);

  const isArticlePost = Boolean(
    tweet.is_article && tweet.article_body_markdown
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
        })
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
  } else {
    const tweetContentEl = document.createElement("div");
    tweetContentEl.className = "tweet-content";

    const rawContent = tweet.content ? tweet.content.trim() : "";

    const tweetLinkRegex = /https?:\/\/(?:www\.)?(?:localhost:3000|tweetapus\.com)\/tweet\/([a-zA-Z0-9_-]+)/g;
    let contentWithoutLinks = rawContent;
    const extractedTweetIds = [];
    let match = tweetLinkRegex.exec(rawContent);
    
    while (match !== null) {
      extractedTweetIds.push(match[1]);
      contentWithoutLinks = contentWithoutLinks.replace(match[0], '').trim();
      match = tweetLinkRegex.exec(rawContent);
    }

    const isExpandedView = Boolean(showStats) || clickToOpen === false;
    const shouldTrim =
      contentWithoutLinks.length > 300 &&
      !isExpandedView &&
      !tweet.extended &&
      !tweet.isExpanded;

    const applyLinkified = (text) => {
      tweetContentEl.innerHTML = linkifyText(text);
    };

    if (shouldTrim) {
      let trimmed = contentWithoutLinks.slice(0, 300);
      const lastSpace = Math.max(
        trimmed.lastIndexOf(" "),
        trimmed.lastIndexOf("\n")
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

        const collapse = document.createElement("button");
        collapse.className = "tweet-collapse-btn";
        collapse.type = "button";
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
    
    if (extractedTweetIds.length > 0 && !tweet.quoted_tweet) {
      const tweetId = extractedTweetIds[0];
      query(`/tweets/${tweetId}`)
        .then(response => {
          if (response?.tweet) {
            const quotedTweetEl = createTweetElement(response.tweet, {
              size: "preview",
              clickToOpen: true,
            });
            quotedTweetEl.classList.add("tweet-preview");
            
            const existingQuote = tweetEl.querySelector('.tweet-preview');
            if (!existingQuote) {
              const pollEl = tweetEl.querySelector('.poll-container');
              const attachmentsEl = tweetEl.querySelector('.tweet-attachments');
              
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
        .catch(err => {
          console.error('Failed to load embedded tweet:', err);
        });
    }
  }

  if (tweet.poll) {
    const pollEl = createPollElement(tweet.poll, tweet);
    if (pollEl) {
      tweetEl.appendChild(pollEl);
    }
  }

  if (!isArticlePost && tweet.attachments && tweet.attachments.length > 0) {
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
    if (!tweet.quoted_tweet.author) {
      const unavailableQuoteEl = document.createElement("div");
      unavailableQuoteEl.className = "tweet-preview unavailable-quote";
      unavailableQuoteEl.textContent = "Quote tweet unavailable";
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

  const tweetInteractionsEl = document.createElement("div");
  tweetInteractionsEl.className = "tweet-interactions";

  const tweetInteractionsLikeEl = document.createElement("button");
  tweetInteractionsLikeEl.className = "engagement";
  tweetInteractionsLikeEl.dataset.liked = tweet.liked_by_user;
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
        </svg> <span class="like-count">${tweet.like_count || ""}</span>`;

  tweetInteractionsLikeEl.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isBlockedByProfile) {
      toastQueue.add(`<h1>You have been blocked by this user</h1>`);
      return;
    }

    try {
      // Prevent like if blocked by author
      const current = await getUser();
      if (current && tweet.author && tweet.author.id) {
        const profileResp = await query(`/profile/${tweet.author.username}`);
        if (profileResp?.profile?.blockedByProfile) {
          toastQueue.add(`<h1>You have been blocked by this user</h1>`);
          return;
        }
      }
      const result = await query(`/tweets/${tweet.id}/like`, {
        method: "POST",
      });

      if (result.success) {
        const newIsLiked = result.liked;
        tweetInteractionsLikeEl.dataset.liked = newIsLiked;

        const svg = tweetInteractionsLikeEl.querySelector("svg path");
        const likeCountSpan =
          tweetInteractionsLikeEl.querySelector(".like-count");
        const currentCount = parseInt(likeCountSpan.textContent || "0");

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
        </svg> ${tweet.reply_count || ""}`;

  tweetInteractionsReplyEl.addEventListener("click", async (e) => {
    if (!clickToOpen) return;

    e.stopPropagation();
    e.preventDefault();

    if (isBlockedByProfile) {
      toastQueue.add(`<h1>You have been blocked by this user</h1>`);
      return;
    }

    // Check if blocked by author before opening composer
    const current = await getUser();
    if (current && tweet.author && tweet.author.username) {
      const profileResp = await query(`/profile/${tweet.author.username}`);
      if (profileResp?.profile?.blockedByProfile) {
        toastQueue.add(`<h1>You have been blocked by this user</h1>`);
        return;
      }
    }

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
              tweet.retweet_count || ""
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
            if (isBlockedByProfile) {
              toastQueue.add(`<h1>You have been blocked by this user</h1>`);
              return;
            }
            const current = await getUser();
            if (current && tweet.author && tweet.author.username) {
              const profileResp = await query(
                `/profile/${tweet.author.username}`
              );
              if (profileResp?.profile?.blockedByProfile) {
                toastQueue.add(`<h1>You have been blocked by this user</h1>`);
                return;
              }
            }
            const result = await query(`/tweets/${tweet.id}/retweet`, {
              method: "POST",
            });

            if (result.success) {
              const newIsRetweeted = result.retweeted;
              tweetInteractionsRetweetEl.dataset.retweeted = newIsRetweeted;

              const svgPaths =
                tweetInteractionsRetweetEl.querySelectorAll("svg path");
              const retweetCountSpan =
                tweetInteractionsRetweetEl.querySelector(".retweet-count");
              const currentCount = parseInt(
                retweetCountSpan.textContent || "0"
              );

              if (newIsRetweeted) {
                svgPaths.forEach((path) =>
                  path.setAttribute("stroke", "#00BA7C")
                );
                retweetCountSpan.textContent = currentCount + 1;
              } else {
                svgPaths.forEach((path) =>
                  path.setAttribute("stroke", "currentColor")
                );
                retweetCountSpan.textContent = Math.max(0, currentCount - 1);
              }
            } else {
              toastQueue.add(`<h1>${result.error || "Failed to retweet"}</h1>`);
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
          try {
            const { createComposer } = await import("./composer.js");

            const composer = await createComposer({
              placeholder: "Add your thoughts about this tweet...",
              quoteTweet: tweet,
              callback: async (newTweet) => {
                addTweetToTimeline(newTweet, true).classList.add("created");
                setTimeout(() => {
                  modal.close();
                }, 10);
              },
            });

            const modal = createModal({
              content: composer,
            });
          } catch (error) {
            console.error("Error creating quote composer:", error);
            toastQueue.add(`<h1>Error opening quote composer</h1>`);
          }
        },
      },
    ];

    if (tweet.quote_count && tweet.quote_count > 0) {
      menuItems.push({
        id: "see-quotes-option",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>`,
        title: "See quotes",
        onClick: async () => {
          showInteractionUsers(tweet.id, "quotes", "Quotes");
        },
      });
    }

    createPopup({
      triggerElement: tweetInteractionsRetweetEl,
      items: menuItems,
    });
  });

  const tweetInteractionsShareEl = document.createElement("button");
  tweetInteractionsShareEl.className = "engagement";
  tweetInteractionsShareEl.style.setProperty("--color", "119, 119, 119");
  tweetInteractionsShareEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.2171 2.2793L10.2171 12.9745M10.2171 2.2793L13.333 4.99984M10.2171 2.2793L7.08301 4.99984M2.49967 10.9925L2.49967 14.1592C2.49967 16.011 4.00084 17.5121 5.85261 17.5121L14.9801 17.5121C16.8318 17.5121 18.333 16.011 18.333 14.1592L18.333 10.9925" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
`;

  tweetInteractionsShareEl.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

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
  });

  const tweetInteractionsBookmarkEl = document.createElement("button");
  tweetInteractionsBookmarkEl.className = "engagement";
  tweetInteractionsBookmarkEl.dataset.bookmarked =
    tweet.bookmarked_by_user || false;
  tweetInteractionsBookmarkEl.style.setProperty("--color", "255, 169, 0");
  const isInitiallyBookmarked =
    tweetInteractionsBookmarkEl.dataset.bookmarked === "true";
  tweetInteractionsBookmarkEl.innerHTML = `
        <svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.625 3.125H14.375C14.9963 3.125 15.5 3.62868 15.5 4.25V16.5073C15.5 16.959 15.0134 17.2422 14.6301 17.011L10 14.2222L5.36986 17.011C4.98664 17.2422 4.5 16.959 4.5 16.5073V4.25C4.5 3.62868 5.00368 3.125 5.625 3.125Z"
            stroke="${isInitiallyBookmarked ? "#FFA900" : "currentColor"}"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="${isInitiallyBookmarked ? "#FFA900" : "none"}"
          />
        </svg>
        <span class="bookmark-count">${tweet.bookmark_count || ""}</span>`;

  tweetInteractionsBookmarkEl.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isBlockedByProfile) {
      toastQueue.add(`<h1>You have been blocked by this user</h1>`);
      return;
    }

    try {
      const current = await getUser();
      if (current && tweet.author && tweet.author.username) {
        const profileResp = await query(`/profile/${tweet.author.username}`);
        if (profileResp?.profile?.blockedByProfile) {
          toastQueue.add(`<h1>You have been blocked by this user</h1>`);
          return;
        }
      }
      const isBookmarked =
        tweetInteractionsBookmarkEl.dataset.bookmarked === "true";
      const endpoint = isBookmarked ? "/bookmarks/remove" : "/bookmarks/add";

      const result = await query(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId: tweet.id }),
      });

      if (result.success) {
        const newIsBookmarked = result.bookmarked;
        tweetInteractionsBookmarkEl.dataset.bookmarked = newIsBookmarked;

        const svg = tweetInteractionsBookmarkEl.querySelector("svg");
        const path = svg.querySelector("path");

        if (newIsBookmarked) {
          path.setAttribute("fill", "#FFA900");
          path.setAttribute("stroke", "#FFA900");
        } else {
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "currentColor");
        }
      } else {
        toastQueue.add(
          `<h1>${result.error || "Failed to bookmark tweet"}</h1>`
        );
      }
    } catch (error) {
      console.error("Error bookmarking tweet:", error);
      toastQueue.add(`<h1>Network error. Please try again.</h1>`);
    }
  });

  // If profile blocked the viewer, disable interaction buttons for accessibility
  if (isBlockedByProfile) {
    [
      tweetInteractionsLikeEl,
      tweetInteractionsRetweetEl,
      tweetInteractionsReplyEl,
      tweetInteractionsBookmarkEl,
      tweetInteractionsShareEl,
    ].forEach((btn) => {
      try {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.classList.add("blocked-interaction");
      } catch (_) {}
    });
  }

  // If we're not already in a profile-blocked context, check per-author block status for timeline/home feeds
  (async () => {
    try {
      if (!isBlockedByProfile) {
        const authorBlocked = await checkAuthorBlockedByProfile(
          tweet.author.username
        );
        if (authorBlocked) {
          [
            tweetInteractionsLikeEl,
            tweetInteractionsRetweetEl,
            tweetInteractionsReplyEl,
            tweetInteractionsBookmarkEl,
            tweetInteractionsShareEl,
          ].forEach((btn) => {
            try {
              btn.disabled = true;
              btn.setAttribute("aria-disabled", "true");
              btn.classList.add("blocked-interaction");
            } catch (_) {}
          });

          // Also mark the tweet element visually so CSS can style it
          // done ok
          // what do we trying doing RN on tweetapus???
          // Tr, a the answer
          // idk, OpuaYT, but i pulled the changes
          // ok

          // maybe the algorithm
          // algo but in Bun?

          // maybe idk Tr Happies
          // maybe we fix SQLiteError: no such column: view_count yes
          tweetEl.classList.add("blocked-by-profile");
        }
      }
    } catch (_) {}
  })();

  const replyRestriction = tweet.reply_restriction || "everyone";

  if (replyRestriction !== "everyone") {
    import("./auth.js").then(async ({ authToken }) => {
      if (authToken) {
        const getUser = (await import("./auth.js")).default;
        const currentUser = await getUser();

        if (currentUser && currentUser.id === tweet.author.id) {
          const restrictionEl = document.createElement("div");
          restrictionEl.className = "reply-restriction-info";
          restrictionEl.textContent = "You can reply to your own tweet";
          tweetInteractionsEl.appendChild(restrictionEl);
          return;
        }

        checkReplyPermissions(tweet, replyRestriction).then(
          ({ canReply: allowed, restrictionText }) => {
            if (!allowed) {
              tweetInteractionsReplyEl.disabled = true;
              tweetInteractionsReplyEl.classList.add("reply-restricted");
              tweetInteractionsReplyEl.title = "You cannot reply to this tweet";
            }

            if (restrictionText) {
              const restrictionEl = document.createElement("div");
              restrictionEl.className = "reply-restriction-info";
              restrictionEl.textContent = restrictionText;
              tweetInteractionsEl.appendChild(restrictionEl);
            }
          }
        );
      }
    });
  }

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
    <span>${tweet.view_count > 0 ? tweet.view_count : ""}</span>`;
  tweetInteractionsViewsEl.style.setProperty("--color", "119, 119, 119");
  tweetInteractionsViewsEl.title = `${tweet.view_count || 0} views`;

  tweetInteractionsRightEl.appendChild(tweetInteractionsViewsEl);
  tweetInteractionsRightEl.appendChild(tweetInteractionsBookmarkEl);
  tweetInteractionsRightEl.appendChild(tweetInteractionsShareEl);

  tweetInteractionsEl.appendChild(tweetInteractionsRightEl);

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

  if (showStats) {
    createExpandedStats(tweet.id, extendedStats).then((statsEl) => {
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
      tweet
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

// stuck ->
