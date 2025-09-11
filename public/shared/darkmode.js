const updateToggleButtons = () => {
	const buttons = document.querySelectorAll(".dark-toggle");
	const isDark = document.documentElement.classList.contains("dark");

	buttons.forEach((button) => {
		const icon = button.querySelector(".toggle-icon");
		const text = button.querySelector(".toggle-text");

		if (icon) {
			icon.innerHTML = isDark
				? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>`
				: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>`;
		}

		if (text) {
			text.textContent = isDark ? "Light" : "Dark";
		}
	});
};

const toggle = () => {
	if (document.documentElement.classList.contains("dark")) {
		document.documentElement.classList.remove("dark");
		localStorage.setItem("theme", "light");
	} else {
		document.documentElement.classList.add("dark");
		localStorage.setItem("theme", "dark");
	}
	updateToggleButtons();
};

const savedTheme = localStorage.getItem("theme");
const systemDarkMode = window.matchMedia(
	"(prefers-color-scheme: dark)",
).matches;

if (savedTheme === "dark" || (!savedTheme && systemDarkMode)) {
	document.documentElement.classList.add("dark");
} else {
	document.documentElement.classList.remove("dark");
}

window
	.matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", (e) => {
		if (!localStorage.getItem("theme")) {
			if (e.matches) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
			updateToggleButtons();
		}
	});

updateToggleButtons();

document.querySelectorAll(".dark-toggle").forEach((button) => {
	button.addEventListener("click", toggle);
});
