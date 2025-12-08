(async () => {
	const currentScript = document.currentScript;
	if (currentScript.getAttribute("data-tweetapus-loaded") === "1") return;
	currentScript.setAttribute("data-tweetapus-loaded", "1");

	const tweet = {
		/*{tweet}*/
	};

	const tweetFrame = document.createElement("iframe");
	tweetFrame.style.cssText = `
    width: 100%;
    height: 0px;
    border: none;
    border-radius: 0px;
    overflow: hidden;
  `;
	tweetFrame.setAttribute("scrolling", "no");
	tweetFrame.setAttribute("frameborder", "0");
	tweetFrame.setAttribute("width", "100%");
	currentScript.after(tweetFrame);

	const doc = tweetFrame.contentDocument;
	doc.open();
	doc.write(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * {
            box-sizing: border-box;
          }
          
          body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }

          :root {
            --primary: rgb(172, 151, 255);
            --primary-fg: black;
            --text-rgb: 76, 79, 105;
            --text-primary: rgba(54, 56, 76, 1);
            --text-secondary: #5c5f77;
            --text-tertiary: #7c7f93;
            --text-placeholder: #8c8fa1;
            --text-muted: #9ca0b0;
            --text-muted-hover: #6c6f85;
            --bg-primary: #eff1f5;
            --bg-rgb: 239, 241, 245;
            --bg-secondary: #e6e9ef;
            --border-primary: #ccd0da;
            --border-secondary: #dce0e8;
            --border-tertiary: #bcc0cc;
            --border-focus: var(--primary);
            --border-hover: #acb0be;
            --border-input: rgba(0, 0, 0, 0.12);
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --primary-rgb: 172, 151, 255;
              --primary: rgb(172, 151, 255);
              --primary-fg: black;
              --text-rgb: 205, 214, 244;
              --text-primary: rgb(226 232 240);
              --text-secondary: #bac2de;
              --text-tertiary: #a6adc8;
              --text-placeholder: #9399b2;
              --text-muted: #bac2de;
              --text-muted-hover: #cdd6f4;
              --bg-primary: #181825;
              --bg-rgb: 24, 24, 37;
              --bg-secondary: #181825;
              --border-primary: #313244;
              --border-secondary: #45475a;
              --border-tertiary: #585b70;
              --border-focus: var(--primary);
              --border-hover: #6c7086;
              --border-input: rgba(255, 255, 255, 0.1);
            }
          }

          .tweet-container {
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 16px;
            max-width: 540px;
            transition: border-color 0.2s, background-color 0.2s;
          }

          .tweet-container:hover {
            border-color: var(--border-hover);
          }

          .tweet-header {
            display: flex;
            align-items: center;
            gap: .625rem;
            font-size: 14.95px;
            position: relative;
            margin-bottom: 12px;
						user-select: none;
          }

          .tweet-header img {
            width: 32px;
            height: 32px;
            cursor: pointer;
            transition: transform 0.2s, opacity 0.2s;
            object-fit: cover;
          }

          .tweet-header img:hover {
            transform: scale(1.1);
          }

          .tweet-header img:active {
            opacity: 0.8;
            transform: scale(0.98);
          }

          .tweet-header-info {
            display: flex;
            flex-direction: column;
            flex-wrap: wrap;
            flex: 1;
						gap: 5px;
          }

          .tweet-header-info:hover .name {
            text-decoration: underline;
          }

          .tweet-header-info p {
            margin: 0px;
            display: flex;
            align-items: center;
            gap: 2px;
          }

          .tweet-header-info .name {
            font-weight: 500;
            margin-bottom: -4px;
            cursor: pointer;
          }

          .verification-badge {
            display: inline-flex;
            align-items: center;
            vertical-align: middle;
            margin-left: 2px;
          }

          .verification-badge svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
          }

          .tweet-header-username-span {
            color: var(--text-secondary);
            font-weight: 400;
						user-select: none;
          }

          .tweet-header-info .username {
            color: var(--text-secondary);
            cursor: pointer;
            user-select: none;
          }

          .tweet-content {
            font-size: 1.125rem;
            color: var(--text-primary);
            margin: 0 0 12px 0;
            word-wrap: break-word;
            line-height: 1.5rem;
          }

          .tweet-date {
            font-size: 14px;
            color: var(--text-secondary);
            margin: 12px 0;
            opacity: .8;
						user-select: none;
          }

          .tweet-divider {
            border: none;
            border-top: 1px solid var(--border-secondary);
            margin: 12px 0;
          }

          .tweet-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 14px;
						user-select: none;
          }

          .tweet-stats {
            display: flex;
            align-items: center;
            gap: 16px;
            color: var(--text-secondary);
          }

          .tweet-stat {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .tweet-stat svg {
            width: 19px;
            height: 19px;
          }

          .tweet-link {
            color: rgb(172, 151, 255);
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
          }

          .tweet-link:hover {
            text-decoration: underline;
          }

          .tweetapus-logo {
            width: 20px;
            height: 20px;
            cursor: pointer;
            transition: transform 0.2s, opacity 0.2s;
          }

          .tweetapus-logo:active {
            transform: scale(0.95);
            opacity: 0.8;
          }

          .tweet-attachments {
            display: grid;
            gap: 8px;
            margin: 12px 0;
            border-radius: 12px;
            overflow: hidden;
          }

          .tweet-attachments.single-attachment {
            grid-template-columns: 1fr;
          }

          .tweet-attachments.two-attachments {
            grid-template-columns: 1fr 1fr;
          }

          .tweet-attachments.three-attachments {
            grid-template-columns: 1fr 1fr;
          }

          .tweet-attachments.three-attachments .tweet-attachment:first-child {
            grid-column: 1 / -1;
          }

          .tweet-attachments.four-attachments {
            grid-template-columns: 1fr 1fr;
          }

          .tweet-attachment {
            position: relative;
            width: 100%;
            overflow: hidden;
            border-radius: 8px;
            background: var(--bg-secondary);
          }

          .tweet-attachment img,
          .tweet-attachment video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            max-height: 400px;
            border-radius: 8px;
          }

          .tweet-attachment video {
            max-height: 400px;
          }

          .tweet-poll {
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 12px;
            margin: 12px 0;
          }

          .poll-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
          }

          .poll-option {
            position: relative;
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 12px;
            background: var(--bg-primary);
            overflow: hidden;
          }

          .poll-option-bar {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            background: var(--primary);
            opacity: 0.15;
            transition: width 0.3s ease;
          }

          .poll-option-content {
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1;
          }

          .poll-option-text {
            font-size: 14px;
            color: var(--text-primary);
          }

          .poll-option-percentage {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
          }

          .poll-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: var(--text-secondary);
            padding-top: 8px;
            border-top: 1px solid var(--border-secondary);
          }

          .poll-votes {
            font-weight: 500;
          }

          .poll-time {
            opacity: 0.8;
          }
        </style>
      </head>
      <body></body>
    </html>
  `);
	doc.close();

	function resizeIframeToFitContent() {
		const body = tweetFrame.contentDocument.body;
		let maxHeight = 0;
		const children = body.children;
		for (let i = 0; i < children.length; i++) {
			const rect = children[i].getBoundingClientRect();
			const bottom = rect.top + rect.height;
			if (bottom > maxHeight) {
				maxHeight = bottom;
			}
		}
		tweetFrame.style.height = `${Math.ceil(maxHeight)}px`;
	}

	tweetFrame.addEventListener("load", () => {
		const body = tweetFrame.contentDocument.body;

		const escapeHtml = (str) => {
			if (!str) return "";
			const div = document.createElement("div");
			div.textContent = str;
			return div.innerHTML;
		};

		const formatDate = (dateStr) => {
			const date = new Date(dateStr);
			const options = { month: "short", day: "numeric", year: "numeric" };
			const formatted = date.toLocaleDateString("en-US", options);
			const time = date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
			return `${time} • ${formatted}`;
		};

		const getVerificationBadge = (verified) => {
			if (!verified) return "";

			let color;

			if (verified === "gold") color = "#d4af37";
			else if (verified === "gray") color = "#829AAB";
			else if (verified) color = "#AC97FF";

			return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="${color}"></path><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
		};

		const formatTimeRemaining = (expiresAt) => {
			const now = new Date();
			const expires = new Date(expiresAt);
			const diff = expires - now;

			if (diff <= 0) return "Final results";

			const days = Math.floor(diff / (1000 * 60 * 60 * 24));
			const hours = Math.floor(
				(diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
			);
			const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

			if (days > 0) return `${days} day${days !== 1 ? "s" : ""} left`;
			if (hours > 0) return `${hours} hour${hours !== 1 ? "s" : ""} left`;
			return `${minutes} minute${minutes !== 1 ? "s" : ""} left`;
		};

		let attachmentsHTML = "";
		if (tweet.attachments && tweet.attachments.length > 0) {
			const count = tweet.attachments.length;
			const gridClass =
				count === 1
					? "single-attachment"
					: count === 2
						? "two-attachments"
						: count === 3
							? "three-attachments"
							: "four-attachments";

			attachmentsHTML = `<div class="tweet-attachments ${gridClass}">`;

			for (const attachment of tweet.attachments) {
				attachmentsHTML += '<div class="tweet-attachment">';

				if (attachment.file_type.startsWith("image/")) {
					attachmentsHTML += `<img src="${escapeHtml(attachment.file_url)}" alt="${escapeHtml(attachment.file_name)}" loading="lazy" />`;
				} else if (attachment.file_type === "video/mp4") {
					attachmentsHTML += `<video src="${escapeHtml(attachment.file_url)}" controls></video>`;
				}

				attachmentsHTML += "</div>";
			}

			attachmentsHTML += "</div>";
		}

		let pollHTML = "";
		if (tweet.poll) {
			pollHTML = '<div class="tweet-poll"><div class="poll-options">';

			for (const option of tweet.poll.options) {
				const safePercentage = Number.isFinite(option.percentage)
					? Math.max(0, Math.min(100, option.percentage))
					: 0;
				pollHTML += `
					<div class="poll-option">
						<div class="poll-option-bar" style="width: ${safePercentage}%"></div>
						<div class="poll-option-content">
							<span class="poll-option-text">${escapeHtml(option.text)}</span>
							<span class="poll-option-percentage">${safePercentage}%</span>
						</div>
					</div>
				`;
			}

			const safeTotalVotes = Number.isFinite(tweet.poll.totalVotes)
				? Math.max(0, tweet.poll.totalVotes)
				: 0;
			pollHTML += `
				</div>
				<div class="poll-meta">
					<span class="poll-votes">${safeTotalVotes} vote${safeTotalVotes !== 1 ? "s" : ""}</span>
					<span class="poll-time">${escapeHtml(formatTimeRemaining(tweet.poll.expiresAt))}</span>
				</div>
			</div>
			`;
		}

		const safeLink = escapeHtml(tweet.link);
		const safeAvatar = escapeHtml(tweet.author.avatar);
		const safeName = escapeHtml(tweet.author.name);
		const safeUsername = escapeHtml(tweet.author.username);
		const safeContent = escapeHtml(tweet.content);
		const safeAvatarRadius = Number.isFinite(tweet.author.avatar_radius)
			? Math.max(0, Math.min(50, tweet.author.avatar_radius))
			: 50;
		const safeLikes = Number.isFinite(tweet.likes)
			? Math.max(0, tweet.likes)
			: 0;
		const safeRetweets = Number.isFinite(tweet.retweets)
			? Math.max(0, tweet.retweets)
			: 0;
		const safeReplies = Number.isFinite(tweet.replies)
			? Math.max(0, tweet.replies)
			: 0;

		let safeOrigin;
		try {
			safeOrigin = new URL(tweet.link).origin;
		} catch {
			safeOrigin = "";
		}

		const tweetHTML = `
			<div class="tweet-container" onclick="window.open('${safeLink}', '_blank')">
				<div class="tweet-header">
					<img src="${safeAvatar}" alt="${safeName}" style="border-radius: ${safeAvatarRadius}%;" />
					<div class="tweet-header-info">
						<p class="name">
							${safeName}
							${tweet.author.verified && tweet.author.verified !== "none" ? `<span class="verification-badge">${getVerificationBadge(tweet.author.verified)}</span>` : ""}
						</p>
							<span class="tweet-header-username-span">@${safeUsername}</span>
					</div>
					<img class="tweetapus-logo" src="${escapeHtml(safeOrigin)}/public/shared/assets/favicon.svg" alt="Tweetapus logo" width="32" height="32" loading="lazy" draggable="false">
				</div>
				<p class="tweet-content">${safeContent}</p>
				${attachmentsHTML}
				${pollHTML}
				<div class="tweet-date">${escapeHtml(formatDate(tweet.created_at))}</div>
				<hr class="tweet-divider" />
				<div class="tweet-footer">
					<div class="tweet-stats">
						<div class="tweet-stat">
							<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M5.00002 2.54822C8.00003 2.09722 9.58337 4.93428 10 5.87387C10.4167 4.93428 12 2.09722 15 2.54822C18 2.99923 18.75 5.66154 18.75 7.05826C18.75 9.28572 18.1249 10.9821 16.2499 13.244C14.3749 15.506 10 18.3333 10 18.3333C10 18.3333 5.62498 15.506 3.74999 13.244C1.875 10.9821 1.25 9.28572 1.25 7.05826C1.25 5.66154 2 2.99923 5.00002 2.54822Z" stroke="#EC4899" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="${safeLikes > 0 ? "#EC4899" : "none"}"></path>
							</svg>
							<span>${safeLikes}</span>
						</div>
						${
							safeRetweets > 0
								? `
						<div class="tweet-stat">
							<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
							</svg>
							<span>${safeRetweets}</span>
						</div>
							`
								: ""
						}
						<div class="tweet-stat">
							<svg width="19" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M18.7502 11V7.50097C18.7502 4.73917 16.5131 2.50033 13.7513 2.50042L6.25021 2.50044C3.48848 2.5004 1.25017 4.73875 1.2502 7.50048L1.25021 10.9971C1.2502 13.749 3.47395 15.9836 6.22586 15.9971L6.82888 16V19.0182L12.1067 16H13.7502C16.5116 16 18.7502 13.7614 18.7502 11Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
							</svg>
							<span>Reply</span>
						</div>
					</div>
					<a href="${safeLink}" target="_blank" class="tweet-link" onclick="event.stopPropagation()">
						Read ${safeReplies} ${safeReplies === 1 ? "reply" : "replies"} on Tweetapus
					</a>
				</div>
			</div>
		`;

		body.innerHTML = tweetHTML;

		resizeIframeToFitContent();

		const resizeObserver = new ResizeObserver(() => {
			resizeIframeToFitContent();
		});

		for (const child of body.children) {
			resizeObserver.observe(child);
		}
	});

	window.addEventListener("resize", resizeIframeToFitContent);
})();
