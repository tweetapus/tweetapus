import toastQueue from "../../shared/toasts.js";

const shownToasts = new Set();
let rateLimitModal = null;
let pendingRateLimitResolve = null;

function hash(str) {
	let h = 2166136261n;
	for (let i = 0; i < str.length; i++) {
		h ^= BigInt(str.charCodeAt(i));
		h *= 16777619n;
	}
	const hex = h.toString(16);

	if (hex.length > 32) return hex.slice(0, 32);
	return hex.padStart(32, "0");
}

async function showRateLimitCaptcha() {
	if (rateLimitModal)
		return new Promise((resolve) => {
			pendingRateLimitResolve = resolve;
		});

	return new Promise((resolve) => {
		pendingRateLimitResolve = resolve;

		rateLimitModal = document.createElement("div");
		rateLimitModal.className = "rate-limit-modal";
		rateLimitModal.innerHTML = `
			<div class="rate-limit-modal-content">
				<div class="cap-container"></div>
				<p class="rate-limit-status">Please wait while we check your browser…</p>

				<div class="progress-bar">
					<div class="progress-bar-inner"></div>
				</div>
			</div>
		`;

		document.body.appendChild(rateLimitModal);

		const capContainer = rateLimitModal.querySelector(".cap-container");
		const statusEl = rateLimitModal.querySelector(".rate-limit-status");

		const capWidget = document.createElement("cap-widget");
		capWidget.style.position = "fixed";
		capWidget.style.top = "-1000px";
		capWidget.style.left = "0";
		capWidget.setAttribute("data-cap-api-endpoint", "/api/auth/cap/");
		capContainer.appendChild(capWidget);

		capWidget.addEventListener("solve", async (e) => {
			if (rateLimitModal) {
				rateLimitModal.style.display = "none";

				setTimeout(() => {
					rateLimitModal.remove();
					rateLimitModal = null;
				}, 3_000);
			}

			const capToken = e.detail.token;
			const token = localStorage.getItem("authToken");

			try {
				const bypassRes = await fetch("/api/auth/cap/rate-limit-bypass", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ capToken }),
				});

				if (bypassRes.ok) {
					setTimeout(() => {
						if (pendingRateLimitResolve) {
							pendingRateLimitResolve(true);
							pendingRateLimitResolve = null;
						}
					}, 500);
				} else {
					statusEl.textContent = "Verification failed";
					capWidget.reset();
				}
			} catch {
				statusEl.textContent = "Network error";
				capWidget.reset();
			}
		});

		capWidget.addEventListener("error", () => {
			statusEl.textContent = "Verification failed, you're going too fast!";

			const progressBarInner = rateLimitModal.querySelector(
				".progress-bar-inner",
			);
			if (progressBarInner) {
				progressBarInner.style.width = `100%`;
				progressBarInner.style.backgroundColor = "var(--error-color)";
			}
		});

		capWidget.addEventListener("progress", (e) => {
			const progressBarInner = rateLimitModal.querySelector(
				".progress-bar-inner",
			);
			if (progressBarInner) {
				progressBarInner.style.width = `${e.detail.progress}%`;
			}
		});

		setTimeout(() => {
			if (capWidget.solve) {
				capWidget.solve();
			}
		}, 300);
	});
}

async function apiQuery(url, options = {}) {
	const token = localStorage.getItem("authToken");

	if (
		options.body &&
		!(options.body instanceof FormData) &&
		(options.body.startsWith("{") || options.body.startsWith("["))
	) {
		options.headers = {
			...(options.headers || {}),
			"Content-Type": "application/json",
		};
	}

	try {
		const res = await fetch(`/api${url}`, {
			...options,
			headers: {
				...(options.headers || {}),
				Authorization: `Bearer ${token}`,
				"X-Request-Token": hash(token || "public"),
			},
		});

		if (res.status === 429) {
			const solved = await showRateLimitCaptcha();

			if (solved) {
				return await apiQuery(url, options);
			}
			return { error: "Rate limited", rateLimited: true };
		}

		let parsed = null;
		try {
			parsed = await res.json();
		} catch {
			const text = await res.text();
			parsed = text;
		}

		if (parsed?.restricted) {
			const key = "restricted-notice";
			if (!shownToasts.has(key)) {
				shownToasts.add(key);
				toastQueue.add(
					`<h1>Account restricted</h1><p>Your account has limited privileges - you can browse posts, but interactions such as tweeting, liking, retweeting, DMs, and following are disabled.</p>`,
				);
				setTimeout(() => shownToasts.delete(key), 60 * 1000);
			}
		}

		if (res.ok) return parsed;

		if (parsed && typeof parsed === "object") {
			return parsed;
		}

		return { error: String(parsed) || "Request failed" };
	} catch (error) {
		return { error: error?.message || error || "Network error" };
	}
}

export default apiQuery;
