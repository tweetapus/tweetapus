import db from "../db.js";

const updateSpamScore = db.prepare(
	"UPDATE users SET spam_score = ? WHERE id = ?",
);

const getUserPosts = db.prepare(`
  SELECT id, content, created_at, like_count, retweet_count, reply_count
  FROM posts 
  WHERE user_id = ? 
  ORDER BY created_at DESC 
  LIMIT 100
`);

const getUserInfo = db.prepare(`
  SELECT 
    created_at,
    (SELECT COUNT(*) FROM follows WHERE following_id = users.id) as follower_count,
    (SELECT COUNT(*) FROM follows WHERE follower_id = users.id) as following_count,
    (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as total_posts
  FROM users 
  WHERE id = ?
`);

const getUserReplies = db.prepare(`
  SELECT reply_to, content
  FROM posts 
  WHERE user_id = ? AND reply_to IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 30
`);

const SUSPICIOUS_DOMAINS = [
	"bit.ly",
	"tinyurl.com",
	"goo.gl",
	"ow.ly",
	"t.co",
	"is.gd",
	"cli.gs",
	"pic.gd",
	"DwarfURL.com",
	"yfrog.com",
	"migre.me",
	"ff.im",
	"tiny.cc",
	"url4.eu",
	"tr.im",
	"twit.ac",
	"su.pr",
	"twurl.nl",
	"snipurl.com",
	"short.to",
	"BudURL.com",
	"ping.fm",
	"post.ly",
	"Just.as",
	"bkite.com",
	"snipr.com",
	"fic.kr",
	"loopt.us",
	"doiop.com",
	"twitthis.com",
	"htxt.it",
	"AltURL.com",
	"linktr.ee",
	"cutt.ly",
];

const SPAM_KEYWORDS = [
	"crypto",
	"bitcoin",
	"btc",
	"eth",
	"ethereum",
	"forex",
	"investment",
	"profit",
	"giveaway",
	"prize",
	"winner",
	"congratulations",
	"click here",
	"link in bio",
	"dm me",
	"whatsapp",
	"telegram",
	"cash app",
	"paypal",
	"money",
	"income",
	"work from home",
	"passive income",
	"nft",
	"airdrop",
];

const normalizeContent = (text) => {
	if (!text) return "";
	return text
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

const extractUrls = (text) => {
	if (!text) return [];
	const urlPattern = /https?:\/\/[^\s]+/gi;
	return text.match(urlPattern) || [];
};

const extractHashtags = (text) => {
	if (!text) return [];
	const hashtagPattern = /#[a-zA-Z0-9_]+/g;
	return text.match(hashtagPattern) || [];
};

const extractMentions = (text) => {
	if (!text) return [];
	const mentionPattern = /@[a-zA-Z0-9_]+/g;
	return text.match(mentionPattern) || [];
};

const hasSuspiciousDomain = (url) => {
	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname.toLowerCase();
		return SUSPICIOUS_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith("." + domain),
		);
	} catch {
		return false;
	}
};

const calculateRepeatedCharScore = (text) => {
	if (!text || text.length < 10) return 0;

	const repeatedPattern = /(.)\1{4,}/g;
	const matches = text.match(repeatedPattern);
	if (!matches) return 0;

	const totalRepeated = matches.reduce((sum, match) => sum + match.length, 0);
	return Math.min(1.0, totalRepeated / text.length);
};

const calculateCapitalizationScore = (text) => {
	if (!text || text.length < 10) return 0;

	const letters = text.replace(/[^a-zA-Z]/g, "");
	if (letters.length < 10) return 0;

	const uppercase = letters.replace(/[^A-Z]/g, "");
	const ratio = uppercase.length / letters.length;

	return ratio > 0.7 ? Math.min(1.0, (ratio - 0.7) / 0.3) : 0;
};

