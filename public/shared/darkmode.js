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
		}
	});