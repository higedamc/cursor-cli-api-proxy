/**
 * Cursor Agent CLI stream-json output types
 * Based on Cursor headless docs (--output-format stream-json)
 */

export interface CursorCliAssistantContent {
  type: "text";
  text: string;
}

export interface CursorCliAssistant {
  type: "assistant";
  message: {
    model?: string;
    id?: string;
    role: "assistant";
    content: CursorCliAssistantContent[];
    stop_reason?: string | null;
  };
  session_id?: string;
  uuid?: string;
}

export interface CursorCliResult {
  type: "result";
  subtype: "success" | "error";
  is_error?: boolean;
  duration_ms?: number;
  result?: string;
  session_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface CursorCliSystemInit {
  type: "system";
  subtype: "init";
  model?: string;
  session_id?: string;
  [key: string]: unknown;
}

export type CursorCliMessage =
  | CursorCliAssistant
  | CursorCliResult
  | CursorCliSystemInit
  | { type: string; subtype?: string; [key: string]: unknown };

export function isAssistantMessage(msg: CursorCliMessage): msg is CursorCliAssistant {
  return msg.type === "assistant";
}

export function isResultMessage(msg: CursorCliMessage): msg is CursorCliResult {
  return msg.type === "result";
}

export function isSystemInit(msg: CursorCliMessage): msg is CursorCliSystemInit {
  return msg.type === "system" && (msg as { subtype?: string }).subtype === "init";
}
