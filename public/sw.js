self.addEventListener("push", (event) => {
	if (!event.data) return;

	let data;
	try {
		data = event.data.json();
	} catch {
		data = { title: "New notification", body: event.data.text() };
	}

	const options = {
		body: data.body || "",
		icon: "/public/shared/assets/img/icon-192.png",
		badge: "/public/shared/assets/img/badge-72.png",
		tag: data.type || "notification",
		renotify: true,
		data: {
			url: getNotificationUrl(data),
		},
	};

	event.waitUntil(
		self.registration.showNotification(data.title || "Tweetapus", options),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const url = event.notification.data?.url || "/";

	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clientList) => {
				for (const client of clientList) {
					if (client.url.includes(self.location.origin) && "focus" in client) {
						client.focus();
						client.navigate(url);
						return;
					}
				}
				return clients.openWindow(url);
			}),
	);
});

function getNotificationUrl(data) {
	if (!data) return "/notifications";

	switch (data.type) {
		case "like":
		case "retweet":
		case "reply":
		case "quote":
		case "mention":
		case "reaction":
			return data.relatedId ? `/tweet/${data.relatedId}` : "/notifications";
		case "follow":
			return data.actorUsername ? `/@${data.actorUsername}` : "/notifications";
		case "dm_message":
			return data.relatedId ? `/dm/${data.relatedId}` : "/notifications";
		default:
			return "/notifications";
	}
}
