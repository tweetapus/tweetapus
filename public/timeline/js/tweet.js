import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import { createComposer } from "./composer.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

export default async function openTweet(
	tweet,
	{ repliesCache, threadPostsCache } = {},
) {
	if (!tweet?.author) {
		const apiOutput = await await (
			await fetch(`/api/tweets/${tweet.id}`, {
				headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
			})
		).json();
		tweet = apiOutput.tweet;
		threadPostsCache = apiOutput.threadPosts;
		repliesCache = apiOutput.replies;

		if (!tweet) {
			switchPage("timeline");
			toastQueue.add(
				`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
			);
			return;
		}
	}

	switchPage("tweet", {
		path: `/tweet/${tweet.id}`,
		recoverState: async (page) => {
			page.innerHTML = `<a href="/" class="back-button"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></a>`;

			page.querySelector(".back-button").addEventListener("click", () => {
				window.location.href = "/";
			});

			const tweetEl = createTweetElement(tweet, {
				clickToOpen: false,
			});
			page.appendChild(tweetEl);

			const composer = await createComposer({
				placeholder: `Add a reply…`,
				replyTo: tweet.id,
				callback: (tweet) => {
					const replyEl = createTweetElement(tweet, {
						clickToOpen: true,
					});
					replyEl.classList.add("created");

					composer.insertAdjacentElement("afterend", replyEl);
				},
			});

			page.appendChild(composer);

			if (!threadPostsCache || !repliesCache) {
				const apiOutput = await await (
					await fetch(`/api/tweets/${tweet.id}`, {
						headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
					})
				).json();
				tweet = apiOutput.tweet;
				threadPostsCache = apiOutput.threadPosts;
				repliesCache = apiOutput.replies;
			}

			if (!tweet) {
				switchPage("timeline");
				toastQueue.add(
					`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
				);
				return;
			}

			tweetEl.remove();

			threadPostsCache.forEach((reply) => {
				const postEl = createTweetElement(reply, {
					clickToOpen: reply.id !== tweet.id,
				});
				composer.insertAdjacentElement("beforebegin", postEl);
			});

			repliesCache.forEach((reply) => {
				const replyEl = createTweetElement(reply, {
					clickToOpen: true,
				});
				page.appendChild(replyEl);
			});
		},
	});
}

addRoute(
	(pathname) =>
		pathname.startsWith("/tweet/") && pathname.split("/").length === 3,
	(pathname) => {
		openTweet({
			id: pathname.split("/").pop(),
		});
	},
);

export { openTweet };
