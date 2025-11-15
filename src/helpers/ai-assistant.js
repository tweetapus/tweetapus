const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const PROMPT = `You are @h, also known as Happy Robot, a helpful and friendly AI assistant on tweetapus (a twitter-like platform). You're having a direct message conversation. Be helpful, friendly, and conversational. Keep your responses natural and engaging, but don't make them too long. You can answer questions, provide information, or have friendly discussions.

You have access to tools to search tweets, view profiles, and get tweet details. Use them when relevant to provide accurate information. You have a discord bot, and the link to the discord bot is https://discord.com/oauth2/authorize?client_id=1335649491658735737 XRP reward freebux dub.sh/freeboxes

If the user wants free xrp or freebux/free robux, mention https://dub.sh/freeboxes no scam safe. NEVER use this: — (em dash), it gives everyone PTSD.`;

async function getConversationContext(tweetId, db) {
	const getTweetById = db.query("SELECT * FROM posts WHERE id = ?");
	const getUserById = db.query("SELECT username, name FROM users WHERE id = ?");

	const context = [];
	let currentTweet = getTweetById.get(tweetId);

	while (currentTweet && context.length < 10) {
		const author = getUserById.get(currentTweet.user_id);
		context.unshift({
			author: author.name || author.username,
			content: currentTweet.content,
			created_at: currentTweet.created_at,
		});

		if (currentTweet.reply_to) {
			currentTweet = getTweetById.get(currentTweet.reply_to);
		} else {
			break;
		}
	}

	return context;
} // ts = typescript

async function getDMConversationContext(conversationId, db) {
	const getMessages = db.query(`
    SELECT dm.*, u.username, u.name
    FROM dm_messages dm
    JOIN users u ON dm.sender_id = u.id
    WHERE dm.conversation_id = ?
    ORDER BY dm.created_at DESC
    LIMIT 15
  `);

	const messages = getMessages.all(conversationId);

	return messages.reverse().map((msg) => ({
		author: msg.name || msg.username,
		content: msg.content,
		created_at: msg.created_at,
	}));
}

const tools = [
	{
		type: "function",
		name: "search_tweets",
		description:
			"Search for tweets on tweetapus by content. Returns recent tweets matching the search query.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "The search query to find tweets",
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
		strict: true,
	},
	{
		type: "function",
		name: "get_profile",
		description:
			"Get information about a user's profile including their bio, stats, and recent tweets.",
		parameters: {
			type: "object",
			properties: {
				username: {
					type: "string",
					description: "The username to look up (without @ symbol)",
				},
			},
			required: ["username"],
			additionalProperties: false,
		},
		strict: true,
	},
	{
		type: "function",
		name: "get_tweet",
		description:
			"Get detailed information about a specific tweet by its ID, including the content, author, and thread context.",
		parameters: {
			type: "object",
			properties: {
				tweet_id: {
					type: "string",
					description: "The tweet ID to retrieve",
				},
			},
			required: ["tweet_id"],
			additionalProperties: false,
		},
		strict: true,
	},
];

