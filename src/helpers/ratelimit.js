// https://github.com/rayriffy/elysia-rate-limit#generator
// elysia-rate-limit spamming the terminal is annoying
export default function (req, server) {
	if (process.env.NODE_ENV === "development") {
		return Math.random().toFixed(2);
	}
	return (
		req.headers.get("CF-Connecting-IP") ??
		server?.requestIP(req)?.address ??
		"0.0.0.0"
	);
}
// Tr Happies
