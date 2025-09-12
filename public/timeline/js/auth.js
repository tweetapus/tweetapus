export const authToken = localStorage.getItem("authToken");

let _user;

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
	_user = user;
	document.querySelector(".account img").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector("#compose-avatar").src =
		user.avatar || `https://unavatar.io/${user.username}`;
	document.querySelector(".account").addEventListener("click", () => {
		window.location.href = `/account`;
	});

	document.querySelector(".loader").style.opacity = "0";
	setTimeout(() => {
		document.querySelector(".loader").style.display = "none";
	}, 150);
})();

export default function getUser() {
	return new Promise((resolve) => {
		if (_user) resolve(_user);

		const interval = setInterval(() => {
			if (!_user) return;
			resolve(_user);
			clearInterval(interval);
		}, 1);
	});
}
