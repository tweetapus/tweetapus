/** biome-ignore-all lint/suspicious/noDocumentCookie: not available on older browsers */
import { ToastQueue } from "https://unpkg.com/toast-queue@1.0.0-alpha.4/dist/toast-queue.js";
import confetti from "../shared/confetti.js";

const toastQueue = new ToastQueue({
	position: "bottom-start",
	isMinimized: true,
	maxVisibleToasts: 7,
	root: document.body,
});

const authToken = localStorage.getItem("authToken");
const timeAgo = (date) => {
	const now = new Date();
	const seconds = Math.floor((now - new Date(date)) / 1000);

	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
	if (seconds < 2419200) return `${Math.floor(seconds / 604800)}w`;

	const d = date.getDate().toString().padStart(2, "0");
	const m = (date.getMonth() + 1).toString().padStart(2, "0");
	const y = date.getFullYear().toString().slice(-2);

	if (date.getFullYear() === now.getFullYear()) return `${d}/${m}`;
	return `${d}/${m}/${y}`;
};

(async () => {
	if (!authToken) return document.getElementById("logout").click();

	const response = await fetch("/api/auth/me", {
		headers: { Authorization: `Bearer ${authToken}` },
	});

	const { user, error } = await response.json();

	if (error || !user) {
		localStorage.removeItem("authToken");
		window.location.href = "/";
		return;
	}

	document.querySelector(".account img").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector("#compose-avatar").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector(".account").addEventListener("click", () => {
		window.location.href = `/account`;
	});
})();

(async () => {
	if (!authToken) return;

	const { timeline } = await (
		await fetch("/api/timeline/", {
			headers: { Authorization: `Bearer ${authToken}` },
		})
	).json();

	document.querySelector(".tweets").innerText = "";

	document.querySelector(".loader").style.opacity = "0";
	setTimeout(() => {
		document.querySelector(".loader").style.display = "none";
	}, 150);

	timeline.forEach((tweet) => {
		addTweetToTimeline(tweet, false);
	});
})();

