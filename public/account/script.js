import toastQueue from "../shared/toasts.js";

const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;

const elements = {
  title: document.querySelector("h1"),
  username: document.getElementById("username"),
  register: document.getElementById("register"),
  login: document.getElementById("login"),
  loginForm: document.getElementById("login-form"),
  status: document.getElementById("status"),
  basicLoginModal: document.getElementById("basicLoginModal"),
};

let authToken = null;
const currentUser = null;

const query = fetch;

const agreeCookieName = "agree";
const agreeCookieExpiry = new Date("Fri, 31 Dec 9999 23:59:59 GMT");

const persistAgreeCookie = async () => {
  try {
    if (window.cookieStore?.set) {
      await window.cookieStore.set({
        name: agreeCookieName,
        value: "yes",
        expires: agreeCookieExpiry,
      });
      return;
    }
  } catch (_) {}
  Reflect.set(
    document,
    "cookie",
    `${agreeCookieName}=yes; path=/; expires=${agreeCookieExpiry.toUTCString()}`
  );
};

function handleImpersonationToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const impersonateToken = urlParams.get("impersonate");

  if (impersonateToken) {
    localStorage.setItem("authToken", decodeURIComponent(impersonateToken));
    window.history.replaceState({}, document.title, window.location.pathname);
    persistAgreeCookie();

    setTimeout(() => {
      window.location.href = "/timeline/";
    }, 500);
    return true;
  }
  return false;
}

function checkExistingSession() {
  if (handleImpersonationToken()) {
    return;
  }

  const token = localStorage.getItem("authToken");
  if (!token) {
    document.querySelector(".loader").style.display = "none";
    return;
  }

  location.href = "/";
}

function showLoginForm() {
  authToken = null;
  localStorage.removeItem("authToken");
  elements.loginForm.style.display = "block";
  elements.username.value = "";
  elements.title.textContent = "Welcome to Tweetapus";
}

function setButtonsDisabled(disabled) {
  elements.register.disabled = disabled;
  elements.login.disabled = disabled;
}

async function handleRegistration() {
  const username = elements.username.value.trim();
  if (!username) {
    return elements.username.focus();
  }

  const accountType = document.querySelector(
    'input[name="accountType"]:checked'
  ).value;

  if (accountType === "password") {
    return await handlePasswordRegistration();
  } else {
    return await handlePasskeyRegistration();
  }
}

async function handlePasswordRegistration() {
  const username = elements.username.value.trim();
  const password = document.getElementById("password").value;

  if (!password) {
    toastQueue.add(`<h1>Password Required</h1><p>Please enter a password</p>`);
    return;
  }

  if (password.length < 6) {
    toastQueue.add(
      `<h1>Password Too Short</h1><p>Password must be at least 6 characters long</p>`
    );
    return;
  }

  setButtonsDisabled(true);

  try {
    const response = await fetch("/api/auth/register-with-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.error) {
      toastQueue.add(`<h1>Registration Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem("authToken", data.token);

      await persistAgreeCookie();
      location.href = "/";
    }
  } catch {
    toastQueue.add(
      `<h1>Registration Failed</h1><p>Unable to connect to server</p>`
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function handlePasskeyRegistration() {
  const username = elements.username.value.trim();

  setButtonsDisabled(true);

  try {
    const { options, challenge, error } = await (
      await query("/api/auth/generate-registration-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      })
    ).json();

    if (error) {
      toastQueue.add(`<h1>Unable to create account</h1><p>${error}</p>`);
      return;
    }

    const registrationResponse = await startRegistration({
      optionsJSON: options,
    });

    const verification = await (
      await query("/api/auth/verify-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          credential: registrationResponse,
          challenge,
        }),
      })
    ).json();

    if (!verification.verified) {
      toastQueue.add(
        `<h1>Unable to create account</h1><p>${verification.error || ""}</p>`
      );
    }

    authToken = verification.token;
    localStorage.setItem("authToken", authToken);

    await persistAgreeCookie();
    location.href = "/";
  } catch (error) {
    if (error.name === "NotAllowedError") return;

    toastQueue.add(
      `<h1>Unable to create account</h1><p>${error.message || ""}</p>`
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function handleAuthentication() {
  setButtonsDisabled(true);

  try {
    const { options, expectedChallenge, error } = await (
      await query("/api/auth/generate-authentication-options", {
        method: "POST",
      })
    ).json();

    if (error) {
      toastQueue.add(`<h1>Something's not right.</h1><p>${error || ""}</p>`);
      return;
    }

    const authenticationResponse = await startAuthentication({
      optionsJSON: options,
      mediation: "silent",
    });

    document.querySelector(".loader").style.display = "flex";
    document.querySelector(".loader").style.opacity = "0";
    setTimeout(() => {
      document.querySelector(".loader").style.opacity = "1";
    }, 150);

    const verification = await (
      await query("/api/auth/verify-authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedChallenge,
          credential: authenticationResponse,
        }),
      })
    ).json();

    document.querySelector(".loader").style.opacity = "0";
    setTimeout(() => {
      document.querySelector(".loader").style.display = "none";
    }, 150);

    if (verification.verified) {
      authToken = verification.token;
      localStorage.setItem("authToken", authToken);

      await persistAgreeCookie();
      location.href = "/";
    } else {
      toastQueue.add(
        `<h1>Something's not right.</h1><p>${verification.error}</p>`
      );
    }
  } catch (error) {
    if (error.name === "NotAllowedError") return;

    toastQueue.add(
      `<h1>Something's not right.</h1><p>${error.message || ""}</p>`
    );
  } finally {
    setButtonsDisabled(false);
  }
}

