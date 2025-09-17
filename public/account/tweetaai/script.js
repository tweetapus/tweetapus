let isLoading = false;

// Hide loader after page loads
window.addEventListener("load", () => {
	const loader = document.querySelector(".loader");
	if (loader) {
		loader.style.display = "none";
	}
});

async function getToken() {
	return localStorage.getItem("authToken") || localStorage.getItem("token");
}

function appendMessage(text, cls, isThinking = false) {
	const messages = document.getElementById("messages");
	const emptyState = messages.querySelector(".empty-state");
	if (emptyState) {
		emptyState.remove();
	}

	const div = document.createElement("div");
	div.className = `bubble ${cls}`;
	if (isThinking) {
		div.classList.add("thinking");
	}
	div.textContent = text;
	messages.appendChild(div);
	messages.scrollTop = messages.scrollHeight;
	return div;
}

function autoResizeTextarea(textarea) {
	textarea.style.height = "auto";
	textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

function updateSendButton() {
	const button = document.getElementById("sendButton");
	const textarea = document.getElementById("message");
	const hasText = textarea.value.trim().length > 0;

	button.disabled = isLoading || !hasText;
	button.textContent = isLoading ? "Sending..." : "Send";
}

// Auto-resize textarea
const messageInput = document.getElementById("message");
messageInput.addEventListener("input", () => {
	autoResizeTextarea(messageInput);
	updateSendButton();
});

// Handle Enter key (send on Enter, new line on Shift+Enter)
messageInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		document.getElementById("chatForm").dispatchEvent(new Event("submit"));
	}
});

// Handle form submission
document.getElementById("chatForm").addEventListener("submit", async (e) => {
	e.preventDefault();

	if (isLoading) return;

	const textarea = document.getElementById("message");
	const text = textarea.value.trim();
	if (!text) return;

	const token = await getToken();
	if (!token) {
		showToast("Please sign in to use TweetaAI");
		return;
	}

	isLoading = true;
	updateSendButton();

	// Add user message
	appendMessage(text, "user");
	textarea.value = "";
	autoResizeTextarea(textarea);

	// Add thinking indicator
	const thinkingEl = appendMessage("TweetaAI is thinking...", "ai", true);

	try {
		const res = await fetch("/api/tweetaai/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ message: text }),
		});

		const data = await res.json();

		// Remove thinking indicator
		thinkingEl.remove();

		if (data.error) {
			appendMessage(`Error: ${data.error}`, "ai");
			if (data.error.includes("token") || data.error.includes("auth")) {
				showToast("Please sign in again to continue");
			}
			return;
		}

		// Add AI response
		appendMessage(data.reply || "(no reply)", "ai");
	} catch (error) {
		console.error("TweetaAI error:", error);
		thinkingEl.remove();
		appendMessage(
			"Network error communicating with TweetaAI. Please try again.",
			"ai",
		);
	} finally {
		isLoading = false;
		updateSendButton();
		textarea.focus();
	}
});

// Initial setup
updateSendButton();
