import { Elysia } from "elysia";
import db from "../db.js";

const getTweetById = db.query(`
  SELECT * FROM posts WHERE id = ?
`);
const getUserById = db.query(`
  SELECT id, username, name, avatar, verified, gold FROM users WHERE id = ?
`);

export const embeds = new Elysia({ name: "generateEmbeds" })
	.mapResponse(({ request, response, set }) => {
		if (request.url.endsWith("?rb=1")) {
			return response;
		}
		const userAgent = request.headers.get("user-agent").toLowerCase();
		if (!userAgent) return response;
		const goodMatches = ["applewebkit", "chrome/", "firefox/", "safari/"];
		for (const goodMatch of goodMatches) {
			if (userAgent.includes(goodMatch)) {
				return response;
			}
		}

		const pathname = new URL(request.url).pathname;
		if (!pathname || pathname.startsWith("/api/")) return response;

		if (pathname?.startsWith("/tweet/")) {
			set.headers["Content-Type"] = "text/html; charset=utf-8";

			const tweetId = pathname.replaceAll("/tweet/", "").split("/")[0];
			const tweet = getTweetById.get(tweetId);
			if (!tweet) {
				return `<!DOCTYPE html><html><head><meta property="og:title" content="Tweetapus"/><meta property="og:description" content="That tweet doesn't exist"/></head><body>That tweet doesn't exist. <a href="/">Go back to the homepage</a></body></html>`;
			}

			const author = getUserById.get(tweet.user_id);
			if (!author) {
				return `<!DOCTYPE html><html><head><meta property="og:title" content="Tweetapus"/><meta property="og:description" content="That tweet doesn't exist"/></head><body>That tweet doesn't exist. <a href="/">Go back to the homepage</a></body></html>`;
			}

			const esc = (str) =>
				str
					?.replaceAll('"', '\\"')
					?.replaceAll("<", "&lt;")
					?.replaceAll(">", "&gt;");

			if (tweet.content.length > 280) {
				tweet.content = `${tweet.content.substring(0, 280)}…`;
			}

			return `<!DOCTYPE html><html lang="en"><head><meta name="application-title" content="Tweetapus" /><link rel="canonical" href="${process.env.BASE_URL}/tweet/${pathname.replaceAll("/tweet/", "")}"/><meta property="og:url" content="${process.env.BASE_URL}/tweet/${pathname.replaceAll("/tweet/", "")}"/><meta property="theme-color" content="#AC97FF"/><meta property="twitter:title" content="${esc(author.name || author.username)} (@${author.username})"/><meta http-equiv="refresh" content="0;url=${process.env.BASE_URL}/tweet/${pathname.replaceAll("/tweet/", "")}?rb=1"/><meta property="twitter:card" content="summary_large_image"/><meta property="og:title" content="${esc(author.name || author.username)} (@${author.username})"/><meta property="og:description" content="${esc(tweet.article_title || tweet.content)}"/><meta property="og:site_name" content="Tweetapus"/><link rel="alternate" href="${process.env.BASE_URL}/api/owoembed?i=${encodeURIComponent(pathname.replaceAll("/tweet/", ""))}&a=${encodeURIComponent(`💬 ${tweet.reply_count}   🔁 ${tweet.quote_count + tweet.retweet_count}   ❤️ ${tweet.like_count}   👁️ ${tweet.view_count}`)}" type="application/json+oembed" title="${esc(author.name || author.username)} (@${author.username})"></head><body></body></html>`;
		}
	})
	.as("plugin");
