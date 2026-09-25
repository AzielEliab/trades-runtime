# Glama listing — trades-runtime

Public identity: **Aziel Eliab** only. Person `@id` https://www.azieleliab.com/#aziel

Glama is one of the compatible AI clients (ChatGPT, Grok, Venice, Claude, Cursor, Glama, Perplexity, Copilot, Gemini, Mistral, Meta AI, Apple Intelligence, Amazon Q, DuckAssist, You.com, Cohere, plus other MCP/OpenAPI-capable assistants). This page is the practical Install Server / stdio path.

Intended listing (document the URL; do **not** treat Install Server as LIVE until a Glama admin Deploy + Make Release succeeds):

[glama.ai/mcp/servers/AzielEliab/trades-runtime](https://glama.ai/mcp/servers/AzielEliab/trades-runtime)

Glama hosting runs a **stdio** MCP process (stdin/stdout JSON-RPC). The giveaway Worker already speaks MCP over HTTP at `POST https://trades-runtime.vibelock.workers.dev/mcp`. Without a stdio entrypoint, `glama.json`, and a Dockerfile, Glama cannot offer **Install Server**.

This repo ships:

| File | Role |
|------|------|
| [`glama.json`](../glama.json) | Claim file. Schema requires `maintainers` (GitHub username `AzielEliab`). Listing `name` (`Trades Runtime`), `version` (`0.4.3`), designed-purpose `description` (local-first BYO field-trades; `live_backends` false), `keywords`, `homepage` (`https://glama.ai/mcp/servers/AzielEliab/trades-runtime`), and `documentation` (`https://github.com/AzielEliab/trades-runtime/blob/main/docs/GLAMA.md`) are additional properties. |
| [`cli/mcp-stdio.mjs`](../cli/mcp-stdio.mjs) | Stdio MCP server. Bridges to the hosted Worker `/mcp` with `User-Agent: Mozilla/5.0`. |
| [`Dockerfile`](../Dockerfile) | Local / “from Dockerfile” image. Glama admin often **generates** its own image from CMD args — still ship this file. |

Do not invent Glama TDQS scores. Do not claim the listing or Install Server is already live.

## Honesty

- Local-first BYO field-trades runtime (HVAC / plumbing / electrical / sewer / cross-trades).
- Public MCP tools are read-only: `trades_runtime_health`, `trades_runtime_stats`, `trades_runtime_cite`, `trades_runtime_skill`.
- `live_backends` false.
- Dual surface: agents via MCP / OpenAPI; humans via Worker UI + counted `/download`.

## Why stdio

Glama wraps the process and talks MCP on stdin/stdout (newline-delimited JSON-RPC; Content-Length framing is also accepted). HTTP `POST /mcp` stays the Worker API; this CLI forwards `initialize`, `tools/list`, `tools/call`, `ping`, and notifications so the tool list is not duplicated.

## Run locally

```bash
node cli/mcp-stdio.mjs
npm run mcp
```

Optional:

```bash
# point at another Worker origin
TRADES_RUNTIME_URL=https://trades-runtime.vibelock.workers.dev node cli/mcp-stdio.mjs
```

Stdout is MCP only. Logs go to stderr.

Claude Desktop / Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "trades-runtime": {
      "command": "node",
      "args": ["cli/mcp-stdio.mjs"],
      "cwd": "/path/to/trades-runtime",
      "env": {
        "TRADES_RUNTIME_URL": "https://trades-runtime.vibelock.workers.dev"
      }
    }
  }
}
```

## Docker

```bash
docker build -t trades-runtime-mcp .
docker run --rm -i trades-runtime-mcp
```

Optional URL:

```bash
docker run --rm -i \
  -e TRADES_RUNTIME_URL=https://trades-runtime.vibelock.workers.dev \
  trades-runtime-mcp
```

## Glama admin — claim, Deploy, Make Release

Git alone cannot turn **Install Server** on. After this lands on `main`, **GitBaby / TradesBot** (or a human signed in as `AzielEliab` on glama.ai) must finish the Glama admin UI:

1. Open [Score / claim](https://glama.ai/mcp/servers/AzielEliab/trades-runtime/score) and claim with `glama.json` maintainers (`AzielEliab`). Re-run claim after any `glama.json` change so Glama re-reads the file.
2. Open [admin Dockerfile](https://glama.ai/mcp/servers/AzielEliab/trades-runtime/admin/dockerfile). Glama generates a container (it does not have to use this repo’s `Dockerfile`). Fill:
   - **Build steps:** `["npm install --omit=dev"]` (or `npm ci --omit=dev` if a lockfile exists)
   - **CMD arguments:** `["node", "cli/mcp-stdio.mjs"]` — this repo’s Dockerfile uses the same CMD.
   - **Environment variables JSON schema:**

```json
{
  "type": "object",
  "properties": {
    "TRADES_RUNTIME_URL": {
      "type": "string",
      "description": "Worker origin. Default https://trades-runtime.vibelock.workers.dev"
    }
  },
  "required": []
}
```

   - Placeholder parameters: `{}` (the public Worker needs no credentials)
3. **Deploy** — Glama builds the image and starts the stdio server (`initialize` / `tools/list` must succeed).
4. **Make Release** from the passing test (version + changelog). A Glama release is what turns **Install Server** on. It is not a GitHub release.

Once that release exists, the Install Server / Try URL is:

https://glama.ai/mcp/servers/AzielEliab/trades-runtime

No Wrangler deploy is required for the listing. HTTP `/mcp` on the Worker is unchanged.

## Author

Aziel Eliab.
