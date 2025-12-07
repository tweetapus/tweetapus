import { Database } from "bun:sqlite";

const db = new Database("./.data/db.sqlite");

const parseTransparency = (jsonStr) => {
	if (!jsonStr) return null;
	try {
		return JSON.parse(jsonStr);
	} catch {
		return null;
	}
};

const calculateTransparencyScore = async (creationData, loginData) => {
	let score = 100;
	const issues = [];

	if (!creationData && !loginData) {
		return { score: 0, issues: ["No transparency data available"] };
	}

	const creation = parseTransparency(creationData);
	const login = parseTransparency(loginData);

	if (creation) {
		if (creation.vpn === true) {
			score -= 30;
			issues.push("Account created using VPN");
		}

		if (!creation.city || !creation.country) {
			score -= 10;
			issues.push("Missing location data at creation");
		}
	} else {
		score -= 15;
		issues.push("No account creation transparency data");
	}

	if (login) {
		if (login.vpn === true && !login.suppress_vpn_warning) {
			score -= 20;
			issues.push("Recent login using VPN");
		}

		if (!login.city || !login.country) {
			score -= 5;
			issues.push("Missing location data at last login");
		}

		if (creation && login) {
			if (creation.country !== login.country) {
				score -= 15;
				issues.push(
					`Country mismatch: created in ${creation.country}, last login from ${login.country}`,
				);
			}

			if (creation.continent && login.continent) {
				if (creation.continent !== login.continent) {
					score -= 25;
					issues.push(
						`Continent mismatch: created in ${creation.continent}, last login from ${login.continent}`,
					);
				}
			}
		}
	} else {
		score -= 10;
		issues.push("No login transparency data");
	}

	score = Math.max(0, Math.min(100, score));

	return { score, issues };
};

const recalculateTransparencyForUser = async (userId) => {
	const user = db
		.query(
			"SELECT id, username, account_creation_transparency, account_login_transparency FROM users WHERE id = ?",
		)
		.get(userId);

	if (!user) {
		console.error(`User ${userId} not found`);
		return null;
	}

	const { score, issues } = await calculateTransparencyScore(
		user.account_creation_transparency,
		user.account_login_transparency,
	);

	console.log(`\nUser: ${user.username} (${user.id})`);
	console.log(`Transparency Score: ${score}/100`);
	if (issues.length > 0) {
		console.log("Issues:");
		for (const issue of issues) {
			console.log(`  - ${issue}`);
		}
	}

	return { userId: user.id, username: user.username, score, issues };
};

const recalculateAllTransparency = async () => {
	const users = db
		.query(
			"SELECT id, username, account_creation_transparency, account_login_transparency FROM users",
		)
		.all();

	console.log(
		`\nRecalculating transparency scores for ${users.length} users...\n`,
	);

	const results = [];
	let processed = 0;

	for (const user of users) {
		const { score, issues } = await calculateTransparencyScore(
			user.account_creation_transparency,
			user.account_login_transparency,
		);

		results.push({
			userId: user.id,
			username: user.username,
			score,
			issues,
		});

		processed++;
		if (processed % 100 === 0) {
			console.log(`Processed ${processed}/${users.length} users...`);
		}
	}

	console.log(`\nCompleted! Processed ${results.length} users.\n`);

	const scoreDistribution = {
		"90-100": 0,
		"75-89": 0,
		"50-74": 0,
		"25-49": 0,
		"0-24": 0,
	};

	for (const result of results) {
		if (result.score >= 90) scoreDistribution["90-100"]++;
		else if (result.score >= 75) scoreDistribution["75-89"]++;
		else if (result.score >= 50) scoreDistribution["50-74"]++;
		else if (result.score >= 25) scoreDistribution["25-49"]++;
		else scoreDistribution["0-24"]++;
	}

	console.log("Score Distribution:");
	for (const [range, count] of Object.entries(scoreDistribution)) {
		console.log(`  ${range}: ${count} users`);
	}

	const lowScoreUsers = results
		.filter((r) => r.score < 50)
		.sort((a, b) => a.score - b.score)
		.slice(0, 20);

	if (lowScoreUsers.length > 0) {
		console.log("\nTop 20 Users with Lowest Transparency Scores:");
		for (const user of lowScoreUsers) {
			console.log(`  ${user.username}: ${user.score}/100`);
			for (const issue of user.issues) {
				console.log(`    - ${issue}`);
			}
		}
	}

	return results;
};

const main = async () => {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log("Usage:");
		console.log("  bun scripts/recalculate-transparency.js all");
		console.log("  bun scripts/recalculate-transparency.js <username>");
		console.log("  bun scripts/recalculate-transparency.js <user_id>");
		process.exit(0);
	}

	const target = args[0];

	if (target === "all") {
		await recalculateAllTransparency();
	} else {
		const userByUsername = db
			.query("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
			.get(target);
		const userById = db.query("SELECT id FROM users WHERE id = ?").get(target);

		const userId = userByUsername?.id || userById?.id;

		if (!userId) {
			console.error(`User not found: ${target}`);
			process.exit(1);
		}

		await recalculateTransparencyForUser(userId);
	}

	db.close();
};

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
