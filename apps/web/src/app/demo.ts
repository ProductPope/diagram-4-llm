import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  setNodeMeta,
  startAssistantTurn,
  type ConversationGraph,
  type GraphError,
  type NodeId,
  type Result,
} from "@diagram-4-llm/core";

export const DEMO_CONVERSATION_ID = "demo-choosing-a-database";

/**
 * Shown where a model name would be. The answers were written for the demo,
 * not generated, and the label must not suggest otherwise.
 */
export const DEMO_MODEL = "example (hand-written)";

type DemoTurn =
  | {
      readonly kind: "user";
      readonly id: NodeId;
      readonly parentId: NodeId | null;
      readonly content: string;
    }
  | {
      readonly kind: "assistant";
      readonly id: NodeId;
      readonly parentId: NodeId;
      readonly content: string;
      readonly title: string;
    };

// Creation order matters: the reading pane opens on the newest branch, so
// the deepest branch is written last.
const TURNS: readonly DemoTurn[] = [
  {
    kind: "user",
    id: "demo-q1",
    parentId: null,
    content:
      "I'm building a small web app for a local sports club: members, events and sign-ups. Which database should I use?",
  },
  {
    kind: "assistant",
    id: "demo-a1",
    parentId: "demo-q1",
    title: "SQLite or PostgreSQL",
    content: `For an app of this size, two options cover almost every case:

- **SQLite**: the database is a single file next to your app. Nothing to install or run, and it handles thousands of members easily.
- **PostgreSQL**: a database server. More to set up, but it handles many simultaneous writers and is what most hosting platforms offer as a managed service.

If the app runs on one server, start with SQLite. If you deploy to a platform that runs several copies of your app, or expect heavy simultaneous editing, choose PostgreSQL.`,
  },
  {
    kind: "user",
    id: "demo-q2-postgres",
    parentId: "demo-a1",
    content: "Go deeper on PostgreSQL. What does hosting it involve?",
  },
  {
    kind: "assistant",
    id: "demo-a2-postgres",
    parentId: "demo-q2-postgres",
    title: "Hosting PostgreSQL",
    content: `You have two routes:

1. **Managed service.** Most cloud and app platforms offer PostgreSQL with backups, updates and monitoring included. You get a connection string and pay a monthly fee.
2. **Your own server.** Cheaper, but you install it, apply security updates and set up backups yourself, for example with \`pg_dump\` on a schedule.

For a club app, a managed service is usually worth the fee.`,
  },
  {
    kind: "assistant",
    id: "demo-a2-postgres-short",
    parentId: "demo-q2-postgres",
    title: "PostgreSQL in short",
    content:
      "Use a managed PostgreSQL service: backups and updates are handled for you. Running it yourself is cheaper but makes you responsible for both.",
  },
  {
    kind: "user",
    id: "demo-q2-sqlite",
    parentId: "demo-a1",
    content: "Go deeper on SQLite. What are its limits for a web app?",
  },
  {
    kind: "assistant",
    id: "demo-a2-sqlite",
    parentId: "demo-q2-sqlite",
    title: "Limits of SQLite",
    content: `The main limits:

- **One writer at a time.** Other writes wait until it finishes. In WAL mode reading never waits for writing, which is plenty for sign-ups.
- **One machine.** The file must sit on the same server as the app, so it does not suit platforms that run several copies of your app.
- **Fewer built-in features** than PostgreSQL, for example user accounts inside the database.

None of these is likely to matter for a sports club.`,
  },
  {
    kind: "user",
    id: "demo-q3-sqlite",
    parentId: "demo-a2-sqlite",
    content: "How would I back it up?",
  },
  {
    kind: "assistant",
    id: "demo-a3-sqlite",
    parentId: "demo-q3-sqlite",
    title: "Backing up SQLite",
    content: `Do not copy the file while the app is writing to it. Instead:

\`\`\`sh
sqlite3 club.db ".backup 'backup/club-$(date +%F).db'"
\`\`\`

Run it daily, keep a few weeks of copies, and store them on another machine. Try restoring one now and then: a backup you have never restored is only a hope.`,
  },
];

const START = Date.parse("2026-10-01T09:00:00.000Z");
const at = (minute: number) => new Date(START + minute * 60_000).toISOString();

/**
 * A short branched conversation that shows the app without a provider: a
 * fork into two topics, two versions of one answer, and titles on the map.
 * It is built with the same operations as a real conversation, so it obeys
 * every invariant and its context records are computed, not invented.
 */
export function demoConversation(): Result<ConversationGraph, GraphError> {
  const created = createConversation({
    id: DEMO_CONVERSATION_ID,
    title: "Demo: which database for a small app?",
    createdAt: at(0),
  });
  if (!created.ok) return created;
  let graph = created.value;

  for (const [index, turn] of TURNS.entries()) {
    const added = addTurn(graph, turn, at(index + 1));
    if (!added.ok) return added;
    graph = added.value;
  }
  return { ok: true, value: graph };
}

function addTurn(
  graph: ConversationGraph,
  turn: DemoTurn,
  createdAt: string,
): Result<ConversationGraph, GraphError> {
  if (turn.kind === "user") {
    return addUserTurn(graph, {
      id: turn.id,
      parentId: turn.parentId,
      refs: [],
      content: turn.content,
      createdAt,
    });
  }
  const started = startAssistantTurn(graph, {
    id: turn.id,
    parentId: turn.parentId,
    createdAt,
    // The adapter field has no value for "no provider"; no endpoint is
    // recorded, and the model label says the answer was written by hand.
    adapter: "openai-compatible",
    model: DEMO_MODEL,
    params: {},
    systemPrompt: null,
  });
  if (!started.ok) return started;
  const written = appendAssistantContent(started.value, turn.id, turn.content);
  if (!written.ok) return written;
  const finished = finishAssistantTurn(written.value, turn.id, {
    status: "complete",
    stopReason: "end",
  });
  if (!finished.ok) return finished;
  return setNodeMeta(finished.value, turn.id, { title: turn.title });
}
