const rateLimitStore = new Map();
const violationStore = new Map();
const capBypassStore = new Map();

const RATE_LIMITS = {
	default: { max: 30, duration: 10000 },
	auth: { max: 5, duration: 60000 },
	upload: { max: 10, duration: 60000 },
	dm: { max: 20, duration: 10000 },
	post: { max: 15, duration: 60000 },
	sensitive: { max: 3, duration: 60000 },
	search: { max: 20, duration: 10000 },
	timeline: { max: 25, duration: 10000 },
	like: { max: 10, duration: 2000 },
	likeBurst: { max: 100, duration: 7200000 },
	reply: { max: 5, duration: 10000 },
	replyBurst: { max: 50, duration: 3600000 },
	retweet: { max: 10, duration: 5000 },
	retweetBurst: { max: 60, duration: 3600000 },
	follow: { max: 5, duration: 5000 },
	followBurst: { max: 50, duration: 3600000 },
	block: { max: 2, duration: 5000 },
	blockBurst: { max: 10, duration: 3600000 },
	mute: { max: 2, duration: 5000 },
	muteBurst: { max: 10, duration: 3600000 },
};

function cleanupExpired() {
	const now = Date.now();
	for (const [key, data] of rateLimitStore.entries()) {
		if (now - data.resetTime > data.duration + 5000) {
			rateLimitStore.delete(key);
		}
	}
	for (const [key, data] of violationStore.entries()) {
		if (now - data.lastViolation > 3600000) {
			violationStore.delete(key);
		}
	}
	for (const [key, expiry] of capBypassStore.entries()) {
		if (now > expiry) {
			capBypassStore.delete(key);
		}
	}
}

setInterval(cleanupExpired, 60000);

export function grantCapBypass(identifier) {
	capBypassStore.set(identifier, Date.now() + 30000);
}

export function hasCapBypass(identifier) {
	const expiry = capBypassStore.get(identifier);
	if (expiry && Date.now() < expiry) {
		capBypassStore.delete(identifier);
		return true;
	}
	return false;
}

export function checkRateLimit(identifier, limitType = "default") {
	if (hasCapBypass(identifier)) {
		const config = RATE_LIMITS[limitType] || RATE_LIMITS.default;
		return {
			isLimited: false,
			remaining: config.max,
			resetIn: 0,
			limit: config.max,
			violations: 0,
		};
	}

	const config = RATE_LIMITS[limitType] || RATE_LIMITS.default;
	const key = `${limitType}:${identifier}`;
	const now = Date.now();

	let data = rateLimitStore.get(key);
	const violations = violationStore.get(identifier) || {
		count: 0,
		lastViolation: 0,
	};

	if (!data || now - data.resetTime > config.duration) {
		data = {
			count: 0,
			resetTime: now,
			duration: config.duration,
		};
		rateLimitStore.set(key, data);
	}

	data.count++;

	const remaining = Math.max(0, config.max - data.count);
	const isLimited = data.count > config.max;

	if (isLimited) {
		violations.count++;
		violations.lastViolation = now;
		violationStore.set(identifier, violations);
	}

	return {
		isLimited,
		remaining,
		resetIn: Math.ceil((data.resetTime + config.duration - now) / 1000),
		limit: config.max,
		violations: violations.count,
	};
}

export function checkMultipleRateLimits(identifier, limitTypes) {
	for (const limitType of limitTypes) {
		const result = checkRateLimit(identifier, limitType);
		if (result.isLimited) {
			return result;
		}
	}
	return { isLimited: false };
}

export function getRateLimitMiddleware(limitType = "default") {
	return ({ headers, set }) => {
		const token = headers.authorization?.split(" ")[1];
		const ip =
			headers["cf-connecting-ip"] ||
			headers["x-forwarded-for"]?.split(",")[0] ||
			"0.0.0.0";

		const identifier = token || ip;
		const result = checkRateLimit(identifier, limitType);

		set.headers["X-RateLimit-Limit"] = result.limit.toString();
		set.headers["X-RateLimit-Remaining"] = result.remaining.toString();
		set.headers["X-RateLimit-Reset"] = result.resetIn.toString();

		if (result.isLimited) {
			set.status = 429;
			const backoffMs = Math.min(result.violations * 1000, 30000);
			return {
				error: "Too many requests",
				resetIn: result.resetIn,
				retryAfter: Math.ceil(backoffMs / 1000),
			};
		}
	};
}

export function getActionRateLimiter(shortLimit, burstLimit) {
	return (identifier) => {
		const shortResult = checkRateLimit(identifier, shortLimit);
		if (shortResult.isLimited) return shortResult;
		const burstResult = checkRateLimit(identifier, burstLimit);
		return burstResult;
	};
}

export default {
	checkRateLimit,
	checkMultipleRateLimits,
	getRateLimitMiddleware,
	getActionRateLimiter,
	grantCapBypass,
	hasCapBypass,
	RATE_LIMITS,
};
