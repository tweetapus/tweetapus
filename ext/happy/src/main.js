(() => {
	const boot = () => {
		const navHost = document.querySelector(".sidebar nav");
		const contentHost = document.querySelector(".col-lg-10 .p-4");
		if (!navHost || !contentHost) return false;
		if (document.getElementById("happies-section")) return true;

		const { section, addBtn, emptyState, list } = createHappiesSection();
		contentHost.appendChild(section);
		const navLink = createNavLink();
		navHost.appendChild(navLink);
		wireInteractions({ navLink, section, addBtn, emptyState, list });
		return true;
	};

	const createNavLink = () => {
		const link = document.createElement("a");
		link.className = "nav-link";
		link.href = "#";
		link.dataset.section = "happies";
		link.title = "Secret Happies";
		const icon = document.createElement("i");
		icon.className = "bi bi-emoji-laughing";
		link.appendChild(icon);
		link.appendChild(document.createTextNode(" Happies"));
		return link;
	};

	const createHappiesSection = () => {
		const section = document.createElement("div");
		section.id = "happies-section";
		section.className = "section d-none";

		const header = document.createElement("div");
		header.className = "d-flex align-items-center justify-content-between mb-3";
		section.appendChild(header);

		const headingWrap = document.createElement("div");
		header.appendChild(headingWrap);

		const title = document.createElement("h4");
		title.className = "mb-1";
		title.textContent = "Happies";
		headingWrap.appendChild(title);

		const subtitle = document.createElement("p");
		subtitle.className = "text-muted mb-0";
		subtitle.textContent = "Private gratitude feed for admins.";
		headingWrap.appendChild(subtitle);

		const addBtn = document.createElement("button");
		addBtn.type = "button";
		addBtn.className = "btn btn-success";
		addBtn.id = "happiesAddBtn";
		addBtn.textContent = "Add Happy";
		header.appendChild(addBtn);

		const emptyState = document.createElement("div");
		emptyState.id = "happiesEmpty";
		emptyState.className = "alert alert-info d-none";
		emptyState.textContent = "No happies yet. Share the first one.";
		section.appendChild(emptyState);

		const list = document.createElement("div");
		list.id = "happiesList";
		list.className = "row g-3";
		section.appendChild(list);

		return { section, addBtn, emptyState, list };
	};

	const wireInteractions = ({ navLink, section, addBtn, emptyState, list }) => {
		const happies = [];
		const moods = ["radiant", "calm", "sparkly", "brave", "zen", "buoyant"];
		const seeds = [
			"Community uptime held steady all week.",
			"Reports cleared before lunch every day.",
			"New creators praised the welcoming vibe.",
		];
		const formatter = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});

		const render = () => {
			list.textContent = "";
			if (!happies.length) {
				emptyState.classList.remove("d-none");
				return;
			}
			emptyState.classList.add("d-none");
			happies.forEach((entry) => {
				const column = document.createElement("div");
				column.className = "col-md-6";
				const card = document.createElement("div");
				card.className = "card bg-dark border border-success h-100 shadow-sm";
				const cardBody = document.createElement("div");
				cardBody.className = "card-body d-flex flex-column";
				const badgeRow = document.createElement("div");
				badgeRow.className = "d-flex justify-content-between mb-2";
				const moodBadge = document.createElement("span");
				moodBadge.className = "badge bg-success";
				moodBadge.textContent = `${entry.score} happies`;
				const toneBadge = document.createElement("span");
				toneBadge.className = "badge bg-secondary text-uppercase";
				toneBadge.textContent = entry.mood;
				badgeRow.appendChild(moodBadge);
				badgeRow.appendChild(toneBadge);
				const message = document.createElement("p");
				message.className = "mb-2 fs-5";
				message.textContent = entry.text;
				const meta = document.createElement("small");
				meta.className = "text-muted";
				meta.textContent = `${entry.source} • ${formatter.format(entry.timestamp)}`;
				cardBody.appendChild(badgeRow);
				cardBody.appendChild(message);
				cardBody.appendChild(meta);
				card.appendChild(cardBody);
				column.appendChild(card);
				list.appendChild(column);
			});
		};

		const addHappy = (payload) => {
			if (!payload || !payload.text) return;
			happies.unshift({
				id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				text: payload.text.trim(),
				mood: payload.mood || moods[Math.floor(Math.random() * moods.length)],
				score: payload.score || Math.floor(50 + Math.random() * 50),
				timestamp: payload.timestamp || new Date(),
				source: payload.source || "System",
			});
			if (happies.length > 8) {
				happies.pop();
			}
			render();
		};

		const revealSection = (event) => {
			event.preventDefault();
			if (
				window.adminPanel &&
				typeof window.adminPanel.showSection === "function"
			) {
				window.adminPanel.showSection("happies");
				if (typeof window.adminPanel.updateActiveNav === "function") {
					window.adminPanel.updateActiveNav(navLink);
				}
			} else {
				document
					.querySelectorAll(".section")
					.forEach((node) => node.classList.add("d-none"));
				section.classList.remove("d-none");
			}
			render();
		};

		navLink.addEventListener("click", revealSection);

		addBtn.addEventListener("click", () => {
			const value = window.prompt("What made you smile today?");
			if (!value) return;
			addHappy({ text: value, source: "You" });
		});

		seeds.forEach((seed, index) => {
			addHappy({
				text: seed,
				source: index === 0 ? "Ops" : index === 1 ? "Safety" : "Creators",
				timestamp: new Date(Date.now() - (index + 1) * 3600 * 1000),
			});
		});
	};

	const init = () => {
		if (boot()) return;
		let retries = 0;
		const interval = setInterval(() => {
			retries += 1;
			if (boot() || retries > 40) {
				clearInterval(interval);
			}
		}, 250);
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
