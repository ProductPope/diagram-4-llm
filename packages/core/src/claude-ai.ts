import { z } from "zod";

import type { ActivityItem, SessionStep } from "./claude-code.js";
import { err, ok, type Result } from "./result.js";

// A Claude.ai data export holds the account's conversations in
// `conversations.json`. The format is not documented. The schemas below
// read only the fields this module uses, as found in an export made on
// 2026-10-08, and ignore any others so that later exports with more fields
// still load. See ADR 0013.

/** The parent of a conversation's first message. */
const ROOT_PARENT = "00000000-0000-4000-8000-000000000000";

const conversationSchema = z.object({
  uuid: z.string().min(1),
  name: z.string(),
  updated_at: z.string(),
  chat_messages: z.array(z.unknown()),
});

const messageSchema = z.object({
  uuid: z.string().min(1),
  sender: z.enum(["human", "assistant"]),
  parent_message_uuid: z.string().nullable().optional(),
  created_at: z.string().optional(),
  // `text` repeats the text blocks, with a placeholder for each tool call,
  // so the blocks are read instead.
  content: z.array(z.object({ type: z.string() }).loose()),
  attachments: z.array(z.object({ file_name: z.string() })).optional(),
  files: z.array(z.object({ file_name: z.string() })).optional(),
});

const textBlock = z.object({ type: z.literal("text"), text: z.string() });
const toolUseBlock = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const toolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.array(z.object({ type: z.string() }).loose()),
  is_error: z.boolean(),
});
const knowledgeBlock = z.object({
  type: z.literal("knowledge"),
  title: z.string(),
  url: z.string(),
});

export interface ClaudeAiConversation {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  /** Parents before children, as the session map expects. */
  readonly steps: readonly SessionStep[];
  /**
   * Content with nothing to show on the map, such as thinking or files,
   * counted by kind, so that the map does not appear to be everything.
   */
  readonly notShown: ReadonlyMap<string, number>;
}

export interface ClaudeAiExport {
  /** Most recently updated first; never empty. */
  readonly conversations: readonly [
    ClaudeAiConversation,
    ...ClaudeAiConversation[],
  ];
  /** Conversations and messages that could not be read; the rest loads. */
  readonly problems: readonly string[];
}

export type ClaudeAiExportError =
  | { readonly code: "not-an-export" }
  | { readonly code: "empty" }
  | { readonly code: "no-conversations"; readonly problems: readonly string[] };

/**
 * Reads the parsed `conversations.json` of a Claude.ai data export into
 * read-only maps, one per conversation: each message of the user is a
 * prompt, and each answer an activity with its text and tool calls. Like a
 * Claude Code session, it is a view of the export, never a conversation of
 * the app.
 */
export function readClaudeAiExport(
  document: unknown,
): Result<ClaudeAiExport, ClaudeAiExportError> {
  if (!Array.isArray(document)) return err({ code: "not-an-export" });
  if (document.length === 0) return err({ code: "empty" });

  const conversations: ClaudeAiConversation[] = [];
  const problems: string[] = [];
  for (const [index, entry] of document.entries()) {
    const parsed = conversationSchema.safeParse(entry);
    if (!parsed.success) {
      problems.push(
        `Conversation ${String(index + 1)} could not be read: ${issueOf(parsed.error)}`,
      );
      continue;
    }
    conversations.push(readConversation(parsed.data, problems));
  }
  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [first, ...rest] = conversations;
  if (first === undefined) return err({ code: "no-conversations", problems });
  return ok({ conversations: [first, ...rest], problems });
}

function readConversation(
  conversation: z.infer<typeof conversationSchema>,
  problems: string[],
): ClaudeAiConversation {
  const title =
    conversation.name.trim() === ""
      ? "Untitled conversation"
      : conversation.name;
  const messages: z.infer<typeof messageSchema>[] = [];
  for (const [index, entry] of conversation.chat_messages.entries()) {
    const parsed = messageSchema.safeParse(entry);
    if (parsed.success) messages.push(parsed.data);
    else
      problems.push(
        `${title}, message ${String(index + 1)} could not be read: ${issueOf(parsed.error)}`,
      );
  }

  const ids = new Set(messages.map((message) => message.uuid));
  const notShown = new Map<string, number>();
  const hide = (kind: string) => {
    notShown.set(kind, (notShown.get(kind) ?? 0) + 1);
  };
  // Where each message is on the map: its own step, or the nearest step
  // above it when it has nothing to show.
  const shown = new Map<string, string | null>();
  const steps: SessionStep[] = [];
  const ordered = parentsFirst(messages, ids);
  for (const message of ordered) {
    const parent = message.parent_message_uuid;
    const above =
      parent === null || parent === undefined || !ids.has(parent)
        ? null
        : (shown.get(parent) ?? null);
    const step = stepOf(message, above, hide);
    if (step === null) {
      shown.set(message.uuid, above);
      continue;
    }
    steps.push(step);
    shown.set(message.uuid, step.id);
  }
  if (ordered.length < messages.length)
    problems.push(
      `${title}: some messages are not linked to the start of the conversation and are not on the map.`,
    );
  return {
    id: conversation.uuid,
    title,
    updatedAt: conversation.updated_at,
    steps,
    notShown,
  };
}