const calculateEmojiDensity = (text) => {
	if (!text) return 0;

	const emojiPattern =
		/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
	const emojis = text.match(emojiPattern) || [];

	const nonWhitespace = text.replace(/\s/g, "").length;
	if (nonWhitespace === 0) return 0;

	return Math.min(1.0, emojis.length / Math.max(20, nonWhitespace / 3));
};

const calculateKeywordSpamScore = (text) => {
	if (!text) return 0;
	const lower = text.toLowerCase();
	let matches = 0;
	for (const keyword of SPAM_KEYWORDS) {
		if (lower.includes(keyword)) matches++;
	}
	return Math.min(1.0, matches * 0.3);
};

const getSpamAnalysis = (userId) => {
	try {
		const posts = getUserPosts.all(userId);
		const userInfo = getUserInfo.get(userId);
		const replies = getUserReplies.all(userId);

		if (posts.length < 5) {
			return {
				score: 0.0,
				indicators: [],
				notEnoughData: true,
			};
		}

		const indicators = [];

		const recentPosts = posts.slice(0, 30);
		const contentMap = new Map();

		for (const post of recentPosts) {
			const normalized = normalizeContent(post.content);
			if (!normalized) continue;
			const count = contentMap.get(normalized) || 0;
			contentMap.set(normalized, count + 1);
		}

		let duplicateCount = 0;
		let maxDuplicates = 0;
		for (const count of contentMap.values()) {
			if (count > 1) {
				duplicateCount += count - 1;
				maxDuplicates = Math.max(maxDuplicates, count);
			}
		}

		const duplicateRatio = duplicateCount / recentPosts.length;
		let duplicateScore = 0;
		if (duplicateRatio > 0.4) duplicateScore = 0.3;
		if (duplicateRatio > 0.6) duplicateScore = 0.6;
		if (duplicateRatio > 0.75) duplicateScore = 1.0;
		if (maxDuplicates > 8) duplicateScore = Math.max(duplicateScore, 0.8);

		indicators.push({
			name: "duplicate_content",
			displayName: "Duplicate Content",
			score: duplicateScore,
			weight: 0.15,
			details: `${(duplicateRatio * 100).toFixed(1)}% duplicate posts, max ${maxDuplicates} repeats`,
		});

		const now = Date.now();
		const oneHourAgo = now - 3600000;
		const sixHoursAgo = now - 6 * 3600000;
		const oneDayAgo = now - 24 * 3600000;

		const postsInLastHour = posts.filter(
			(p) => new Date(p.created_at).getTime() > oneHourAgo,
		).length;
		const postsInLast6Hours = posts.filter(
			(p) => new Date(p.created_at).getTime() > sixHoursAgo,
		).length;
		const postsInLastDay = posts.filter(
			(p) => new Date(p.created_at).getTime() > oneDayAgo,
		).length;

		let frequencyScore = 0;
		if (postsInLastHour > 20) frequencyScore = 1.0;
		else if (postsInLastHour > 15) frequencyScore = 0.7;
		else if (postsInLastHour > 10) frequencyScore = 0.4;
		else if (postsInLast6Hours > 60)
			frequencyScore = Math.max(frequencyScore, 0.8);
		else if (postsInLast6Hours > 40)
			frequencyScore = Math.max(frequencyScore, 0.5);
		else if (postsInLastDay > 150)
			frequencyScore = Math.max(frequencyScore, 0.9);
		else if (postsInLastDay > 100)
			frequencyScore = Math.max(frequencyScore, 0.6);

		indicators.push({
			name: "posting_frequency",
			displayName: "Posting Frequency",
			score: frequencyScore,
			weight: 0.12,
			details: `${postsInLastHour} posts/hour, ${postsInLastDay} posts/day`,
		});

		const urlAnalysis = posts.slice(0, 30).map((p) => {
			const urls = extractUrls(p.content);
			const suspiciousUrls = urls.filter(hasSuspiciousDomain);
			return {
				urlCount: urls.length,
				suspiciousCount: suspiciousUrls.length,
				hasUrl: urls.length > 0,
			};
		});

		const avgUrls =
			urlAnalysis.reduce((sum, a) => sum + a.urlCount, 0) /
			Math.max(urlAnalysis.length, 1);
		const postsWithUrls = urlAnalysis.filter((a) => a.hasUrl).length;
		const urlRatio = postsWithUrls / Math.max(urlAnalysis.length, 1);
		const suspiciousUrlCount = urlAnalysis.reduce(
			(sum, a) => sum + a.suspiciousCount,
			0,
		);

		let urlScore = 0;
		if (avgUrls > 3) urlScore = 0.6;
		else if (avgUrls > 2) urlScore = 0.3;
		if (urlRatio > 0.8) urlScore = Math.max(urlScore, 0.7);
		if (suspiciousUrlCount > 5) urlScore = Math.max(urlScore, 0.9);
		else if (suspiciousUrlCount > 2) urlScore = Math.max(urlScore, 0.5);

		indicators.push({
			name: "url_spam",
			displayName: "URL Spam",
			score: urlScore,
			weight: 0.14,
			details: `${(urlRatio * 100).toFixed(1)}% posts with URLs, ${suspiciousUrlCount} suspicious`,
		});

		const hashtagAnalysis = posts.slice(0, 30).map((p) => {
			const hashtags = extractHashtags(p.content);
			return {
				count: hashtags.length,
				unique: new Set(hashtags.map((h) => h.toLowerCase())).size,
			};
		});

		const avgHashtags =
			hashtagAnalysis.reduce((sum, a) => sum + a.count, 0) /
			Math.max(hashtagAnalysis.length, 1);
		const maxHashtags = Math.max(...hashtagAnalysis.map((a) => a.count), 0);
		const lowDiversityPosts = hashtagAnalysis.filter(
			(a) => a.count > 3 && a.unique / Math.max(a.count, 1) < 0.5,
		).length;

		let hashtagScore = 0;
		if (avgHashtags > 8) hashtagScore = 1.0;
		else if (avgHashtags > 5) hashtagScore = 0.6;
		else if (avgHashtags > 3) hashtagScore = 0.3;
		if (maxHashtags > 15) hashtagScore = Math.max(hashtagScore, 0.9);
		else if (maxHashtags > 10) hashtagScore = Math.max(hashtagScore, 0.6);
		if (lowDiversityPosts > 10) hashtagScore = Math.max(hashtagScore, 0.7);

		indicators.push({
			name: "hashtag_spam",
			displayName: "Hashtag Spam",
			score: hashtagScore,
			weight: 0.1,
			details: `Avg ${avgHashtags.toFixed(1)} hashtags/post, max ${maxHashtags}`,
		});

		const mentionAnalysis = posts.slice(0, 30).map((p) => {
			const mentions = extractMentions(p.content);
			const uniqueMentions = new Set(mentions.map((m) => m.toLowerCase()));
			return {
				count: mentions.length,
				unique: uniqueMentions.size,
			};
		});

		const avgMentions =
			mentionAnalysis.reduce((sum, a) => sum + a.count, 0) /
			Math.max(mentionAnalysis.length, 1);
		const maxMentions = Math.max(...mentionAnalysis.map((a) => a.count), 0);
		const repetitiveMentions = mentionAnalysis.filter(
			(a) => a.count > 5 && a.unique / Math.max(a.count, 1) < 0.4,
		).length;

		let mentionScore = 0;
		if (avgMentions > 6) mentionScore = 0.9;
		else if (avgMentions > 4) mentionScore = 0.5;
		else if (avgMentions > 3) mentionScore = 0.3;
		if (maxMentions > 15) mentionScore = Math.max(mentionScore, 1.0);
		else if (maxMentions > 10) mentionScore = Math.max(mentionScore, 0.7);
		if (repetitiveMentions > 8) mentionScore = Math.max(mentionScore, 0.8);

		indicators.push({
			name: "mention_spam",
			displayName: "Mention Spam",
			score: mentionScore,
			weight: 0.09,
			details: `Avg ${avgMentions.toFixed(1)} mentions/post, max ${maxMentions}`,
		});

		const qualityAnalysis = posts.slice(0, 30).map((p) => {
			const content = p.content || "";
			return {
				length: content.length,
				repeatedChars: calculateRepeatedCharScore(content),
				capitalization: calculateCapitalizationScore(content),
				emojiDensity: calculateEmojiDensity(content),
				keywordScore: calculateKeywordSpamScore(content),
				wordsCount: content.split(/\s+/).filter((w) => w.length > 0).length,
			};
		});

		const veryShortPosts = qualityAnalysis.filter((a) => a.length < 10).length;
		const lowQualityPosts = qualityAnalysis.filter(
			(a) =>
				a.repeatedChars > 0.3 ||
				a.capitalization > 0.5 ||
				a.emojiDensity > 0.5 ||
				a.keywordScore > 0.5,
		).length;
		const avgWords =
			qualityAnalysis.reduce((sum, a) => sum + a.wordsCount, 0) /
			Math.max(qualityAnalysis.length, 1);
		const avgKeywordScore =
			qualityAnalysis.reduce((sum, a) => sum + a.keywordScore, 0) /
			Math.max(qualityAnalysis.length, 1);

		let qualityScore = 0;
		if (veryShortPosts > 15) qualityScore = 0.7;
		else if (veryShortPosts > 10) qualityScore = 0.4;
		if (lowQualityPosts > 15) qualityScore = Math.max(qualityScore, 0.8);
		else if (lowQualityPosts > 10) qualityScore = Math.max(qualityScore, 0.5);
		if (avgWords < 3) qualityScore = Math.max(qualityScore, 0.6);
		if (avgKeywordScore > 0.3) qualityScore = Math.max(qualityScore, 0.8);

		indicators.push({
			name: "content_quality",
			displayName: "Content Quality",
			score: qualityScore,
			weight: 0.11,
			details: `${lowQualityPosts} low quality posts, avg keyword score ${(avgKeywordScore * 100).toFixed(1)}%`,
		});

		if (replies.length > 0) {
			const replyTargets = replies.map((r) => r.reply_to);
			const uniqueTargets = new Set(replyTargets);
			const replyDiversity =
				uniqueTargets.size / Math.max(replyTargets.length, 1);

			const replyContentMap = new Map();
			for (const reply of replies) {
				const normalized = normalizeContent(reply.content);
				if (!normalized) continue;
				const count = replyContentMap.get(normalized) || 0;
				replyContentMap.set(normalized, count + 1);
			}

			let replyDuplicates = 0;
			for (const count of replyContentMap.values()) {
				if (count > 1) replyDuplicates += count - 1;
			}
			const replyDuplicateRatio = replyDuplicates / Math.max(replies.length, 1);

			let replyScore = 0;
			if (replyDiversity < 0.3 && replies.length > 10) replyScore = 0.8;
			else if (replyDiversity < 0.5 && replies.length > 15) replyScore = 0.5;
			if (replyDuplicateRatio > 0.5) replyScore = Math.max(replyScore, 0.9);
			else if (replyDuplicateRatio > 0.3)
				replyScore = Math.max(replyScore, 0.6);

			indicators.push({
				name: "reply_spam",
				displayName: "Reply Spam",
				score: replyScore,
				weight: 0.08,
				details: `${(replyDuplicateRatio * 100).toFixed(1)}% duplicate replies, diversity ${(replyDiversity * 100).toFixed(1)}%`,
			});
		} else {
			indicators.push({
				name: "reply_spam",
				displayName: "Reply Spam",
				score: 0,
				weight: 0.08,
				details: "No replies",
			});
		}

		const engagementAnalysis = posts.slice(0, 30).map((p) => {
			const totalEngagement =
				(p.like_count || 0) + (p.retweet_count || 0) + (p.reply_count || 0);
			return {
				engagement: totalEngagement,
				length: p.content.length,
			};
		});

		const noEngagementPosts = engagementAnalysis.filter(
			(a) => a.engagement === 0,
		).length;
		const noEngagementRatio =
			noEngagementPosts / Math.max(engagementAnalysis.length, 1);

		let engagementScore = 0;
		if (postsInLastDay > 30 && noEngagementRatio > 0.9 && posts.length > 20) {
			engagementScore = 0.8;
		} else if (
			postsInLastDay > 50 &&
			noEngagementRatio > 0.85 &&
			posts.length > 30
		) {
			engagementScore = 0.9;
		} else if (
			postsInLast6Hours > 20 &&
			noEngagementRatio > 0.95 &&
			posts.length > 15
		) {
			engagementScore = 0.7;
		}

		indicators.push({
			name: "engagement_manipulation",
			displayName: "Engagement Manipulation",
			score: engagementScore,
			weight: 0.09,
			details: `${(noEngagementRatio * 100).toFixed(1)}% posts with 0 engagement`,
		});

		let accountScore = 0;

		if (userInfo) {
			const accountAgeMs = Date.now() - new Date(userInfo.created_at).getTime();
			const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

			const followersCount = userInfo.follower_count || 0;
			const followingCount = userInfo.following_count || 0;
			const totalPosts = userInfo.total_posts || 0;

			let followerBonus = 0;
			if (followersCount >= 100) followerBonus = 1.0;
			else if (followersCount >= 50) followerBonus = 0.8;
			else if (followersCount >= 20) followerBonus = 0.6;
			else if (followersCount >= 10) followerBonus = 0.4;
			else if (followersCount >= 5) followerBonus = 0.2;

			if (followersCount < 10) {
				if (accountAgeDays < 7 && totalPosts > 100) {
					accountScore = 0.6;
				} else if (accountAgeDays < 3 && totalPosts > 50) {
					accountScore = 0.7;
				} else if (accountAgeDays < 1 && totalPosts > 20) {
					accountScore = 0.9;
				}
			}

			if (followingCount > 0 && followersCount < 20) {
				const followRatio = followingCount / Math.max(followersCount, 1);
				if (followRatio > 20 && followingCount > 200)
					accountScore = Math.max(accountScore, 0.8);
				else if (followRatio > 10 && followingCount > 100)
					accountScore = Math.max(accountScore, 0.6);
				else if (followRatio > 5 && followingCount > 200)
					accountScore = Math.max(accountScore, 0.4);
			}

			if (followersCount === 0 && totalPosts > 50) {
				accountScore = Math.max(accountScore, 0.7);
			} else if (followersCount < 3 && totalPosts > 100) {
				accountScore = Math.max(accountScore, 0.6);
			}

			accountScore = accountScore * (1.0 - followerBonus);
			if (accountScore < 0) accountScore = 0;
		}

		indicators.push({
			name: "account_behavior",
			displayName: "Account Behavior",
			score: accountScore,
			weight: 0.12,
			details: userInfo
				? `${userInfo.follower_count} followers, ${userInfo.following_count} following`
				: "No info",
		});

		let spamScore = 0.0;
		let totalWeight = 0;
		for (const indicator of indicators) {
			spamScore += indicator.score * indicator.weight;
			totalWeight += indicator.weight;
		}

		spamScore = spamScore / totalWeight;

		spamScore = Math.min(1.0, spamScore);
		spamScore = Math.max(0.0, spamScore);

		spamScore = Math.round(spamScore * 1000) / 1000;

		return {
			score: spamScore,
			indicators,
			notEnoughData: false,
		};
	} catch (error) {
		console.error("Error in spam analysis:", error);
		return {
			score: 0.0,
			indicators: [],
			error: true,
		};
	}
};