// Tab functionality
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;

    // Update active tab button
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Update active tab content
    document
      .querySelectorAll(".tab-content")
      .forEach((content) => content.classList.remove("active"));
    document.getElementById(`${tabName}-tab`).classList.add("active");
  });
});

elements.register.addEventListener("click", handleRegistration);
elements.login.addEventListener("click", handleAuthentication);
elements.username.addEventListener("input", (e) => {
  e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
});

elements.username.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleRegistration();
});

// Account type selection handler
document.querySelectorAll('input[name="accountType"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const passwordFields = document.getElementById("passwordFields");
    const claim = document.querySelector(".claim");

    if (e.target.value === "password") {
      passwordFields.style.display = "block";
      claim.innerHTML = claim.innerHTML.replace(
        "no email or password required",
        "secure password-based authentication"
      );
    } else {
      passwordFields.style.display = "none";
      claim.innerHTML = claim.innerHTML.replace(
        "secure password-based authentication",
        "no email or password required"
      );
    }
  });
});

// Modal handlers
function showModal(modal) {
  modal.style.display = "flex";
}

function hideModal(modal) {
  modal.style.display = "none";
}

document.getElementById("basicLoginLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  showModal(elements.basicLoginModal);
});

document
  .getElementById("closeBasicLoginModal")
  ?.addEventListener("click", () => {
    hideModal(elements.basicLoginModal);
  });

document.getElementById("cancelBasicLogin")?.addEventListener("click", () => {
  hideModal(elements.basicLoginModal);
});

document
  .getElementById("basicLoginForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("basicUsername").value.trim();
    const password = document.getElementById("basicPassword").value;

    if (!username || !password) {
      toastQueue.add(
        `<h1>Error</h1><p>Please enter both username and password</p>`
      );
      return;
    }

    try {
      const response = await fetch("/api/auth/basic-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.error) {
        toastQueue.add(`<h1>Login Failed</h1><p>${data.error}</p>`);
        return;
      }

      if (data.token) {
        authToken = data.token;
        localStorage.setItem("authToken", data.token);
        hideModal(elements.basicLoginModal);

        await persistAgreeCookie();

        location.href = "/";
      }
    } catch {
      toastQueue.add(`<h1>Login Failed</h1><p>Unable to connect to server</p>`);
    }
  });

checkExistingSession();

document.getElementById("profile-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentUser?.username) {
    window.location.href = `/@${currentUser.username}`;
  } else {
    window.location.href = "/";
  }
});

document.querySelector(".legal").addEventListener("click", (e) => {
  e.preventDefault();
  const iframeWrapper = document.createElement("div");
  iframeWrapper.classList.add("iframe-wrapper");
  document.body.appendChild(iframeWrapper);

  iframeWrapper.addEventListener("click", (e) => {
    if (e.target !== iframeWrapper) iframeWrapper.remove();
  });

  const iframe = document.createElement("iframe");
  iframe.src = "/legal";
  iframeWrapper.appendChild(iframe);

  const closeButton = document.createElement("button");
  closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  iframeWrapper.appendChild(closeButton);
});

window.onerror = (message, source, lineno, colno) => {
  toastQueue.add(
    `<h1>${message}</h1><p>at ${lineno || "?"}:${colno || "?"} in ${
      source || "?"
    }</p>`
  );

  return false;
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;

  if (reason instanceof Error) {
    toastQueue.add(
      `<h1>${reason.message}</h1><p>at ${reason.lineNumber || "?"}:${
        reason.columnNumber || "?"
      } in ${reason.fileName || "?"}</p>`
    );
  } else {
    toastQueue.add(`<h1>${String(reason)}</h1><p>Error</p>`);
  }
};
