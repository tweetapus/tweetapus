import Cap from "@cap.js/server";
import { SQL } from "bun";

const sqlite = new SQL("sqlite://.data/cap.sqlite");

(async () => {
  await sqlite`
  CREATE TABLE IF NOT EXISTS challenges (
    token TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tokens (
    key TEXT PRIMARY KEY,
    expires INTEGER NOT NULL
  );
`;
})();

const cap = new Cap({
  storage: {
    challenges: {
      store: async (token, challengeData) => {
        await sqlite`
          INSERT OR REPLACE INTO challenges (token, data, expires)
          VALUES (${token}, ${JSON.stringify(challengeData.challenge)}, ${
          challengeData.expires
        })
        `;
      },
      read: async (token) => {
        const row =
          (await sqlite`SELECT data, expires FROM challenges WHERE token = ${token} AND expires > ${Date.now()}`)[0];

        return row
          ? { challenge: JSON.parse(row.data), expires: row.expires }
          : null;
      },
      delete: async (token) => {
        await sqlite`DELETE FROM challenges WHERE token = ${token}`;
      },
      deleteExpired: async () => {
        await sqlite`DELETE FROM challenges WHERE expires <= ${Date.now()}`;
      },
    },
    tokens: {
      store: async (tokenKey, expires) => {
        await sqlite`
          INSERT OR REPLACE INTO tokens (key, expires)
          VALUES (${tokenKey}, ${expires})
        `;
      },
      get: async (tokenKey) => {
        const row =
          (await sqlite`SELECT expires FROM tokens WHERE key = ${tokenKey} AND expires > ${Date.now()}`)[0];

        return row ? row.expires : null;
      },
      delete: async (tokenKey) => {
        await sqlite`DELETE FROM tokens WHERE key = ${tokenKey}`;
      },
      deleteExpired: async () => {
        await sqlite`DELETE FROM tokens WHERE expires <= ${Date.now()}`;
      },
    },
  },
});

export default cap;
