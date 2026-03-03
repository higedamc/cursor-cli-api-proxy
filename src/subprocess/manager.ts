/**
 * Cursor Agent CLI subprocess manager
 * Spawns `agent -p --output-format stream-json` and parses JSON lines.
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type {
  CursorCliMessage,
  CursorCliAssistant,
  CursorCliResult,
} from "../types/cursor-cli.js";
import { isAssistantMessage, isResultMessage } from "../types/cursor-cli.js";

export interface SubprocessOptions {
  model: string;
  sessionId?: string;
  cwd?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 300000; // 5 min

export class CursorSubprocess extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = "";
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isKilled = false;

  async start(prompt: string, options: SubprocessOptions): Promise<void> {
    const args = this.buildArgs(prompt, options);
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    return new Promise((resolve, reject) => {
      try {
        // Use process.env as-is: CURSOR_API_KEY if set (API key auth), else agent uses stored session (agent login)
        const env = { ...process.env };

        this.process = spawn("agent", args, {
          cwd: options.cwd ?? process.cwd(),
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.timeoutId = setTimeout(() => {
          if (!this.isKilled && this.process) {
            this.isKilled = true;
            this.process.kill("SIGTERM");
            this.emit("error", new Error(`Request timed out after ${timeout}ms`));
          }
        }, timeout);

        this.process.on("error", (err: NodeJS.ErrnoException) => {
          this.clearTimeout();
          if (err.code === "ENOENT") {
            reject(
              new Error(
                "Cursor Agent CLI not found. Install: curl https://cursor.com/install -fsS | bash. Then set CURSOR_API_KEY."
              )
            );
          } else {
            reject(err);
          }
        });

        this.process.stdout?.on("data", (chunk: Buffer) => {
          this.buffer += chunk.toString();
          this.processBuffer();
        });

        this.process.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trim();
          if (text) console.error("[agent stderr]", text.slice(0, 300));
        });

        this.process.on("close", (code) => {
          this.clearTimeout();
          if (this.buffer.trim()) this.processBuffer();
          this.emit("close", code);
        });

        resolve();
      } catch (err) {
        this.clearTimeout();
        reject(err);
      }
    });
  }

  private buildArgs(prompt: string, options: SubprocessOptions): string[] {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--trust",
    ];
    if (options.model && options.model !== "default") {
      args.push("--model", options.model);
    }
    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }
    args.push(prompt);
    return args;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as CursorCliMessage;
        if (isAssistantMessage(msg)) {
          this.emit("assistant", msg as CursorCliAssistant);
        } else if (isResultMessage(msg)) {
          this.emit("result", msg as CursorCliResult);
        }
      } catch {
        // skip non-JSON
      }
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this.isKilled && this.process) {
      this.isKilled = true;
      this.clearTimeout();
      this.process.kill(signal);
    }
  }
}

export async function verifyAgent(): Promise<{ ok: boolean; error?: string; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("agent", ["--version"], { stdio: "pipe", env: process.env });
    let out = "";
    proc.stdout?.on("data", (c: Buffer) => { out += c.toString(); });
    proc.on("error", () => {
      resolve({
        ok: false,
        error: "Cursor Agent CLI not found. Install: curl https://cursor.com/install -fsS | bash",
      });
    });
    proc.on("close", (code) => {
      resolve(code === 0 ? { ok: true, version: out.trim() } : { ok: false, error: "agent exited non-zero" });
    });
  });
}

const AUTH_CHECK_TIMEOUT_MS = 15000;

/**
 * Verify that Cursor CLI is authenticated (browser session or API key).
 * Runs `agent status`; exit code 0 means authenticated.
 * If `agent status` does not exit within 15s, proceeds as ok (avoids hang on slow/headless env).
 */
export async function verifyAuth(): Promise<{ ok: boolean; error?: string; timedOut?: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn("agent", ["status"], { stdio: "pipe", env: process.env });
    let settled = false;

    const finish = (ok: boolean, error?: string, timedOut?: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      resolve({ ok, error, timedOut });
    };

    const tid = setTimeout(() => {
      finish(true, undefined, true);
    }, AUTH_CHECK_TIMEOUT_MS);

    proc.stderr?.on("data", (_c: Buffer) => {});
    proc.on("error", () => {
      finish(false, "agent not found");
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          error: "Not authenticated. Run 'agent login' (browser session) or set CURSOR_API_KEY.",
        });
      }
    });
  });
}
