export const authToken = localStorage.getItem("authToken");

(async () => {
	if (!authToken) {
		cookieStore.delete("agree");
		window.location.href = "/";
		return;
	}

	const response = await fetch("/api/auth/me", {
		headers: { Authorization: `Bearer ${authToken}` },
	});

	const { user, error } = await response.json();

	if (error || !user) {
		localStorage.removeItem("authToken");
		window.location.href = "/";
		return;
	}

	document.querySelector(".account img").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector("#compose-avatar").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector(".account").addEventListener("click", () => {
		window.location.href = `/account`;
	});
})();
