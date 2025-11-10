(async () => {
  const impersonateToken = new URLSearchParams(window.location.search).get(
    "impersonate"
  );

  if (impersonateToken) {
    localStorage.setItem("authToken", decodeURIComponent(impersonateToken));
    window.history.replaceState({}, document.title, window.location.pathname);

    Reflect.set(
      document,
      "cookie",
      `agree=yes; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`
    );
    setTimeout(() => {
      window.location.href = "/timeline/";
    }, 200);
  }
})();

document.querySelector(".create-account").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

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

  document.querySelector(".create-account").style.width = `${
    document.querySelector(".create-account").offsetWidth
  }px`;

  document.querySelector(".create-account").classList.add("loading");
  document.querySelector(".create-account").disabled = true;
  document.querySelector(
    ".create-account"
  ).innerHTML = `<svg fill="currentColor" viewBox="0 0 16 16" width="20" height="20" style="color:#c5c5c8" class="iosspin"><rect width="2" height="4" x="2.35" y="3.764" opacity=".93" rx="1" transform="rotate(-45 2.35 3.764)"></rect><rect width="4" height="2" x="1" y="7" opacity=".78" rx="1"></rect><rect width="2" height="4" x="5.179" y="9.41" opacity=".69" rx="1" transform="rotate(45 5.179 9.41)"></rect><rect width="2" height="4" x="7" y="11" opacity=".62" rx="1"></rect><rect width="2" height="4" x="9.41" y="10.824" opacity=".48" rx="1" transform="rotate(-45 9.41 10.824)"></rect><rect width="4" height="2" x="11" y="7" opacity=".38" rx="1"></rect><rect width="2" height="4" x="12.239" y="2.35" opacity=".3" rx="1" transform="rotate(45 12.239 2.35)"></rect><rect width="2" height="4" x="7" y="1" rx="1"></rect></svg>`;
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
    document.getElementById("createAccount").click();
  }
});

document.querySelector(".log-in").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  location.href = "/__old__account__"; // Stuck Cursor
});
