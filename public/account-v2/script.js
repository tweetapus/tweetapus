import DOMPurify from "/public/shared/assets/js/dompurify.js";
import { marked } from "/public/shared/assets/js/marked.js";

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
	],
	ALLOWED_ATTR: [
		"href",
		"target",
		"rel",
		"class",
		"data-username",
		"data-hashtag",
	],
};

(async () => {
	const impersonateToken = new URLSearchParams(window.location.search).get(
		"impersonate",
	);

	if (impersonateToken) {
		localStorage.setItem("authToken", decodeURIComponent(impersonateToken));
		window.history.replaceState({}, document.title, window.location.pathname);

		Reflect.set(
			document,
			"cookie",
			`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
		);
		setTimeout(() => {
			window.location.href = "/timeline/";
		}, 200);
	}
})();

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

const createSimpleTweetElement = (tweet) => {
	if (!tweet || !tweet.author) {
		return document.createElement("div");
	}

	const tweetEl = document.createElement("div");
	tweetEl.className = "tweet clickable";

	const tweetHeaderEl = document.createElement("div");
	tweetHeaderEl.className = "tweet-header";

	const avatarEl = document.createElement("img");
	avatarEl.src =
		tweet.author.avatar || `/public/shared/assets/default-avatar.svg`;
	avatarEl.alt = tweet.author.name || tweet.author.username;
	avatarEl.classList.add("tweet-header-avatar");
	avatarEl.loading = "lazy";

	if (
		tweet.author.avatar_radius !== null &&
		tweet.author.avatar_radius !== undefined
	) {
		const pct = (tweet.author.avatar_radius / 100) * 100;
		avatarEl.style.borderRadius = `${Math.min(100, Math.max(0, pct))}%`;
	} else if (tweet.author.gold) {
		avatarEl.style.borderRadius = "4px";
	} else {
		avatarEl.style.borderRadius = "50%";
	}

	tweetHeaderEl.appendChild(avatarEl);

	const infoEl = document.createElement("div");
	infoEl.className = "tweet-header-info";

	const nameEl = document.createElement("p");
	nameEl.className = "name";
	nameEl.textContent = tweet.author.name || tweet.author.username;

	if (tweet.author.username !== tweet.author.name) {
		const usernameSpan = document.createElement("span");
		usernameSpan.className = "tweet-header-username-span";
		usernameSpan.textContent = `@${tweet.author.username}`;
		nameEl.appendChild(usernameSpan);
	}

	const timeEl = document.createElement("p");
	timeEl.className = "username";
	timeEl.textContent = timeAgo(tweet.created_at);

	infoEl.appendChild(nameEl);
	infoEl.appendChild(timeEl);
	tweetHeaderEl.appendChild(infoEl);
	tweetEl.appendChild(tweetHeaderEl);

	const contentEl = document.createElement("div");
	contentEl.className = "tweet-content";

	const contentText = tweet.content || "";
	const contentWithoutLinks = contentText.split(/https?:\/\/[^\s]+/g).join("");
	const shouldTrim = contentWithoutLinks.length > 300;

	const applyLinkified = (text) => {
		contentEl.innerHTML = linkifyText(text);
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
				contentEl.appendChild(ellipsis);
				collapse.remove();
			});

			contentEl.appendChild(collapse);
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

		contentEl.appendChild(ellipsis);
	} else {
		applyLinkified(contentWithoutLinks);
	}

	tweetEl.appendChild(contentEl);

	if (Array.isArray(tweet.attachments) && tweet.attachments.length > 0) {
		const attachmentsEl = document.createElement("div");
		attachmentsEl.className = "tweet-attachments";

		tweet.attachments.slice(0, 4).forEach((attachment) => {
			if (attachment.file_type?.startsWith("image/")) {
				const img = document.createElement("img");
				img.src = attachment.file_url;
				img.alt = attachment.file_name || "Tweet image";
				img.loading = "lazy";
				attachmentsEl.appendChild(img);
			} else if (attachment.file_type?.startsWith("video/")) {
				const video = document.createElement("video");
				video.src = attachment.file_url;
				video.controls = true;
				video.style.maxWidth = "100%";
				attachmentsEl.appendChild(video);
			}
		});

		if (attachmentsEl.children.length > 0) {
			tweetEl.appendChild(attachmentsEl);
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

	const tweetInteractionsReplyEl = document.createElement("button");
	tweetInteractionsReplyEl.className = "engagement";
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

	const tweetInteractionsRetweetEl = document.createElement("button");
	tweetInteractionsRetweetEl.className = "engagement";
	tweetInteractionsRetweetEl.innerHTML = `<svg
              width="19"
              height="19"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg> ${tweet.retweet_count ? formatNumber(tweet.retweet_count) : ""}`;

	const tweetInteractionsLikeEl = document.createElement("button");
	tweetInteractionsLikeEl.className = "engagement";
	tweetInteractionsLikeEl.innerHTML = `<svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.00002 2.54822C8.00003 2.09722 9.58337 4.93428 10 5.87387C10.4167 4.93428 12 2.09722 15 2.54822C18 2.99923 18.75 5.66154 18.75 7.05826C18.75 9.28572 18.1249 10.9821 16.2499 13.244C14.3749 15.506 10 18.3333 10 18.3333C10 18.3333 5.62498 15.506 3.74999 13.244C1.875 10.9821 1.25 9.28572 1.25 7.05826C1.25 5.66154 2 2.99923 5.00002 2.54822Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> ${tweet.like_count ? formatNumber(tweet.like_count) : ""}`;

	const tweetInteractionsOptionsEl = document.createElement("button");
	tweetInteractionsOptionsEl.className = "engagement";
	tweetInteractionsOptionsEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M15.498 8.50159C16.3254 8.50159 16.9959 9.17228 16.9961 9.99963C16.9961 10.8271 16.3256 11.4987 15.498 11.4987C14.6705 11.4987 14 10.8271 14 9.99963C14.0002 9.17228 14.6706 8.50159 15.498 8.50159Z"></path><path d="M4.49805 8.50159C5.32544 8.50159 5.99689 9.17228 5.99707 9.99963C5.99707 10.8271 5.32555 11.4987 4.49805 11.4987C3.67069 11.4985 3 10.827 3 9.99963C3.00018 9.17239 3.6708 8.50176 4.49805 8.50159Z"></path><path d="M10.0003 8.50159C10.8276 8.50176 11.4982 9.17239 11.4984 9.99963C11.4984 10.827 10.8277 11.4985 10.0003 11.4987C9.17283 11.4987 8.50131 10.8271 8.50131 9.99963C8.50149 9.17228 9.17294 8.50159 10.0003 8.50159Z"></path></svg>`;

	tweetInteractionsEl.appendChild(tweetInteractionsReplyEl);
	tweetInteractionsEl.appendChild(tweetInteractionsRetweetEl);
	tweetInteractionsEl.appendChild(tweetInteractionsLikeEl);
	tweetInteractionsEl.appendChild(tweetInteractionsOptionsEl);

	tweetEl.appendChild(tweetInteractionsEl);

	return tweetEl;
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

	return `${month} ${day}${daySuffix(day)}, ${year}`;
};

let isLoadingTweets = false;
let tweetCache = [];
const MAX_TWEETS_IN_DOM = 50;

const loadTweets = async () => {
	if (isLoadingTweets) return;
	isLoadingTweets = true;

	try {
		const res = await fetch(`/api/public-tweets?limit=100`);
		const data = await res.json();

		if (!data.posts || data.posts.length === 0) {
			isLoadingTweets = false;
			return;
		}

		const validPosts = data.posts.filter((post) => post && post.author);

		for (let i = validPosts.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[validPosts[i], validPosts[j]] = [validPosts[j], validPosts[i]];
		}

		tweetCache = validPosts;
	} catch (error) {
		console.error("Error loading tweets:", error);
	} finally {
		isLoadingTweets = false;
	}
};

const initRecentTweets = async () => {
	const container = document.getElementById("recentTweetsContainer");
	if (!container) return;

	await loadTweets();

	let currentIndex = 0;
	const populateContainer = () => {
		if (tweetCache.length === 0) return;

		while (
			container.children.length < MAX_TWEETS_IN_DOM &&
			currentIndex < tweetCache.length
		) {
			const tweet = tweetCache[currentIndex];
			const tweetEl = createSimpleTweetElement(tweet);
			container.appendChild(tweetEl);
			currentIndex++;
		}

		if (currentIndex >= tweetCache.length) {
			currentIndex = 0;
		}
	};

	populateContainer();

	const scrollSpeed = 0.5;
	const isScrolling = true;

	const autoScroll = () => {
		if (!isScrolling) return;

		container.scrollTop += scrollSpeed;

		if (
			container.scrollTop >=
			container.scrollHeight - container.clientHeight
		) {
			container.scrollTop = 0;

			while (container.children.length > MAX_TWEETS_IN_DOM) {
				container.removeChild(container.firstChild);
			}

			populateContainer();
		}

		requestAnimationFrame(autoScroll);
	};

	autoScroll();
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initRecentTweets);
} else {
	initRecentTweets();
}

document
	.querySelector(".create-account")
	.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		const initialHtml = document.querySelector(".create-account").innerHTML;

		const username = document.getElementById("username").value.trim();
		if (!username) {
			document.getElementById("username").focus();
			document.querySelector(".init-form").style.transition = "all .2s";

			setTimeout(() => {
				document.querySelector(".init-form").style.transform = "scale(1.04)";
			}, 5);

			setTimeout(() => {
				document.querySelector(".init-form").style.transform = "scale(1)";
			}, 200);
			return;
		}

		document.querySelector(".create-account").style.width = `${
			document.querySelector(".create-account").offsetWidth
		}px`;

		document.querySelector(".create-account").classList.add("loading");
		document.querySelector(".create-account").disabled = true;
		document.querySelector(".create-account").innerHTML =
			`<svg fill="currentColor" viewBox="0 0 16 16" width="20" height="20" style="color:#c5c5c8" class="iosspin"><rect width="2" height="4" x="2.35" y="3.764" opacity=".93" rx="1" transform="rotate(-45 2.35 3.764)"></rect><rect width="4" height="2" x="1" y="7" opacity=".78" rx="1"></rect><rect width="2" height="4" x="5.179" y="9.41" opacity=".69" rx="1" transform="rotate(45 5.179 9.41)"></rect><rect width="2" height="4" x="7" y="11" opacity=".62" rx="1"></rect><rect width="2" height="4" x="9.41" y="10.824" opacity=".48" rx="1" transform="rotate(-45 9.41 10.824)"></rect><rect width="4" height="2" x="11" y="7" opacity=".38" rx="1"></rect><rect width="2" height="4" x="12.239" y="2.35" opacity=".3" rx="1" transform="rotate(45 12.239 2.35)"></rect><rect width="2" height="4" x="7" y="1" rx="1"></rect></svg>`;

		document.getElementById("username").blur();
		document.getElementById("username").disabled = true;

		const { available } = await (
			await fetch(
				`/api/auth/username-availability?username=${encodeURIComponent(
					username,
				)}`,
			)
		).json();

		if (!available) {
			document.querySelector(".create-account").classList.remove("loading");
			document.querySelector(".create-account").disabled = false;
			document.querySelector(".create-account").innerHTML = initialHtml;
			document.querySelector(".create-account").style.width = "";
			document.getElementById("username").disabled = false;

			document.getElementById("username").focus();
			document.getElementById("username").select();

			document.querySelector(".init-form label").innerText =
				"Username taken, try another.";
			document.querySelector(".init-form label").style.color =
				"var(--error-color)";
			document.querySelector(".init-form label").style.transition =
				"opacity .4s, filter .4s, transform .4s";

			setTimeout(() => {
				document.querySelector(".init-form label").style.opacity = "0";
				document.querySelector(".init-form label").style.filter = "blur(2px)";
				document.querySelector(".init-form label").style.transform =
					"scale(0.9)";
			}, 1500);
			setTimeout(() => {
				document.querySelector(".init-form label").innerText =
					"Choose your username";

				document.querySelector(".init-form label").style.color = "";
				document.querySelector(".init-form label").style.opacity = "";
				document.querySelector(".init-form label").style.filter = "";
				document.querySelector(".init-form label").style.transform = "";
			}, 1700);

			return;
		}

		const cap = new window.Cap({
			apiEndpoint: "/api/auth/cap/",
		});

		let challengeToken;

		cap.solve().then((solution) => {
			challengeToken = solution.token;
		});

		await new Promise((r) => {
			setTimeout(r, 300);
		});

		setTimeout(() => {
			document.querySelector(".create-account").classList.remove("loading");
			document.querySelector(".create-account").disabled = false;
			document.querySelector(".create-account").innerHTML = initialHtml;
			document.querySelector(".create-account").style.width = "";
			document.getElementById("username").disabled = false;
		}, 300);

		const modal = document.querySelector(".model-wrapper.create-step2");

		modal.style.display = "flex";

		modal.querySelector("#create-username").value = username;
		modal.querySelector("#create-password").value = "";
		modal.querySelector("#create-password").focus();

		modal.querySelector(".finish").onclick = async () => {
			if (modal.querySelector("#create-username").value.trim() === "") {
				modal.querySelector("#create-username").focus();
				return;
			}

			if (modal.querySelector("#create-password").value.trim() === "") {
				modal.querySelector("#create-password").focus();
				return;
			}

			modal.querySelector(".finish").disabled = true;
			modal.querySelector(".finish").innerHTML =
				`<svg fill="currentColor" viewBox="0 0 16 16" width="20" height="20" style="color:#c5c5c8" class="iosspin"><rect width="2" height="4" x="2.35" y="3.764" opacity=".93" rx="1" transform="rotate(-45 2.35 3.764)"></rect><rect width="4" height="2" x="1" y="7" opacity=".78" rx="1"></rect><rect width="2" height="4" x="5.179" y="9.41" opacity=".69" rx="1" transform="rotate(45 5.179 9.41)"></rect><rect width="2" height="4" x="7" y="11" opacity=".62" rx="1"></rect><rect width="2" height="4" x="9.41" y="10.824" opacity=".48" rx="1" transform="rotate(-45 9.41 10.824)"></rect><rect width="4" height="2" x="11" y="7" opacity=".38" rx="1"></rect><rect width="2" height="4" x="12.239" y="2.35" opacity=".3" rx="1" transform="rotate(45 12.239 2.35)"></rect><rect width="2" height="4" x="7" y="1" rx="1"></rect></svg>`;

			if (!challengeToken) {
				await new Promise((resolve) => {
					const i = setInterval(() => {
						if (challengeToken) {
							clearInterval(i);
							resolve();
						}
					}, 50);
				});
			}

			const { token, success, error } = await (
				await fetch("/api/auth/register-with-password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: modal.querySelector("#create-username").value,
						password: modal.querySelector("#create-password").value,
						challengeToken,
					}),
				})
			).json();

			if (error || !success) {
				modal.querySelector(".finish").innerText = error || "An error occurred";

				setTimeout(() => {
					modal.querySelector(".finish").innerText = "Create your account";
					modal.querySelector(".finish").disabled = false;
				}, 1500);
				return;
			}

			if (success && token) {
				localStorage.setItem("authToken", token);
				setTimeout(() => {
					location.reload();
				}, 300);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
						return;
					}
				} catch {}

				Reflect.set(
					document,
					"cookie",
					`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
				);
			}
		};
	});

document.getElementById("username").addEventListener("input", (e) => {
	if (e.target.value.length > 20) {
		e.target.value = e.target.value.slice(0, 20);
	}

	if (e.target.value.trim() === "") {
		e.target.value = "";
	}

	e.target.value = e.target.value
		.replaceAll(" ", "-")
		.replace(/[^a-zA-Z0-9._-]/g, "");
});

document.getElementById("username").addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		document.querySelector(".create-account").click();
	}
});

document.querySelector(".log-in").addEventListener("click", async (e) => {
	e.preventDefault();
	e.stopPropagation();

	const passwordModal = document.createElement("div");
	passwordModal.className = "login-modal-backdrop";

	const passwordContent = document.createElement("div");
	passwordContent.className = "login-modal-content";

	const passwordLogo = document.createElement("svg");

	const passkeyLoginButton = document.createElement("button");
	passkeyLoginButton.type = "button";
	passkeyLoginButton.className = "passkey-login";
	passkeyLoginButton.textContent = "Log in with passkey";

	passkeyLoginButton.addEventListener("click", async () => {
		try {
			const response = await fetch(
				"/api/auth/generate-authentication-options",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);

			const data = await response.json();

			if (!data.options) {
				throw new Error(
					data.error || "Failed to generate authentication options",
				);
			}

			const credential = await window.SimpleWebAuthnBrowser.startAuthentication(
				data.options,
			);

			const verifyResponse = await fetch("/api/auth/verify-authentication", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedChallenge: data.expectedChallenge,
					credential,
				}),
			});

			const verifyData = await verifyResponse.json();

			if (verifyData.token) {
				localStorage.setItem("authToken", verifyData.token);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
					} else {
						Reflect.set(
							document,
							"cookie",
							`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
						);
					}
				} catch {}

				window.location.href = "/timeline/";
			} else {
				alert(verifyData.error || "Authentication failed");
			}
		} catch (err) {
			console.error("Passkey login error:", err);
		}
	});

	if (!window.SimpleWebAuthnBrowser) {
		passkeyLoginButton.style.display = "none";
	}

	const form = document.createElement("form");
	form.className = "password-login-form";

	const usernameLabel = document.createElement("label");
	usernameLabel.htmlFor = "login-username";
	usernameLabel.textContent = "Username";

	const usernameInput = document.createElement("input");
	usernameInput.type = "text";
	usernameInput.placeholder = "tiago";
	usernameInput.id = "login-username";
	usernameInput.required = true;

	const passwordLabel = document.createElement("label");
	passwordLabel.htmlFor = "login-password";
	passwordLabel.textContent = "Password";

	const passwordInput = document.createElement("input");
	passwordInput.type = "password";
	passwordInput.placeholder = "••••••••••••";
	passwordInput.id = "login-password";
	passwordInput.required = true;

	const formActions = document.createElement("div");
	formActions.className = "form-actions";

	const loginBtn = document.createElement("button");
	loginBtn.type = "submit";
	loginBtn.className = "primary";
	loginBtn.textContent = "Log in";

	const backBtn = document.createElement("button");
	backBtn.type = "button";
	backBtn.className = "back-btn";
	backBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const username = usernameInput.value.trim();
		const password = passwordInput.value.trim();

		if (!username || !password) {
			alert("Please enter both username and password");
			return;
		}

		try {
			const { token, error } = await (
				await fetch("/api/auth/basic-login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ username, password }),
				})
			).json();

			if (token) {
				localStorage.setItem("authToken", token);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
					} else {
						Reflect.set(
							document,
							"cookie",
							`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
						);
					}
				} catch {}

				window.location.href = "/timeline/";
			} else {
				alert(error || "Login failed");
			}
		} catch (err) {
			console.error("Login error:", err);
			alert("Login failed. Please try again.");
		}
	});

	backBtn.addEventListener("click", () => {
		passwordModal.remove();
	});

	formActions.appendChild(loginBtn);
	formActions.appendChild(backBtn);
	form.appendChild(usernameLabel);
	form.appendChild(usernameInput);
	form.appendChild(passwordLabel);
	form.appendChild(passwordInput);
	form.appendChild(formActions);
	passwordContent.appendChild(passwordLogo);
	passwordContent.appendChild(passkeyLoginButton);
	passwordContent.appendChild(form);
	passwordModal.appendChild(passwordContent);
	document.body.appendChild(passwordModal);

	passwordLogo.outerHTML = `<svg class="logo" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
  </svg>`;

	usernameInput.focus();
});

document
	.querySelector(".model-wrapper .close")
	.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();

		document.querySelector(".model-wrapper").style.transition =
			"top .3s, opacity .3s";

		setTimeout(() => {
			document.querySelector(".model-wrapper").style.top = "-100px";
			document.querySelector(".model-wrapper").style.opacity = "0";
		}, 10);

		setTimeout(() => {
			document.querySelector(".model-wrapper").style.display = "none";
			document.querySelector(".model-wrapper").style.opacity = "";
			document.querySelector(".model-wrapper").style.top = "";
			document.querySelector(".model-wrapper").style.transition = "";
		}, 500);
	});