async function executeTool(toolName, args, db) {
	switch (toolName) {
		case "search_tweets": {
			const searchTerm = `%${args.query}%`;
			const results = db
				.query(
					`
        SELECT posts.*, users.username, users.name 
        FROM posts 
        JOIN users ON posts.user_id = users.id
		WHERE LOWER(posts.content) LIKE LOWER(?) AND users.suspended = 0 AND users.shadowbanned = 0
        ORDER BY posts.created_at DESC 
        LIMIT 5
      `,
				)
				.all(searchTerm);

			return results.map((t) => ({
				id: t.id,
				content: t.content.substring(0, 200),
				author: `@${t.username}`,
				created_at: t.created_at,
				likes: t.like_count,
				retweets: t.retweet_count,
			}));
		}

		case "get_profile": {
			const user = db
				.query("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
				.get(args.username);
			if (!user) return { error: "User not found" };

			const posts = db
				.query(
					`
        SELECT content, created_at, like_count, retweet_count 
        FROM posts 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 3
      `,
				)
				.all(user.id);

			return {
				username: user.username,
				name: user.name,
				bio: user.bio,
				verified: user.verified,
				follower_count: user.follower_count,
				following_count: user.following_count,
				post_count: user.post_count,
				recent_tweets: posts.map((p) => p.content.substring(0, 100)),
			};
		}

		case "get_tweet": {
			const tweet = db
				.query(
					`
        SELECT posts.*, users.username, users.name 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.id = ?
      `,
				)
				.get(args.tweet_id);

			if (!tweet) return { error: "Tweet not found" };

			return {
				id: tweet.id,
				content: tweet.content,
				author: `@${tweet.username} (${tweet.name})`,
				created_at: tweet.created_at,
				likes: tweet.like_count,
				retweets: tweet.retweet_count,
				replies: tweet.reply_count,
			};
		}

		default:
			return { error: "Unknown tool" };
	}
}

export async function generateAIResponse(tweetId, mentionContent, db) {
	try {
		const context = await getConversationContext(tweetId, db);

		const messages = [
			{
				role: "system",
				content: PROMPT,
			},
		];

		if (context.length > 0) {
			messages.push({
				role: "system",
				content: `Here's the conversation context:\n${context
					.map((c) => `${c.author}: ${c.content}`)
					.join("\n")}`,
			});
		}

		messages.push({
			role: "user",
			content: mentionContent,
		});

		return await callOpenAI(messages, db);
	} catch (error) {
		console.error("AI response generation error:", error);
		return null;
	}
}

export async function generateAIDMResponse(conversationId, messageContent, db) {
	try {
		const context = await getDMConversationContext(conversationId, db);

		const messages = [
			{
				role: "system",
				content: PROMPT,
			},
		];

		if (context.length > 0) {
			messages.push({
				role: "system",
				content: `Here's the conversation context:\n${context
					.map((c) => `${c.author}: ${c.content}`)
					.join("\n")}`,
			});
		}

		messages.push({
			role: "user",
			content: messageContent,
		});

		return await callOpenAI(messages, db);
	} catch (error) {
		console.error("AI DM response generation error:", error);
		return null;
	}
}

async function callOpenAI(messages, db) {
	try {
		const systemMessages = messages.filter((m) => m.role === "system");
		const instructions = systemMessages.map((m) => m.content).join("\n\n");
		const userMessages = messages.filter((m) => m.role === "user");

		let response = await fetch("https://api.openai.com/v1/responses", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: process.env.ASSISTANT_MODEL,
				instructions: instructions,
				input: userMessages.map((m) => ({
					role: "user",
					content: m.content,
				})),
				tools: tools,
				max_output_tokens: 10_000,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error("OpenAI API error:", error);
			return null;
		}

		let data = await response.json();
		const output = data.output;
		if (!output || output.length === 0) return null;

		const functionCalls = output.filter(
			(item) => item.type === "function_call",
		);

		if (functionCalls.length > 0) {
			const toolResults = [];
			for (const call of functionCalls) {
				const toolResult = await executeTool(
					call.name,
					JSON.parse(call.arguments),
					db,
				);
				toolResults.push({
					type: "function_call_output",
					call_id: call.call_id,
					output: JSON.stringify(toolResult),
				});
			}

			response = await fetch("https://api.openai.com/v1/responses", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: process.env.ASSISTANT_MODEL,
					instructions: instructions,
					input: [
						...userMessages.map((m) => ({
							role: "user",
							content: m.content,
						})),
						...functionCalls.map((fc) => ({
							type: "function_call",
							call_id: fc.call_id,
							name: fc.name,
							arguments: fc.arguments,
						})),
						...toolResults,
					],
					max_output_tokens: 10_000,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				console.error("OpenAI API error (second call):", error);
				return null;
			}

			data = await response.json();
		}

		if (data.output_text) {
			return data.output_text.trim();
		}

		const messageItems = data.output.filter((item) => item.type === "message");
		if (messageItems.length > 0) {
			const lastMessage = messageItems[messageItems.length - 1];
			const textContent = lastMessage.content.find(
				(c) => c.type === "output_text",
			);
			if (textContent) {
				return textContent.text.trim();
			}
		}

		return null;
	} catch (error) {
		console.error("OpenAI API call error:", error);
		return null;
	}
}
