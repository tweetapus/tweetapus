import { existsSync, promises as fs, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Elysia, file } from "elysia";
import db from "../db.js";

const extensionsDir = join(process.cwd(), "ext");
if (!existsSync(extensionsDir)) {
	mkdirSync(extensionsDir, { recursive: true });
}
const legacyExtensionsDir = join(process.cwd(), ".data", "extensions");
if (!existsSync(legacyExtensionsDir)) {
	mkdirSync(legacyExtensionsDir, { recursive: true });
}

const parseJsonSafely = (value, fallback) => {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const safeDirNamePattern = /^[A-Za-z0-9._-]+$/;

const getInstallDirName = (record) => {
	const manifest = parseJsonSafely(record.manifest_json, {});
	const dirName = manifest?.install_dir;
	if (typeof dirName === "string" && safeDirNamePattern.test(dirName.trim())) {
		return dirName.trim();
	}
	return null;
};

const mapExtensionRecord = (record) => ({
	id: record.id,
	name: record.name,
	version: record.version,
	author: record.author,
	summary: record.summary,
	description: record.description,
	website: record.website,
	changelogUrl: record.changelog_url,
	rootFile: record.root_file,
	entryType: record.entry_type,
	styles: parseJsonSafely(record.styles, []),
	capabilities: parseJsonSafely(record.capabilities, []),
	targets: parseJsonSafely(record.targets, []),
	bundleHash: record.bundle_hash,
	fileEndpoint: `/api/extensions/${encodeURIComponent(record.id)}/file`,
	installDir: getInstallDirName(record),
});

const normalizeRelativePath = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
	const parts = trimmed
		.split("/")
		.filter((segment) => segment && segment !== ".");
	if (!parts.length) return null;
	if (parts.some((segment) => segment === "..")) return null;
	const normalized = parts.join("/");
	if (!normalized.startsWith("src/") && !normalized.startsWith("assets/")) {
		return null;
	}
	return normalized;
};

const sanitizeStyleList = (value) => {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => normalizeRelativePath(entry))
		.filter((entry) => typeof entry === "string" && entry.endsWith(".css"));
};

const normalizeManualManifest = (manifest = {}, fallbackName) => {
	const name =
		typeof manifest.name === "string" && manifest.name.trim()
			? manifest.name.trim().slice(0, 80)
			: fallbackName;
	const rootCandidate =
		manifest.root_file ?? manifest.rootFile ?? manifest.entry;
	const rootFile = normalizeRelativePath(rootCandidate || "src/main.js");
	if (!rootFile || !rootFile.startsWith("src/")) return null;
	const entryType =
		typeof manifest.entry_type === "string" &&
		manifest.entry_type.toLowerCase() === "script"
			? "script"
			: "module";
	return {
		id: manifest.id ?? null,
		name,
		version: typeof manifest.version === "string" ? manifest.version : "0.1.0",
		author:
			typeof manifest.author === "string" && manifest.author.trim()
				? manifest.author.trim()
				: "unknown",
		summary: typeof manifest.summary === "string" ? manifest.summary : null,
		description:
			typeof manifest.description === "string" ? manifest.description : null,
		website:
			typeof manifest.website === "string" &&
			manifest.website.startsWith("http")
				? manifest.website
				: null,
		changelogUrl:
			typeof manifest.changelogUrl === "string" &&
			manifest.changelogUrl.startsWith("http")
				? manifest.changelogUrl
				: null,
		rootFile,
		entryType,
		styles: sanitizeStyleList(manifest.styles ?? manifest["style-files"] ?? []),
		capabilities: Array.isArray(manifest.capabilities)
			? manifest.capabilities
			: [],
		targets: Array.isArray(manifest.targets) ? manifest.targets : [],
	};
};

