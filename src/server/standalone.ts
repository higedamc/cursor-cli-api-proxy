#!/usr/bin/env node
/**
 * Standalone server - Cursor CLI API proxy
 * Usage: CURSOR_API_KEY=xxx node dist/server/standalone.js [port]
 */

import { startServer, stopServer } from "./index.js";
import { verifyAgent } from "../subprocess/manager.js";

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
  if (!skipCheck && !process.env.CURSOR_API_KEY) {
    console.error("Error: CURSOR_API_KEY environment variable is required.");
    console.error("Get your key from Cursor dashboard: Integrations > User API Keys");
    process.exit(1);
  }

  if (!skipCheck) {
    console.log("Checking Cursor Agent CLI...");
    const check = await verifyAgent();
    if (!check.ok) {
      console.error("Error:", check.error);
      console.error("Install: curl https://cursor.com/install -fsS | bash");
      process.exit(1);
    }
    console.log("  Agent CLI:", check.version || "OK\n");
  } else {
    console.log("Skipping CLI check (--skip-cli-check). Set CURSOR_API_KEY for chat.\n");
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
