#!/usr/bin/env node
/**
 * Standalone server - Cursor CLI API proxy
 * Auth: browser session (agent login) or CURSOR_API_KEY env.
 * Usage: node dist/server/standalone.js [port]
 */

import { startServer, stopServer } from "./index.js";
import { verifyAgent, verifyAuth } from "../subprocess/manager.js";

const DEFAULT_PORT = 3457;

async function main(): Promise<void> {
  console.log("Cursor CLI API Proxy - Standalone");
  console.log("=================================\n");

  const port = parseInt(process.argv[2] ?? String(DEFAULT_PORT), 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error("Invalid port. Usage: node standalone.js [port]");
    process.exit(1);
  }

  const skipCheck = process.argv.includes("--skip-cli-check");
  if (!skipCheck) {
    console.log("Checking Cursor Agent CLI...");
    const agentCheck = await verifyAgent();
    if (!agentCheck.ok) {
      console.error("Error:", agentCheck.error);
      console.error("Install: curl https://cursor.com/install -fsS | bash");
      process.exit(1);
    }
    console.log("  Agent CLI:", agentCheck.version || "OK");

    console.log("Checking authentication...");
    const authCheck = await verifyAuth();
    if (!authCheck.ok) {
      console.error("Error:", authCheck.error);
      console.error("Either run 'agent login' (browser session) or set CURSOR_API_KEY.");
      process.exit(1);
    }
    console.log("  Auth: OK (session or CURSOR_API_KEY)\n");
  } else {
    console.log("Skipping CLI check (--skip-cli-check).\n");
  }

  try {
    await startServer({ port, host: "0.0.0.0" });
    console.log("Ready. Test:");
    console.log(`  curl http://localhost:${port}/health`);
    console.log(`  curl -X POST http://localhost:${port}/v1/chat/completions \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"model":"cursor-default","messages":[{"role":"user","content":"Hello"}]}'`);
    console.log("\nPress Ctrl+C to stop.\n");
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }

  const shutdown = async () => {
    console.log("\nShutting down...");
    await stopServer();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
