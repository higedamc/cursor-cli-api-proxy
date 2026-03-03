/**
 * Cursor CLI output -> OpenAI response format
 */

import type { CursorCliAssistant, CursorCliResult } from "../types/cursor-cli.js";
import type { OpenAIChatResponse, OpenAIChatChunk } from "../types/openai.js";

export function extractTextContent(message: CursorCliAssistant): string {
  if (!message.message?.content || !Array.isArray(message.message.content)) return "";
  return message.message.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

function normalizeModel(model: string | undefined): string {
  if (!model) return "cursor-default";
  if (model.includes("opus")) return "cursor-opus";
  if (model.includes("sonnet")) return "cursor-sonnet";
  if (model.includes("haiku")) return "cursor-haiku";
  return "cursor-default";
}

export function createDoneChunk(requestId: string, model: string): OpenAIChatChunk {
  return {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: normalizeModel(model),
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
}

function ensureString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function cliResultToOpenai(result: CursorCliResult, requestId: string): OpenAIChatResponse {
  return {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "cursor-default",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: ensureString(result.result),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: result.usage?.input_tokens ?? 0,
      completion_tokens: result.usage?.output_tokens ?? 0,
      total_tokens: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    },
  };
}
