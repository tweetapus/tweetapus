import toastQueue from "../../shared/toasts.js";
import { createComposer } from "./composer.js";
import switchPage, { addRoute } from "./pages.js";
import { createTweetElement } from "./tweets.js";

export default async function openTweet(
  tweet,
  { repliesCache, threadPostsCache } = {}
) {
  const { default: query } = await import("./api.js");

  if (!tweet?.id || !tweet) return;

  if (!tweet?.author) {
    const apiOutput = await query(`/tweets/${tweet.id}`);
    tweet = apiOutput.tweet;
    threadPostsCache = apiOutput?.threadPosts || [{
      ...tweet,
      content: "failed to load xeet. it might have been deleted",
    }];
    repliesCache = apiOutput?.replies || [];
    tweet.extendedStats = apiOutput?.extendedStats || [];

    if (!tweet) {
      switchPage("timeline");
      toastQueue.add(
        `<h1>Tweet not found</h1><p>It might have been deleted</p>`
      );
      return;
    }
  }

  switchPage("tweet", {
    path: `/tweet/${tweet.id}`,
    recoverState: async (page) => {
      page.innerHTML = `<button class="back-button" onclick="history.back()"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></button>`;

      page.querySelector(".back-button").addEventListener("click", (e) => {
        e.preventDefault();
        history.back();
      });

      const tweetEl = createTweetElement(tweet, {
        clickToOpen: false,
        showStats: true,
        extendedStats: tweet.extendedStats,
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
        const apiOutput = await query(`/tweets/${tweet.id}`);
        tweet = apiOutput.tweet;
        threadPostsCache = apiOutput.threadPosts;
        repliesCache = apiOutput.replies;
        tweet.extendedStats = apiOutput.extendedStats;
      }

      if (!tweet) {
        switchPage("timeline");
        toastQueue.add(
          `<h1>Tweet not found</h1><p>It might have been deleted</p>`
        );
        return;
      }

      if (threadPostsCache.length > 0) {
        tweetEl.remove();
        threadPostsCache.forEach((reply) => {
          const postEl = createTweetElement(reply, {
            clickToOpen: reply.id !== tweet.id,
            showStats: reply.id === tweet.id,
            extendedStats: reply.id === tweet.id ? tweet.extendedStats : null,
          });
          if (reply.id === tweet.id) {
            postEl.setAttribute('data-main-tweet', 'true');
          }
          composer.insertAdjacentElement("beforebegin", postEl);
        });
        
        setTimeout(() => {
          const mainTweet = page.querySelector('[data-main-tweet="true"]');
          if (mainTweet) {
            mainTweet.scrollIntoView({ block: 'center' });
          }
        }, 100);
      }

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
    const tweetId = pathname.split("/").pop();
    openTweet({ id: tweetId });
  }
);
