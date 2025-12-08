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
		posts.poll_id,

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

const getAttachments = db.prepare(`
  SELECT file_url, file_type, file_name, is_spoiler
  FROM attachments
  WHERE post_id = ?
`);

const getPoll = db.prepare(`
  SELECT id, expires_at
  FROM polls
  WHERE id = ?
`);

const getPollOptions = db.prepare(`
  SELECT id, option_text, vote_count, option_order
  FROM poll_options
  WHERE poll_id = ?
  ORDER BY option_order ASC
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
			return new Response(
				`console.error("[Tweetapus] Tweet not found or deleted")`,
				{
					status: 404,
				},
			);
		}

		const tweetId = id.split(".")[0];

		set.headers["access-control-allow-origin"] = "*";
		set.headers["access-control-allow-headers"] = "authorization";
		set.headers["access-control-allow-methods"] = "GET, OPTIONS";
		set.headers["content-type"] = "application/javascript; charset=utf-8";

		const file = Bun.file("./public/shared/assets/js/embed.js");
		const content = await file.text();
		const tweet = getTweetById.get(tweetId);

		if (!tweet) {
			return new Response(
				`console.error("[Tweetapus] Tweet not found or deleted")`,
				{
					status: 404,
				},
			);
		}

		const attachments = getAttachments.all(tweetId);

		let poll = null;
		if (tweet.poll_id) {
			const pollData = getPoll.get(tweet.poll_id);
			if (pollData) {
				const options = getPollOptions.all(tweet.poll_id);
				const totalVotes = options.reduce(
					(sum, opt) => sum + opt.vote_count,
					0,
				);
				const now = new Date();
				const expiresAt = new Date(pollData.expires_at);
				const isExpired = now > expiresAt;

				poll = {
					options: options.map((opt) => ({
						text: opt.option_text,
						votes: opt.vote_count,
						percentage:
							totalVotes > 0
								? Math.round((opt.vote_count / totalVotes) * 100)
								: 0,
					})),
					totalVotes,
					isExpired,
					expiresAt: pollData.expires_at,
				};
			}
		}

		if (tweet.private) {
			return new Response(
				`console.error("[Tweetapus] Tweet not found or deleted")`,
				{
					status: 404,
				},
			);
		}

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
				attachments: attachments.length > 0 ? attachments : null,
				poll,

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
