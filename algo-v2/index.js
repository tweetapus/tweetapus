import { pipeline } from "@huggingface/transformers";
import { readFile } from "fs/promises";

// config
const TWEET_HALF_LIFE_DAYS = 90;
const LIKE_HALF_LIFE_DAYS = 45;
const DECAY_CUTOFF = 0.05;
const now = Date.now();

// utils
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));
const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b));
const days = (ms) => ms / 86400000;

const decay = (days, halfLife) => {
	const d = 0.5 ** (days / halfLife);
	return d < DECAY_CUTOFF ? 0 : d;
};

// tweet freshness "spike"
const freshnessSpike = (tweetDate) => {
	const ageHours = (now - tweetDate.getTime()) / 3600000;

	// big boost for ultra-recent tweets (<1h)
	if (ageHours < 1) return 4;
	if (ageHours < 3) return 2.5;
	if (ageHours < 12) return 1.8;
	if (ageHours < 24) return 1.4;
	if (ageHours < 48) return 1.1;

	return 1;
};

// “xgboost-style” small nonlinear learny model
const learnedModel = (features) => {
	// just an example non-linear stack
	let score = 0;

	score += 0.7 * Math.tanh(features.sim * 2);
	score += 0.4 * Math.tanh(Math.log1p(features.likes) * 0.7);
	score += 0.25 * Math.tanh(features.retweets * 0.0015);
	score += 0.15 * Math.tanh(features.comments * 0.002);
	score += 0.3 * Math.tanh(features.authorBoost);
	score += 0.2 * Math.tanh(features.fresh);

	return Math.max(score, 0.1); // ensure nothing hits zero
};

// twitter-style ranking influences
const twitterAlgo = (f) => {
	let score = 1;

	// 1. follow graph boost
	if (f.followedAuthor) score *= 1.7;

	// 2. early engagement (virality curve)
	const virality = Math.log1p(f.retweets * 0.4 + f.likes * 0.2);
	score *= 1 + virality * 0.12;

	// 3. diversity boost (avoid echo chamber)
	score *= 1 + f.topicDiversity * 0.05;

	// 4. conversational health
	if (f.comments > 20 && f.comments < 150) score *= 1.2;
	if (f.comments > 300) score *= 0.85;

	return score;
};

// load tweets
const raw = JSON.parse(await readFile("tweets.json", "utf8"));

const allTweets = raw.map((t) => t.text);
const tweetDates = raw.map((t) => new Date(t.date));

// engagement placeholder
const engagement = raw.map((t) => ({
	likes: t.likes,
	retweets: t.retweets,
	comments: t.comments,
	author: t.author,
	followedAuthor: t.followedAuthor,
}));

// user likes
const likedTweets = [
	{ index: 1, date: "2024-10-10" },
	{ index: 3, date: "2024-10-13" },
];

// embed
const extractor = await pipeline(
	"feature-extraction",
	"Xenova/all-MiniLM-L6-v2",
);

console.time("extract");
const embeddings = (
	await extractor(allTweets, {
		pooling: "mean",
		normalize: true,
	})
).tolist();
console.timeEnd("extract");

// build centroid
const likedWeighted = [];
for (const like of likedTweets) {
	const i = like.index;
	const age = days(now - new Date(like.date).getTime());
	const w = decay(age, LIKE_HALF_LIFE_DAYS);
	if (w === 0) continue;
	likedWeighted.push({ vec: embeddings[i], weight: w });
}

const dims = embeddings[0].length;
const centroid = Array(dims).fill(0);
let total = 0;
for (const { vec, weight } of likedWeighted) {
	for (let d = 0; d < dims; d++) centroid[d] += vec[d] * weight;
	total += weight;
}
for (let d = 0; d < dims; d++) centroid[d] /= total || 1;

// compute scores
const scores = embeddings.map((vec, i) => {
	if (likedTweets.some((x) => x.index === i)) return null;

	const ageDays = days(now - tweetDates[i].getTime());
	const timeDecay = decay(ageDays, TWEET_HALF_LIFE_DAYS);
	if (timeDecay === 0) return null;

	const e = engagement[i];
	const sim = cosine(vec, centroid);

	const engWeight =
		Math.log10(1 + e.likes) * 0.5 +
		Math.log10(1 + e.retweets) * 0.3 +
		Math.log10(1 + e.comments) * 0.2;

	const fresh = freshnessSpike(tweetDates[i]);

	const learned = learnedModel({
		sim,
		likes: e.likes,
		retweets: e.retweets,
		comments: e.comments,
		fresh,
		authorBoost: e.followedAuthor ? 1 : 0,
	});

	const tw = twitterAlgo({
		retweets: e.retweets,
		likes: e.likes,
		comments: e.comments,
		followedAuthor: e.followedAuthor,
		topicDiversity: 0.4,
	});

	return sim * timeDecay * engWeight * fresh * learned * tw;
});

// rank
const ranked = scores
	.map((score, i) => ({ i, score }))
	.filter((x) => x.score !== null)
	.sort((a, b) => b.score - a.score);

// output
console.log("=== BEST TWEETS ===");
for (const { i, score } of ranked.slice(0, 15)) {
	const e = engagement[i];
	console.log(
		`${score.toFixed(4)} | ${raw[i].text} ` +
			`(❤${e.likes} 🔁${e.retweets} 💬${e.comments})`,
	);
}
