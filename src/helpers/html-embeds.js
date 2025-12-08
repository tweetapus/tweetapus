import { Elysia } from "elysia";
import db from "../db.js";

const getTweetById = db.prepare(`
  SELECT 
    posts.content,
		posts.reply_to,
		posts.created_at,
		posts.like_count,
		posts.retweet_count,
		posts.reply_count,
		posts.quote_count,

    users.username,
    users.name,
    users.avatar,
    users.verified,
    users.private,
    users.avatar_radius,
    users.gray,
    users.label_type,
		users.gold
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.id = ?
`);

export const htmlEmbeds = new Elysia({
	name: "htmlEmbeds",
	prefix: "/embed",
	tags: ["Embeds"],
})
	.options("/:id", ({ set }) => {
		set.headers["access-control-allow-origin"] = "*";
		set.headers["access-control-allow-headers"] = "authorization";
		set.headers["access-control-allow-methods"] = "GET, OPTIONS";
		return new Response("OK", { status: 200 });
	})
	.get("/:id", async ({ set, params }) => {
		const { id } = params;
		if (!id || !id.endsWith(".js")) {
			return new Response(`console.error("[Tweetapus] Tweet ID not found")`, {
				status: 405,
			});
		}

		const tweetId = id.split(".")[0];

		set.headers["access-control-allow-origin"] = "*";
		set.headers["access-control-allow-headers"] = "authorization";
		set.headers["access-control-allow-methods"] = "GET, OPTIONS";
		set.headers["content-type"] = "application/javascript; charset=utf-8";

		const file = Bun.file("./public/shared/assets/js/embed.js");
		const content = await file.text();
		const tweet = getTweetById.get(tweetId);

		console.log(tweet);

		return content.replaceAll(
			"/*{tweet}*/",
			JSON.stringify({
				content: tweet.content,
				reply_to: tweet.reply_to,
				created_at: tweet.created_at,
				likes: tweet.like_count,
				retweets: tweet.retweet_count + tweet.quote_count,
				replies: tweet.reply_count,
				link: `${process.env.BASE_URL}/tweet/${tweetId}?ref=embed`,

				author: {
					username: tweet.username,
					name: tweet.name,
					avatar: `${process.env.BASE_URL}${tweet.avatar}`,
					verified: tweet.gold
						? "gold"
						: tweet.gray
							? "gray"
							: tweet.verified
								? "verified"
								: "",
					private: tweet.private,
					avatar_radius: tweet.avatar_radius,
					label_type: tweet.label_type,
				},
			}).slice(1, -1),
		);
	});
