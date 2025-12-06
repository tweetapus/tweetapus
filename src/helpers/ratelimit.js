// https://github.com/rayriffy/elysia-rate-limit#generator

export default function (req, server) {
	const url = new URL(req.url);
	if (url.pathname.includes("/cap/")) {
		return Math.random().toString();
	}
	const authHeader = req.headers.get("Authorization");
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (token) return token;
	return (
		req.headers.get("CF-Connecting-IP") ??
		server?.requestIP(req)?.address ??
		"0.0.0.0"
	);
}