/**
 * The messages in an order where each parent comes before its children,
 * keeping the export's order among siblings. Messages whose parent chain
 * never reaches the start, which a damaged export could hold, are left out.
 */
function parentsFirst(
  messages: readonly z.infer<typeof messageSchema>[],
  ids: ReadonlySet<string>,
): z.infer<typeof messageSchema>[] {
  const children = new Map<string | null, z.infer<typeof messageSchema>[]>();
  for (const message of messages) {
    const parent = message.parent_message_uuid;
    const key =
      parent === null ||
      parent === undefined ||
      parent === ROOT_PARENT ||
      !ids.has(parent)
        ? null
        : parent;
    children.set(key, [...(children.get(key) ?? []), message]);
  }
  const ordered: z.infer<typeof messageSchema>[] = [];
  const stack = [...(children.get(null) ?? [])].reverse();
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    ordered.push(next);
    stack.push(...[...(children.get(next.uuid) ?? [])].reverse());
  }
  return ordered;
}

function stepOf(
  message: z.infer<typeof messageSchema>,
  parentId: string | null,
  hide: (kind: string) => void,
): SessionStep | null {
  const timestamp = message.created_at ?? null;
  if (message.sender === "human") {
    const files = [
      ...(message.attachments ?? []),
      ...(message.files ?? []),
    ].map((file) => file.file_name);
    const parts = message.content.flatMap((block) => {
      const text = textBlock.safeParse(block);
      if (text.success) return [text.data.text];
      hide(block.type);
      return [];
    });
    // Only the names of attached files are shown; their content is not.
    if (files.length > 0) parts.push(`[Attached: ${files.join(", ")}]`);
    const text = parts.join("\n\n");
    if (text.trim() === "") {
      hide("empty message");
      return null;
    }
    return { kind: "prompt", id: message.uuid, parentId, text, timestamp };
  }

  const items: ActivityItem[] = [];
  const calls = new Map<string, number>();
  for (const block of message.content) {
    const text = textBlock.safeParse(block);
    const call = toolUseBlock.safeParse(block);
    const result = toolResultBlock.safeParse(block);
    if (text.success) {
      if (text.data.text.trim() !== "")
        items.push({ kind: "text", text: text.data.text });
    } else if (call.success) {
      calls.set(call.data.id, items.length);
      items.push({
        kind: "tool",
        name: call.data.name,
        input: JSON.stringify(call.data.input, null, 2),
        result: null,
      });
    } else if (result.success) {
      const index = calls.get(result.data.tool_use_id);
      const item = index === undefined ? undefined : items[index];
      if (index === undefined || item?.kind !== "tool") hide("tool result");
      else
        items[index] = {
          ...item,
          result: {
            text: resultText(result.data.content),
            isError: result.data.is_error,
          },
        };
    } else {
      hide(block.type);
    }
  }
  if (items.length === 0) {
    hide("empty answer");
    return null;
  }
  return {
    kind: "activity",
    id: message.uuid,
    parentId,
    model: null,
    items,
    timestamp,
  };
}

/** A tool result's blocks as text, with other blocks named in brackets. */
function resultText(
  blocks: readonly z.infer<typeof toolResultBlock>["content"][number][],
): string {
  return blocks
    .map((block) => {
      const text = textBlock.safeParse(block);
      if (text.success) return text.data.text;
      const source = knowledgeBlock.safeParse(block);
      if (source.success) return `${source.data.title} (${source.data.url})`;
      return `[${block.type}]`;
    })
    .join("\n\n");
}

function issueOf(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "It does not match the expected format.";
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}