const discoverManualExtensions = async (managedRows) => {
	const found = [];
	let entries;
	try {
		entries = await fs.readdir(extensionsDir, { withFileTypes: true });
	} catch {
		return found;
	}
	const managedDirNames = new Set(
		managedRows
			.map((row) => getInstallDirName(row))
			.filter((dirName) => typeof dirName === "string" && dirName.length > 0),
	);
	const managedIds = new Set(managedRows.map((row) => row.id));
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dirName = entry.name;
		if (!safeDirNamePattern.test(dirName)) continue;
		const manifestPath = join(extensionsDir, dirName, "ext.json");
		let manifestContent;
		try {
			manifestContent = await fs.readFile(manifestPath, "utf8");
		} catch {
			continue;
		}
		let manifest;
		try {
			manifest = JSON.parse(manifestContent);
		} catch {
			continue;
		}
		const normalized = normalizeManualManifest(manifest, dirName);
		if (!normalized) continue;
		if (normalized.id && managedIds.has(normalized.id)) continue;
		if (managedDirNames.has(dirName)) continue;
		const hasher = new Bun.CryptoHasher("sha256");
		hasher.update(dirName);
		hasher.update(manifestContent);
		const bundleHash = hasher.digest("hex");
		found.push({
			id: dirName,
			name: normalized.name,
			version: normalized.version,
			author: normalized.author,
			summary: normalized.summary,
			description: normalized.description,
			website: normalized.website,
			changelogUrl: normalized.changelogUrl,
			rootFile: normalized.rootFile,
			entryType: normalized.entryType,
			styles: normalized.styles,
			capabilities: normalized.capabilities,
			targets: normalized.targets,
			bundleHash,
			fileEndpoint: `/api/extensions/${encodeURIComponent(dirName)}/file`,
			installDir: dirName,
		});
	}
	return found;
};

const resolveManagedRoot = (record) => {
	const dirName = getInstallDirName(record);
	if (dirName) {
		return join(extensionsDir, dirName);
	}
	return join(legacyExtensionsDir, record.id);
};

const sanitizeDirSegment = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!safeDirNamePattern.test(trimmed)) return null;
	return trimmed;
};

const enabledExtensionsQuery = db.prepare(
	"SELECT * FROM extensions WHERE enabled = 1 ORDER BY created_at ASC",
);
const extensionByIdQuery = db.prepare("SELECT * FROM extensions WHERE id = ?");

export default new Elysia({ prefix: "/extensions" })
	.get("/", async () => {
		const rows = enabledExtensionsQuery.all();
		const manual = await discoverManualExtensions(rows);
		const managed = rows.map(mapExtensionRecord);
		return { extensions: [...managed, ...manual] };
	})
	.get("/:id/file", async ({ params, query, set }) => {
		const relativePath = normalizeRelativePath(query.path);
		if (!relativePath) {
			set.status = 400;
			return { error: "Invalid file path" };
		}

		let rootDir;
		let cacheSeconds = 60;
		const managedExtension = extensionByIdQuery.get(params.id);
		if (managedExtension && managedExtension.enabled) {
			rootDir = resolveManagedRoot(managedExtension);
		} else {
			const dirName = sanitizeDirSegment(params.id);
			if (!dirName) {
				set.status = 404;
				return { error: "Extension not found" };
			}
			rootDir = join(extensionsDir, dirName);
			const manifestExists = await Bun.file(join(rootDir, "ext.json")).exists();
			if (!manifestExists) {
				set.status = 404;
				return { error: "Extension not found" };
			}
			cacheSeconds = 15;
		}

		const absolutePath = join(rootDir, ...relativePath.split("/"));

		if (!absolutePath.startsWith(rootDir)) {
			set.status = 400;
			return { error: "Invalid file path" };
		}

		if (!(await Bun.file(absolutePath).exists())) {
			set.status = 404;
			return { error: "File not found" };
		}

		set.headers = {
			"Cache-Control": `public, max-age=${cacheSeconds}`,
		};

		return file(absolutePath);
	});
