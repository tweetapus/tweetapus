import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  conversationParticipants,
  conversations,
  dmMessages,
  follows,
  likes,
  notifications,
  posts,
  retweets,
  suspensions,
  tweetaaiChats,
  users,
} from "./schema";

// User queries
export const getUserById = (id: string) =>
  db.select().from(users).where(eq(users.id, id)).get();

export const getUserByUsername = (username: string) =>
  db.select().from(users).where(eq(users.username, username)).get();

export const createUser = (userData: typeof users.$inferInsert) =>
  db.insert(users).values(userData).returning().get();

export const updateUser = (
  id: string,
  userData: Partial<typeof users.$inferInsert>
) => db.update(users).set(userData).where(eq(users.id, id)).returning().get();

export const deleteUser = (id: string) =>
  db.delete(users).where(eq(users.id, id));

// Post queries
export const getPostById = (id: string) =>
  db
    .select({
      post: posts,
      author: users,
      likeCount: posts.likeCount,
      retweetCount: posts.retweetCount,
      replyCount: posts.replyCount,
      quoteCount: posts.quoteCount,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.id, id))
    .get();

export const createPost = (postData: typeof posts.$inferInsert) =>
  db.insert(posts).values(postData).returning().get();

export const updatePost = (
  id: string,
  postData: Partial<typeof posts.$inferInsert>
) => db.update(posts).set(postData).where(eq(posts.id, id)).returning().get();

export const deletePost = (id: string) =>
  db.delete(posts).where(eq(posts.id, id));

export const getTimelinePosts = (limit = 20, offset = 0) =>
  db
    .select({
      post: posts,
      author: users,
      likeCount: posts.likeCount,
      retweetCount: posts.retweetCount,
      replyCount: posts.replyCount,
      quoteCount: posts.quoteCount,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

export const getUserPosts = (userId: string, limit = 20, offset = 0) =>
  db
    .select({
      post: posts,
      author: users,
      likeCount: posts.likeCount,
      retweetCount: posts.retweetCount,
      replyCount: posts.replyCount,
      quoteCount: posts.quoteCount,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

export const getPostReplies = (postId: string, limit = 20, offset = 0) =>
  db
    .select({
      post: posts,
      author: users,
      likeCount: posts.likeCount,
      retweetCount: posts.retweetCount,
      replyCount: posts.replyCount,
      quoteCount: posts.quoteCount,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.replyTo, postId))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

// Like queries
export const likePost = (userId: string, postId: string, likeId: string) =>
  db.transaction(async (tx) => {
    await tx.insert(likes).values({ id: likeId, userId, postId });
    await tx
      .update(posts)
      .set({
        likeCount: sql`${posts.likeCount} + 1`,
      })
      .where(eq(posts.id, postId));
  });

export const unlikePost = (userId: string, postId: string) =>
  db.transaction(async (tx) => {
    await tx
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)));
    await tx
      .update(posts)
      .set({
        likeCount: sql`${posts.likeCount} - 1`,
      })
      .where(eq(posts.id, postId));
  });

export const isPostLikedByUser = (userId: string, postId: string) =>
  db
    .select()
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
    .get();

// Retweet queries
export const retweetPost = (
  userId: string,
  postId: string,
  retweetId: string
) =>
  db.transaction(async (tx) => {
    await tx.insert(retweets).values({ id: retweetId, userId, postId });
    await tx
      .update(posts)
      .set({
        retweetCount: sql`${posts.retweetCount} + 1`,
      })
      .where(eq(posts.id, postId));
  });

export const unretweetPost = (userId: string, postId: string) =>
  db.transaction(async (tx) => {
    await tx
      .delete(retweets)
      .where(and(eq(retweets.userId, userId), eq(retweets.postId, postId)));
    await tx
      .update(posts)
      .set({
        retweetCount: sql`${posts.retweetCount} - 1`,
      })
      .where(eq(posts.id, postId));
  });

export const isPostRetweetedByUser = (userId: string, postId: string) =>
  db
    .select()
    .from(retweets)
    .where(and(eq(retweets.userId, userId), eq(retweets.postId, postId)))
    .get();

// Follow queries
export const followUser = (
  followerId: string,
  followingId: string,
  followId: string
) =>
  db.transaction(async (tx) => {
    await tx.insert(follows).values({ id: followId, followerId, followingId });
    await tx
      .update(users)
      .set({
        followerCount: sql`${users.followerCount} + 1`,
      })
      .where(eq(users.id, followingId));
    await tx
      .update(users)
      .set({
        followingCount: sql`${users.followingCount} + 1`,
      })
      .where(eq(users.id, followerId));
  });

export const unfollowUser = (followerId: string, followingId: string) =>
  db.transaction(async (tx) => {
    await tx
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );
    await tx
      .update(users)
      .set({
        followerCount: sql`${users.followerCount} - 1`,
      })
      .where(eq(users.id, followingId));
    await tx
      .update(users)
      .set({
        followingCount: sql`${users.followingCount} - 1`,
      })
      .where(eq(users.id, followerId));
  });

export const isUserFollowing = (followerId: string, followingId: string) =>
  db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      )
    )
    .get();

