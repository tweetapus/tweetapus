import confetti from "../../shared/confetti.js";
import toastQueue from "../../shared/toasts.js";
import getUser, { authToken } from "./auth.js";

export const useComposer = (element, callback, { replyTo = null } = {}) => {
	const textarea = element.querySelector("#tweet-textarea");
	const charCount = element.querySelector("#char-count");
	const tweetButton = element.querySelector("#tweet-button");

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
						reply_to: replyTo,
						source: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
							? "mobile_web"
							: "desktop_web",
					}),
				})
			).json();

			if (!tweet) {
				toastQueue.add(`<h1>${error || "Failed to post tweet"}</h1>`);
				return;
			}

			textarea.value = "";
			charCount.textContent = "0";
			textarea.style.height = "25px";

			callback(tweet);

			if (!replyTo) {
				confetti(tweetButton, {
					count: 40,
					fade: true,
				});
			}

			toastQueue.add(`<h1>Tweet posted successfully!</h1>`);
		} catch (e) {
			console.log(e);
			toastQueue.add(`<h1>Network error. Please try again.</h1>`);
		} finally {
			tweetButton.disabled = false;
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
};

export const createComposer = async ({
	callback = () => {},
	placeholder = "What's happening?",
	replyTo = null,
}) => {
	const el = document.createElement("div");
	el.classList.add("compose-tweet");
	el.innerHTML = `
        <div class="compose-header">
          <img src="" alt="Your avatar" id="compose-avatar">
          <div class="compose-input">
            <textarea placeholder="What's happening?" maxlength="400" id="tweet-textarea"></textarea>
            <div class="compose-footer">
              <div class="character-counter" id="">
              <span id="char-count">0</span>/400
            </div>
              <button id="tweet-button" disabled="">Tweet</button>
            </div>
          </div>
        </div>`;
	el.querySelector("#tweet-textarea").placeholder = placeholder;
	el.querySelector(".compose-header img").src = (await getUser()).avatar;
	useComposer(el, callback, { replyTo });

	return el;
};
