import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import ratelimit from "../helpers/ratelimit.js";
import cap from "./cap.js";

const rpID = process.env.AUTH_RPID;
const rpName = process.env.AUTH_RPNAME;
const origin = process.env.AUTH_ORIGIN;

const getUserByUsername = db.prepare(
	"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);
const userExistsByUsername = db.prepare(
	"SELECT count(*) FROM users WHERE LOWER(username) = LOWER(?)",
);

function savePasskey(credentialData) {
	const {
		credId,
		credPublicKey,
		internalUserId,
		webAuthnUserId,
		counter,
		backupEligible,
		backupStatus,
		transports,
	} = credentialData;

	return db
		.query(
			`INSERT INTO passkeys 
			(cred_id, cred_public_key, internal_user_id, webauthn_user_id, counter, backup_eligible, backup_status, transports, last_used) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		)
		.run(
			credId,
			credPublicKey,
			internalUserId,
			webAuthnUserId,
			counter,
			backupEligible,
			backupStatus,
			JSON.stringify(transports),
		);
}

function updatePasskeyCounter(credId, newCounter) {
	return db
		.query(
			"UPDATE passkeys SET counter = ?, last_used = datetime('now') WHERE cred_id = ?",
		)
		.run(newCounter, credId);
}

function getPasskeyByCredId(credId) {
	return db.query("SELECT * FROM passkeys WHERE cred_id = ?").get(credId);
}

export default new Elysia({ prefix: "/auth", tags: ["Auth"] })
	.use(
		rateLimit({
			duration: 10_000,
			max: 30,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post(
		"/cap/challenge",
		async () => {
			return await cap.createChallenge();
		},
		{
			detail: {
				description: "Creates a Cap challenge",
			},
			response: t.Object({
				challenge: t.Any(),
				token: t.String(),
				expires: t.Number(),
			}),
		},
	)
	.post(
		"/cap/redeem",
		async ({ body, set }) => {
			const { token, solutions } = body;
			if (!token || !solutions) {
				set.status = 400;
				return { success: false };
			}
			return await cap.redeemChallenge({ token, solutions });
		},
		{
			detail: {
				description: "Redeems a Cap challenge",
			},
			body: t.Object({
				token: t.String(),
				solutions: t.Array(t.String()),
			}),
		},
	)
	.get(
		"/me",
		async ({ jwt, headers, query, set }) => {
			const authorization = headers.authorization;
			if (!authorization) {
				return { error: "No authorization header" };
			}

			const token = authorization.replace("Bearer ", "");
			try {
				const payload = await jwt.verify(token);
				if (!payload) {
					return { error: "Invalid token" };
				}

				const user = getUserByUsername.get(payload.username);
				if (!user) {
					return { error: "User not found" };
				}

				const passkeys = query.requestPreload
					? db
							.query(
								`SELECT cred_id, created_at, last_used, transports, backup_eligible, name 
					FROM passkeys WHERE internal_user_id = ? 
					ORDER BY created_at DESC`,
							)
							.all(user.id)
					: [];

				return {
					user: {
						id: user.id,
						username: user.username,
						name: user.name || null,
						avatar: user.avatar,
						verified: user.verified || false,
						gold: user.gold || false,
						admin: user.admin || false,
						theme: user.theme || null,
						accent_color: user.accent_color || null,
						use_c_algorithm:
							user.use_c_algorithm === 1 || user.use_c_algorithm === true,
						avatar_radius: user.avatar_radius ?? null,
						character_limit: user.character_limit ?? null,
						label_type: user.label_type || null,
						label_automated: user.label_automated || false,
						private: user.private === 1 || user.private === true,
						has_password: !!user.password_hash,
					},
					passkeys: passkeys.map((passkey) => ({
						id: passkey.cred_id,
						createdAt: passkey.created_at,
						lastUsed: passkey.last_used,
						transports: JSON.parse(passkey.transports || "[]"),
						backupEligible: passkey.backup_eligible,
						name: passkey.name || `Passkey ${passkey.cred_id.slice(0, 8)}...`,
					})),
					restricted: set.restricted,
				};
			} catch (error) {
				return { error: error.message };
			}
		},
		{
			detail: {
				description: "Returns current user information",
			},
			response: t.Object({
				user: t.Object({
					id: t.String(),
					username: t.String(),
					name: t.Optional(t.String()),
					avatar: t.Optional(t.String()),
					verified: t.Union([t.Boolean(), t.Number()]),
					gold: t.Boolean(),
					admin: t.Union([t.Boolean(), t.Number()]),
					theme: t.Optional(t.String()),
					accent_color: t.Optional(t.String()),
					use_c_algorithm: t.Boolean(),
					avatar_radius: t.Optional(t.Number()),
					character_limit: t.Optional(t.Union([t.Number(), t.Null()])),
					label_type: t.Optional(t.Union([t.String(), t.Null()])),
					label_automated: t.Boolean(),
					private: t.Boolean(),
					has_password: t.Boolean(),
				}),
				passkeys: t.Array(
					t.Object({
						id: t.String(),
						createdAt: t.String(),
						lastUsed: t.String(),
						transports: t.Array(t.String()),
						backupEligible: t.Boolean(),
						name: t.String(),
					}),
				),
				restricted: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/username-availability",
		async ({ query }) => {
			const username = query.username?.trim();
			if (!username) {
				return { error: "Username is required" };
			}

			const available = !Object.values(userExistsByUsername.get(username))[0];

			return { available };
		},
		{
			description: "Checks if a username is available",
			response: t.Object({
				available: t.Boolean(),
			}),
			query: t.Object({
				username: t.String(),
			}),
		},
	)
	.post("/generate-registration-options", async ({ body, jwt, headers }) => {
		const username = body.username?.trim();

		if (!username) {
			return { error: "Username is required" };
		}

		if (username.length > 40) {
			return { error: "Username must be less than 40 characters" };
		}

		if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
			return {
				error:
					"Username can only contain lowercase letters, numbers, periods, and hyphens",
			};
		}

		const user = getUserByUsername.get(username);
		let excludeCredentials = [];
		let userId;

		if (user) {
			const authorization = headers.authorization;
			if (!authorization) {
				return { error: "This username has already been taken." };
			}

			const token = authorization.replace("Bearer ", "");
			try {
				const payload = await jwt.verify(token);
				if (!payload || payload.username !== username) {
					return { error: "This username has already been taken." };
				}
			} catch {
				return { error: "This username has already been taken." };
			}

			const userPasskeys = db
				.query("SELECT * FROM passkeys WHERE internal_user_id = ?")
				.all(user.id);

			excludeCredentials = userPasskeys.map((passkey) => ({
				id: passkey.cred_id,
				transports: JSON.parse(passkey.transports || "[]"),
			}));

			userId = user.id;
		} else {
			userId = Bun.randomUUIDv7();
		}

		let options;

		try {
			options = await generateRegistrationOptions({
				rpName,
				rpID,
				userID: isoUint8Array.fromUTF8String(userId),
				userName: username,
				userDisplayName: username,
				excludeCredentials,
				authenticatorSelection: {
					residentKey: "preferred",
					userVerification: "preferred",
				},
			});
		} catch (error) {
			console.error("Registration options generation error:", error);
			return { error: error.message };
		}

		if (options.error) return { error: options.error };

		return {
			options,
			challenge: await jwt.sign({
				regchallenge: options.challenge,
				userId: userId,
				username: username,

				// 2.5 minutes
				exp: Math.floor(Date.now() / 1000) + 2.5 * 60,
			}),
		};
	})
	.post("/verify-registration", async ({ body, jwt }) => {
		const { username, credential, challenge } = body;

		if (!username || !credential) {
			return { error: "Username and credential are required" };
		}

		let challengePayload;
		try {
			challengePayload = await jwt.verify(challenge);
			if (!challengePayload || !challengePayload.regchallenge) {
				return { error: "Invalid challenge" };
			}
		} catch {
			return { error: "Invalid challenge:" };
		}

		let user = getUserByUsername.get(username);

		try {
			const verification = await verifyRegistrationResponse({
				response: credential,
				expectedChallenge: challengePayload.regchallenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
			});

			if (verification.verified && verification.registrationInfo) {
				const registrationInfo = verification.registrationInfo;

				const credentialID = registrationInfo.credential?.id;
				const credentialPublicKey = registrationInfo.credential?.publicKey;
				const credentialBackedUp = registrationInfo.credentialBackedUp || false;

				if (!credentialID || !credentialPublicKey) {
					console.error("Missing credential data:", {
						credentialID: !!credentialID,
						credentialPublicKey: !!credentialPublicKey,
						credential: registrationInfo.credential,
					});
					return { error: "Invalid credential data received" };
				}

				const credIdString =
					typeof credentialID === "string"
						? credentialID
						: isoBase64URL.fromBuffer(credentialID);

				const existingPasskey = getPasskeyByCredId(credIdString);
				if (existingPasskey) {
					if (!user) {
						user = db
							.query("SELECT * FROM users WHERE id = ?")
							.get(existingPasskey.internal_user_id);
					}

					if (!user) {
						return {
							verified: false,
							error: "User associated with this passkey no longer exists",
						};
					}

					return {
						verified: true,
						user: { id: user.id, username: user.username },
						token: await jwt.sign({
							userId: user.id,
							username: user.username,
							iat: Math.floor(Date.now() / 1000),
							exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
						}),
					};
				}

				if (!user) {
					user = db
						.query(
							"INSERT INTO users (id, username, character_limit) VALUES (?, ?, ?) RETURNING *",
						)
						.get(challengePayload.userId, username, null);
				}

				savePasskey({
					credId: credIdString,
					credPublicKey: Buffer.from(credentialPublicKey),
					internalUserId: user.id,
					webAuthnUserId: Bun.randomUUIDv7(),
					counter: registrationInfo.counter || 0,
					backupEligible: credentialBackedUp,
					backupStatus: credentialBackedUp,
					transports: credential.response.transports || [],
				});

				const token = await jwt.sign({
					userId: user.id,
					username: user.username,
					iat: Math.floor(Date.now() / 1000),
					exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
				});

				return {
					verified: true,
					user: { id: user.id, username: user.username },
					token,
				};
			} else {
				console.error("Verification failed:", verification);
				return { verified: false, error: "Registration verification failed" };
			}
		} catch (error) {
			console.error("Registration verification error:", error);
			return { error: error.message };
		}
	})
	.post("/generate-authentication-options", async ({ jwt }) => {
		const options = await generateAuthenticationOptions({
			rpID,
			allowCredentials: [],
			userVerification: "preferred",
		});

		if (options.error) return { error: options.error };

		return {
			options,
			expectedChallenge: await jwt.sign({
				challenge: options.challenge,

				// 2.5 minutes
				exp: Math.floor(Date.now() / 1000) + 2.5 * 60,
			}),
		};
	})
	.post("/verify-authentication", async ({ body, jwt }) => {
		const { expectedChallenge, credential } = body;

		if (!expectedChallenge || !credential) {
			return { error: "expectedChallenge and credential are required" };
		}

		if (!credential.rawId) {
			console.error("Missing credential.rawId:", credential);
			return { error: "Invalid credential format" };
		}

		const credId =
			typeof credential.rawId === "string"
				? credential.rawId
				: isoBase64URL.fromBuffer(credential.rawId);

		const passkey = getPasskeyByCredId(credId);
		if (!passkey) {
			return { error: "Passkey not found" };
		}

		try {
			const verification = await verifyAuthenticationResponse({
				response: credential,
				expectedChallenge: (await jwt.verify(expectedChallenge)).challenge,
				expectedOrigin: origin,
				expectedRPID: [rpID],
				credential: {
					id: isoBase64URL.toBuffer(passkey.cred_id),
					publicKey: new Uint8Array(passkey.cred_public_key),
					counter: passkey.counter,
				},
			});

			if (!verification.verified || !verification.authenticationInfo) {
				return { verified: false, error: "Authentication verification failed" };
			}

			const user = db
				.query("SELECT * FROM users WHERE id = ?")
				.get(passkey.internal_user_id);

			if (!user) {
				return {
					verified: false,
					error: "User associated with this passkey no longer exists",
				};
			}

			updatePasskeyCounter(credId, verification.authenticationInfo.newCounter);

			const token = await jwt.sign({
				userId: user.id,
				username: user.username,
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
			});

			return {
				verified: true,
				user: { id: user.id, username: user.username },
				token,
			};
		} catch (error) {
			console.error("Authentication verification error:", error);
			return { error: "Authentication verification failed" };
		}
	})
	.get(
		"/passkeys",
		async ({ jwt, headers }) => {
			const authorization = headers.authorization;
			if (!authorization) {
				return { error: "No authorization header" };
			}

			const token = authorization.replace("Bearer ", "");
			try {
				const payload = await jwt.verify(token);
				if (!payload) {
					return { error: "Invalid token" };
				}

				const user = getUserByUsername.get(payload.username);
				if (!user) {
					return { error: "User not found" };
				}

				const passkeys = db
					.query(
						`SELECT cred_id, created_at, last_used, transports, backup_eligible, name 
					FROM passkeys WHERE internal_user_id = ? 
					ORDER BY created_at DESC`,
					)
					.all(user.id);

				return {
					passkeys: passkeys.map((passkey) => ({
						id: passkey.cred_id,
						createdAt: passkey.created_at,
						lastUsed: passkey.last_used,
						transports: JSON.parse(passkey.transports || "[]"),
						backupEligible: passkey.backup_eligible,
						name: passkey.name || `Passkey ${passkey.cred_id.slice(0, 8)}...`,
					})),
				};
			} catch (error) {
				return { error: error.message };
			}
		},
		{
			detail: {
				description: "Lists all passkeys for a user",
			},
			response: t.Object({
				passkeys: t.Array(
					t.Object({
						id: t.String(),
						createdAt: t.String(),
						lastUsed: t.String(),
						transports: t.Array(t.String()),
						backupEligible: t.Boolean(),
						name: t.String(),
					}),
				),
			}),
		},
	)
	.put(
		"/passkeys/:credId/name",
		async ({ jwt, headers, params, body }) => {
			const authorization = headers.authorization;
			if (!authorization) {
				return { error: "No authorization header" };
			}

			const token = authorization.replace("Bearer ", "");
			try {
				const payload = await jwt.verify(token);
				if (!payload) {
					return { error: "Invalid token" };
				}

				const user = getUserByUsername.get(payload.username);
				if (!user) {
					return { error: "User not found" };
				}

				const { name } = body;
				if (!name || name.trim().length === 0) {
					return { error: "Name is required" };
				}

				if (name.length > 50) {
					return { error: "Name must be less than 50 characters" };
				}

				const result = db
					.query(
						"UPDATE passkeys SET name = ? WHERE cred_id = ? AND internal_user_id = ?",
					)
					.run(name.trim(), params.credId, user.id);

				if (result.changes === 0) {
					return { error: "Passkey not found" };
				}

				const passkeys = db
					.query(
						`SELECT cred_id, created_at, last_used, transports, backup_eligible, name 
					FROM passkeys WHERE internal_user_id = ? 
					ORDER BY created_at DESC`,
					)
					.all(user.id);

				return {
					success: true,
					passkeys: passkeys.map((passkey) => ({
						id: passkey.cred_id,
						createdAt: passkey.created_at,
						lastUsed: passkey.last_used,
						transports: JSON.parse(passkey.transports || "[]"),
						backupEligible: passkey.backup_eligible,
						name: passkey.name || `Passkey ${passkey.cred_id.slice(0, 8)}...`,
					})),
				};
			} catch (error) {
				return { error: error.message };
			}
		},
		{
			detail: {
				description: "Updates the name of a passkey",
			},
			params: t.Object({
				credId: t.String(),
			}),
			body: t.Object({
				name: t.String(),
			}),
		},
	)
	.delete(
		"/passkeys/:credId",
		async ({ jwt, headers, params }) => {
			const authorization = headers.authorization;
			if (!authorization) {
				return { error: "No authorization header" };
			}

			const token = authorization.replace("Bearer ", "");
			try {
				const payload = await jwt.verify(token);
				if (!payload) {
					return { error: "Invalid token" };
				}

				const user = getUserByUsername.get(payload.username);
				if (!user) {
					return { error: "User not found" };
				}

				const passkeyCount = db
					.query(
						"SELECT COUNT(*) as count FROM passkeys WHERE internal_user_id = ?",
					)
					.get(user.id).count;

				if (passkeyCount <= 1) {
					return { error: "Cannot delete the last passkey" };
				}

				const result = db
					.query(
						"DELETE FROM passkeys WHERE cred_id = ? AND internal_user_id = ?",
					)
					.run(params.credId, user.id);

				if (result.changes === 0) {
					return { error: "Passkey not found" };
				}

				const passkeys = db
					.query(
						`SELECT cred_id, created_at, last_used, transports, backup_eligible, name 
					FROM passkeys WHERE internal_user_id = ? 
					ORDER BY created_at DESC`,
					)
					.all(user.id);

				return {
					success: true,
					passkeys: passkeys.map((passkey) => ({
						id: passkey.cred_id,
						createdAt: passkey.created_at,
						lastUsed: passkey.last_used,
						transports: JSON.parse(passkey.transports || "[]"),
						backupEligible: passkey.backup_eligible,
						name: passkey.name || `Passkey ${passkey.cred_id.slice(0, 8)}...`,
					})),
				};
			} catch (error) {
				return { error: error.message };
			}
		},
		{
			detail: {
				description: "Deletes a passkey",
			},
			params: t.Object({
				credId: t.String(),
			}),
		},
	)
	.post(
		"/register-with-password",
		async ({ body, jwt }) => {
			try {
				const username = body.username?.trim();
				const { password, challengeToken } = body;

				if (!username || !password) {
					return { error: "Username and password are required" };
				}
				if (!challengeToken) {
					return { error: "Challenge token is required" };
				}

				if (username.length < 3 || username.length > 20) {
					return { error: "Username must be between 3 and 20 characters" };
				}

				if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
					return {
						error:
							"Username can only contain lowercase letters, numbers, periods, and hyphens",
					};
				}

				if (password.length < 6) {
					return { error: "Password must be at least 6 characters long" };
				}

				const validChallenge = await cap.validateToken(challengeToken);

				if (!validChallenge.success) {
					return { error: "Invalid challenge token" };
				}

				const userExists = userExistsByUsername.get(username);
				if (Object.values(userExists)[0]) {
					return { error: "Username is already taken" };
				}

				const passwordHash = await Bun.password.hash(password);
				const userId = Bun.randomUUIDv7();

				const user = db
					.query(
						"INSERT INTO users (id, username, password_hash, character_limit) VALUES (?, ?, ?, ?) RETURNING *",
					)
					.get(userId, username, passwordHash, null);

				const token = await jwt.sign({
					userId: user.id,
					username: user.username,
					iat: Math.floor(Date.now() / 1000),
					exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
				});

				return {
					success: true,
					token,
				};
			} catch (error) {
				console.error("Password registration error:", error);
				return { error: "Failed to create account" };
			}
		},
		{
			detail: {
				description: "Registers a new account with a password",
			},
			body: t.Object({
				username: t.String(),
				password: t.String(),
				challengeToken: t.String(),
			}),
		},
	)
	.post(
		"/basic-login",
		async ({ body, jwt }) => {
			try {
				const { username, password } = body;

				if (!username || !password) {
					return { error: "Username and password are required" };
				}

				const user = getUserByUsername.get(username);
				if (!user || !user.password_hash) {
					return { error: "Invalid username or password" };
				}

				const isValidPassword = await Bun.password.verify(
					password,
					user.password_hash,
				);
				if (!isValidPassword) {
					return { error: "Invalid username or password" };
				}

				const token = await jwt.sign({
					userId: user.id,
					username: user.username,
					iat: Math.floor(Date.now() / 1000),
					exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
				});

				const passkeys = db
					.query(
						`SELECT cred_id, created_at, last_used, transports, backup_eligible, name 
					FROM passkeys WHERE internal_user_id = ? 
					ORDER BY created_at DESC`,
					)
					.all(user.id);

				return {
					token,
					user,
					passkeys: passkeys.map((passkey) => ({
						id: passkey.cred_id,
						createdAt: passkey.created_at,
						lastUsed: passkey.last_used,
						transports: JSON.parse(passkey.transports || "[]"),
						backupEligible: passkey.backup_eligible,
						name: passkey.name || `Passkey ${passkey.cred_id.slice(0, 8)}...`,
					})),
				};
			} catch (error) {
				console.error("Basic login error:", error);
				return { error: "Login failed" };
			}
		},
		{
			detail: {
				description: "Logs in a user with username and password",
			},
			body: t.Object({
				username: t.String(),
				password: t.String(),
			}),
		},
	);
