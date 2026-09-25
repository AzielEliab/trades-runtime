# Giveaway Worker smoke notes

Run after `npm run giveaway:pack` so `release/trades-runtime-0.4.0.tgz` exists.

```bash
cd workers/giveaway
npx wrangler dev --port 8787
```

In another shell (Miniflare KV starts at 0):

```bash
# Health / catalog — must NOT increment views or downloads
curl -sS http://127.0.0.1:8787/v1/health
curl -sS http://127.0.0.1:8787/v1/stats
curl -sS http://127.0.0.1:8787/count
# expect views/downloads/total + human/bot split, all 0

curl -sS http://127.0.0.1:8787/cite.json
curl -sS http://127.0.0.1:8787/llms.txt
curl -sS http://127.0.0.1:8787/ai.txt
curl -sS http://127.0.0.1:8787/humans.txt
curl -sS http://127.0.0.1:8787/robots.txt
curl -sS http://127.0.0.1:8787/sitemap.xml
curl -sS http://127.0.0.1:8787/.well-known/mcp.json
curl -sS http://127.0.0.1:8787/openapi.json
curl -sS http://127.0.0.1:8787/v1/skill
curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
curl -sS http://127.0.0.1:8787/v1/stats
# still views=0 downloads=0

# Homepage view — increments views by 1
curl -sS -o /tmp/tr-home.html -w "%{http_code}\n" http://127.0.0.1:8787/
# 200
curl -sS http://127.0.0.1:8787/v1/stats
# views=1 downloads=0

# Health-check UA must not increment
curl -sS -A "kube-probe/1.0" http://127.0.0.1:8787/ >/dev/null
curl -sS http://127.0.0.1:8787/v1/stats
# views still 1

# Failed download (if you temporarily hide the tarball) must not increment.
# Successful download increments downloads by 1
curl -sS -o /tmp/trades-runtime-0.4.0.tgz -w "%{http_code}\n" http://127.0.0.1:8787/download
# 200; file starts with gzip magic 1f 8b
curl -sS http://127.0.0.1:8787/v1/stats
# views=1 downloads=1
```

Automated coverage lives in `test/*.test.ts` (`npm test` in this directory).
