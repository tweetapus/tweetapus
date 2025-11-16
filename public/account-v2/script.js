(async () => {
	const impersonateToken = new URLSearchParams(window.location.search).get(
		"impersonate",
	);

	if (impersonateToken) {
		localStorage.setItem("authToken", decodeURIComponent(impersonateToken));
		window.history.replaceState({}, document.title, window.location.pathname);

		Reflect.set(
			document,
			"cookie",
			`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
		);
		setTimeout(() => {
			window.location.href = "/timeline/";
		}, 200);
	}
})();

document
	.querySelector(".create-account")
	.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		const initialHtml = document.querySelector(".create-account").innerHTML;

		const username = document.getElementById("username").value.trim();
		if (!username) {
			document.getElementById("username").focus();
			document.querySelector(".init-form").style.transition = "all .2s";

			setTimeout(() => {
				document.querySelector(".init-form").style.transform = "scale(1.04)";
			}, 5);

			setTimeout(() => {
				document.querySelector(".init-form").style.transform = "scale(1)";
			}, 200);
			return;
		}

		document.querySelector(".create-account").style.width = `${document.querySelector(".create-account").offsetWidth
			}px`;

		document.querySelector(".create-account").classList.add("loading");
		document.querySelector(".create-account").disabled = true;
		document.querySelector(".create-account").innerHTML =
			`<svg fill="currentColor" viewBox="0 0 16 16" width="20" height="20" style="color:#c5c5c8" class="iosspin"><rect width="2" height="4" x="2.35" y="3.764" opacity=".93" rx="1" transform="rotate(-45 2.35 3.764)"></rect><rect width="4" height="2" x="1" y="7" opacity=".78" rx="1"></rect><rect width="2" height="4" x="5.179" y="9.41" opacity=".69" rx="1" transform="rotate(45 5.179 9.41)"></rect><rect width="2" height="4" x="7" y="11" opacity=".62" rx="1"></rect><rect width="2" height="4" x="9.41" y="10.824" opacity=".48" rx="1" transform="rotate(-45 9.41 10.824)"></rect><rect width="4" height="2" x="11" y="7" opacity=".38" rx="1"></rect><rect width="2" height="4" x="12.239" y="2.35" opacity=".3" rx="1" transform="rotate(45 12.239 2.35)"></rect><rect width="2" height="4" x="7" y="1" rx="1"></rect></svg>`;

		document.getElementById("username").blur();
		document.getElementById("username").disabled = true;

		const { available } = await (
			await fetch(
				`/api/auth/username-availability?username=${encodeURIComponent(
					username,
				)}`,
			)
		).json();

		if (!available) {
			document.querySelector(".create-account").classList.remove("loading");
			document.querySelector(".create-account").disabled = false;
			document.querySelector(".create-account").innerHTML = initialHtml;
			document.querySelector(".create-account").style.width = "";
			document.getElementById("username").disabled = false;

			document.getElementById("username").focus();
			document.getElementById("username").select();

			document.querySelector(".init-form p").innerText =
				"Username taken, try another.";
			document.querySelector(".init-form p").style.color = "var(--error-color)";
			document.querySelector(".init-form p").style.transition =
				"opacity .4s, filter .4s, transform .4s";

			setTimeout(() => {
				document.querySelector(".init-form p").style.opacity = "0";
				document.querySelector(".init-form p").style.filter = "blur(2px)";
				document.querySelector(".init-form p").style.transform = "scale(0.9)";
			}, 1500);
			setTimeout(() => {
				document.querySelector(".init-form p").innerText =
					"Choose your username";

				document.querySelector(".init-form p").style.color = "";
				document.querySelector(".init-form p").style.opacity = "";
				document.querySelector(".init-form p").style.filter = "";
				document.querySelector(".init-form p").style.transform = "";
			}, 1700);

			return;
		}

		const cap = new window.Cap({
			apiEndpoint: "/api/auth/cap/",
		});

		let challengeToken;

		cap.solve().then((solution) => {
			challengeToken = solution.token;
		});

		setTimeout(() => {
			document.querySelector(".create-account").classList.remove("loading");
			document.querySelector(".create-account").disabled = false;
			document.querySelector(".create-account").innerHTML = initialHtml;
			document.querySelector(".create-account").style.width = "";
			document.getElementById("username").disabled = false;
		}, 300);

		const modal = document.querySelector(".model-wrapper.create-step2");

		modal.style.display = "flex";

		modal.querySelector("#create-username").value = username;
		modal.querySelector("#create-password").value = "";
		modal.querySelector("#create-password").focus();

		modal.querySelector(".finish").onclick = async () => {
			if (modal.querySelector("#create-username").value.trim() === "") {
				modal.querySelector("#create-username").focus();
				return;
			}

			if (modal.querySelector("#create-password").value.trim() === "") {
				modal.querySelector("#create-password").focus();
				return;
			}

			modal.querySelector(".finish").disabled = true;
			modal.querySelector(".finish").innerHTML =
				`<svg fill="currentColor" viewBox="0 0 16 16" width="20" height="20" style="color:#c5c5c8" class="iosspin"><rect width="2" height="4" x="2.35" y="3.764" opacity=".93" rx="1" transform="rotate(-45 2.35 3.764)"></rect><rect width="4" height="2" x="1" y="7" opacity=".78" rx="1"></rect><rect width="2" height="4" x="5.179" y="9.41" opacity=".69" rx="1" transform="rotate(45 5.179 9.41)"></rect><rect width="2" height="4" x="7" y="11" opacity=".62" rx="1"></rect><rect width="2" height="4" x="9.41" y="10.824" opacity=".48" rx="1" transform="rotate(-45 9.41 10.824)"></rect><rect width="4" height="2" x="11" y="7" opacity=".38" rx="1"></rect><rect width="2" height="4" x="12.239" y="2.35" opacity=".3" rx="1" transform="rotate(45 12.239 2.35)"></rect><rect width="2" height="4" x="7" y="1" rx="1"></rect></svg>`;

			if (!challengeToken) {
				await new Promise((resolve) => {
					const i = setInterval(() => {
						if (challengeToken) {
							clearInterval(i);
							resolve();
						}
					}, 50);
				});
			}

			const { token, success, error } = await (
				await fetch("/api/auth/register-with-password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: modal.querySelector("#create-username").value,
						password: modal.querySelector("#create-password").value,
						challengeToken,
					}),
				})
			).json();

			if (error || !success) {
				modal.querySelector(".finish").innerText = error || "An error occurred";

				setTimeout(() => {
					modal.querySelector(".finish").innerText = "Create your account";
					modal.querySelector(".finish").disabled = false;
				}, 1500);
				return;
			}

			if (success && token) {
				localStorage.setItem("authToken", token);
				setTimeout(() => {
					location.reload();
				}, 300);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
						return;
					}
				} catch { }

				Reflect.set(
					document,
					"cookie",
					`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
				);
			}
		};
	});

