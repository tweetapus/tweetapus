import { dlopen, FFIType, suffix } from "bun:ffi";
import { existsSync } from "fs";
import path from "path";

const libPath = path.join(import.meta.dir, `algorithm.${suffix}`);

let lib = null;

if (existsSync(libPath)) {
  try {
    lib = dlopen(libPath, {
      calculate_score: {
        args: [FFIType.i64, FFIType.i32, FFIType.i32],
        returns: FFIType.double,
      },
    });
    console.log("✓ C algorithm library loaded successfully");
  } catch (error) {
    console.warn(
      "Failed to load C algorithm library, using JavaScript fallback"
    );
    console.warn("Error:", error.message);
  }
} else {
  console.warn(
    `C algorithm library not found at ${libPath}, using JavaScript fallback`
  );
  console.warn("Run 'make' in src/algo/ to compile the C algorithm");
}

export const calculateScore = (
  created_at,
  like_count,
  retweet_count,
  reply_count = 0,
  quote_count = 0
) => {
  if (!lib) {
    const now = Math.floor(Date.now() / 1000);
    const ageHours = (now - created_at) / 3600;

    const MAX_AGE_HOURS = 72;
    const FRESH_TWEET_HOURS = 6;

    const totalEngagement =
      like_count + retweet_count + reply_count + quote_count;

    if (ageHours > MAX_AGE_HOURS && totalEngagement < 5) {
      return 0;
    }

    const calculateTimeDecay = (age) => {
      if (age < FRESH_TWEET_HOURS) {
        return 1.0 + ((FRESH_TWEET_HOURS - age) / FRESH_TWEET_HOURS) * 0.8;
      } else if (age < 24) {
        return (
          1.0 - ((age - FRESH_TWEET_HOURS) / (24 - FRESH_TWEET_HOURS)) * 0.3
        );
      } else if (age < MAX_AGE_HOURS) {
        return 0.7 - ((age - 24) / (MAX_AGE_HOURS - 24)) * 0.5;
      } else {
        return 0.2 * Math.exp(-(age - MAX_AGE_HOURS) / 24);
      }
    };

    const retweetRatio = retweet_count / Math.max(like_count, 1);
    const replyRatio = reply_count / Math.max(like_count, 1);
    const quoteRatio = quote_count / Math.max(like_count, 1);

    let qualityScore = 1.0;
    if (retweetRatio > 0.3) qualityScore *= 1.4;
    if (replyRatio > 0.2) qualityScore *= 1.3;
    if (quoteRatio > 0.1) qualityScore *= 1.2;

    const totalActions = like_count + retweet_count * 2;
    const velocity = totalActions / Math.max(ageHours, 0.1);

    let viralityBoost = 1.0;
    if (totalActions >= 100) {
      viralityBoost = 1.5 + Math.log(totalActions / 100 + 1) * 0.3;
    } else if (totalActions >= 50) {
      viralityBoost = 1.0 + ((totalActions - 50) / 50) * 0.5;
    } else if (totalActions >= 20) {
      viralityBoost = 1.0 + ((totalActions - 20) / 30) * 0.3;
    }

    if (velocity > 10) {
      viralityBoost *= 1.0 + Math.log(velocity / 10 + 1) * 0.2;
    }

    const baseScore =
      Math.log(like_count + 1) * 2.0 +
      Math.log(retweet_count + 1) * 3.0 +
      Math.log(reply_count + 1) * 1.5 +
      Math.log(quote_count + 1) * 2.5;

    let engagementTypes = 0;
    if (like_count > 0) engagementTypes++;
    if (retweet_count > 0) engagementTypes++;
    if (reply_count > 0) engagementTypes++;
    if (quote_count > 0) engagementTypes++;
    const diversityBonus = 1.0 + (engagementTypes - 1) * 0.15;

    const timeDecay = calculateTimeDecay(ageHours);

    return Math.max(
      0,
      baseScore * timeDecay * qualityScore * viralityBoost * diversityBonus
    );
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
    quote_count
  );
};

export const rankTweets = (tweets, seenIds = new Set()) => {
  const unseenTweets = tweets.filter((tweet) => !seenIds.has(tweet.id));

  const tweetsWithScores = unseenTweets.map((tweet) => {
    const timestamp =
      typeof tweet.created_at === "string"
        ? Math.floor(new Date(tweet.created_at).getTime() / 1000)
        : tweet.created_at;

    return {
      ...tweet,
      _score: calculateScore(
        timestamp,
        tweet.like_count || 0,
        tweet.retweet_count || 0,
        tweet.reply_count || 0,
        tweet.quote_count || 0
      ),
    };
  });

  tweetsWithScores.sort((a, b) => b._score - a._score);

  tweetsWithScores.forEach((tweet) => delete tweet._score);

  return tweetsWithScores;
};

export const isAlgorithmAvailable = () => lib !== null;
