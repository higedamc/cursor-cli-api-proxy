/**
 * Express server - OpenAI-compatible API wrapping Cursor Agent CLI
 */

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { handleChatCompletions, handleModels, handleHealth } from "./routes.js";

export interface ServerConfig {
  port: number;
  host?: string;
}

let serverInstance: Server | null = null;

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (process.env.DEBUG) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });
  app.options("*", (_req: Request, res: Response) => res.sendStatus(200));

  app.get("/health", handleHealth);
  app.get("/v1/models", handleModels);
  app.post("/v1/chat/completions", handleChatCompletions);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: { message: "Not found", type: "invalid_request_error", code: "not_found" },
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Server Error]", err.message);
    res.status(500).json({
      error: { message: err.message, type: "server_error", code: null },
    });
  });

  return app;
}

export async function startServer(config: ServerConfig): Promise<Server> {
  const { port, host = "0.0.0.0" } = config;
  if (serverInstance) {
    console.log("[Server] Already running");
    return serverInstance;
  }
  const app = createApp();
  return new Promise((resolve, reject) => {
    serverInstance = createServer(app);
    serverInstance.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") reject(new Error(`Port ${port} is already in use`));
      else reject(err);
    });
    serverInstance.listen(port, host, () => {
      console.log(`[Server] Cursor CLI proxy at http://${host}:${port}`);
      console.log(`[Server] OpenAI-compatible: http://${host}:${port}/v1/chat/completions`);
      resolve(serverInstance!);
    });
  });
}

export async function stopServer(): Promise<void> {
  if (!serverInstance) return;
  return new Promise((resolve, reject) => {
    serverInstance!.close((err) => {
      if (err) reject(err);
      else {
        serverInstance = null;
        console.log("[Server] Stopped");
        resolve();
      }
    });
  });
}
