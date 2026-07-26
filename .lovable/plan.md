## Root cause

After migrating from `react-router-dom` 7 to `react-router` 8, two stale artifacts still reference the removed package:

1. `node_modules/.vite/deps/_metadata.json` has an entry `react-router-dom → ../../react-router-dom/dist/index.mjs`. That path no longer exists, so Vite crashes with `ENOENT … react-router-dom/dist/index.mjs` every time it re-optimizes dependencies, which blanks the preview.
2. `package-lock.json` (npm) still pins `react-router-dom@^6.30.1`. The project uses `bun.lock`; the leftover npm lockfile is misleading and can pull the removed package back in during future installs.

No source file imports `react-router-dom` any more, so this is purely a cache/lockfile hygiene issue.

## Fix

1. Delete the Vite optimizer cache: `rm -rf node_modules/.vite`.
2. Delete the stale npm lockfile: `rm package-lock.json`.
3. Restart the dev server (`kill -9` the vite process; the supervisor respawns it) and wait for `http://localhost:8080/` to answer.
4. Verify: dev-server log no longer prints the `ENOENT react-router-dom` error, and the preview renders the app instead of a blank screen.

No source code changes required.
