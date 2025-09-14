import { staticPlugin } from "@elysiajs/static";
import { Elysia, file } from "elysia";

import api from "./api.js";

new Elysia()
	.use(staticPlugin())
	.get("/account", () => file("./public/account/index.html"))
	.get("/notifications", () => file("./public/notifications/index.html"))
	.get("/profile/:username", () => file("./public/profile.html"))
	.get("/settings", ({ redirect }) => redirect("/settings/main"))
	.get("/settings/:section", () => file("./public/settings.html"))
	.get("/legal", () => file("./public/legal.html"))
	.get("*", ({ cookie, redirect }) => {
		return cookie.agree?.value === "yes"
			? file("./public/timeline/index.html")
			: redirect("/account");
	})
	.use(api)
	.listen(3000, () => {
		console.log("Happies tweetapus app is running on http://localhost:3000");
	});
