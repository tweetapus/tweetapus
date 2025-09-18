import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("profile_pic"),
  banner: text("banner"),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  pronouns: text("pronouns"),
  verified: integer("verified", { mode: "boolean" }).default(false),
  admin: integer("admin", { mode: "boolean" }).default(false),
  suspended: integer("suspended", { mode: "boolean" }).default(false),
  private: integer("private", { mode: "boolean" }).default(false),
  theme: text("theme"),
  accentColor: text("accent_color"),
  postCount: integer("post_count").default(0),
  followerCount: integer("follower_count").default(0),
  followingCount: integer("following_count").default(0),
  passwordHash: text("password_hash"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const passkeys = sqliteTable("passkeys", {
  credId: text("cred_id").primaryKey(),
  credPublicKey: blob("cred_public_key"),
  internalUserId: text("internal_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  webauthnUserId: text("webauthn_user_id").unique(),
  counter: integer("counter"),
  backupEligible: integer("backup_eligible", { mode: "boolean" }),
  backupStatus: integer("backup_status", { mode: "boolean" }),
  transports: text("transports"),
  name: text("name"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
  lastUsed: text("last_used"),
});

export const follows = sqliteTable("follows", {
  id: text("id").primaryKey(),
  followerId: text("follower_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  followingId: text("following_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const followRequests = sqliteTable("follow_requests", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("pending"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
  respondedAt: text("responded_at"),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  replyTo: text("reply_to").references(() => posts.id),
  pollId: text("poll_id").references(() => polls.id, { onDelete: "cascade" }),
  quoteTweetId: text("quote_tweet_id").references(() => posts.id, {
    onDelete: "cascade",
  }),
  source: text("source"),
  pinned: integer("pinned", { mode: "boolean" }).default(false),
  replyRestriction: text("reply_restriction").default("everyone"),
  likeCount: integer("like_count").default(0),
  replyCount: integer("reply_count").default(0),
  retweetCount: integer("retweet_count").default(0),
  quoteCount: integer("quote_count").default(0),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const likes = sqliteTable("likes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const retweets = sqliteTable("retweets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const pollOptions = sqliteTable("poll_options", {
  id: text("id").primaryKey(),
  pollId: text("poll_id")
    .notNull()
    .references(() => polls.id, { onDelete: "cascade" }),
  optionText: text("option_text").notNull(),
  voteCount: integer("vote_count").default(0),
  optionOrder: integer("option_order").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const pollVotes = sqliteTable("poll_votes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pollId: text("poll_id")
    .notNull()
    .references(() => polls.id, { onDelete: "cascade" }),
  optionId: text("option_id")
    .notNull()
    .references(() => pollOptions.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  fileHash: text("file_hash").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileUrl: text("file_url").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: text("content").notNull(),
  relatedId: text("related_id"),
  read: integer("read", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const suspensions = sqliteTable("suspensions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  suspendedBy: text("suspended_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  severity: integer("severity").notNull().default(3),
  expiresAt: text("expires_at"),
  status: text("status").default("active"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").default("direct"),
  title: text("title"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now', 'utc'))`),
});

export const conversationParticipants = sqliteTable(
  "conversation_participants",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").default(sql`(datetime('now', 'utc'))`),
    lastReadAt: text("last_read_at").default(sql`(datetime('now', 'utc'))`),
  }
);

export const dmMessages = sqliteTable("dm_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  messageType: text("message_type").default("text"),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
  editedAt: text("edited_at"),
});

export const dmAttachments = sqliteTable("dm_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => dmMessages.id, { onDelete: "cascade" }),
  fileHash: text("file_hash").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileUrl: text("file_url").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});

export const tweetaaiChats = sqliteTable("tweetaai_chats", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now', 'utc'))`),
});
