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
	if (rateLimitModal) return new Promise((resolve) => { pendingRateLimitResolve = resolve; });

	return new Promise((resolve) => {
		pendingRateLimitResolve = resolve;

		rateLimitModal = document.createElement("div");
		rateLimitModal.className = "rate-limit-modal";
		rateLimitModal.innerHTML = `
			<div class="rate-limit-modal-content">
				<div class="rate-limit-header">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<polyline points="12 6 12 12 16 14"/>
					</svg>
					<h2>Slow down!</h2>
				</div>
				<p>You're making requests too fast. Complete this quick verification to continue.</p>
				<div class="cap-container"></div>
				<p class="rate-limit-status">Solving automatically...</p>
			</div>
		`;

		const style = document.createElement("style");
		style.textContent = `
			.rate-limit-modal {
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background-color: rgba(0, 0, 0, 0.7);
				display: flex;
				align-items: center;
				justify-content: center;
				z-index: 10000;
				animation: fadeIn 0.2s ease-out;
			}
			.rate-limit-modal-content {
				background-color: var(--bg-primary, #fff);
				border-radius: 16px;
				padding: 24px;
				max-width: 360px;
				width: 90%;
				text-align: center;
				box-shadow: 0 8px 32px rgba(0,0,0,0.3);
			}
			.rate-limit-header {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 10px;
				margin-bottom: 12px;
			}
			.rate-limit-header svg {
				color: var(--accent, #1d9bf0);
			}
			.rate-limit-header h2 {
				margin: 0;
				font-size: 20px;
				color: var(--text-primary, #000);
			}
			.rate-limit-modal-content p {
				margin: 0 0 16px 0;
				color: var(--text-secondary, #666);
				font-size: 14px;
			}
			.rate-limit-status {
				font-size: 13px !important;
				color: var(--text-tertiary, #999) !important;
				margin-top: 12px !important;
			}
			.cap-container {
				display: flex;
				justify-content: center;
			}
			.cap-container cap-widget {
				--cap-background: var(--bg-secondary, #f7f9f9);
				--cap-border-color: var(--border, #eff3f4);
				--cap-color: var(--text-primary, #0f1419);
			}
			@keyframes fadeIn {
				from { opacity: 0; }
				to { opacity: 1; }
			}
		`;
		document.head.appendChild(style);
		document.body.appendChild(rateLimitModal);

		const capContainer = rateLimitModal.querySelector(".cap-container");
		const statusEl = rateLimitModal.querySelector(".rate-limit-status");

		const capWidget = document.createElement("cap-widget");
		capWidget.setAttribute("data-cap-api-endpoint", "/api/auth/cap/");
		capContainer.appendChild(capWidget);

		capWidget.addEventListener("solve", async (e) => {
			statusEl.textContent = "Verified! Resuming...";
			const capToken = e.detail.token;

			try {
				const bypassRes = await fetch("/api/auth/cap/rate-limit-bypass", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ capToken }),
				});

				if (bypassRes.ok) {
					setTimeout(() => {
						if (rateLimitModal) {
							rateLimitModal.remove();
							rateLimitModal = null;
						}
						if (pendingRateLimitResolve) {
							pendingRateLimitResolve(true);
							pendingRateLimitResolve = null;
						}
					}, 500);
				} else {
					statusEl.textContent = "Verification failed. Try again.";
					capWidget.reset();
				}
			} catch (_err) {
				statusEl.textContent = "Network error. Try again.";
				capWidget.reset();
			}
		});

		capWidget.addEventListener("error", () => {
			statusEl.textContent = "Verification failed. Click to retry.";
		});

		capWidget.addEventListener("progress", (e) => {
			statusEl.textContent = `Verifying... ${e.detail.progress}%`;
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

		let parsed = null;
		try {
			parsed = await res.json();
		} catch {
			const text = await res.text();
			parsed = text;
		}

		if (res.status === 429) {
			const solved = await showRateLimitCaptcha();
			if (solved) {
				return await apiQuery(url, options);
			}
			return { error: "Rate limited", rateLimited: true };
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
