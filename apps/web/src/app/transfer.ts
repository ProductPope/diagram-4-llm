import {
  exportConversation,
  importConversation,
  type ConversationGraph,
} from "@diagram-4-llm/core";

import { describeImportError } from "../storage/conversation-store";

/** The exported document, formatted for people who open the file. */
export function serializeConversation(graph: ConversationGraph): string {
  return `${JSON.stringify(exportConversation(graph), null, 2)}\n`;
}

/** A file name from the title, safe on common file systems. */
export function exportFileName(graph: ConversationGraph): string {
  const base = graph.conversation.title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${base === "" ? "conversation" : base}.diagram-4-llm.json`;
}

/**
 * Reads an exported file. The document goes through the core's import, which
 * checks every node, so a damaged or edited file is rejected with the reason
 * instead of being partly imported.
 */
export function parseConversationFile(
  text: string,
):
  | { readonly ok: true; readonly value: ConversationGraph }
  | { readonly ok: false; readonly error: string } {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const imported = importConversation(document);
  return imported.ok
    ? imported
    : { ok: false, error: describeImportError(imported.error) };
}
