import toastQueue from "../../shared/toasts.js";
import { authToken } from "./auth.js";
import switchPage from "./pages.js";

let isLoading = false;
let currentStreamElement = null;
let abortController = null;

function appendMessage(text, cls, isThinking = false) {
	const messages = document.getElementById("tweetaai-messages");
	const emptyState = messages.querySelector(".tweetaai-empty-state");
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

function createStreamingMessage() {
	const messages = document.getElementById("tweetaai-messages");
	const emptyState = messages.querySelector(".tweetaai-empty-state");
	if (emptyState) {
		emptyState.remove();
	}

	const div = document.createElement("div");
	div.className = "bubble ai streaming";
	div.textContent = "";
	messages.appendChild(div);
	messages.scrollTop = messages.scrollHeight;
	return div;
}

function autoResizeTextarea(textarea) {
	textarea.style.height = "auto";
	textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

function updateSendButton() {
	const button = document.getElementById("tweetaaiSendButton");
	const textarea = document.getElementById("tweetaai-message");
	if (!button || !textarea) return;

	const hasText = textarea.value.trim().length > 0;
	button.disabled = isLoading || !hasText;
	button.textContent = isLoading ? "Sending..." : "Send";
}

async function streamChatResponse(message, token) {
	abortController = new AbortController();

	try {
		const response = await fetch("/api/tweetaai/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ message, stream: true }),
			signal: abortController.signal,
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || "Network error");
		}

		if (!response.body) {
			const data = await response.json();
			return data.reply || "No response";
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let result = "";

		currentStreamElement = createStreamingMessage();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split("\n");

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6);
					if (data === "[DONE]") {
						currentStreamElement.classList.remove("streaming");
						return result;
					}

					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices?.[0]?.delta?.content;
						if (content) {
							result += content;
							currentStreamElement.textContent = result;
							const messages = document.getElementById("tweetaai-messages");
							messages.scrollTop = messages.scrollHeight;
						}
					} catch {
						console.warn("Failed to parse streaming chunk:", data);
					}
				}
			}
		}

		currentStreamElement.classList.remove("streaming");
		return result;
	} catch (error) {
		if (error.name === "AbortError") {
			throw new Error("Request cancelled");
		}
		throw error;
	}
}

function initializeTweetaAI() {
	const messageInput = document.getElementById("tweetaai-message");
	const chatForm = document.getElementById("tweetaaiChatForm");

	if (!messageInput || !chatForm) return;

	messageInput.addEventListener("input", () => {
		autoResizeTextarea(messageInput);
		updateSendButton();
	});

	messageInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			chatForm.dispatchEvent(new Event("submit"));
		}
	});

	chatForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		if (isLoading) {
			if (abortController) {
				abortController.abort();
				if (currentStreamElement) {
					currentStreamElement.textContent += " (cancelled)";
					currentStreamElement.classList.remove("streaming");
				}
				isLoading = false;
				updateSendButton();
			}
			return;
		}

		const textarea = document.getElementById("tweetaai-message");
		const text = textarea.value.trim();
		if (!text) return;

		if (!authToken) {
			toastQueue.add("Please sign in to use TweetaAI");
			return;
		}

		isLoading = true;
		updateSendButton();

		appendMessage(text, "user");
		textarea.value = "";
		autoResizeTextarea(textarea);

		try {
			await streamChatResponse(text, authToken);
		} catch (error) {
			console.error("TweetaAI error:", error);

			if (currentStreamElement) {
				currentStreamElement.remove();
			}

			let errorMessage =
				"Network error communicating with TweetaAI. Please try again.";
			if (error.message.includes("token") || error.message.includes("auth")) {
				errorMessage = "Authentication error. Please sign in again.";
				toastQueue.add("Please sign in again to continue");
			} else if (error.message !== "Request cancelled") {
				errorMessage = `Error: ${error.message}`;
			}

			if (error.message !== "Request cancelled") {
				appendMessage(errorMessage, "ai");
			}
		} finally {
			isLoading = false;
			updateSendButton();
			textarea.focus();
			currentStreamElement = null;
			abortController = null;
		}
	});

	updateSendButton();
}

document.getElementById("aiBtn")?.addEventListener("click", () => {
	switchPage("tweetaai", {
		path: "/tweetaai",
		recoverState: () => {
			setTimeout(() => {
				initializeTweetaAI();
			}, 0);
		},
	});
});

export { initializeTweetaAI };