export const calculateSpamScore = (userId) => {
	const analysis = getSpamAnalysis(userId);

	if (analysis.error || analysis.notEnoughData) {
		return 0.0;
	}

	const spamScore = analysis.score;

	updateSpamScore.run(spamScore, userId);

	if (spamScore > 0.95) {
		const user = db
			.prepare("SELECT shadowbanned FROM users WHERE id = ?")
			.get(userId);
		if (user && !user.shadowbanned) {
			const suspensionId = Bun.randomUUIDv7();
			const reportId = Bun.randomUUIDv7();
			const now = new Date().toISOString();

			db.prepare("UPDATE users SET shadowbanned = TRUE WHERE id = ?").run(
				userId,
			);

			db.prepare(`
				INSERT INTO suspensions (id, user_id, suspended_by, reason, action, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`).run(
				suspensionId,
				userId,
				"system",
				"Automated: High Spam Score",
				"shadowban",
				"active",
				now,
			);

			db.prepare(`
				INSERT INTO reports (id, reporter_id, reported_type, reported_id, reason, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`).run(
				reportId,
				"system",
				"user",
				userId,
				`Automated: High Spam Score (${spamScore.toFixed(3)})`,
				"pending",
				now,
			);

			db.prepare("DELETE FROM dm_messages WHERE sender_id = ?").run(userId);

			const logId = Bun.randomUUIDv7();
			db.prepare(`
				INSERT INTO moderation_logs (id, moderator_id, action, target_type, target_id, details, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`).run(
				logId,
				"system",
				"shadowban_user",
				"user",
				userId,
				JSON.stringify({
					reason: "Automated: High Spam Score",
					score: spamScore,
					auto: true,
				}),
				now,
			);

			console.log(
				`[Auto-Mod] Shadowbanned user ${userId} due to high spam score: ${spamScore}`,
			);
		}
	}

	return spamScore;
};

