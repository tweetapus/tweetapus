import { Database } from "bun:sqlite";

const db = new Database("./.data/db.sqlite");

const calculateBlockWeight = (blockerData) => {
	const { followerCount, totalBlocksGiven } = blockerData;

	let weight = 1.0;

	if (totalBlocksGiven > 10) {
		weight *= 1.0 / (1.0 + Math.log10(totalBlocksGiven / 10));
	}

	if (followerCount < 10) {
		weight *= 0.3;
	} else if (followerCount < 50) {
		weight *= 0.5;
	} else if (followerCount < 100) {
		weight *= 0.7;
	} else if (followerCount < 500) {
		weight *= 0.85;
	}

	weight = Math.max(0.1, Math.min(1.0, weight));

	return weight;
};

const recalculateWeightedBlocksForUser = (userId) => {
	const user = db
		.query("SELECT id, username, blocked_by_count FROM users WHERE id = ?")
		.get(userId);

	if (!user) {
		console.error(`User ${userId} not found`);
		return null;
	}

	const blockers = db
		.query(
			`
		SELECT 
			u.id,
			u.username,
			u.follower_count,
			(SELECT COUNT(*) FROM blocks WHERE blocker_id = u.id) as total_blocks_given
		FROM blocks b
		JOIN users u ON b.blocker_id = u.id
		WHERE b.blocked_id = ?
	`,
		)
		.all(userId);

	let weightedTotal = 0;
	const blockerDetails = [];

	for (const blocker of blockers) {
		const weight = calculateBlockWeight({
			followerCount: blocker.follower_count || 0,
			totalBlocksGiven: blocker.total_blocks_given || 0,
		});

		weightedTotal += weight;
		blockerDetails.push({
			username: blocker.username,
			followerCount: blocker.follower_count,
			totalBlocksGiven: blocker.total_blocks_given,
			weight: weight.toFixed(3),
		});
	}

	const oldCount = user.blocked_by_count;
	const newCount = Math.round(weightedTotal);

	db.query("UPDATE users SET blocked_by_count = ? WHERE id = ?").run(
		newCount,
		userId,
	);

	console.log(`\nUser: ${user.username} (${user.id})`);
	console.log(
		`Blocked by ${blockers.length} users (raw count: ${oldCount} → weighted count: ${newCount})`,
	);
	console.log(
		`Weighted total: ${weightedTotal.toFixed(2)} → rounded to ${newCount}`,
	);

	if (blockerDetails.length > 0 && blockerDetails.length <= 10) {
		console.log("\nBlocker breakdown:");
		for (const detail of blockerDetails) {
			console.log(
				`  ${detail.username}: ${detail.followerCount} followers, ${detail.totalBlocksGiven} blocks given, weight=${detail.weight}`,
			);
		}
	} else if (blockerDetails.length > 10) {
		console.log(`\n(${blockerDetails.length} blockers - too many to list)`);
		const lowWeight = blockerDetails.filter(
			(d) => Number.parseFloat(d.weight) < 0.5,
		);
		console.log(`  Low-weight blocks (< 0.5): ${lowWeight.length}`);
	}

	return {
		userId: user.id,
		username: user.username,
		oldCount,
		newCount,
		rawTotal: blockers.length,
		weightedTotal,
		blockers: blockerDetails,
	};
};

const recalculateAllWeightedBlocks = () => {
	const users = db
		.query(
			"SELECT id, username, blocked_by_count FROM users WHERE blocked_by_count > 0",
		)
		.all();

	console.log(
		`\nRecalculating weighted block counts for ${users.length} users with blocks...\n`,
	);

	const results = [];
	let processed = 0;
	let totalReduction = 0;

	for (const user of users) {
		const result = recalculateWeightedBlocksForUser(user.id);
		if (result) {
			results.push(result);
			const reduction = result.oldCount - result.newCount;
			totalReduction += reduction;

			processed++;
			if (processed % 50 === 0) {
				console.log(`\nProcessed ${processed}/${users.length} users...`);
			}
		}
	}

	console.log(`\n\n=== SUMMARY ===`);
	console.log(`Completed! Processed ${results.length} users.`);
	console.log(
		`Total block count reduction: ${totalReduction} (${((totalReduction / results.reduce((sum, r) => sum + r.oldCount, 0)) * 100).toFixed(1)}%)`,
	);

	const significantChanges = results
		.filter((r) => Math.abs(r.oldCount - r.newCount) >= 5)
		.sort(
			(a, b) =>
				Math.abs(b.oldCount - b.newCount) - Math.abs(a.oldCount - a.newCount),
		)
		.slice(0, 20);

	if (significantChanges.length > 0) {
		console.log("\nTop 20 Users with Most Significant Changes:");
		for (const result of significantChanges) {
			const change = result.newCount - result.oldCount;
			console.log(
				`  ${result.username}: ${result.oldCount} → ${result.newCount} (${change > 0 ? "+" : ""}${change})`,
			);
		}
	}

	return results;
};

const main = () => {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log("Usage:");
		console.log("  bun scripts/recalculate-weighted-blocks.js all");
		console.log("  bun scripts/recalculate-weighted-blocks.js <username>");
		console.log("  bun scripts/recalculate-weighted-blocks.js <user_id>");
		console.log(
			"\nThis script recalculates blocked_by_count with weighted values.",
		);
		console.log(
			"Blocks from accounts with few followers or many blocks given count for less.",
		);
		process.exit(0);
	}

	const target = args[0];

	if (target === "all") {
		recalculateAllWeightedBlocks();
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

		recalculateWeightedBlocksForUser(userId);
	}

	db.close();
};

main();