(() => {
	const textarea = document.getElementById("tweet-textarea");
	const charCount = document.getElementById("char-count");
	const tweetButton = document.getElementById("tweet-button");

	textarea.addEventListener("input", () => {
		const length = textarea.value.length;
		charCount.textContent = length;

		if (length > 400) {
			charCount.parentElement.id = "over-limit";
			tweetButton.disabled = true;
		} else {
			charCount.parentElement.id = "";
			tweetButton.disabled = length === 0;
		}
	});

	textarea.addEventListener("input", () => {
		textarea.style.height = `${Math.max(textarea.scrollHeight, 25)}px`;

		if (textarea.scrollHeight < 250) {
			textarea.style.overflow = "hidden";
		} else {
			textarea.style.overflow = "auto";
		}
	});

	tweetButton.addEventListener("click", async () => {
		const content = textarea.value.trim();

		if (!content || content.length > 400) {
			toastQueue.add({
				message: "Please enter a valid tweet (1-400 characters)",
				type: "error",
			});
			return;
		}

		tweetButton.disabled = true;
		tweetButton.textContent = "Tweeting...";

		try {
			const { error, tweet } = await (
				await fetch("/api/tweets/", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${authToken}`,
					},
					body: JSON.stringify({
						content,
						source: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
							? "mobile_web"
							: "desktop_web",
					}),
				})
			).json();

			if (tweet) {
				textarea.value = "";
				charCount.textContent = "0";
				textarea.style.height = "25px";

				addTweetToTimeline(tweet, true);

				toastQueue.add(`<h1>Tweet posted successfully!</h1>`);

				confetti(tweetButton, {
					count: 30,
					fade: true,
				});
			} else {
				toastQueue.add(`<h1>${error || "Failed to post tweet"}</h1>`);
			}
		} catch {
			toastQueue.add(`<h1>Network error. Please try again.</h1>`);
		} finally {
			tweetButton.disabled = false;
			tweetButton.textContent = "Tweet";
		}
	});

	textarea.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			if (!tweetButton.disabled) {
				tweetButton.click();
			}
		}
	});
})();

function addTweetToTimeline(tweet, prepend = false) {
	const tweetEl = document.createElement("div");
	tweetEl.className = "tweet";

	const tweetHeaderEl = document.createElement("div");
	tweetHeaderEl.className = "tweet-header";

	const tweetHeaderAvatarEl = document.createElement("img");
	tweetHeaderAvatarEl.src =
		tweet.author.avatar || `https://unavatar.io/${tweet.author.username}`;
	tweetHeaderAvatarEl.alt = tweet.author.display_name || tweet.author.username;
	tweetHeaderAvatarEl.loading = "lazy";

	tweetHeaderEl.appendChild(tweetHeaderAvatarEl);

	const tweetHeaderInfoEl = document.createElement("div");
	tweetHeaderInfoEl.className = "tweet-header-info";

	const tweetHeaderNameEl = document.createElement("p");
	tweetHeaderNameEl.className = "name";
	tweetHeaderNameEl.textContent = tweet.author.name || tweet.author.username;

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
	};

	const tweetHeaderUsernameEl = document.createElement("p");
	tweetHeaderUsernameEl.className = "username";
	tweetHeaderUsernameEl.textContent = `@${tweet.author.username} · ${timeAgo(tweet.created_at)}`;

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
	tweetEl.appendChild(tweetHeaderEl);

	const tweetContentEl = document.createElement("div");
	tweetContentEl.className = "tweet-content";
	tweetContentEl.textContent = tweet.content;

	tweetEl.appendChild(tweetContentEl);

	const tweetInteractionsEl = document.createElement("div");
	tweetInteractionsEl.className = "tweet-interactions";

	const tweetInteractionsLikeEl = document.createElement("button");
	tweetInteractionsLikeEl.className = "engagement";
	tweetInteractionsLikeEl.dataset.liked = tweet.liked_by_user;

	tweetInteractionsLikeEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 19 19"
          fill="${tweet.liked_by_user ? "#F91980" : "none"}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1.57852 7.51938C1.57854 6.63788 1.84594 5.77712 2.34542 5.05078C2.8449 4.32445 3.55296 3.76671 4.37607 3.45123C5.19918 3.13575 6.09863 3.07738 6.95561 3.28381C7.8126 3.49024 8.58681 3.95177 9.17599 4.60745C9.21749 4.65182 9.26766 4.68719 9.32339 4.71138C9.37912 4.73556 9.43922 4.74804 9.49997 4.74804C9.56073 4.74804 9.62083 4.73556 9.67656 4.71138C9.73229 4.68719 9.78246 4.65182 9.82396 4.60745C10.4113 3.94751 11.1857 3.4821 12.0441 3.27316C12.9024 3.06422 13.8041 3.12166 14.629 3.43783C15.4539 3.75401 16.163 4.31392 16.6619 5.04305C17.1607 5.77218 17.4256 6.63594 17.4214 7.51938C17.4214 9.33339 16.2332 10.688 15.045 11.8762L10.6945 16.0848C10.5469 16.2544 10.3649 16.3905 10.1607 16.4843C9.95638 16.5781 9.73448 16.6273 9.50971 16.6288C9.28494 16.6302 9.06243 16.5838 8.85698 16.4926C8.65153 16.4014 8.46783 16.2675 8.31809 16.0999L3.95496 11.8762C2.76674 10.688 1.57852 9.34131 1.57852 7.51938Z"
            stroke="${tweet.liked_by_user ? "#F91980" : "var(--text-secondary)"}"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> <span class="like-count">${tweet.like_count}</span>`;

	tweetInteractionsLikeEl.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		if (Math.random() < 0.0067) { // six seven :skull:
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
				svg.setAttribute("stroke", "var(--text-secondary)");
				likeCountSpan.textContent = Math.max(0, currentCount - 1);
			}
		}
	});

	const tweetInteractionsRetweetEl = document.createElement("button");
	tweetInteractionsRetweetEl.className = "engagement";
	tweetInteractionsRetweetEl.dataset.retweeted = tweet.retweeted_by_user;

	const retweetColor = tweet.retweeted_by_user
		? "#00BA7C"
		: "var(--text-secondary)";

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

		const response = await fetch(`/api/tweets/${tweet.id}/retweet`, {
			method: "POST",
			headers: { Authorization: `Bearer ${authToken}` },
		});

		const result = await response.json();

		if (result.success) {
			const newIsRetweeted = result.retweeted;
			tweetInteractionsRetweetEl.dataset.retweeted = newIsRetweeted;

			const svgPaths = tweetInteractionsRetweetEl.querySelectorAll("svg path");
			const retweetCountSpan =
				tweetInteractionsRetweetEl.querySelector(".retweet-count");
			const currentCount = parseInt(retweetCountSpan.textContent);

			if (newIsRetweeted) {
				svgPaths.forEach((path) => path.setAttribute("stroke", "#00BA7C"));
				retweetCountSpan.textContent = currentCount + 1;
				toastQueue.add(`<h1>Tweet retweeted</h1>`);
			} else {
				svgPaths.forEach((path) =>
					path.setAttribute("stroke", "var(--text-secondary)"),
				);
				retweetCountSpan.textContent = Math.max(0, currentCount - 1);
				toastQueue.add(`<h1>Retweet removed</h1>`);
			}
		} else {
			toastQueue.add(`<h1>${result.error || "Failed to retweet"}</h1>`);
		}
	});

	const tweetInteractionsReplyEl = document.createElement("button");
	tweetInteractionsReplyEl.className = "engagement";
	tweetInteractionsReplyEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 19 19"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.795 12.25C3.88813 12.4849 3.90886 12.7423 3.85454 12.9891L3.18004 15.0728C3.1583 15.1784 3.16392 15.2879 3.19636 15.3908C3.2288 15.4937 3.28698 15.5866 3.36539 15.6607C3.4438 15.7348 3.53984 15.7876 3.6444 15.8142C3.74895 15.8408 3.85856 15.8402 3.96284 15.8125L6.1244 15.1804C6.35729 15.1342 6.59847 15.1544 6.82044 15.2387C8.17285 15.8703 9.70487 16.0039 11.1462 15.616C12.5875 15.2281 13.8455 14.3436 14.6983 13.1185C15.551 11.8935 15.9437 10.4066 15.807 8.92028C15.6703 7.43394 15.013 6.04363 13.9512 4.99466C12.8893 3.94569 11.4911 3.30546 10.0032 3.18694C8.51527 3.06842 7.03332 3.47921 5.81878 4.34685C4.60424 5.21449 3.73517 6.48321 3.3649 7.92917C2.99463 9.37513 3.14696 10.9054 3.795 12.25Z"
            stroke="var(--text-secondary)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> ${tweet.reply_count}`;

	tweetInteractionsEl.appendChild(tweetInteractionsLikeEl);
	tweetInteractionsEl.appendChild(tweetInteractionsRetweetEl);
	tweetInteractionsEl.appendChild(tweetInteractionsReplyEl);

	tweetEl.appendChild(tweetInteractionsEl);

	const tweetsContainer = document.querySelector(".tweets");
	if (prepend) {
		tweetsContainer.insertBefore(tweetEl, tweetsContainer.firstChild);
	} else {
		tweetsContainer.appendChild(tweetEl);
	}
}
