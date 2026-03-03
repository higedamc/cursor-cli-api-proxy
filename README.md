# Cursor CLI API Proxy

OpenAI-compatible HTTP API that wraps Cursor Agent CLI. Uses your Cursor subscription (Pro/Business) so you can point OpenAI-compatible clients at this proxy instead of paying per-API token.

Reference: [claude-max-api-proxy](https://github.com/mnemon-dev/claude-max-api-proxy) (same idea for Claude Code CLI).

## Prerequisites

1. Cursor Pro or Business subscription.
2. Cursor Agent CLI installed and an API key:
   - Install: `curl https://cursor.com/install -fsS | bash`
   - Create API key: Cursor dashboard > Integrations > User API Keys
3. Node.js >= 20.

## Setup

```bash
cd cursor-cli-api-proxy
npm install
npm run build
```

## Run

```bash
export CURSOR_API_KEY=your_key_from_cursor_dashboard
npm start
# Or: node dist/server/standalone.js [port]
# Default port: 3457. Listens on 0.0.0.0 so LNVPS/remote access works.
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /health | GET | Health check |
| /v1/models | GET | List models |
| /v1/chat/completions | POST | Chat (streaming and non-streaming) |

## Model IDs

Use these in the `model` field of requests:

- `cursor-default`
- `cursor-opus`
- `cursor-sonnet`
- `cursor-haiku`

## Cursor IDE (custom model)

In Cursor Settings > Models, add a custom model:

- **baseUrl**: `http://<LNVPS_IP>:3457/v1`
- **apiKey**: any value (proxy ignores it; auth is via CURSOR_API_KEY on the server)
- **model**: `cursor-default` (or cursor-opus / cursor-sonnet / cursor-haiku)

## Test

```bash
curl http://localhost:3457/health
curl http://localhost:3457/v1/models
curl -X POST http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"cursor-default","messages":[{"role":"user","content":"Say hello in one word."}]}'
```

## License

MIT
