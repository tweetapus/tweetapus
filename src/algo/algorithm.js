import { dlopen, FFIType, suffix } from "bun:ffi";
import { existsSync } from "fs";
import path from "path";

const libPath = path.join(import.meta.dir, `algorithm.${suffix}`);

let lib = null;

if (existsSync(libPath)) {
  try {
    lib = dlopen(libPath, {
      calculate_score: {
        args: [
          FFIType.i64,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.double,
          FFIType.i32,
          FFIType.i32,
          FFIType.double,
          FFIType.double,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
        ],
        returns: FFIType.double,
      },
    });
    console.log("✓ C algorithm library loaded successfully");
  } catch (error) {
    console.warn("Failed to load C algorithm library");
    console.warn("Error:", error.message);
  }
} else {
  console.warn(`C algorithm library not found at ${libPath}`);
  console.warn("Run 'make' in src/algo/ to compile the C algorithm");
}

export const calculateScore = (
  created_at,
  like_count,
  retweet_count,
  reply_count = 0,
  quote_count = 0,
  has_media = 0,
  hours_since_seen = -1,
  author_repeats = 0,
  content_repeats = 0,
  novelty_factor = 1,
  random_factor = Math.random(),
  is_all_seen = 0,
  position_in_feed = 0,
  user_verified = 0,
  user_gold = 0,
  follower_count = 0
) => {
  if (!lib) {
    return 0;
  }

  const timestamp =
    typeof created_at === "string"
      ? Math.floor(new Date(created_at).getTime() / 1000)
      : created_at;

  return lib.symbols.calculate_score(
    BigInt(timestamp),
    like_count,
    retweet_count,
    reply_count,
    quote_count,
    has_media,
    hours_since_seen,
    author_repeats,
    content_repeats,
    novelty_factor,
    random_factor,
    is_all_seen,
    position_in_feed,
    user_verified,
    user_gold,
    follower_count
  );
};

const normalizeContent = (value) => {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const rankTweets = (tweets, seenInput = new Map()) => {
  if (!lib) return tweets;
  if (!Array.isArray(tweets) || tweets.length === 0) return [];

  let seenMap;
  if (seenInput instanceof Map) {
    seenMap = seenInput;
  } else if (seenInput instanceof Set) {
    seenMap = new Map();
    seenInput.forEach((id) => seenMap.set(id, null));
  } else {
    seenMap = new Map();
  }

  const nowMillis = Date.now();
  const nowSeconds = Math.floor(nowMillis / 1000);

  const authorCounts = new Map();
  const contentCounts = new Map();

  tweets.forEach((tweet) => {
    const authorKey =
      tweet.user_id ||
      tweet.author_id ||
      tweet.author?.id ||
      tweet.username ||
      tweet.author?.username;
    if (authorKey) {
      authorCounts.set(authorKey, (authorCounts.get(authorKey) || 0) + 1);
    }

    const contentKey = normalizeContent(tweet.content);
    if (contentKey) {
      contentCounts.set(contentKey, (contentCounts.get(contentKey) || 0) + 1);
    }
  });

  const allSeen = tweets.every((tweet) => seenMap.has(tweet.id));

  const scored = tweets.map((tweet) => {
    let timestamp =
      typeof tweet.created_at === "string"
        ? Math.floor(new Date(tweet.created_at).getTime() / 1000)
        : tweet.created_at;
    if (!Number.isFinite(timestamp)) {
      timestamp = nowSeconds;
    }

    const attachments = Array.isArray(tweet.attachments)
      ? tweet.attachments
      : [];
    const hasQuotedMedia =
      tweet.quoted_tweet &&
      Array.isArray(tweet.quoted_tweet.attachments) &&
      tweet.quoted_tweet.attachments.length > 0;
    const hasMedia = attachments.length > 0 || hasQuotedMedia ? 1 : 0;

    const authorKey =
      tweet.user_id ||
      tweet.author_id ||
      tweet.author?.id ||
      tweet.username ||
      tweet.author?.username;
    const authorCount = authorKey ? authorCounts.get(authorKey) || 0 : 0;

    const contentKey = normalizeContent(tweet.content);
    const contentCount = contentKey ? contentCounts.get(contentKey) || 0 : 0;

    const seenMeta = seenMap.get(tweet.id);
    let hoursSinceSeen = -1;
    if (seenMeta !== undefined && seenMeta !== null) {
      const parsed = Date.parse(
        typeof seenMeta === "string" && !seenMeta.endsWith("Z")
          ? `${seenMeta}Z`
          : seenMeta
      );
      if (Number.isFinite(parsed)) {
        hoursSinceSeen = Math.max(0, (nowMillis - parsed) / 3600000);
      }
    }

    let noveltyFactor = 1.0;
    if (hoursSinceSeen < 0) {
      noveltyFactor = 1.2;
    } else if (hoursSinceSeen > 72) {
      noveltyFactor = 1.05;
    }

    const randomFactor = Math.random();

    const userVerified = tweet.verified || tweet.author?.verified ? 1 : 0;
    const userGold = tweet.gold || tweet.author?.gold ? 1 : 0;
    const followerCount = tweet.follower_count || tweet.author?.follower_count || 0;

    const score = calculateScore(
      timestamp,
      tweet.like_count || 0,
      tweet.retweet_count || 0,
      tweet.reply_count || 0,
      tweet.quote_count || 0,
      hasMedia,
      hoursSinceSeen,
      Math.max(0, authorCount - 1),
      Math.max(0, contentCount - 1),
      noveltyFactor,
      randomFactor,
      allSeen ? 1 : 0,
      0,
      userVerified,
      userGold,
      followerCount
    );

    return { ...tweet, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);

  return scored.map(({ _score, ...rest }) => rest);
};

export const isAlgorithmAvailable = () => lib !== null;
