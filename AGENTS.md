# Agent Development Guidelines

How to build and run the app is in `DEVELOPMENT.md`. How to release it is in `RELEASING.md`.

## Never store a database's address, only its hash

A database's address is its type, host, port and name, such as `postgres://localhost:5432/shop`. The code calls it the database key (`databaseKeyOf` in `src/main/database-key.ts`). It tells anyone who reads a file where your databases are.

- beamlynx.db stores only the key's SHA-256 hash. Every write goes through `toStoredKey`, and every lookup through `storedKeyCandidates`. A migration in `src/main/app-db.ts` hashed the rows older apps wrote.
- Never write the key, a host, a port or pine-lang's connection id (`host:port:dbname`) to beamlynx.db, a log, the agent call log, usage stats (PostHog) or Supabase.
- The connection store (`src/main/credential-store.ts`) is the only file that keeps an address. It needs the address to connect.
- The renderer may get `databaseKey` over IPC, to match rows an older app wrote. beamlynx-ui never persists it.

A hash hides the address from someone reading the file. It is not a secret: anyone who guesses the address can hash it and compare. So never use the hash as a credential.
