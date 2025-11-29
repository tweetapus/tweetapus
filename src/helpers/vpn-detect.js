import { mkdir, readFile, writeFile } from "node:fs/promises";

const URL =
	"https://raw.githubusercontent.com/josephrocca/is-vpn/main/vpn-or-datacenter-ipv4-ranges.txt";
const OUTPUT_DIR = ".data";
const OUTPUT_FILE = `${OUTPUT_DIR}/vpn-ips.txt`;
const CONFIG_FILE = `${OUTPUT_DIR}/vpn-ips.config`;

let vpnRanges = [];

async function fetchAndSave() {
	try {
		const res = await fetch(URL);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();

		await mkdir(OUTPUT_DIR, { recursive: true });
		await writeFile(OUTPUT_FILE, text, "utf-8");

		const now = new Date().toISOString();
		await writeFile(CONFIG_FILE, JSON.stringify({ lastFetched: now }), "utf-8");

		loadRanges(text);
	} catch (err) {
		console.error("Failed to fetch VPN list:", err);
	}
}

function loadRanges(text) {
	vpnRanges = text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((cidr) => {
			const [ip, bits] = cidr.split("/");
			const ipNum = ipToNum(ip);
			const mask = ~(2 ** (32 - +bits) - 1) >>> 0;
			return { ipNum, mask };
		});
}

function ipToNum(ip) {
	return (
		ip
			.split(".")
			.map(Number)
			.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0
	);
}

export const isVPN = async (ip) => {
	if (!ip) {
		return null;
	}
	if (!vpnRanges.length) {
		try {
			const text = await readFile(OUTPUT_FILE, "utf-8");
			loadRanges(text);
		} catch {
			await fetchAndSave();
		}
	}

	const ipNum = ipToNum(ip);
	return vpnRanges.some(
		(range) => (ipNum & range.mask) === (range.ipNum & range.mask),
	);
};

async function maybeFetchOnStart() {
	try {
		const configRaw = await readFile(CONFIG_FILE, "utf-8");
		const config = JSON.parse(configRaw);
		const lastFetched = new Date(config.lastFetched);

		if (!lastFetched || Date.now() - lastFetched.getTime() > 1000 * 60 * 60) {
			await fetchAndSave();
		} else {
			const text = await readFile(OUTPUT_FILE, "utf-8");
			loadRanges(text);
		}
	} catch {
		await fetchAndSave();
	}
}

maybeFetchOnStart();
setInterval(fetchAndSave, 1000 * 60 * 60);
