import { existsSync, mkdirSync } from "node:fs";
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

export default new Elysia({ prefix: "/extensions", tags: ["Extensions"] })
	.get("/", async () => {
		const enabledRows = enabledExtensionsQuery.all();

		const managed = enabledRows.map(mapExtensionRecord);
		return { extensions: [...managed] };
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
		if (managedExtension) {
			if (!managedExtension.enabled) {
				set.status = 404;
				return { error: "Extension not found" };
			}
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
