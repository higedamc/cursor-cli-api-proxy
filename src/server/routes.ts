/**
 * OpenAI-compatible route handlers
 */

import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { CursorSubprocess } from "../subprocess/manager.js";
import { openaiToCli } from "../adapter/openai-to-cli.js";
import {
  cliResultToOpenai,
  createDoneChunk,
  extractTextContent,
} from "../adapter/cli-to-openai.js";
import type { OpenAIChatRequest } from "../types/openai.js";
import type { CursorCliAssistant, CursorCliResult } from "../types/cursor-cli.js";

export async function handleChatCompletions(req: Request, res: Response): Promise<void> {
  const requestId = uuidv4().replace(/-/g, "").slice(0, 24);
  const body = req.body as OpenAIChatRequest;
  const stream = body.stream === true;

  try {
    if (!body.messages?.length) {
      res.status(400).json({
        error: {
          message: "messages is required and must be a non-empty array",
          type: "invalid_request_error",
          code: "invalid_messages",
        },
      });
      return;
    }

    const cliInput = openaiToCli(body);
    const subprocess = new CursorSubprocess();

    if (stream) {
      await handleStreaming(res, subprocess, cliInput, requestId);
    } else {
      await handleNonStreaming(res, subprocess, cliInput, requestId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[handleChatCompletions]", message);
    if (!res.headersSent) {
      res.status(500).json({
        error: { message, type: "server_error", code: null },
      });
    }
  }
}

async function handleStreaming(
  res: Response,
  subprocess: CursorSubprocess,
  cliInput: ReturnType<typeof openaiToCli>,
  requestId: string
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Request-Id", requestId);
  res.flushHeaders();
  res.write(":ok\n\n");

  let isFirst = true;
  let lastModel = "cursor-default";
  let isComplete = false;

  return new Promise((resolve) => {
    res.on("close", () => {
      if (!isComplete) subprocess.kill();
      resolve();
    });

    subprocess.on("assistant", (msg: CursorCliAssistant) => {
      const text = extractTextContent(msg);
      if (msg.message?.model) lastModel = msg.message.model;
      if (text && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            id: `chatcmpl-${requestId}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: lastModel,
            choices: [
              {
                index: 0,
                delta: { role: isFirst ? "assistant" : undefined, content: text },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
        isFirst = false;
      }
    });

    subprocess.on("result", (_result: CursorCliResult) => {
      isComplete = true;
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(createDoneChunk(requestId, lastModel))}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
      resolve();
    });

    subprocess.on("error", (error: Error) => {
      console.error("[Streaming]", error.message);
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            error: { message: error.message, type: "server_error", code: null },
          })}\n\n`
        );
        res.end();
      }
      resolve();
    });

    subprocess.on("close", (code: number | null) => {
      if (!res.writableEnded) {
        if (code !== 0 && !isComplete) {
          res.write(
            `data: ${JSON.stringify({
              error: { message: `Process exited with code ${code}`, type: "server_error", code: null },
            })}\n\n`
          );
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
      resolve();
    });

    subprocess.start(cliInput.prompt, {
      model: cliInput.model,
      sessionId: cliInput.sessionId,
    }).catch((err) => {
      console.error("[Streaming] start error", err);
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            error: { message: err instanceof Error ? err.message : String(err), type: "server_error", code: null },
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
      resolve();
    });
  });
}

async function handleNonStreaming(
  res: Response,
  subprocess: CursorSubprocess,
  cliInput: ReturnType<typeof openaiToCli>,
  requestId: string
): Promise<void> {
  return new Promise((resolve) => {
    let finalResult: CursorCliResult | null = null;

    subprocess.on("result", (result: CursorCliResult) => {
      finalResult = result;
    });

    subprocess.on("error", (error: Error) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: { message: error.message, type: "server_error", code: null },
        });
      }
      resolve();
    });

    subprocess.on("close", (code: number | null) => {
      if (finalResult) {
        res.json(cliResultToOpenai(finalResult, requestId));
      } else if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: `Cursor CLI exited with code ${code} without response`,
            type: "server_error",
            code: null,
          },
        });
      }
      resolve();
    });

    subprocess.start(cliInput.prompt, {
      model: cliInput.model,
      sessionId: cliInput.sessionId,
    }).catch((error) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: { message: error.message, type: "server_error", code: null },
        });
      }
      resolve();
    });
  });
}

export function handleModels(_req: Request, res: Response): void {
  res.json({
    object: "list",
    data: [
      { id: "cursor-default", object: "model", owned_by: "cursor", created: Math.floor(Date.now() / 1000) },
      { id: "cursor-opus", object: "model", owned_by: "cursor", created: Math.floor(Date.now() / 1000) },
      { id: "cursor-sonnet", object: "model", owned_by: "cursor", created: Math.floor(Date.now() / 1000) },
      { id: "cursor-haiku", object: "model", owned_by: "cursor", created: Math.floor(Date.now() / 1000) },
    ],
  });
}

export function handleHealth(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    provider: "cursor-cli",
    timestamp: new Date().toISOString(),
  });
}
