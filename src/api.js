import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import auth from "./api/auth.js";
// import profile from "./api/profile.js";
import timeline from "./api/timeline.js";
import tweet from "./api/tweet.js";
import ratelimit from "./helpers/ratelimit.js";

export default new Elysia({
	prefix: "/api",
})
	.use(
		rateLimit({
			duration: 15_000,
			max: 30,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.use(auth)
	.use(tweet)
	// .use(profile)
	.use(timeline);
