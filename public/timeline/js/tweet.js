import {
	createTweetSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import toastQueue from "../../shared/toasts.js";
import { createComposer } from "./composer.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

export default async function openTweet(
	tweet,
	{ repliesCache, threadPostsCache } = {},
) {
	const { default: query } = await import("./api.js");

	if (!tweet?.id || !tweet) return;

	if (!tweet?.author) {
		const apiOutput = await query(`/tweets/${tweet.id}`);

		if (!apiOutput || !apiOutput.tweet) {
			toastQueue.add(
				`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
			);
			return;
		}

		tweet = apiOutput.tweet;
		threadPostsCache = apiOutput?.threadPosts || [
			{
				...tweet,
				content: "failed to load xeet. it might have been deleted",
			},
		];
		repliesCache = apiOutput?.replies || [];
		tweet.extendedStats = apiOutput?.extendedStats || [];
	}

	let isLoadingMoreReplies = false;
	let hasMoreReplies = false;
	let oldestReplyId = null;
	let scrollHandler = null;

	switchPage("tweet", {
		path: `/tweet/${tweet.id}`,
		cleanup: () => {
			if (scrollHandler) {
				window.removeEventListener("scroll", scrollHandler);
				scrollHandler = null;
			}
		},
		recoverState: async (page) => {
			page.innerHTML = `<button class="back-button" onclick="history.back()"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></button>`;

			page.querySelector(".back-button").addEventListener("click", (e) => {
				e.preventDefault();
				history.back();
			});

			const tweetEl = createTweetElement(tweet, {
				clickToOpen: false,
			});
			tweetEl.setAttribute("data-main-tweet", "true");

			if (tweet.reply_to) {
				page.style.opacity = ".5";
			}

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

			const repliesContainer = document.createElement("div");
			repliesContainer.className = "tweet-replies-container";
			page.appendChild(repliesContainer);

			let skeletons = [];
			if (!threadPostsCache || !repliesCache) {
				skeletons = showSkeletons(
					repliesContainer,
					createTweetSkeleton,
					typeof tweet?.reply_count === "number"
						? Math.min(tweet?.reply_count, 24)
						: 3,
				);

				const apiOutput = await query(`/tweets/${tweet.id}`);
				tweet = apiOutput.tweet;
				threadPostsCache = apiOutput.threadPosts;
				repliesCache = apiOutput.replies;
				hasMoreReplies = apiOutput?.hasMoreReplies || false;
				tweet.extendedStats = apiOutput.extendedStats;

				removeSkeletons(skeletons);
			}

			if (!tweet) {
				switchPage("timeline");
				toastQueue.add(
					`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
				);
				return;
			}

			if (threadPostsCache.length > 0) {
				tweetEl.remove();
				threadPostsCache.forEach((reply) => {
					const postEl = createTweetElement(reply, {
						clickToOpen: reply.id !== tweet.id,
					});
					if (reply.id === tweet.id) {
						postEl.setAttribute("data-main-tweet", "true");
					}
					composer.insertAdjacentElement("beforebegin", postEl);
				});

				setTimeout(() => {
					const mainTweet = page.querySelector('[data-main-tweet="true"]');
					if (mainTweet) {
						mainTweet.scrollIntoView({ block: "start" });
						window.scrollBy(0, -200);
					}
				}, 100);
			}

			if (tweet.reply_to) {
				page.style.opacity = "";
			}

			repliesCache.forEach((reply) => {
				const replyEl = createTweetElement(reply, {
					clickToOpen: true,
				});
				replyEl.setAttribute("data-reply-id", reply.id);
				repliesContainer.appendChild(replyEl);
				oldestReplyId = reply.id;
			});

			page.appendChild(repliesContainer);

			if (scrollHandler) {
				window.removeEventListener("scroll", scrollHandler);
			}

			scrollHandler = async () => {
				if (isLoadingMoreReplies || !hasMoreReplies) return;

				const scrollPosition = window.innerHeight + window.scrollY;
				const threshold = document.documentElement.scrollHeight - 800;

				if (scrollPosition >= threshold) {
					isLoadingMoreReplies = true;

					const loadMoreSkeletons = showSkeletons(
						repliesContainer,
						createTweetSkeleton,
						3,
					);

					try {
						const apiOutput = await query(
							`/tweets/${tweet.id}?before=${oldestReplyId}&limit=20`,
						);

						removeSkeletons(loadMoreSkeletons);

						if (apiOutput.replies && apiOutput.replies.length > 0) {
							apiOutput.replies.forEach((reply) => {
								const replyEl = createTweetElement(reply, {
									clickToOpen: true,
								});
								replyEl.setAttribute("data-reply-id", reply.id);
								repliesContainer.appendChild(replyEl);
								oldestReplyId = reply.id;
							});

							hasMoreReplies = apiOutput.hasMoreReplies || false;
						}
					} catch (error) {
						removeSkeletons(loadMoreSkeletons);
						console.error("Error loading more replies:", error);
					} finally {
						isLoadingMoreReplies = false;
					}
				}
			};

			window.addEventListener("scroll", scrollHandler);
		},
	});
}

addRoute(
	(pathname) =>
		pathname.startsWith("/tweet/") && pathname.split("/").length === 3,
	(pathname) => {
		const tweetId = pathname.split("/").pop();
		openTweet({ id: tweetId });
	},
);
