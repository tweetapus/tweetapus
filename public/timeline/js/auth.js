export const authToken = localStorage.getItem("authToken");

let _user;

const closeDropdown = (dropdown) => {
	if (!dropdown) return;
	dropdown.classList.remove("open");
	const onTransitionEnd = (ev) => {
		if (ev.propertyName === "opacity") {
			dropdown.style.display = "none";
			dropdown.removeEventListener("transitionend", onTransitionEnd);
		}
	};
	const fallback = setTimeout(() => {
		if (getComputedStyle(dropdown).opacity === "0") {
			dropdown.style.display = "none";
		}
		clearTimeout(fallback);
	}, 300);
	dropdown.addEventListener("transitionend", onTransitionEnd);
};

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
	const outsideClickHandler = (e) => {
		const accountBtn = document.querySelector(".account");
		const dropdown = document.getElementById("accountDropdown");
		if (!dropdown) return;
		if (!accountBtn.contains(e.target) && !dropdown.contains(e.target)) {
			closeDropdown(dropdown);
			document.removeEventListener("click", outsideClickHandler);
		}
	};

	document.querySelector(".account").addEventListener("click", (e) => {
		e.stopPropagation();
		e.preventDefault();
		const dropdown = document.getElementById("accountDropdown");
		if (!dropdown.classList.contains("open")) {
			dropdown.style.display = "block";
			void dropdown.offsetHeight;
			dropdown.classList.add("open");
			document.addEventListener("click", outsideClickHandler);
		} else {
			closeDropdown(dropdown);
			document.removeEventListener("click", outsideClickHandler);
		}
	});

	document.getElementById("myProfileLink").addEventListener("click", (e) => {
		e.preventDefault();
		const dropdown = document.getElementById("accountDropdown");
		closeDropdown(dropdown);
		import("./profile.js").then(({ default: openProfile }) => {
			openProfile(_user.username);
		});
	});

	document.getElementById("settingsLink").addEventListener("click", (e) => {
		e.preventDefault();
		const dropdown = document.getElementById("accountDropdown");
		closeDropdown(dropdown);
		import("./settings.js").then(({ openSettings }) => {
			openSettings("main");
		});
	});

	document.getElementById("signOutLink").addEventListener("click", (e) => {
		e.preventDefault();
		const dropdown = document.getElementById("accountDropdown");
		closeDropdown(dropdown);
		localStorage.removeItem("authToken");
		window.location.href = "/";
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
