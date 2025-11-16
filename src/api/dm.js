import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import db from "../db.js";
import { generateAIDMResponse } from "../helpers/ai-assistant.js";
import { getRateLimitMiddleware } from "../helpers/customRateLimit.js";
import cap from "./cap.js";
import { addNotification } from "./notifications.js";

let broadcastToUser, sendUnreadCounts;
try {
	const indexModule = await import("../index.js");
	broadcastToUser = indexModule.broadcastToUser;
	sendUnreadCounts = indexModule.sendUnreadCounts;
} catch {
	broadcastToUser = () => {};
	sendUnreadCounts = () => {};
}

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
	"SELECT id, username, name, avatar, verified FROM users WHERE LOWER(username) = LOWER(?)",
);

const isRestrictedQuery = db.query(`
  SELECT 1 FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);
const getUserRestrictedFlag = db.query(
	"SELECT restricted FROM users WHERE id = ?",
);

const isUserRestrictedById = (userId) => {
	const r = isRestrictedQuery.get(userId);
	const f = getUserRestrictedFlag.get(userId);
	return !!r || !!f?.restricted;
};

const createConversation = db.query(`
  INSERT INTO conversations (id, type, title)
  VALUES (?, ?, ?)
  RETURNING *
`);

const addParticipant = db.query(`
  INSERT INTO conversation_participants (id, conversation_id, user_id)
  VALUES (?, ?, ?)
`);

const getConversationById = db.query(`
  SELECT * FROM conversations WHERE id = ?
`);

const getConversationByParticipants = db.query(`
  SELECT c.* FROM conversations c
  JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
  JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
  WHERE cp1.user_id = ? AND cp2.user_id = ? AND c.type = 'direct'
  GROUP BY c.id
  HAVING COUNT(DISTINCT cp1.user_id) = 2
`);

const getUserConversations = db.query(`
  SELECT 
    c.*,
    GROUP_CONCAT(DISTINCT u.username) as participant_usernames,
    GROUP_CONCAT(DISTINCT u.name) as participant_names,
    GROUP_CONCAT(DISTINCT u.avatar) as participant_avatars,
    GROUP_CONCAT(DISTINCT u.id) as participant_ids,
    COUNT(DISTINCT cp.user_id) as participant_count,
    (SELECT COUNT(DISTINCT dm.id) FROM dm_messages dm 
     WHERE dm.conversation_id = c.id 
     AND dm.created_at > COALESCE(my_cp.last_read_at, c.created_at)
     AND dm.sender_id != ?) as unread_count,
    (SELECT dm.content FROM dm_messages dm 
     WHERE dm.conversation_id = c.id 
     ORDER BY dm.created_at DESC LIMIT 1) as last_message_content,
    (SELECT dm.created_at FROM dm_messages dm 
     WHERE dm.conversation_id = c.id 
     ORDER BY dm.created_at DESC LIMIT 1) as last_message_time,
    (SELECT u.username FROM dm_messages dm 
     JOIN users u ON dm.sender_id = u.id
     WHERE dm.conversation_id = c.id 
     ORDER BY dm.created_at DESC LIMIT 1) as last_message_sender,
    (SELECT u.name FROM dm_messages dm 
     JOIN users u ON dm.sender_id = u.id
     WHERE dm.conversation_id = c.id 
     ORDER BY dm.created_at DESC LIMIT 1) as last_message_sender_name
  FROM conversations c
  JOIN conversation_participants my_cp ON c.id = my_cp.conversation_id AND my_cp.user_id = ?
  JOIN conversation_participants cp ON c.id = cp.conversation_id
  JOIN users u ON cp.user_id = u.id AND u.id != ?
  GROUP BY c.id
  ORDER BY COALESCE(
    (SELECT dm.created_at FROM dm_messages dm 
     WHERE dm.conversation_id = c.id 
     ORDER BY dm.created_at DESC LIMIT 1), 
    c.updated_at
  ) DESC
`);

const getConversationMessages = db.query(`
  SELECT 
    dm.*,
    u.username,
    u.name,
    u.avatar,
    u.verified,
    u.avatar_radius,
    u.gold
  FROM dm_messages dm
  JOIN users u ON dm.sender_id = u.id
  WHERE dm.conversation_id = ? AND dm.deleted_at IS NULL AND (dm.expires_at IS NULL OR dm.expires_at > datetime('now', 'utc'))
  ORDER BY dm.created_at DESC
  LIMIT ? OFFSET ?
`);

const getMessageAttachments = db.query(`
  SELECT * FROM dm_attachments WHERE message_id = ?
`);

const createMessage = db.query(`
  INSERT INTO dm_messages (id, conversation_id, sender_id, content, message_type, reply_to)
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const saveMessageAttachment = db.query(`
  INSERT INTO dm_attachments (id, message_id, file_hash, file_name, file_type, file_size, file_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING *
`);

const updateConversationTimestamp = db.query(`
  UPDATE conversations SET updated_at = datetime('now', 'utc') WHERE id = ?
`);

const updateLastReadAt = db.query(`
  UPDATE conversation_participants 
  SET last_read_at = (
    SELECT COALESCE(
      (SELECT dm.created_at FROM dm_messages dm 
       WHERE dm.conversation_id = ? 
       ORDER BY dm.created_at DESC LIMIT 1),
      datetime('now', 'utc')
    )
  )
  WHERE conversation_id = ? AND user_id = ?
`);

const getConversationParticipants = db.query(`
  SELECT cp.*, u.username, u.name, u.avatar, u.verified
  FROM conversation_participants cp
  JOIN users u ON cp.user_id = u.id
  WHERE cp.conversation_id = ?
`);

const checkParticipant = db.query(`
  SELECT * FROM conversation_participants 
  WHERE conversation_id = ? AND user_id = ?
`);

const removeParticipant = db.query(`
  DELETE FROM conversation_participants 
  WHERE conversation_id = ? AND user_id = ?
`);

const updateConversationTitle = db.query(`
  UPDATE conversations SET title = ?, updated_at = datetime('now', 'utc') 
  WHERE id = ?
`);

const getMessageReactions = db.query(`
  SELECT 
    dr.emoji,
    COUNT(*) as count,
    GROUP_CONCAT(u.username) as usernames,
    GROUP_CONCAT(u.name) as names
  FROM dm_reactions dr
  JOIN users u ON dr.user_id = u.id
  WHERE dr.message_id = ?
  GROUP BY dr.emoji
`);

const getUserReactionForMessage = db.query(`
  SELECT emoji FROM dm_reactions WHERE message_id = ? AND user_id = ?
`);

const addReaction = db.query(`
  INSERT INTO dm_reactions (id, message_id, user_id, emoji)
  VALUES (?, ?, ?, ?)
`);

const removeReaction = db.query(`
  DELETE FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
`);

const getReplyMessage = db.query(`
  SELECT 
    dm.*,
    u.username,
    u.name,
    u.avatar
  FROM dm_messages dm
  JOIN users u ON dm.sender_id = u.id
  WHERE dm.id = ?
`);

export default new Elysia({ prefix: "/dm", tags: ["DM"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.onBeforeHandle(getRateLimitMiddleware("dm"))

	.get("/conversations", ({ headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const conversations = getUserConversations.all(user.id, user.id, user.id);

			const enhancedConversations = conversations.map((conv) => {
				const participants = conv.participant_usernames?.split(",") || [];
				const names = conv.participant_names?.split(",") || [];
				const avatars = conv.participant_avatars?.split(",") || [];
				const ids = conv.participant_ids?.split(",") || [];

				const participantList = participants.map((username, i) => ({
					id: ids[i],
					username,
					name: names[i],
					avatar: avatars[i],
				}));

				// Determine conversation display info
				let displayName, displayAvatar;

				if (conv.type === "group") {
					displayName =
						conv.title || `Group Chat (${conv.participant_count} members)`;
					displayAvatar = null; // Will be handled in frontend for group avatars
				} else {
					// Direct message - show the other participant
					const otherParticipant = participantList[0];
					displayName =
						otherParticipant?.name || otherParticipant?.username || "Unknown";
					displayAvatar = otherParticipant?.avatar;
				}

				return {
					...conv,
					participants: participantList,
					displayName,
					displayAvatar,
					lastMessageSenderName:
						conv.last_message_sender_name || conv.last_message_sender,
				};
			});

			return { conversations: enhancedConversations };
		} catch (error) {
			console.error("Error fetching conversations:", error);
			return { error: "Internal server error" };
		}
	})

	.get("/conversations/:id", ({ params, headers, query }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;
			const { limit = 50, offset = 0 } = query;

			const conversation = getConversationById.get(id);
			if (!conversation) return { error: "Conversation not found" };

			const participant = checkParticipant.get(id, user.id);
			if (!participant) return { error: "Access denied" };

			updateLastReadAt.run(id, id, user.id);

			const participants = getConversationParticipants.all(id);
			const messages = getConversationMessages.all(
				id,
				parseInt(limit),
				parseInt(offset),
			);

			const enhancedMessages = messages.map((message) => {
				const attachments = getMessageAttachments.all(message.id);
				const reactions = getMessageReactions.all(message.id);
				const userReactions = getUserReactionForMessage.all(
					message.id,
					user.id,
				);

				let replyToMessage = null;
				if (message.reply_to) {
					replyToMessage = getReplyMessage.get(message.reply_to);
				}

				return {
					...message,
					attachments,
					reactions: reactions.map((r) => ({
						emoji: r.emoji,
						count: r.count,
						usernames: r.usernames?.split(",") || [],
						names: r.names?.split(",") || [],
					})),
					user_reacted: userReactions.map((r) => r.emoji),
					reply_to_message: replyToMessage,
				};
			});

			return {
				conversation: {
					...conversation,
					participants,
					disappearing_enabled: !!conversation.disappearing_enabled,
					disappearing_duration: conversation.disappearing_duration,
				},
				messages: enhancedMessages,
			};
		} catch (error) {
			console.error("Error fetching conversation:", error);
			return { error: "Internal server error" };
		}
	})

	.post(
		"/conversations",
		({ body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				// Restricted users cannot send DMs
				if (isUserRestrictedById(user.id)) {
					return { error: "Action not allowed: account is restricted" };
				}

				const { participantUsernames, title, isGroup } = body;

				if (!participantUsernames || participantUsernames.length === 0) {
					return { error: "At least one participant is required" };
				}

				const participants = [];
				for (const username of participantUsernames) {
					const participant = getUserByUsername.get(username);
					if (!participant) {
						return { error: `User ${username} not found` };
					}
					const blocked = db
						.query(
							"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
						)
						.get(user.id, participant.id, participant.id, user.id);
					if (blocked)
						return { error: `Cannot start a conversation with ${username}` };
					participants.push(participant);
				}

				const totalParticipants = participants.length + 1; // +1 for current user
				const conversationType =
					isGroup || totalParticipants > 2 ? "group" : "direct";

				// For direct messages with exactly 2 participants, check if conversation already exists
				if (conversationType === "direct" && participants.length === 1) {
					const existingConversation = getConversationByParticipants.get(
						user.id,
						participants[0].id,
					);
					if (existingConversation) {
						return { conversation: existingConversation };
					}
				}

				const conversationId = Bun.randomUUIDv7();
				const conversation = createConversation.get(
					conversationId,
					conversationType,
					title || null,
				);

				const myParticipantId = Bun.randomUUIDv7();
				addParticipant.run(myParticipantId, conversationId, user.id);

				for (const participant of participants) {
					const participantId = Bun.randomUUIDv7();
					addParticipant.run(participantId, conversationId, participant.id);
				}

				return { conversation };
			} catch (error) {
				console.error("Error creating conversation:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				participantUsernames: t.Array(t.String()),
				title: t.Optional(t.Union([t.String(), t.Null()])),
				isGroup: t.Optional(t.Boolean()),
			}),
		},
	)

	.post(
		"/conversations/:id/messages",
		async ({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				if (body.capToken) {
					const capResult = await cap.verify(body.capToken);
					if (!capResult.success) {
						return { error: "Captcha verification failed" };
					}
				}

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { id } = params;
				const { content, files, replyTo } = body;

				const conversation = getConversationById.get(id);
				if (!conversation) return { error: "Conversation not found" };

				const participant = checkParticipant.get(id, user.id);
				if (!participant) return { error: "Access denied" };

				if (!content?.trim() && (!files || files.length === 0)) {
					return { error: "Message content or attachments required" };
				}

				const messageId = Bun.randomUUIDv7();
				const messageType = files && files.length > 0 ? "media" : "text";

				let expiresAt = null;
				if (
					conversation.disappearing_enabled &&
					conversation.disappearing_duration
				) {
					const expirationDate = new Date();
					expirationDate.setSeconds(
						expirationDate.getSeconds() + conversation.disappearing_duration,
					);
					expiresAt = expirationDate
						.toISOString()
						.replace("T", " ")
						.substring(0, 19);
				}

				const message = db
					.query(`
					INSERT INTO dm_messages (id, conversation_id, sender_id, content, message_type, reply_to, expires_at)
					VALUES (?, ?, ?, ?, ?, ?, ?)
					RETURNING *
				`)
					.get(
						messageId,
						id,
						user.id,
						content || "",
						messageType,
						replyTo || null,
						expiresAt,
					);

				const attachments = [];
				if (files && Array.isArray(files)) {
					files.forEach((file) => {
						const attachmentId = Bun.randomUUIDv7();
						const attachment = saveMessageAttachment.get(
							attachmentId,
							messageId,
							file.hash,
							file.name,
							file.type,
							file.size,
							file.url,
						);
						attachments.push(attachment);
					});
				}

				updateConversationTimestamp.run(id);

				let replyToMessage = null;
				if (replyTo) {
					replyToMessage = getReplyMessage.get(replyTo);
				}

				const recipients = getConversationParticipants
					.all(id)
					.filter((p) => p.user_id !== user.id);
				for (const participant of recipients) {
					broadcastToUser(participant.user_id, {
						type: "m",
						conversationId: id,
						message: {
							...message,
							username: user.username,
							name: user.name,
							avatar: user.avatar,
							verified: user.verified,
							avatar_radius: user.avatar_radius,
							gold: user.gold,
							attachments,
							reactions: [],
							user_reacted: [],
							reply_to_message: replyToMessage,
						},
					});
					sendUnreadCounts(participant.user_id);
				}

				const aiUser = getUserByUsername.get("h");
				const hasAIInConversation = getConversationParticipants
					.all(id)
					.some((p) => p.user_id === aiUser?.id);
				const mentionsAI =
					content &&
					(content.includes("@h") ||
						content.toLowerCase().includes("happy robot"));

				const isGroupChat = conversation.type === "group";
				const shouldAIRespond =
					aiUser &&
					user.id !== aiUser.id &&
					((isGroupChat && mentionsAI) ||
						(!isGroupChat && hasAIInConversation));

				if (shouldAIRespond) {
					(async () => {
						try {
							const aiResponse = await generateAIDMResponse(id, content, db);
							if (aiResponse) {
								const aiMessageId = Bun.randomUUIDv7();
								const aiMessage = createMessage.get(
									aiMessageId,
									id,
									aiUser.id,
									aiResponse,
									"text",
									null,
								);

								updateConversationTimestamp.run(id);

								const allParticipants = getConversationParticipants.all(id);
								for (const participant of allParticipants) {
									if (participant.user_id !== aiUser.id) {
										broadcastToUser(participant.user_id, {
											type: "m",
											conversationId: id,
											message: {
												...aiMessage,
												username: aiUser.username,
												name: aiUser.name,
												avatar: aiUser.avatar,
												verified: aiUser.verified,
												avatar_radius: aiUser.avatar_radius,
												gold: aiUser.gold,
												attachments: [],
												reactions: [],
												user_reacted: [],
												reply_to_message: null,
											},
										});
										sendUnreadCounts(participant.user_id);
									}
								}
							}
						} catch (error) {
							console.error("Failed to generate AI DM response:", error);
						}
					})();
				}

				return {
					message: {
						...message,
						username: user.username,
						name: user.name,
						avatar: user.avatar,
						verified: user.verified,
						avatar_radius: user.avatar_radius,
						gold: user.gold,
						attachments,
						reactions: [],
						user_reacted: [],
						reply_to_message: replyToMessage,
					},
				};
			} catch (error) {
				console.error("Error sending message:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				content: t.Optional(t.String()),
				replyTo: t.Optional(t.Union([t.String(), t.Null()])),
				files: t.Optional(
					t.Array(
						t.Object({
							hash: t.String(),
							name: t.String(),
							type: t.String(),
							size: t.Number(),
							url: t.String(),
						}),
					),
				),
				capToken: t.Optional(t.String()),
			}),
		},
	)

	.patch("/conversations/:id/read", ({ params, headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;

			const participant = checkParticipant.get(id, user.id);
			if (!participant) return { error: "Access denied" };

			updateLastReadAt.run(id, id, user.id);
			sendUnreadCounts(user.id);

			return { success: true };
		} catch (error) {
			console.error("Error marking conversation as read:", error);
			return { error: "Internal server error" };
		}
	})

	.post(
		"/conversations/:id/participants",
		({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { id } = params;
				const { usernames } = body;

				const conversation = getConversationById.get(id);
				if (!conversation) return { error: "Conversation not found" };

				if (conversation.type !== "group") {
					return { error: "Cannot add participants to direct conversations" };
				}

				const participant = checkParticipant.get(id, user.id);
				if (!participant) return { error: "Access denied" };

				const addedParticipants = [];
				for (const username of usernames) {
					const newUser = getUserByUsername.get(username);
					if (!newUser) continue;

					const existingParticipant = checkParticipant.get(id, newUser.id);
					if (existingParticipant) continue;

					const participantId = Bun.randomUUIDv7();
					addParticipant.run(participantId, id, newUser.id);
					addedParticipants.push({
						id: newUser.id,
						username: newUser.username,
						name: newUser.name,
						avatar: newUser.avatar,
					});

					addNotification(
						newUser.id,
						"group_invite",
						`${user.name || user.username} added you to a group chat`,
						id,
						user.id,
						user.username,
						user.name || user.username,
					);
				}

				updateConversationTimestamp.run(id);

				return { participants: addedParticipants };
			} catch (error) {
				console.error("Error adding participants:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				usernames: t.Array(t.String()),
			}),
		},
	)

	.delete("/conversations/:id/participants/:userId", ({ params, headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id, userId } = params;

			const conversation = getConversationById.get(id);
			if (!conversation) return { error: "Conversation not found" };

			if (conversation.type !== "group") {
				return {
					error: "Cannot remove participants from direct conversations",
				};
			}

			const participant = checkParticipant.get(id, user.id);
			if (!participant) return { error: "Access denied" };

			// Allow users to remove themselves or let any participant remove others
			if (userId !== user.id) {
				// Check if the user being removed exists in the conversation
				const targetParticipant = checkParticipant.get(id, userId);
				if (!targetParticipant) {
					return { error: "User not found in conversation" };
				}
			}

			removeParticipant.run(id, userId);
			updateConversationTimestamp.run(id);

			return { success: true };
		} catch (error) {
			console.error("Error removing participant:", error);
			return { error: "Internal server error" };
		}
	})

	.patch(
		"/conversations/:id/title",
		({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { id } = params;
				const { title } = body;

				const conversation = getConversationById.get(id);
				if (!conversation) return { error: "Conversation not found" };

				if (conversation.type !== "group") {
					return { error: "Cannot set title for direct conversations" };
				}

				const participant = checkParticipant.get(id, user.id);
				if (!participant) return { error: "Access denied" };

				updateConversationTitle.run(title || null, id);
				updateConversationTimestamp.run(id);

				return { success: true, title };
			} catch (error) {
				console.error("Error updating conversation title:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				title: t.Union([t.String(), t.Null()]),
			}),
		},
	)

	.post(
		"/messages/:messageId/reactions",
		({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { messageId } = params;
				const { emoji } = body;

				const message = db
					.query("SELECT * FROM dm_messages WHERE id = ?")
					.get(messageId);
				if (!message) return { error: "Message not found" };

				const participant = checkParticipant.get(
					message.conversation_id,
					user.id,
				);
				if (!participant) return { error: "Access denied" };

				const existingReaction = getUserReactionForMessage.get(
					messageId,
					user.id,
				);

				if (existingReaction?.emoji === emoji) {
					removeReaction.run(messageId, user.id, emoji);

					const reactions = getMessageReactions.all(messageId);
					const recipients = getConversationParticipants
						.all(message.conversation_id)
						.filter((p) => p.user_id !== user.id);

					for (const participant of recipients) {
						broadcastToUser(participant.user_id, {
							type: "reaction",
							messageId,
							conversationId: message.conversation_id,
							reactions: reactions.map((r) => ({
								emoji: r.emoji,
								count: r.count,
								usernames: r.usernames?.split(",") || [],
								names: r.names?.split(",") || [],
							})),
						});
					}

					return {
						success: true,
						removed: true,
						reactions: reactions.map((r) => ({
							emoji: r.emoji,
							count: r.count,
							usernames: r.usernames?.split(",") || [],
							names: r.names?.split(",") || [],
						})),
					};
				}

				if (existingReaction) {
					removeReaction.run(messageId, user.id, existingReaction.emoji);
				}

				const reactionId = Bun.randomUUIDv7();
				addReaction.run(reactionId, messageId, user.id, emoji);

				const reactions = getMessageReactions.all(messageId);
				const recipients = getConversationParticipants
					.all(message.conversation_id)
					.filter((p) => p.user_id !== user.id);

				for (const participant of recipients) {
					broadcastToUser(participant.user_id, {
						type: "reaction",
						messageId,
						conversationId: message.conversation_id,
						reactions: reactions.map((r) => ({
							emoji: r.emoji,
							count: r.count,
							usernames: r.usernames?.split(",") || [],
							names: r.names?.split(",") || [],
						})),
					});
				}

				return {
					success: true,
					reactions: reactions.map((r) => ({
						emoji: r.emoji,
						count: r.count,
						usernames: r.usernames?.split(",") || [],
						names: r.names?.split(",") || [],
					})),
				};
			} catch (error) {
				console.error("Error adding reaction:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				emoji: t.String(),
			}),
		},
	)

	.post("/conversations/:id/typing", ({ params, headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;

			const conversation = getConversationById.get(id);
			if (!conversation) return { error: "Conversation not found" };

			const participant = checkParticipant.get(id, user.id);
			if (!participant) return { error: "Access denied" };

			const recipients = getConversationParticipants
				.all(id)
				.filter((p) => p.user_id !== user.id);

			for (const p of recipients) {
				broadcastToUser(p.user_id, {
					type: "typing",
					conversationId: id,
					userId: user.id,
					username: user.username,
					name: user.name,
					avatar: user.avatar,
				});
			}

			return { success: true };
		} catch (error) {
			console.error("Error broadcasting typing indicator:", error);
			return { error: "Internal server error" };
		}
	})

	.post("/conversations/:id/typing-stop", ({ params, headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { id } = params;

			const conversation = getConversationById.get(id);
			if (!conversation) return { error: "Conversation not found" };

			const participant = checkParticipant.get(id, user.id);
			if (!participant) return { error: "Access denied" };

			const recipients = getConversationParticipants
				.all(id)
				.filter((p) => p.user_id !== user.id);

			for (const p of recipients) {
				broadcastToUser(p.user_id, {
					type: "typing-stop",
					conversationId: id,
					userId: user.id,
				});
			}

			return { success: true };
		} catch (error) {
			console.error("Error broadcasting typing stop:", error);
			return { error: "Internal server error" };
		}
	})

	.put(
		"/messages/:messageId",
		({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { messageId } = params;
				const { content } = body;

				const message = db
					.query("SELECT * FROM dm_messages WHERE id = ?")
					.get(messageId);
				if (!message) return { error: "Message not found" };

				if (message.sender_id !== user.id) {
					return { error: "You can only edit your own messages" };
				}

				if (!content || typeof content !== "string") {
					return { error: "Content is required" };
				}

				const trimmedContent = content.trim();
				if (trimmedContent.length === 0) {
					return { error: "Message content cannot be empty" };
				}

				db.query(
					"UPDATE dm_messages SET content = ?, edited_at = datetime('now', 'utc') WHERE id = ?",
				).run(trimmedContent, messageId);

				const updatedMessage = db
					.query("SELECT * FROM dm_messages WHERE id = ?")
					.get(messageId);

				const attachments = getMessageAttachments.all(messageId);
				const reactions = getMessageReactions.all(messageId);
				const userReactions = getUserReactionForMessage.all(messageId, user.id);

				let replyToMessage = null;
				if (updatedMessage.reply_to) {
					replyToMessage = getReplyMessage.get(updatedMessage.reply_to);
				}

				const fullMessage = {
					...updatedMessage,
					username: user.username,
					name: user.name,
					avatar: user.avatar,
					verified: user.verified,
					avatar_radius: user.avatar_radius,
					gold: user.gold,
					attachments,
					reactions: reactions.map((r) => ({
						emoji: r.emoji,
						count: r.count,
						usernames: r.usernames?.split(",") || [],
						names: r.names?.split(",") || [],
					})),
					user_reacted: userReactions.map((r) => r.emoji),
					reply_to_message: replyToMessage,
				};

				const recipients = getConversationParticipants
					.all(message.conversation_id)
					.filter((p) => p.user_id !== user.id);

				for (const participant of recipients) {
					broadcastToUser(participant.user_id, {
						type: "message-edit",
						conversationId: message.conversation_id,
						message: fullMessage,
					});
				}

				return {
					success: true,
					message: fullMessage,
				};
			} catch (error) {
				console.error("Error editing message:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				content: t.String(),
			}),
		},
	)

	.delete("/messages/:messageId", ({ params, headers }) => {
		try {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) return { error: "Unauthorized" };

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "User not found" };

			const { messageId } = params;

			const message = db
				.query("SELECT * FROM dm_messages WHERE id = ?")
				.get(messageId);
			if (!message) return { error: "Message not found" };

			if (message.sender_id !== user.id) {
				return { error: "You can only delete your own messages" };
			}

			db.query(
				"UPDATE dm_messages SET deleted_at = datetime('now', 'utc') WHERE id = ?",
			).run(messageId);

			const recipients = getConversationParticipants
				.all(message.conversation_id)
				.filter((p) => p.user_id !== user.id);

			for (const participant of recipients) {
				broadcastToUser(participant.user_id, {
					type: "message-delete",
					conversationId: message.conversation_id,
					messageId: messageId,
				});
			}

			return { success: true };
		} catch (error) {
			console.error("Error deleting message:", error);
			return { error: "Internal server error" };
		}
	})

	.patch(
		"/conversations/:id/disappearing",
		({ params, body, headers }) => {
			try {
				const token = headers.authorization?.replace("Bearer ", "");
				if (!token) return { error: "Unauthorized" };

				const payload = JSON.parse(atob(token.split(".")[1]));
				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				const { id } = params;
				const { enabled, duration } = body;

				const conversation = getConversationById.get(id);
				if (!conversation) return { error: "Conversation not found" };

				const participant = checkParticipant.get(id, user.id);
				if (!participant) return { error: "Access denied" };

				db.query(
					"UPDATE conversations SET disappearing_enabled = ?, disappearing_duration = ?, updated_at = datetime('now', 'utc') WHERE id = ?",
				).run(enabled ? 1 : 0, duration || null, id);

				const recipients = getConversationParticipants
					.all(id)
					.filter((p) => p.user_id !== user.id);

				for (const participant of recipients) {
					broadcastToUser(participant.user_id, {
						type: "disappearing-update",
						conversationId: id,
						enabled,
						duration,
					});
				}

				return { success: true, enabled, duration };
			} catch (error) {
				console.error("Error updating disappearing messages:", error);
				return { error: "Internal server error" };
			}
		},
		{
			body: t.Object({
				enabled: t.Boolean(),
				duration: t.Optional(t.Union([t.Number(), t.Null()])),
			}),
		},
	);
