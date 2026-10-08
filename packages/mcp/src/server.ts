import {
  err,
  ok,
  readClaudeCodeSession,
  type ConversationGraph,
  type Result,
} from "@diagram-4-llm/core";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  describeBranch,
  describeConversationMap,
  describeConversations,
  describeSessionBranch,
  describeSessionFiles,
  describeSessionMap,
} from "./describe.js";
import {
  listSessionFiles,
  loadConversations,
  readSessionFile,
  type Sources,
} from "./sources.js";

export const SERVER_NAME = "diagram-4-llm";
export const SERVER_VERSION = "0.1.0";

/** Every tool only reads files, so clients may call them without asking. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * The server and its tools. Files are read on every call, so the answers
 * follow new exports and sessions that are still being written.
 */
export function createServer(sources: Sources): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  const { conversationsDir, claudeProjectsDir } = sources;

  if (conversationsDir !== null) {
    server.registerTool(
      "list_conversations",
      {
        title: "List conversations",
        description:
          "Lists the conversations exported from diagram-4-llm, a chat app where a conversation is a tree of branches, with their IDs.",
        inputSchema: z.object({}),
        annotations: READ_ONLY,
      },
      async () => {
        const { conversations, problems } =
          await loadConversations(conversationsDir);
        return text(describeConversations(conversations, problems));
      },
    );

    server.registerTool(
      "read_conversation_map",
      {
        title: "Read a conversation's map",
        description:
          "Shows every turn of a conversation as a tree, with turn IDs and the summaries of its branches.",
        inputSchema: z.object({
          conversationId: z.string().describe("From list_conversations."),
        }),
        annotations: READ_ONLY,
      },
      async ({ conversationId }) => {
        const found = await findConversation(conversationsDir, conversationId);
        return found.ok
          ? text(describeConversationMap(found.value))
          : failure(found.error);
      },
    );

    server.registerTool(
      "read_branch",
      {
        title: "Read a branch",
        description:
          "Reads one branch of a conversation up to a turn, as the model saw it: earlier turns of the branch, with attached turns and summaries in place.",
        inputSchema: z.object({
          conversationId: z.string().describe("From list_conversations."),
          turnId: z.string().describe("From read_conversation_map."),
        }),
        annotations: READ_ONLY,
      },
      async ({ conversationId, turnId }) => {
        const found = await findConversation(conversationsDir, conversationId);
        if (!found.ok) return failure(found.error);
        const branch = describeBranch(found.value, turnId);
        return branch.ok ? text(branch.value) : failure(branch.error);
      },
    );
  }

  server.registerTool(
    "list_claude_code_sessions",
    {
      title: "List Claude Code sessions",
      description:
        "Lists Claude Code session transcripts on this computer, most recently changed first. The session in progress is usually the first one of its project.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("How many to list; 20 if not given."),
      }),
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { sessions, problems } = await listSessionFiles(claudeProjectsDir);
      return text(describeSessionFiles(sessions, problems, limit ?? 20));
    },
  );

  server.registerTool(
    "read_claude_code_session",
    {
      title: "Read a Claude Code session",
      description:
        "Without stepId, shows a Claude Code session as a tree of prompts, answers with the tools they used, and compactions, with step IDs. With stepId, reads the branch through that step in full, including tool inputs and results.",
      inputSchema: z.object({
        path: z.string().describe("From list_claude_code_sessions."),
        stepId: z.string().optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ path, stepId }) => {
      const file = await readSessionFile(claudeProjectsDir, path);
      if (!file.ok) return failure(`${path} could not be read: ${file.error}`);
      const session = readClaudeCodeSession(file.value);
      if (!session.ok)
        return failure(
          session.error.code === "empty"
            ? `${path} is empty.`
            : `${path} has no prompts or answers that could be read.`,
        );
      if (stepId === undefined)
        return text(describeSessionMap(path, session.value));
      const branch = describeSessionBranch(path, session.value, stepId);
      return branch.ok ? text(branch.value) : failure(branch.error);
    },
  );

  return server;
}

async function findConversation(
  dir: string,
  id: string,
): Promise<Result<ConversationGraph, string>> {
  const { conversations } = await loadConversations(dir);
  const found = conversations.find((c) => c.graph.conversation.id === id);
  return found === undefined
    ? err(`No conversation with ID ${id}.`)
    : ok(found.graph);
}

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

/** A failure the model can read and act on, such as an unknown ID. */
function failure(message: string) {
  return { ...text(message), isError: true };
}
