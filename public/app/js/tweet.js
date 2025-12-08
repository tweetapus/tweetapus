import {
	createTweetSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import toastQueue from "../../shared/toasts.js";
import { createComposer } from "./composer.js";
import switchPage, { addRoute, updatePageTitle } from "./pages.js";
import { createTweetElement } from "./tweets.js";

export default async function openTweet(
	tweet,
	{ repliesCache, threadPostsCache } = {},
) {
	const { default: query } = await import("./api.js");

	if (!tweet?.id || !tweet) return;

	let finalThread = null;
	let finalTweet = tweet;

	const sourceThread = threadPostsCache || tweet.parentsCache;

	if (sourceThread && sourceThread.length > 0) {
		const targetIndex = sourceThread.findIndex((t) => t.id === tweet.id);

		if (targetIndex !== -1) {
			finalThread = sourceThread.slice(0, targetIndex + 1);
			finalTweet = sourceThread[targetIndex];
		} else {
			finalThread = [...sourceThread];
			if (tweet.author) {
				finalThread.push(tweet);
				finalTweet = tweet;
			}
		}
	}

	if (!finalTweet.author && !finalThread) {
		const apiOutput = await query(`/tweets/${tweet.id}`);

		if (!apiOutput || !apiOutput.tweet) {
			toastQueue.add(
				`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
			);
			return;
		}

		finalTweet = apiOutput.tweet;
		finalThread = apiOutput?.threadPosts || [];
		repliesCache = apiOutput?.replies || [];
	}

	let isLoadingMoreReplies = false;
	let hasMoreReplies = false;
	let currentOffset = 0;
	let scrollHandler = null;

	const renderedTweets = new Map();

	const authorName =
		finalTweet.author?.name || finalTweet.author?.username || "Post";
	const tweetContent = finalTweet.content?.slice(0, 30) || "";
	const pageTitle = `${authorName}: "${tweetContent}${tweetContent.length >= 30 ? "..." : ""}"`;

	switchPage("tweet", {
		path: `/tweet/${finalTweet.id}`,
		title: pageTitle,
		cleanup: () => {
			if (scrollHandler) {
				window.removeEventListener("scroll", scrollHandler);
				scrollHandler = null;
			}
			renderedTweets.clear();
		},
		recoverState: async (page) => {
			page.innerHTML = `<button class="back-button" onclick="history.back()"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></button>`;

			page.querySelector(".back-button").addEventListener("click", (e) => {
				e.preventDefault();
				history.back();
			});

			const getTweetElement = (tweetData, options = {}) => {
				if (renderedTweets.has(tweetData.id)) {
					return renderedTweets.get(tweetData.id);
				}

				const element = createTweetElement(tweetData, options);
				renderedTweets.set(tweetData.id, element);
				return element;
			};

			if (finalThread && finalThread.length > 0) {
				finalThread.forEach((post) => {
					const postEl = getTweetElement(post, {
						clickToOpen: post.id !== finalTweet.id,
					});

					if (post.id === finalTweet.id) {
						postEl.setAttribute("data-main-tweet", "true");
					}

					page.appendChild(postEl);
				});
			} else if (finalTweet.author) {
				const tweetEl = getTweetElement(finalTweet, {
					clickToOpen: false,
				});
				tweetEl.setAttribute("data-main-tweet", "true");
				page.appendChild(tweetEl);
			}

			const composer = await createComposer({
				placeholder: `Add a reply…`,
				replyTo: finalTweet.id,
				callback: (newTweet) => {
					const replyEl = getTweetElement(newTweet, {
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

			if (repliesCache && repliesCache.length > 0) {
				const threadForReplies = finalThread || [finalTweet];

				repliesCache.forEach((reply) => {
					if (!reply.parentsCache) {
						reply.parentsCache = [...threadForReplies, reply];
					}

					const replyEl = getTweetElement(reply, {
						clickToOpen: true,
					});
					replyEl.setAttribute("data-reply-id", reply.id);
					repliesContainer.appendChild(replyEl);
				});
				currentOffset = repliesCache.length;
				hasMoreReplies = repliesCache.length >= 20;
			}

			const needsThreadData = !finalThread && finalTweet.author;
			const needsRepliesData = !repliesCache;

			if (needsThreadData || needsRepliesData || !finalTweet.author) {
				const skeletons = needsRepliesData
					? showSkeletons(
							repliesContainer,
							createTweetSkeleton,
							typeof finalTweet?.reply_count === "number"
								? Math.min(finalTweet?.reply_count, 24)
								: 3,
						)
					: [];

				const apiOutput = await query(`/tweets/${finalTweet.id}`);

				if (!apiOutput || !apiOutput.tweet) {
					removeSkeletons(skeletons);
					toastQueue.add(
						`<h1>Tweet not found</h1><p>It might have been deleted</p>`,
					);
					return;
				}

				finalTweet = apiOutput.tweet;
				hasMoreReplies = apiOutput?.hasMoreReplies || false;

				const loadedAuthorName =
					finalTweet.author?.name || finalTweet.author?.username || "Post";
				const loadedContent = finalTweet.content?.slice(0, 30) || "";
				updatePageTitle("tweet", {
					title: loadedContent
						? `${loadedAuthorName}: "${loadedContent}${loadedContent.length >= 30 ? "..." : ""}"`
						: `tweet by ${loadedAuthorName}`,
				});

				if ((needsThreadData || !finalThread) && apiOutput.threadPosts) {
					const newThreadPosts = apiOutput.threadPosts;

					if (newThreadPosts.length > 0) {
						const existingTweet = page.querySelector(
							'[data-main-tweet="true"]',
						);
						if (
							existingTweet &&
							!existingTweet.closest(".tweet-replies-container")
						) {
							existingTweet.remove();
						}

						newThreadPosts.forEach((post) => {
							const postEl = getTweetElement(post, {
								clickToOpen: post.id !== finalTweet.id,
							});

							if (post.id === finalTweet.id) {
								postEl.setAttribute("data-main-tweet", "true");
							}

							composer.insertAdjacentElement("beforebegin", postEl);
						});

						const mainTweet = page.querySelector('[data-main-tweet="true"]');
						if (mainTweet) {
							mainTweet.scrollIntoView({ block: "start" });
							window.scrollBy(0, -200);
						}
					}
				}

				if (needsRepliesData && apiOutput.replies) {
					removeSkeletons(skeletons);
					repliesCache = apiOutput.replies;

					const threadForReplies =
						finalThread ||
						(apiOutput.threadPosts ? apiOutput.threadPosts : [finalTweet]);

					repliesCache.forEach((reply) => {
						reply.parentsCache = [...threadForReplies, reply];

						const replyEl = getTweetElement(reply, {
							clickToOpen: true,
						});
						replyEl.setAttribute("data-reply-id", reply.id);
						repliesContainer.appendChild(replyEl);
					});
					currentOffset = repliesCache.length;
				} else if (needsRepliesData) {
					removeSkeletons(skeletons);
				}
			}

			const mainTweet = page.querySelector('[data-main-tweet="true"]');
			if (mainTweet) {
				mainTweet.scrollIntoView({ block: "start" });
				window.scrollBy(0, -200);
			}

			if (scrollHandler) {
				window.removeEventListener("scroll", scrollHandler);
				scrollHandler = null;
			}

			let scrollTimeout = null;

			scrollHandler = () => {
				if (scrollTimeout) return;

				scrollTimeout = setTimeout(async () => {
					scrollTimeout = null;

					if (isLoadingMoreReplies || !hasMoreReplies) {
						return;
					}

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
								`/tweets/${finalTweet.id}?offset=${currentOffset}&limit=20`,
							);

							removeSkeletons(loadMoreSkeletons);

							if (apiOutput?.replies && apiOutput.replies.length > 0) {
								const threadForReplies = finalThread || [finalTweet];

								apiOutput.replies.forEach((reply) => {
									if (!renderedTweets.has(reply.id)) {
										reply.parentsCache = [...threadForReplies, reply];
										const replyEl = getTweetElement(reply, {
											clickToOpen: true,
										});
										replyEl.setAttribute("data-reply-id", reply.id);
										repliesContainer.appendChild(replyEl);
									}
								});

								currentOffset += apiOutput.replies.length;
								hasMoreReplies = apiOutput.hasMoreReplies || false;
							} else {
								hasMoreReplies = false;
							}
						} catch (e) {
							console.error("Error loading more replies:", e);
							removeSkeletons(loadMoreSkeletons);
						} finally {
							isLoadingMoreReplies = false;
						}
					}
				}, 200);
			};

			window.addEventListener("scroll", scrollHandler, { passive: true });
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
