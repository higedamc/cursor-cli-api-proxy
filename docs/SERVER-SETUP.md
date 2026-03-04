# Server Setup, Startup, and Usage

This guide explains how to deploy, run, and use Cursor CLI API Proxy on a server (for example, LNVPS).

---

## 1. Server Setup

### 1.1 Prerequisites

| Item | Details |
| ---- | ------- |
| OS | Linux (Ubuntu / Debian, examples assume Ubuntu) |
| Node.js | `v24.14.0` (Active LTS recommended, npm 10.x) |
| Cursor | Pro or Business subscription |
| Network | Client machines (Cursor IDE, etc.) can reach the server port |

### 1.2 Install Node.js

```bash
# Ubuntu example (skip if already installed)
sudo apt update
sudo apt install -y nodejs npm
node -v   # confirm v24.14.0 (or latest 24.x LTS)
npm -v
```

### 1.3 Install Cursor Agent CLI

```bash
curl https://cursor.com/install -fsS | bash
```

After installation, reload your shell or run `source ~/.bashrc`, then confirm that `agent` is available:

```bash
agent --version
```

### 1.4 Configure Authentication (choose one)

#### Method A: Browser login (recommended, session-based)

Run this once on the server that will run the proxy:

```bash
agent login
```

If a browser opens, that machine must have browser access.  
For headless servers, you can also authenticate on another machine and copy the Cursor CLI auth files to the server (check official Cursor CLI docs for the exact file location).

Check authentication state:

```bash
agent status
```

#### Method B: API key

Generate an API key in Cursor Dashboard and pass it as an environment variable.

- Generate key: Cursor Dashboard > Integrations > User API Keys
- Set `CURSOR_API_KEY` at startup (see section 2)

### 1.5 Build the Proxy

In the cloned repository:

```bash
cd /path/to/cursor-cli-api-proxy
npm install
npm run build
```

If JavaScript files are generated under `dist/`, the build succeeded.

### 1.6 Port and Firewall

- By default, the proxy listens on port **3457**.
- If clients are on different machines, open that port.

Example (`ufw`):

```bash
sudo ufw allow 3457/tcp
sudo ufw status
```

---

## 2. Startup Methods

### 2.1 Start in foreground (manual)

```bash
cd /path/to/cursor-cli-api-proxy
npm start
```

Or:

```bash
node dist/server/standalone.js
```

- By default it listens on `0.0.0.0:3457` (reachable from other hosts).
- To change the port, pass it as the first argument:

```bash
node dist/server/standalone.js 8080
```

- To skip CLI/auth checks temporarily (for example, testing health endpoint first):

```bash
node dist/server/standalone.js 3457 --skip-cli-check
```

In this mode, startup does not validate `agent` or authentication, so chat requests may still fail later.

### 2.2 Start in background (`nohup`)

```bash
cd /path/to/cursor-cli-api-proxy
nohup node dist/server/standalone.js 3457 > proxy.log 2>&1 &
echo $!   # save PID, stop with: kill <PID>
```

### 2.3 Run as a long-lived `systemd` service

Example service file:

```ini
# /etc/systemd/system/cursor-cli-proxy.service
[Unit]
Description=Cursor CLI API Proxy
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/cursor-cli-api-proxy
ExecStart=/usr/bin/node dist/server/standalone.js 3457
Restart=on-failure
RestartSec=5
# Keep this as-is for session auth. If using API key:
# Environment=CURSOR_API_KEY=your_key_here

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cursor-cli-proxy
sudo systemctl start cursor-cli-proxy
sudo systemctl status cursor-cli-proxy
```

View logs:

```bash
journalctl -u cursor-cli-proxy -f
```

---

## 3. Usage

### 3.1 Health and API test (`curl`)

Run on the server, or from a client against `SERVER_IP:3457`:

```bash
# Health check
curl http://localhost:3457/health

# List models
curl http://localhost:3457/v1/models

# Chat (non-streaming)
curl -X POST http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cursor-default",
    "messages": [{"role": "user", "content": "Hello, reply in one word."}]
  }'

# Chat (streaming)
curl -N -X POST http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cursor-default",
    "messages": [{"role": "user", "content": "Count from 1 to 3."}],
    "stream": true
  }'
```

For remote access, replace `localhost` with the server IP or FQDN.

### 3.2 Use as a custom model in Cursor IDE

1. Open Cursor Settings (Settings > Models or equivalent model settings screen).
2. Add a custom model with these values:

| Field | Value |
| ----- | ----- |
| Display name | Any (example: Cursor Proxy) |
| baseUrl | `http://<SERVER_IP_OR_FQDN>:3457/v1` |
| apiKey | Any string (ignored by this proxy; empty or `not-needed` works) |
| Model ID | `cursor-default` or `cursor-opus` / `cursor-sonnet` / `cursor-haiku` |

Example JSON:

```json
{
  "models": {
    "cursor-proxy": {
      "name": "Cursor (Proxy)",
      "apiKey": "not-needed",
      "baseUrl": "http://192.168.1.100:3457/v1",
      "contextLength": 200000,
      "temperature": 0.7
    }
  }
}
```

Select that model and requests will route through this proxy while using your Cursor subscription.

### 3.3 Other OpenAI-compatible clients

For clients that speak OpenAI format API (for example Continue.dev or custom scripts), configure:

- **Base URL**: `http://<SERVER>:3457/v1`
- **API Key**: any value (not validated by this proxy)
- **model**: `cursor-default` / `cursor-opus` / `cursor-sonnet` / `cursor-haiku`

Example (Python):

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://your-server:3457/v1",
    api_key="not-needed"
)
r = client.chat.completions.create(
    model="cursor-default",
    messages=[{"role": "user", "content": "Hello"}]
)
print(r.choices[0].message.content)
```

### 3.4 Available Model IDs

| model | Description |
| ----- | ----------- |
| cursor-default | Default model |
| cursor-opus | Opus family |
| cursor-sonnet | Sonnet family |
| cursor-haiku | Haiku family |

Actual backend mapping depends on Cursor Agent CLI `--model` behavior.

---

## 4. Troubleshooting

| Symptom | Check / Fix |
| ------- | ----------- |
| "Cursor Agent CLI not found" at startup | Confirm `agent --version` works, verify PATH, reinstall CLI if needed |
| "Not authenticated" at startup | Run `agent status`; if not logged in, run `agent login` or set `CURSOR_API_KEY` |
| Cannot connect | Confirm firewall allows 3457 and test `curl http://<server>:3457/health` from client |
| No chat response / timeout | Check whether `agent` is stuck on heavy work; inspect logs and `agent status` |
| Streaming stops immediately | Disable client-side buffering (`-N` for curl) |

For debugging, start with `DEBUG=1` to emit request logs to stderr:

```bash
DEBUG=1 node dist/server/standalone.js 3457
```

---

## 5. Summary

1. **Setup**: Install Node.js and Cursor Agent CLI, authenticate (`agent login` or `CURSOR_API_KEY`), and build.
2. **Run**: Use `npm start` or `node dist/server/standalone.js [port]`. For production, prefer a long-running service such as `systemd`.
3. **Use**: Verify `/health` and `/v1/models`, then point Cursor IDE or other clients to `http://<server>:3457/v1` with model IDs such as `cursor-default`.