export const getUserFollowers = (userId: string, limit = 50, offset = 0) =>
  db
    .select({
      user: users,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .leftJoin(users, eq(follows.followerId, users.id))
    .where(eq(follows.followingId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

export const getUserFollowing = (userId: string, limit = 50, offset = 0) =>
  db
    .select({
      user: users,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .leftJoin(users, eq(follows.followingId, users.id))
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

// Notification queries
export const createNotification = (
  notificationData: typeof notifications.$inferInsert
) => db.insert(notifications).values(notificationData).returning().get();

export const getUserNotifications = (userId: string, limit = 20, offset = 0) =>
  db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

export const markNotificationRead = (id: string) =>
  db.update(notifications).set({ read: true }).where(eq(notifications.id, id));

export const getUnreadNotificationCount = (userId: string) =>
  db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .get();

// DM queries
export const createConversation = (
  conversationData: typeof conversations.$inferInsert
) => db.insert(conversations).values(conversationData).returning().get();

export const addConversationParticipant = (
  participantData: typeof conversationParticipants.$inferInsert
) => db.insert(conversationParticipants).values(participantData);

export const getUserConversations = (userId: string) =>
  db
    .select({
      conversation: conversations,
      participant: users,
      lastReadAt: conversationParticipants.lastReadAt,
    })
    .from(conversationParticipants)
    .leftJoin(
      conversations,
      eq(conversationParticipants.conversationId, conversations.id)
    )
    .leftJoin(users, eq(conversationParticipants.userId, users.id))
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.updatedAt));

export const getConversationMessages = (
  conversationId: string,
  limit = 50,
  offset = 0
) =>
  db
    .select({
      message: dmMessages,
      sender: users,
    })
    .from(dmMessages)
    .leftJoin(users, eq(dmMessages.senderId, users.id))
    .where(eq(dmMessages.conversationId, conversationId))
    .orderBy(desc(dmMessages.createdAt))
    .limit(limit)
    .offset(offset);

export const createMessage = (messageData: typeof dmMessages.$inferInsert) =>
  db.insert(dmMessages).values(messageData).returning().get();

// Suspension queries
export const suspendUser = (suspensionData: typeof suspensions.$inferInsert) =>
  db.transaction(async (tx) => {
    await tx.insert(suspensions).values(suspensionData);
    await tx
      .update(users)
      .set({ suspended: true })
      .where(eq(users.id, suspensionData.userId));
  });

export const unsuspendUser = (userId: string) =>
  db.transaction(async (tx) => {
    await tx
      .update(suspensions)
      .set({ status: "lifted" })
      .where(eq(suspensions.userId, userId));
    await tx
      .update(users)
      .set({ suspended: false })
      .where(eq(users.id, userId));
  });

export const getActiveSuspension = (userId: string) =>
  db
    .select()
    .from(suspensions)
    .where(
      and(eq(suspensions.userId, userId), eq(suspensions.status, "active"))
    )
    .get();

// Search queries
export const searchUsers = (query: string, limit = 20) =>
  db
    .select()
    .from(users)
    .where(
      or(
        sql`${users.username} LIKE ${`%${query}%`}`,
        sql`${users.name} LIKE ${`%${query}%`}`
      )
    )
    .limit(limit);

export const searchPosts = (query: string, limit = 20) =>
  db
    .select({
      post: posts,
      author: users,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(sql`${posts.content} LIKE ${`%${query}%`}`)
    .orderBy(desc(posts.createdAt))
    .limit(limit);

export const createTweetaaiChat = (
  chatData: typeof tweetaaiChats.$inferInsert
) => db.insert(tweetaaiChats).values(chatData).returning().get();

export const getUserTweetaaiChats = (userId: string, limit = 20, offset = 0) =>
  db
    .select()
    .from(tweetaaiChats)
    .where(eq(tweetaaiChats.userId, userId))
    .orderBy(desc(tweetaaiChats.createdAt))
    .limit(limit)
    .offset(offset);

// Admin statistics queries
export const getAdminStats = async () => {
  const [userStats, postStats, suspensionStats] = await Promise.all([
    db
      .select({
        total: count(),
        verified: count(sql`CASE WHEN verified = 1 THEN 1 END`),
        suspended: count(sql`CASE WHEN suspended = 1 THEN 1 END`),
      })
      .from(users)
      .get(),
    db.select({ total: count() }).from(posts).get(),
    db
      .select({ active: count() })
      .from(suspensions)
      .where(eq(suspensions.status, "active"))
      .get(),
  ]);

  return {
    users: {
      total: userStats?.total || 0,
      verified: userStats?.verified || 0,
      suspended: userStats?.suspended || 0,
    },
    posts: {
      total: postStats?.total || 0,
    },
    suspensions: {
      active: suspensionStats?.active || 0,
    },
  };
};

export const getRecentActivity = async () => {
  const [recentUsers, recentSuspensions] = await Promise.all([
    db
      .select({
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5),
    db
      .select({
        username: users.username,
        createdAt: suspensions.createdAt,
      })
      .from(suspensions)
      .leftJoin(users, eq(suspensions.userId, users.id))
      .where(eq(suspensions.status, "active"))
      .orderBy(desc(suspensions.createdAt))
      .limit(5),
  ]);

  return {
    users: recentUsers || [],
    suspensions: recentSuspensions || [],
  };
};
