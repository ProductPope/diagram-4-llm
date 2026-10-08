// Runs the server in process against folders written by the test, through
// the MCP client, as Claude Code or Claude Desktop would call it.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addSummary,
  addUserTurn,
  appendAssistantContent,
  createConversation,
  exportConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
  type Result,
} from "@diagram-4-llm/core";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";

const T = "2026-10-08T12:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function answer(
  graph: ConversationGraph,
  id: string,
  parentId: string,
  content: string,
): ConversationGraph {
  let g = unwrap(
    startAssistantTurn(graph, {
      id,
      parentId,
      adapter: "anthropic",
      model: "claude-test",
      params: {},
      systemPrompt: null,
      createdAt: T,
    }),
  );
  g = unwrap(appendAssistantContent(g, id, content));
  return unwrap(
    finishAssistantTurn(g, id, { status: "complete", stopReason: "end" }),
  );
}

/** Two branches after one answer, and a summary of the first one. */
function conversation(): ConversationGraph {
  let g = unwrap(
    createConversation({ id: "c1", title: "Databases", createdAt: T }),
  );
  g = unwrap(
    addUserTurn(g, {
      id: "u1",
      parentId: null,
      refs: [],
      content: "Which database?",
      createdAt: T,
    }),
  );
  g = answer(g, "a1", "u1", "SQLite.");
  g = unwrap(
    addUserTurn(g, {
      id: "u2",
      parentId: "a1",
      refs: [],
      content: "Why not PostgreSQL?",
      createdAt: T,
    }),
  );
  g = answer(g, "a2", "u2", "No server needed.");
  g = unwrap(
    addSummary(g, {
      id: "s1",
      covers: { fromId: "u1", toId: "a2" },
      content: "SQLite, because it needs no server.",
      createdAt: T,
    }),
  );
  g = unwrap(
    addUserTurn(g, {
      id: "u3",
      parentId: "a1",
      refs: ["s1"],
      content: "How do I back it up?",
      createdAt: T,
    }),
  );
  return g;
}

function sessionLines(): string {
  return [
    { type: "ai-title", aiTitle: "Fix the build" },
    {
      type: "user",
      uuid: "p1",
      parentUuid: null,
      message: { role: "user", content: "The build fails" },
    },
    {
      type: "assistant",
      uuid: "r1",
      parentUuid: "p1",
      message: {
        id: "m1",
        model: "claude-test",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Bash",
            input: { command: "make" },
          },
        ],
      },
    },
    {
      type: "user",
      uuid: "x1",
      parentUuid: "r1",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "error 2" },
        ],
      },
    },
    {
      type: "assistant",
      uuid: "r2",
      parentUuid: "x1",
      message: { id: "m2", content: [{ type: "text", text: "Fixed it." }] },
    },
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");
}

let root: string;
let client: Client;

async function connect(conversationsDir: string | null): Promise<void> {
  const server = createServer({
    conversationsDir,
    claudeProjectsDir: join(root, "projects"),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const first = result.content[0];
  return {
    text: first?.type === "text" ? first.text : "",
    isError: result.isError === true,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "diagram-4-llm-mcp-"));
  await mkdir(join(root, "exports"));
  await mkdir(join(root, "projects", "-home-me-app"), { recursive: true });
  await writeFile(
    join(root, "exports", "databases.diagram-4-llm.json"),
    JSON.stringify(exportConversation(conversation())),
  );
  await writeFile(join(root, "exports", "broken.json"), "{");
  await writeFile(
    join(root, "projects", "-home-me-app", "s1.jsonl"),
    sessionLines(),
  );
});

afterEach(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true });
});

describe("the MCP server", () => {
  it("offers only read-only tools, and conversation tools only with a folder", async () => {
    await connect(join(root, "exports"));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "list_claude_code_sessions",
      "list_conversations",
      "read_branch",
      "read_claude_code_session",
      "read_conversation_map",
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(
      true,
    );
    await client.close();

    await connect(null);
    const without = await client.listTools();
    expect(without.tools.map((tool) => tool.name).sort()).toEqual([
      "list_claude_code_sessions",
      "read_claude_code_session",
    ]);
  });

  it("lists exported conversations and reports files it cannot read", async () => {
    await connect(join(root, "exports"));
    const { text } = await call("list_conversations");
    expect(text).toContain(
      "- Databases (id c1, file databases.diagram-4-llm.json): 5 turns, 2 branches",
    );
    expect(text).toMatch(/Could not read broken\.json: Not valid JSON/);
  });

  it("shows a conversation's tree with its summaries", async () => {
    await connect(join(root, "exports"));
    const { text } = await call("read_conversation_map", {
      conversationId: "c1",
    });
    expect(text.split("\n").slice(2)).toEqual([
      "- u1 user: Which database?",
      "- a1 assistant (claude-test): SQLite.",
      "  - u2 user: Why not PostgreSQL?",
      "  - a2 assistant (claude-test): No server needed.",
      "    * summary s1 of u1..a2: SQLite, because it needs no server.",
      "  - u3 (after a1) user: How do I back it up?",
    ]);
  });

  it("reads a branch as the model saw it, with attachments in place", async () => {
    await connect(join(root, "exports"));
    const { text } = await call("read_branch", {
      conversationId: "c1",
      turnId: "u3",
    });
    expect(text).toContain("up to u3, 3 messages:");
    expect(text).toContain("## assistant\n\nSQLite.");
    expect(text).toMatch(
      /## user\n\n<context source="summary" node="s1">\nSQLite, because it needs no server\.\n<\/context>\n\nHow do I back it up\?$/,
    );
    expect(text).not.toContain("Why not PostgreSQL?");
  });

  it("answers unknown IDs with an error the model can act on", async () => {
    await connect(join(root, "exports"));
    expect(
      await call("read_branch", { conversationId: "nope", turnId: "u1" }),
    ).toEqual({ text: "No conversation with ID nope.", isError: true });
    expect(
      await call("read_branch", { conversationId: "c1", turnId: "s1" }),
    ).toEqual({
      text: "No turn with ID s1 in this conversation.",
      isError: true,
    });
  });

  it("lists Claude Code sessions and maps one", async () => {
    await connect(null);
    const listed = await call("list_claude_code_sessions");
    expect(listed.text).toMatch(
      /^1 session, most recently changed first:\n- -home-me-app\/s1\.jsonl \(changed /,
    );

    const map = await call("read_claude_code_session", {
      path: "-home-me-app/s1.jsonl",
    });
    expect(map.text.split("\n").slice(2)).toEqual([
      "- p1 prompt: The build fails",
      "- r1 answer (tools: Bash): Fixed it.",
    ]);

    const branch = await call("read_claude_code_session", {
      path: "-home-me-app/s1.jsonl",
      stepId: "r1",
    });
    expect(branch.text).toContain(
      '### tool Bash\n\nInput:\n{\n  "command": "make"\n}\n\nResult:\nerror 2',
    );
  });

  it("does not read files outside the projects folder", async () => {
    await writeFile(join(root, "secret.jsonl"), sessionLines());
    await symlink(
      join(root, "secret.jsonl"),
      join(root, "projects", "-home-me-app", "link.jsonl"),
    );
    await connect(null);
    for (const path of ["../secret.jsonl", "-home-me-app/link.jsonl"])
      expect(await call("read_claude_code_session", { path })).toEqual({
        text: `${path} could not be read: The path is outside the Claude Code projects folder.`,
        isError: true,
      });
  });
});
