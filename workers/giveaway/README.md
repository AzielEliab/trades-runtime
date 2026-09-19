# Trades-Runtime giveaway Worker

Public dual-surface giveaway — human UI + counted download. **Not** a hosted multi-tenant company OS.

- **Identity:** Aziel Eliab only
- **Worker name:** `trades-runtime`
- **Intended URL:** https://trades-runtime.vibelock.workers.dev
- **License:** Apache-2.0
- **Product version:** 0.3.4

This Worker does not ingest ServiceTitan dumps, does not write to ServiceTitan or ProBooks, and does not store tenant data. `live_backends` is false.

GitHub Pages stays off. The repo may stay private. Public get is `GET /download`.

## Honest counters (Workers KV `COUNTS`)

| Key | When it increments |
| --- | --- |
| `views` | Exactly once per successful `GET /` HTML **200**. Health-check user-agents (`healthcheck`, `kube-probe`, `GoogleHC`, `UptimeRobot`, …) are excluded. `HEAD /`, assets, and API routes are not views. |
| `views_human` / `views_bot` | Same event as `views`, split by classification. |
| `downloads` | Exactly once per successful `GET /download` **200**, after the release bytes are loaded and verified as gzip (`0x1f 0x8b`). Missing or invalid tarball returns **503** and does **not** increment. `HEAD` does not increment. |
| `downloads_human` / `downloads_bot` | Same event as `downloads`, split by classification. |
| `total` | Fleet convention: equals `downloads`. |

Classification (per counted request): health-check UA is skipped on homepage views; a counted tarball GET with a health-check UA is bot. If `request.cf.botManagement` is present, `verifiedBot === true` or `score <= 30` is bot, otherwise the UA denylist runs. Else human. `classification.method` is `cf.botManagement+ua` when Bot Management is on this isolate path, otherwise `ua+healthcheck`.

`GET /v1/stats` (aliases `/stats`, `/count`) returns:

```json
{
  "project": "trades-runtime",
  "views": 0,
  "downloads": 0,
  "total": 0,
  "views_human": 0,
  "views_bot": 0,
  "downloads_human": 0,
  "downloads_bot": 0,
  "human": { "views": 0, "downloads": 0 },
  "bot": { "views": 0, "downloads": 0 },
  "classification": { "method": "ua+healthcheck", "bot_score_threshold": 30, "note": "…" },
  "note": "…"
}
```

- Start at **0**. No seed. No sampling. No inflation. No estimated unique visitors.
- Invariant: `views === views_human + views_bot` and `downloads === downloads_human + downloads_bot`.
- Existing KV from before the split has `views` / `downloads` only. On read, any remainder is attributed to **human** (never seeded as bot).
- Each increment writes unique keys (`views:<uuid>`, `views_human:<uuid>` or `views_bot:<uuid>`) and running totals via `parseInt(get)||0+1`.
- `/v1/stats` lists the unique keys as the source of truth.
- KV list is eventually consistent (a just-written key may take up to ~60s to appear in another colo). Failed increments are not invented later.

## Routes

| Method | Path | Counted? |
| --- | --- | --- |
| GET | `/` | views, on HTML 200 |
| GET | `/download` | downloads, on verified gzip 200 |
| GET | `/v1/health` | no |
| GET | `/v1/stats`, `/stats`, `/count` | no |
| GET | `/cite.json`, `/llms.txt`, `/ai.txt`, `/humans.txt`, `/robots.txt` | no |
| GET | `/sitemap.xml`, `/sitemap-index.xml` | no |
| GET | `/person.jsonld`, `/graph.jsonld` | no |
| GET | `/.well-known/mcp.json` | no |
| GET | `/v1/skill` | no |
| GET | `/openapi.json` | no |
| GET / POST | `/mcp` | no (GET is a transport note; POST is read-only health/stats/cite/skill) |

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

npm run pack          # builds release/trades-runtime-0.3.4.tgz via npm pack
npx wrangler deploy   # Worker name trades-runtime → trades-runtime.vibelock.workers.dev
# COUNTS KV is already bound (id in wrangler.jsonc). Do not recreate unless the namespace is gone.
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
