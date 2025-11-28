import { Elysia, t } from "elysia";
import webpush from "web-push";
import db from "../db.js";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject =
	process.env.VAPID_SUBJECT ||
	`mailto:admin@${process.env.BASE_URL?.replace(/https?:\/\//, "") || "localhost"}`;

if (vapidPublicKey && vapidPrivateKey) {
	webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const getUserByUsername = db.prepare(
	"SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
);
const getSubscriptionsByUser = db.prepare(
	"SELECT * FROM push_subscriptions WHERE user_id = ?",
);
const insertSubscription = db.prepare(`
	INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
`);
const deleteSubscription = db.prepare(
	"DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
);
const deleteSubscriptionById = db.prepare(
	"DELETE FROM push_subscriptions WHERE id = ?",
);

export async function sendPushNotification(userId, payload) {
	if (!vapidPublicKey || !vapidPrivateKey) return;

	const subscriptions = getSubscriptionsByUser.all(userId);
	if (!subscriptions.length) return;

	const payloadStr = JSON.stringify(payload);

	for (const sub of subscriptions) {
		try {
			await webpush.sendNotification(
				{
					endpoint: sub.endpoint,
					keys: {
						p256dh: sub.p256dh,
						auth: sub.auth,
					},
				},
				payloadStr,
			);
		} catch (error) {
			if (error.statusCode === 404 || error.statusCode === 410) {
				deleteSubscriptionById.run(sub.id);
			}
		}
	}
}

export default new Elysia({ prefix: "/push", tags: ["Push Notifications"] })
	.get(
		"/vapid-key",
		({ set }) => {
			if (!vapidPublicKey) {
				set.status = 503;
				return { error: "Push notifications not configured" };
			}
			return { publicKey: vapidPublicKey };
		},
		{
			detail: {
				description: "Get VAPID public key for push subscription",
			},
		},
	)

	.post(
		"/subscribe",
		async ({ headers, body, set }) => {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) {
				set.status = 401;
				return { error: "User not found" };
			}

			const { subscription } = body;
			if (
				!subscription?.endpoint ||
				!subscription?.keys?.p256dh ||
				!subscription?.keys?.auth
			) {
				set.status = 400;
				return { error: "Invalid subscription" };
			}

			const id = Bun.randomUUIDv7();
			insertSubscription.run(
				id,
				user.id,
				subscription.endpoint,
				subscription.keys.p256dh,
				subscription.keys.auth,
			);

			return { success: true };
		},
		{
			body: t.Object({
				subscription: t.Object({
					endpoint: t.String(),
					keys: t.Object({
						p256dh: t.String(),
						auth: t.String(),
					}),
				}),
			}),
			detail: {
				description: "Subscribe to push notifications",
			},
		},
	)

	.post(
		"/unsubscribe",
		async ({ headers, body, set }) => {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) {
				set.status = 401;
				return { error: "User not found" };
			}

			const { endpoint } = body;
			if (!endpoint) {
				set.status = 400;
				return { error: "Endpoint required" };
			}

			deleteSubscription.run(user.id, endpoint);
			return { success: true };
		},
		{
			body: t.Object({
				endpoint: t.String(),
			}),
			detail: {
				description: "Unsubscribe from push notifications",
			},
		},
	)

	.get(
		"/status",
		async ({ headers, set }) => {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const payload = JSON.parse(atob(token.split(".")[1]));
			const user = getUserByUsername.get(payload.username);
			if (!user) {
				set.status = 401;
				return { error: "User not found" };
			}

			const subscriptions = getSubscriptionsByUser.all(user.id);
			return {
				enabled: subscriptions.length > 0,
				count: subscriptions.length,
			};
		},
		{
			detail: {
				description: "Check push notification subscription status",
			},
		},
	);
