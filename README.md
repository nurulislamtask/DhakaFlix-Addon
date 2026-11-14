# DhakaFlix BDIX Add-on (GooWatch / Stremio)

Stremio-format extension for **GooWatch**. It reads the DhakaFlix open directory and gives every movie/series its **own poster** (looked up by title via Cinemeta; if none is found, a poster generated from that title is used — never one shared image).

## Deploy on Vercel
1. Vercel → *Add New → Project* → import this GitHub repo. No build settings needed (Framework: *Other*).
2. Deploy. Open `https://<your-project>.vercel.app/` and copy the address.
3. GooWatch → *Settings → Extensions* → paste `https://<your-project>.vercel.app/manifest.json`.

## Environment variables (optional, Vercel → Settings → Environment Variables)
| name | default | meaning |
|---|---|---|
| `DFLIX_BASE` | `http://cdn.dflix.live` | server address |
| `DFLIX_ROOTS` | `/` | comma-separated folders to scan, e.g. `/Movies,/Series` |
| `DFLIX_DEPTH` | `3` | how deep to look for title folders |
| `DFLIX_MAX_ITEMS` | `600` | max titles indexed |

## Catalog for everyone (static index)
Vercel can't reach the DhakaFlix server (BDIX-only), so a live crawl there returns an empty catalog. The fix: the catalog is built once on a PC that **can** reach DhakaFlix and committed as `lib/catalog-index.json`. Vercel then serves catalog/meta/stream from that file — no live connection needed. Stream URLs still point at the BDIX host, so playback works for BDIX users (their own device fetches the video).
1. On a BDIX-connected PC: `build-index.bat` (or `npm run build-index`) — writes `lib/catalog-index.json`.
2. `push-index.bat` (or upload the file on github.com) — Vercel redeploys automatically.
3. Re-run whenever new movies/series are added.
Without the file, the addon falls back to the live crawl (works on a PC / BDIX host).

## Notes
- Catalog listing is fetched by Vercel's server, so the server must be reachable from the internet. If it is BDIX-only, Vercel can't read it — use the static index above, run this add-on locally instead (`node` + any tunnel), or point `DFLIX_BASE` at a public mirror.
- Video links are played by your own device, so BDIX speed still applies.
- Movie vs series is guessed from folder names (`S01`, `Season`, `/Series/`…). Put series under a folder called `Series`/`TV Series` for best results.
- `npm test` runs a local mock-server test.

The old Chrome-extension version is kept in `chrome-extension-legacy/`.
