const PASTES_KEY_SECRET =
	process.env.PASTES_ENCRYPTION_KEY || process.env.JWT_SECRET || null;
let _cryptoKey = null;

const ensureKey = async () => {
	if (_cryptoKey) return _cryptoKey;
	if (!PASTES_KEY_SECRET) {
		throw new Error(
			"PASTES_ENCRYPTION_KEY or JWT_SECRET must be set for paste encryption",
		);
	}
	const encoder = new TextEncoder();
	const keyMaterial = encoder.encode(PASTES_KEY_SECRET);
	const digest = await crypto.subtle.digest("SHA-256", keyMaterial);
	_cryptoKey = await crypto.subtle.importKey(
		"raw",
		digest,
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
	return _cryptoKey;
};

export const encryptText = async (plain) => {
	if (plain === null || plain === undefined) return null;
	const key = await ensureKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoder = new TextEncoder();
	const data = encoder.encode(String(plain));
	const encryptedBuf = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		data,
	);
	const combined = new Uint8Array(iv.byteLength + encryptedBuf.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encryptedBuf), iv.byteLength);
	return Buffer.from(combined.buffer).toString("base64");
};

export const decryptText = async (b64) => {
	if (!b64) return null;
	let key;
	try {
		key = await ensureKey();
	} catch {
		return null;
	}
	let bytes;
	try {
		bytes = Buffer.from(String(b64), "base64");
	} catch {
		return null;
	}
	if (bytes.length < 13) return null;
	const iv = new Uint8Array(bytes.slice(0, 12));
	const cipher = new Uint8Array(bytes.slice(12));
	try {
		const decryptedBuf = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			cipher,
		);
		const decoder = new TextDecoder();
		return decoder.decode(decryptedBuf);
	} catch {
		return null;
	}
};