document.getElementById("username").addEventListener("input", (e) => {
	if (e.target.value.length > 20) {
		e.target.value = e.target.value.slice(0, 20);
	}

	if (e.target.value.trim() === "") {
		e.target.value = "";
	}

	e.target.value = e.target.value
		.replaceAll(" ", "-")
		.replace(/[^a-zA-Z0-9._-]/g, "");
});

document.getElementById("username").addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		document.querySelector(".create-account").click();
	}
});

document.querySelector(".log-in").addEventListener("click", async (e) => {
	e.preventDefault();
	e.stopPropagation();

	const passwordModal = document.createElement("div");
	passwordModal.className = "login-modal-backdrop";

	const passwordContent = document.createElement("div");
	passwordContent.className = "login-modal-content";

	const passwordTitle = document.createElement("h2");
	passwordTitle.className = "login-modal-title";
	passwordTitle.textContent = "Log in with password";

	const passkeyLoginButton = document.createElement("button");
	passkeyLoginButton.type = "button";
	passkeyLoginButton.className = "btn btn-primary";
	passkeyLoginButton.textContent = "Log in with passkey";

	passkeyLoginButton.addEventListener("click", async () => {
		try {
			if (!window.SimpleWebAuthnBrowser) {
				alert("WebAuthn not available. Please try password login.");
				return;
			}

			const response = await fetch(
				"/api/auth/generate-authentication-options",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);

			const data = await response.json();

			if (!data.options) {
				throw new Error(
					data.error || "Failed to generate authentication options",
				);
			}

			const credential = await window.SimpleWebAuthnBrowser.startAuthentication(
				data.options,
			);

			const verifyResponse = await fetch("/api/auth/verify-authentication", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedChallenge: data.expectedChallenge,
					credential,
				}),
			});

			const verifyData = await verifyResponse.json();

			if (verifyData.token) {
				localStorage.setItem("authToken", verifyData.token);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
					} else {
						Reflect.set(
							document,
							"cookie",
							`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
						);
					}
				} catch { }

				window.location.href = "/timeline/";
			} else {
				alert(verifyData.error || "Authentication failed");
			}
		} catch (err) {
			console.error("Passkey login error:", err);
		}

	});

	const form = document.createElement("form");
	form.className = "password-login-form";

	const usernameInput = document.createElement("input");
	usernameInput.type = "text";
	usernameInput.placeholder = "Username";
	usernameInput.required = true;

	const passwordInput = document.createElement("input");
	passwordInput.type = "password";
	passwordInput.placeholder = "Password";
	passwordInput.required = true;

	const formActions = document.createElement("div");
	formActions.className = "form-actions";

	const loginBtn = document.createElement("button");
	loginBtn.type = "submit";
	loginBtn.className = "primary";
	loginBtn.textContent = "Log in";

	const backBtn = document.createElement("button");
	backBtn.type = "button";
	backBtn.className = "secondary";
	backBtn.textContent = "Back";

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const username = usernameInput.value.trim();
		const password = passwordInput.value.trim();

		if (!username || !password) {
			alert("Please enter both username and password");
			return;
		}

		try {
			const { token, error } = await (
				await fetch("/api/auth/basic-login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ username, password }),
				})
			).json();

			if (token) {
				localStorage.setItem("authToken", token);

				try {
					if (window.cookieStore?.set) {
						await window.cookieStore.set({
							name: "agree",
							value: "yes",
							expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT"),
						});
					} else {
						Reflect.set(
							document,
							"cookie",
							`agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`,
						);
					}
				} catch { }

				window.location.href = "/timeline/";
			} else {
				alert(error || "Login failed");
			}
		} catch (err) {
			console.error("Login error:", err);
			alert("Login failed. Please try again.");
		}
	});

	backBtn.addEventListener("click", () => {
		passwordModal.remove();
	});

	formActions.appendChild(loginBtn);
	formActions.appendChild(backBtn);
	form.appendChild(usernameInput);
	form.appendChild(passwordInput);
	form.appendChild(formActions);
	passwordContent.appendChild(passwordTitle);
	passwordContent.appendChild(passkeyLoginButton);
	passwordContent.appendChild(form);
	passwordModal.appendChild(passwordContent);
	document.body.appendChild(passwordModal);

	usernameInput.focus();
});

document
	.querySelector(".model-wrapper .close")
	.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();

		document.querySelector(".model-wrapper").style.transition =
			"top .3s, opacity .3s";

		setTimeout(() => {
			document.querySelector(".model-wrapper").style.top = "-100px";
			document.querySelector(".model-wrapper").style.opacity = "0";
		}, 10);

		setTimeout(() => {
			document.querySelector(".model-wrapper").style.display = "none";
			document.querySelector(".model-wrapper").style.opacity = "";
			document.querySelector(".model-wrapper").style.top = "";
			document.querySelector(".model-wrapper").style.transition = "";
		}, 500);
	});
