import { Elysia } from "elysia";
import db from "../db.js";

const stripHtml = (html) => {
	return html.replace(/<[^>]*>?/gm, "");
};

const esc = (str) =>
	str
		?.replaceAll('"', "&quot;")
		?.replaceAll("<", "&lt;")
		?.replaceAll(">", "&gt;");

const getTweetById = db.query(`SELECT * FROM posts WHERE id = ?`);
const getUserById = db.query(`SELECT * FROM users WHERE id = ?`);

const botPatterns =
	/discord|telegram|slack|twitter|facebook|linkedinbot|whatsapp|skype/i;

export const embeds = new Elysia({ name: "generateEmbeds" })
	.mapResponse(({ request, response, set }) => {
		const pathname = new URL(request.url).pathname;
		if (!pathname?.startsWith("/tweet/")) return response;
		if (request.url.endsWith("?rb=1")) return response;

		const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
		if (!userAgent) return response;

		if (!botPatterns.test(userAgent)) {
			const goodMatches = ["applewebkit", "chrome/", "firefox/", "safari/"];
			if (goodMatches.some((match) => userAgent.includes(match))) {
				return response;
			}
		}

		set.headers["Content-Type"] = "text/html; charset=utf-8";

		const tweetId = pathname.replaceAll("/tweet/", "").split("/")[0];
		const tweet = getTweetById.get(tweetId);

		if (!tweet) {
			return `<!DOCTYPE html><html><head><meta property="og:title" content="Tweetapus"/><meta property="og:description" content="Tweet not found"/></head><body>Tweet not found.</body></html>`;
		}

		const author = getUserById.get(tweet.user_id);
		const authorName = author ? author.name || author.username : "Unknown";
		const authorHandle = author ? author.username : "unknown";
		const authorAvatar = `${process.env.BASE_URL}${author?.avatar}`;

		let cleanContent = stripHtml(tweet.content || "");
		if (cleanContent.length > 350) {
			cleanContent = `${cleanContent.substring(0, 350)}…`;
		}

		const imageUrl = tweet.image_url || tweet.attachment_url || null;

		const statsString = `💬 ${tweet.reply_count || 0}   🔁 ${tweet.retweet_count || 0}   ❤️ ${tweet.like_count || 0}   👁️ ${tweet.view_count || 0}`;

		return `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta name="application-title" content="Tweetapus" />
                <link rel="canonical" href="${process.env.BASE_URL}/tweet/${tweetId}"/>
                <meta property="og:url" content="${process.env.BASE_URL}/tweet/${tweetId}"/>
                <meta property="theme-color" content="#AC97FF"/>
                
                <meta property="og:title" content="${esc(authorName)} (@${authorHandle})"/>
                <meta property="og:description" content="${esc(cleanContent)}"/>
                <meta property="description" content="${esc(cleanContent)}"/>
                <meta property="og:site_name" content="Tweetapus"/>
                
                <meta name="twitter:card" content="summary">
                <meta property="twitter:title" content="${esc(authorName)} (@${authorHandle})"/>
                <meta property="twitter:description" content="${esc(cleanContent)}"/
                <meta property="twitter:image" content="${imageUrl || authorAvatar}" />
                <meta property="og:image" content="${imageUrl || authorAvatar}" />

                <link rel="apple-touch-icon" href="${process.env.BASE_URL}/public/shared/assets/favicon.svg">
                <link rel="icon" type="image/svg+xml" href="${process.env.BASE_URL}/public/shared/assets/favicon.svg">
                <link rel="mask-icon" href="${process.env.BASE_URL}/public/shared/assets/favicon.svg" color="#AB96FF">
                <meta property="og:logo" content="${process.env.BASE_URL}/public/shared/assets/favicon.svg">

                <meta http-equiv="refresh" content="0;url=${process.env.BASE_URL}/tweet/${tweetId}?rb=1"/>
                <meta name="application-name" content="Tweetapus">
                <meta property="og:type" content="article">
                <meta property="profile:username" content="${authorHandle}">
                
                <link rel="alternate" href="${process.env.BASE_URL}/api/owoembed?author=${encodeURIComponent(authorName)}&handle=${encodeURIComponent(authorHandle)}&stats=${encodeURIComponent(statsString)}&id=${encodeURIComponent(tweetId)}" type="application/json+oembed">

								 <script type="application/ld+json">${JSON.stringify({
										"@context": "https://schema.org",
										"@type": "DiscussionForumPosting",
										author: {
											"@type": "Person",
											name: authorName,
											alternateName: `@${authorHandle}`,
											url: `${process.env.BASE_URL}/${authorHandle}`,
										},
										text: cleanContent,

										datePublished: new Date(tweet.created_at).toISOString(),
										interactionStatistic: [
											{
												"@type": "InteractionCounter",
												interactionType: "https://schema.org/LikeAction",
												userInteractionCount: tweet.like_count,
											},
											{
												"@type": "InteractionCounter",
												interactionType: "https://schema.org/CommentAction",
												userInteractionCount: tweet.reply_count,
											},
											{
												"@type": "InteractionCounter",
												interactionType: "https://schema.org/ShareAction",
												userInteractionCount:
													tweet.retweet_count + tweet.quote_count,
											},
										],
									})}</script>
            </head>
            <body><p>hi, human. this is supposed to be for robots only. <a href="${process.env.BASE_URL}/tweet/${tweetId}?rb=1">please click here to continue</a></p></body>
        </html>`;
	})
	.as("plugin");
