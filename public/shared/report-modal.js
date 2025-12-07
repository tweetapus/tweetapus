import toastQueue from "./toasts.js";
import { createModal } from "./ui-utils.js";

export function showReportModal({ type, id, username }) {
	const modalContent = document.createElement("div");
	modalContent.className = "report-modal-content";
	modalContent.style.cssText = `
    padding: 20px;
    max-width: 500px;
    width: 100%;
  `;

	const description = document.createElement("p");
	description.style.cssText = `
    margin-bottom: 20px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.5;
    margin-top: -30px;
  `;
	description.textContent = `Help us understand why you're reporting this ${type}. Your report will be reviewed by our moderation team.`;

	const form = document.createElement("form");
	form.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
  `;

	const reasonLabel = document.createElement("label");
	reasonLabel.style.cssText = `
    font-weight: 500;
    color: var(--text-primary);
    font-size: 14px;
  `;
	reasonLabel.textContent = "Reason *";

	const reasonSelect = document.createElement("select");
	reasonSelect.required = true;
	reasonSelect.style.cssText = `
    padding: 10px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
  `;

	const reasons = [
		{ value: "", label: "Select a reason..." },
		{ value: "spam", label: "Spam or misleading" },
		{ value: "harassment", label: "Harassment or bullying" },
		{ value: "hate_speech", label: "Hate speech or symbols" },
		{ value: "violence", label: "Violence or threats" },
		{ value: "nsfw", label: "NSFW content" },
		{ value: "impersonation", label: "Impersonation" },
		{ value: "misinformation", label: "False information" },
		{ value: "illegal", label: "Illegal activity" },
		{ value: "other", label: "Other" },
	];

	for (const reason of reasons) {
		const option = document.createElement("option");
		option.value = reason.value;
		option.textContent = reason.label;
		reasonSelect.appendChild(option);
	}

	const additionalLabel = document.createElement("label");
	additionalLabel.style.cssText = `
    font-weight: 500;
    color: var(--text-primary);
    font-size: 14px;
  `;
	additionalLabel.textContent = "Additional information (optional)";

	const additionalTextarea = document.createElement("textarea");
	additionalTextarea.placeholder = "Provide any additional context...";
	additionalTextarea.rows = 4;
	additionalTextarea.style.cssText = `
    padding: 10px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    resize: vertical;
    font-family: inherit;
  `;

	const confirmationLabel = document.createElement("label");
	confirmationLabel.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
  `;

	const confirmationCheckbox = document.createElement("input");
	confirmationCheckbox.type = "checkbox";
	confirmationCheckbox.required = true;
	confirmationCheckbox.style.cssText = `
    margin-top: 2px;
    cursor: pointer;
  `;

	const confirmationText = document.createElement("span");
	confirmationText.textContent =
		"I understand that false reports may result in restrictions on my account.";

	confirmationLabel.appendChild(confirmationCheckbox);
	confirmationLabel.appendChild(confirmationText);

	const buttonGroup = document.createElement("div");
	buttonGroup.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 8px;
  `;

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.textContent = "Cancel";
	cancelButton.style.cssText = `
    padding: 10px 20px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  `;

	const submitButton = document.createElement("button");
	submitButton.type = "submit";
	submitButton.textContent = "Submit report";
	submitButton.style.cssText = `
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: #d32f2f;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  `;

	buttonGroup.appendChild(cancelButton);
	buttonGroup.appendChild(submitButton);

	form.appendChild(reasonLabel);
	form.appendChild(reasonSelect);
	form.appendChild(additionalLabel);
	form.appendChild(additionalTextarea);
	form.appendChild(confirmationLabel);
	form.appendChild(buttonGroup);

	modalContent.appendChild(description);
	modalContent.appendChild(form);

	const { close } = createModal({
		title: `Report ${type === "post" ? "tweet by" : ""}${
			username ? ` @${username}` : ""
		}`,
		content: modalContent,
		className: "report-modal",
	});

	cancelButton.addEventListener("click", close);

	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		if (!reasonSelect.value) {
			toastQueue.add("<h1>Please select a reason</h1>");
			return;
		}

		if (!confirmationCheckbox.checked) {
			toastQueue.add("<h1>Please confirm the report terms</h1>");
			return;
		}

		submitButton.disabled = true;
		submitButton.textContent = "Submitting...";

		try {
			const query = (await import("../app/js/api.js")).default;
			const data = await query("/reports/create", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					reported_type: type,
					reported_id: id,
					reason: reasonSelect.value,
					additional_info: additionalTextarea.value || null,
				}),
			});

			if (data.success) {
				toastQueue.add(
					"<h1>Report submitted successfully</h1><p>Thank you for helping keep Tweetapus safe.</p>",
				);
				close();
			} else {
				toastQueue.add(`<h1>${data.error || "Failed to submit report"}</h1>`);
				submitButton.disabled = false;
				submitButton.textContent = "Submit Report";
			}
		} catch (error) {
			console.error("Error submitting report:", error);
			toastQueue.add("<h1>Network error. Please try again.</h1>");
			submitButton.disabled = false;
			submitButton.textContent = "Submit Report";
		}
	});
}