export const updateUserSpamScore = (userId) => {
	return calculateSpamScore(userId);
};

export const getSpamScoreBreakdown = (userId) => {
	try {
		const analysis = getSpamAnalysis(userId);

		if (analysis.notEnoughData) {
			return {
				spamScore: 0.0,
				indicators: [],
				message:
					"Not enough posts to calculate spam score (minimum 5 required)",
			};
		}

		const user = db
			.prepare("SELECT spam_score FROM users WHERE id = ?")
			.get(userId);

		return {
			spamScore: user?.spam_score || 0.0,
			message:
				(user?.spam_score || 0) > 0.5
					? "High spam score - account behavior is suspicious"
					: (user?.spam_score || 0) > 0.3
						? "Moderate spam score - some concerning patterns detected"
						: "Normal account behavior",
		};
	} catch (error) {
		console.error("Error getting spam score breakdown:", error);
		return {
			spamScore: 0.0,
			indicators: [],
			message: "Error calculating spam score",
		};
	}
};

export const calculateSpamScoreWithDetails = (userId) => {
	const analysis = getSpamAnalysis(userId);

	if (analysis.notEnoughData) {
		return {
			spamScore: 0.0,
			indicators: [],
			message: "Not enough posts to calculate spam score (minimum 5 required)",
		};
	}

	if (analysis.error) {
		return {
			spamScore: 0.0,
			indicators: [],
			message: "Error calculating spam score",
		};
	}

	const finalScore = analysis.score;

	return {
		spamScore: finalScore,
		indicators: analysis.indicators,
		message:
			finalScore > 0.5
				? "High spam score - account behavior is suspicious"
				: finalScore > 0.3
					? "Moderate spam score - some concerning patterns detected"
					: finalScore > 0.1
						? "Low spam score - normal account behavior"
						: "Excellent - no spam indicators detected",
	};
};
