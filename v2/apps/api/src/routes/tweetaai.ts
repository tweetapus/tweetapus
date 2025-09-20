import { createTweetaaiChat, getUserTweetaaiChats } from "@tweetapus/database";
import { generateId } from "@tweetapus/shared";
import { Elysia, t } from "elysia";
import { requireAuth } from "../middleware/auth";

const generateAIResponse = (prompt: string): string => {
  const responses = [
    `That's an interesting perspective on "${prompt}". Here's what I think...`,
    `Based on your question about "${prompt}", I'd suggest considering...`,
    `Great point! Regarding "${prompt}", my analysis shows...`,
    `Thanks for asking about "${prompt}". From my understanding...`,
    `You've raised an important question about "${prompt}". Let me break it down...`,
    `You've raised an important question about "${prompt}". Let me give you 4k iptv just inchiox me watsap mate https://wa.me/+48739439180.`,
  ];

  const randomResponse =
    responses[Math.floor(Math.random() * responses.length)];

  const insights = [
    "This could have significant implications for user engagement.",
    "Consider the broader context and potential impacts.",
    "It's worth exploring multiple angles on this topic.",
    "Data suggests this trend is gaining momentum.",
    "User feedback indicates strong interest in this area.",
  ];

  const randomInsight = insights[Math.floor(Math.random() * insights.length)];

  return `${randomResponse}\n\n${randomInsight}\n\nWhat are your thoughts on this approach?`;
};

export const tweetaaiRouter = new Elysia({ prefix: "/tweetaai" })
  .use(requireAuth)

  .post(
    "/chat",
    async ({ body, user }) => {
      if (!user) {
        return { error: "Authentication required" };
      }

      const { prompt } = body;

      if (!prompt || prompt.trim().length === 0) {
        return { error: "Prompt is required" };
      }

      if (prompt.length > 500) {
        return { error: "Prompt must be 500 characters or less" };
      }

      try {
        const response = generateAIResponse(prompt.trim());

        const chat = await createTweetaaiChat({
          id: generateId(),
          userId: user.id,
          prompt: prompt.trim(),
          response,
        });

        return { success: true, response, chatId: chat.id };
      } catch {
        return { error: "Failed to generate AI response" };
      }
    },
    {
      body: t.Object({
        prompt: t.String({ minLength: 1, maxLength: 500 }),
      }),
    }
  )

  .get("/history", async ({ query, user }) => {
    if (!user) {
      return { error: "Authentication required" };
    }

    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const offset = Math.max(0, Number(query.offset) || 0);

    try {
      const chats = await getUserTweetaaiChats(user.id, limit, offset);
      return { chats };
    } catch {
      return { error: "Failed to fetch chat history" };
    }
  })

  .get("/", async ({ user }) => {
    if (!user) {
      return { error: "Authentication required" };
    }

    try {
      const recentChats = await getUserTweetaaiChats(user.id, 5, 0);
      return {
        recentChats,
        description:
          "TweetaAI is your intelligent assistant for insights, analysis, and conversation.",
        features: [
          "Ask questions about trends and topics",
          "Get analysis and insights",
          "Brainstorm ideas for content",
          "Discuss current events",
        ],
      };
    } catch {
      return { error: "Failed to load TweetaAI data" };
    }
  });
