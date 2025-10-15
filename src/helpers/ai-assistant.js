const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
}

const tools = [
  {
    type: "function",
    function: {
      name: "search_tweets",
      description: "Search for tweets on tweetapus by content. Returns recent tweets matching the search query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find tweets"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_profile",
      description: "Get information about a user's profile including their bio, stats, and recent tweets.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "The username to look up (without @ symbol)"
          }
        },
        required: ["username"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_tweet",
      description: "Get detailed information about a specific tweet by its ID, including the content, author, and thread context.",
      parameters: {
        type: "object",
        properties: {
          tweet_id: {
            type: "string",
            description: "The tweet ID to retrieve"
          }
        },
        required: ["tweet_id"]
      }
    }
  }
];

async function executeTool(toolName, args, db) {
  switch (toolName) {
    case "search_tweets": {
      const searchTerm = `%${args.query}%`;
      const results = db.query(`
        SELECT posts.*, users.username, users.name 
        FROM posts 
        JOIN users ON posts.user_id = users.id
        WHERE LOWER(posts.content) LIKE LOWER(?) AND users.suspended = 0
        ORDER BY posts.created_at DESC 
        LIMIT 5
      `).all(searchTerm);
      
      return results.map(t => ({
        id: t.id,
        content: t.content.substring(0, 200),
        author: `@${t.username}`,
        created_at: t.created_at,
        likes: t.like_count,
        retweets: t.retweet_count
      }));
    }
    
    case "get_profile": {
      const user = db.query("SELECT * FROM users WHERE username = ?").get(args.username);
      if (!user) return { error: "User not found" };
      
      const posts = db.query(`
        SELECT content, created_at, like_count, retweet_count 
        FROM posts 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 3
      `).all(user.id);
      
      return {
        username: user.username,
        name: user.name,
        bio: user.bio,
        verified: user.verified,
        follower_count: user.follower_count,
        following_count: user.following_count,
        post_count: user.post_count,
        recent_tweets: posts.map(p => p.content.substring(0, 100))
      };
    }
    
    case "get_tweet": {
      const tweet = db.query(`
        SELECT posts.*, users.username, users.name 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.id = ?
      `).get(args.tweet_id);
      
      if (!tweet) return { error: "Tweet not found" };
      
      return {
        id: tweet.id,
        content: tweet.content,
        author: `@${tweet.username} (${tweet.name})`,
        created_at: tweet.created_at,
        likes: tweet.like_count,
        retweets: tweet.retweet_count,
        replies: tweet.reply_count
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
        content:
          "You are @h, also known as Happy Robot, a helpful and friendly AI assistant on tweetapus (a twitter-like platform). Keep your responses concise (under 280 characters when possible), natural, and conversational. You can answer questions, provide information, or engage in friendly discussion. Be helpful but brief. You have access to tools to search tweets, view profiles, and get tweet details. Use them when relevant to provide accurate, up-to-date information.",
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

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return null;
    }

    let data = await response.json();
    let assistantMessage = data.choices[0]?.message;
    
    if (!assistantMessage) return null;

    if (assistantMessage.tool_calls) {
      messages.push(assistantMessage);
      
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        const toolResult = await executeTool(toolName, toolArgs, db);
        
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
      
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI API error (second call):", error);
        return null;
      }

      data = await response.json();
      assistantMessage = data.choices[0]?.message;
    }

    return assistantMessage?.content?.trim() || null;
  } catch (error) {
    console.error("AI response generation error:", error);
    return null;
  }
}
