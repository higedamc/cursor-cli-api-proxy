/**
 * OpenAI chat request -> Cursor CLI input
 */

import type { OpenAIChatRequest, OpenAIMessageContent } from "../types/openai.js";

export interface CliInput {
  prompt: string;
  model: string;
  sessionId?: string;
}

const MODEL_ALIAS: Record<string, string> = {
  "cursor-default": "default",
  "cursor-opus": "opus",
  "cursor-sonnet": "sonnet",
  "cursor-haiku": "haiku",
};

export function extractModel(model: string): string {
  return MODEL_ALIAS[model] ?? model;
}

function extractContentText(content: OpenAIMessageContent): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n");
  }
  return String(content);
}

export function messagesToPrompt(messages: OpenAIChatRequest["messages"]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    const text = extractContentText(msg.content);
    if (!text) continue;
    switch (msg.role) {
      case "system":
      case "developer":
        parts.push(`[Context]\n${text}\n`);
        break;
      case "user":
        parts.push(text);
        break;
      case "assistant":
        parts.push(`[Previous response]\n${text}\n`);
        break;
    }
  }
  return parts.join("\n").trim();
}

export function openaiToCli(request: OpenAIChatRequest): CliInput {
  return {
    prompt: messagesToPrompt(request.messages),
    model: extractModel(request.model ?? "cursor-default"),
    sessionId: request.user,
  };
}
