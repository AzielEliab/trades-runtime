# Trades-Runtime giveaway Worker

Public dual-surface giveaway — human UI + counted download. **Not** a hosted multi-tenant company OS.

- **Identity:** Aziel Eliab only
- **Worker name:** `trades-runtime`
- **Intended URL:** https://trades-runtime.vibelock.workers.dev
- **License:** Apache-2.0
- **Product version:** 0.3.3

This Worker does not ingest ServiceTitan dumps, does not write to ServiceTitan or ProBooks, and does not store tenant data. `live_backends` is false.

GitHub Pages stays off. The repo may stay private. Public get is `GET /download`.

## Honest counters (Workers KV `COUNTS`)

| Key | When it increments |
| --- | --- |
| `views` | Exactly once per successful `GET /` HTML **200**. Health-check user-agents (`healthcheck`, `kube-probe`, `GoogleHC`, `UptimeRobot`, …) are excluded. `HEAD /`, assets, and API routes are not views. |
| `downloads` | Exactly once per successful `GET /download` **200**, after the release bytes are loaded and verified as gzip (`0x1f 0x8b`). Missing or invalid tarball returns **503** and does **not** increment. |

`GET /v1/stats` (alias `/stats`) returns:

```json
{ "views": 0, "downloads": 0, "note": "…" }
```

- Start at **0**. No seed. No sampling. No inflation. No estimated unique visitors.
- Each increment writes one unique key (`views:<uuid>` or `downloads:<uuid>`) and also does `value = (parseInt(await kv.get(name))||0)+1` with `put` on `views` / `downloads`.
- `/v1/stats` lists the unique keys as the source of truth.
- KV list is eventually consistent (a just-written key may take up to ~60s to appear in another colo). Failed increments are not invented later.

## Routes

| Method | Path | Counted? |
| --- | --- | --- |
| GET | `/` | views, on HTML 200 |
| GET | `/download` | downloads, on verified gzip 200 |
| GET | `/v1/health` | no |
| GET | `/v1/stats`, `/stats` | no |
| GET | `/cite.json`, `/llms.txt`, `/robots.txt` | no |
| GET | `/v1/skill` | no |
| GET | `/openapi.json` | no |
| POST | `/mcp` | no (read-only health/stats/cite/skill) |

No write API. No ST/ProBooks routes.

## Deploy (operator / box with wrangler auth)

This tree does **not** deploy itself. Do not treat a PR as a live deploy.

```bash
# from repo root
npm ci
npm test
cd workers/giveaway
npm ci

# first time only on the vibelock Cloudflare account
npx wrangler kv namespace create COUNTS
# paste the id into wrangler.jsonc → kv_namespaces[0].id
# (replace the placeholder 00000000000000000000000000000000)

npm run pack          # builds release/trades-runtime-0.3.3.tgz via npm pack
npx wrangler deploy   # Worker name trades-runtime → trades-runtime.vibelock.workers.dev
```

Later:

```bash
npm run giveaway:pack   # from repo root
cd workers/giveaway && npx wrangler deploy
```

## Local smoke

```bash
npm run giveaway:pack
cd workers/giveaway
npm test
npx wrangler dev
```

Then see [SMOKE.md](SMOKE.md).
