# Architecture

Status: **draft**. This document describes the intended design. Sections are
updated when the implementation proves them wrong, and significant changes
are recorded as ADRs in [`adr/`](adr/).

## 1. Overview

```
┌──────────────────────────── apps/web ────────────────────────────┐
│  Canvas view    Reading pane    Composer    Context inspector    │
│        │              │             │               │            │
│        └──────────────┴──── app state store ────────┘            │
│                              │          │                        │
│                     persistence      provider adapters           │
│                     (IndexedDB)      (Anthropic, OpenAI-compat.) │
└──────────────────────────────┼──────────┼────────────────────────┘
                               │          │
┌──────────────────────── packages/core ───────────────────────────┐
│  graph model · invariants · context assembly · JSON format       │
│  pure TypeScript, no I/O, no framework dependencies              │
└──────────────────────────────────────────────────────────────────┘
```

All domain logic lives in `packages/core`, which performs no I/O and has no
UI or framework dependencies. `apps/web` handles rendering, storage and
network. Keeping this boundary makes the critical logic testable without a
browser and reusable by later consumers such as an MCP server, a CLI or a
desktop shell. See [ADR 0004](adr/0004-pure-core-package.md).

## 2. Data model

The types below are the specification for `packages/core`. Names may change
during implementation. The semantics may not change without an ADR.

```ts
type NodeId = string; // UUIDv7: unique and sortable by creation time
type ISODate = string; // ISO 8601, UTC

interface Conversation {
  id: string;
  title: string;
  createdAt: ISODate;
}

type GraphNode = UserTurn | AssistantTurn | SummaryNode;

interface UserTurn {
  kind: "user";
  id: NodeId;
  conversationId: string;
  parentId: NodeId | null; // null: this turn starts a new root
  content: string;
  refs: NodeId[]; // extra context attached to this turn, in order
  createdAt: ISODate;
}

interface AssistantTurn {
  kind: "assistant";
  id: NodeId;
  conversationId: string;
  parentId: NodeId; // always a UserTurn
  content: string; // partial while streaming, or if aborted or errored
  status: "streaming" | "complete" | "aborted" | "error";
  error?: { code: string; message: string };
  generation: GenerationRecord;
  createdAt: ISODate;
}

interface SummaryNode {
  kind: "summary";
  id: NodeId;
  conversationId: string;
  covers: { fromId: NodeId; toId: NodeId }; // a path segment, inclusive
  content: string;
  revises?: NodeId; // set when this summary is a user edit of another one
  generation?: GenerationRecord; // absent when written by hand
  createdAt: ISODate;
}

interface GenerationRecord {
  adapter: "anthropic" | "openai-compatible";
  baseUrl?: string; // for openai-compatible endpoints
  model: string;
  params: { temperature?: number; maxOutputTokens?: number };
  systemPrompt: string | null;
  manifest: ContextManifest;
  usage?: { inputTokens: number; outputTokens: number }; // as reported by the provider
}

interface ContextManifest {
  entries: { nodeId: NodeId; via: "path" | "ref" }[];
  estimatedInputTokens: number;
}
```

Presentation state (canvas position, collapsed flag, user-assigned title) is
stored separately as `NodeMeta`, keyed by `NodeId`. It is mutable and never
affects what is sent to a model.

### 2.1 Invariants

Every node enters a graph through a single function, `insertNode`, which
checks it against the nodes created before it. Live operations and import
use the same path, so any graph that exists is valid. Each invariant has
unit tests, and a property-based test checks all of them after random
sequences of valid and invalid operations.

A turn is **usable** when it is a user turn, or an assistant turn with
status `complete` or `aborted` and non-empty content. Streaming, failed or
empty answers would give the model an incomplete or empty message.

1. **Alternation.** A `UserTurn`'s parent is `null` or a usable
   `AssistantTurn`. An `AssistantTurn`'s parent is a `UserTurn`. Every path
   therefore starts with a user turn and alternates roles.
2. **Unique path.** Each turn has at most one parent, so the path from any
   turn to its root is unique. "The context of this message" is always
   well defined.
3. **Acyclic by construction.** Every parent, reference, summary endpoint
   and revision points to a node created earlier in the same conversation.
   Nodes are stored in creation order, and import replays them in that
   order, so a document that points forward is rejected.
4. **Valid references.** A user turn's references are unique, are not on
   the turn's own path (that would duplicate context), and point to usable
   turns or to summaries.
5. **Immutability.** A node's content, parent and references never change
   once it is created, except for `AssistantTurn.content`, `status`, `error`
   and `usage` while `status` is `streaming`. Editing a message creates a
   sibling. Editing a summary creates a new summary with `revises` set to a
   summary of the same range.
6. **Valid summary range.** Both ends are turns, `covers.toId` is usable,
   and `covers.fromId` is an ancestor of `covers.toId` or the same node.
7. **Truthful manifest.** The manifest recorded with an assistant turn is
   computed by the core, not supplied by the caller. On import, it must
   match the context the graph implies for that turn's parent.
8. **Non-empty content.** User turns and summaries have content other than
   whitespace.

### 2.2 Why a tree plus references, not a general DAG

A merge node with two parents would make "the path to this message"
ambiguous and force an arbitrary ordering of the two histories. Keeping
parent edges as a tree and expressing cross-branch context as explicit,
ordered references keeps context assembly deterministic and visible. See
[ADR 0001](adr/0001-conversation-graph-model.md).

## 3. Context assembly

`assembleContext` is a pure function and the most important code in the
project.

```ts
function assembleContext(
  graph: ConversationGraph,
  draft: { parentId: NodeId | null; refs: NodeId[]; content: string },
  options: { systemPrompt: string | null },
): Result<
  { system; messages: ProviderMessage[]; manifest: ContextManifest },
  GraphError
>;
```

`assembleForUserTurn` returns the same result for a user turn that is
already in the graph, which is what an answer, or a regenerated answer, is
generated from. A draft and the turn created from it produce identical
context.

Algorithm:

1. Collect the path from the root to `draft.parentId`, root first.
2. For each turn on the path, emit one message with the turn's role. For a
   user turn with references, prefix its content with one context block per
   reference, in order.
3. Emit the draft as the final user message, prefixed with its own reference
   blocks.
4. Record every included node in the manifest, marked `path` or `ref`.

A reference includes only the referenced node's own content, not its
ancestors. To bring in a whole branch, the user references a summary of it.

Reference blocks use explicit delimiters so the model can tell them apart
from the user's own words:

```
<context source="assistant" node="0192f3c0-…">
…referenced content…
</context>
```

The function never drops, truncates or reorders content. The caller compares
`estimatedInputTokens` with the model's context window and blocks sending
when the estimate exceeds it.

Token estimates use a character-based heuristic, because exact tokenizers
for every model are not available in the browser. The UI labels the number
as an estimate and shows the provider-reported usage after the answer.

## 4. Provider adapters

Two adapters cover the intended providers. See
[ADR 0003](adr/0003-provider-adapters.md).

| Adapter             | Covers                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | Anthropic Messages API                                                                                           |
| `openai-compatible` | Ollama, LM Studio, llama.cpp server, vLLM, and hosted services that implement the OpenAI Chat Completions format |

Adapters translate `ProviderMessage[]` to the provider's format and stream
results back as a common sequence of events (text delta, usage, finish,
error). Adapter selection and the model are stored per node in its
`GenerationRecord`, so a conversation can mix models across branches.

Browser-specific constraints:

- Calling the Anthropic API directly from a browser requires an explicit
  opt-in header, and it means the API key is held by the browser. This is
  documented to the user, not hidden.
- Local servers must allow the app's origin through CORS. For example,
  Ollama reads the allowed origins from the `OLLAMA_ORIGINS` environment
  variable. The README will include setup steps for each server.

## 5. Persistence and data format

- Storage: IndexedDB, with a versioned schema and explicit migrations. Every
  migration has a test that runs on a fixture from the previous version.
- Export: one JSON document per conversation, containing `format`,
  `formatVersion`, the conversation, all nodes in creation order, and
  `NodeMeta`. The runtime schema is written with Zod. The published JSON
  Schema, `packages/core/schema/conversation.v1.schema.json`, is generated
  from it, and a test fails if the two drift apart.
- Import parses the document against the schema, rejecting unknown fields,
  then replays the nodes through `insertNode`. Errors name the failing field
  or the index and ID of the failing node. A document is never partially
  imported.
- Writes are atomic per operation: a node and its metadata are written in
  one transaction.

## 6. User interface

- **Canvas:** nodes show a title and role, not full content. The layout is
  computed automatically as a tidy tree. Manual positioning is not planned
  for phase 1. Subtrees can be collapsed. References are drawn as a
  distinct, dashed edge style.
- **Reading pane:** a linear view of the selected path, rendered as Markdown.
- **Composer:** sends to the selected node's branch. Shows the references
  attached to the draft.
- **Context inspector:** the assembled messages, their sources and the
  token estimate, available before sending and stored with each answer.

Performance budget: panning and zooming stay above 50 frames per second on a
generated graph of 1,000 nodes on a mid-range laptop. This is checked with a
benchmark fixture before phase 1 closes.

Accessibility: every action is available from the keyboard, focus is always
visible, and the reading pane works with screen readers. The canvas is a
supplementary view, so the reading pane and keyboard navigation must
provide everything the canvas offers.

## 7. Security

API keys stored in browser storage can be read by any script running on the
page. The mitigations are:

- no third-party scripts, analytics or fonts loaded at runtime,
- a strict Content Security Policy in production builds: scripts and
  styles only from the app itself, no inline scripts, and connections only
  to HTTPS endpoints and local model servers on `localhost`. A static policy
  cannot list each user-configured endpoint, so any HTTPS host is allowed;
  a desktop build (phase 3) can narrow this. An end-to-end test checks that
  the policy is enforced,
- Markdown rendering with raw HTML disabled and links sanitised, because
  model output is untrusted input,
- dependencies kept minimal, with lockfile-pinned versions and automated
  security advisories.

Phase 3 desktop packaging moves keys to the operating system keychain.

## 8. Testing strategy

| Layer                       | Tool                         | What it proves                                                            |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `core` unit tests           | Vitest                       | Each operation and each reference scenario in PLAN section 8              |
| `core` property-based tests | fast-check                   | Invariants in section 2.1 hold for randomly generated operation sequences |
| Format tests                | Vitest + JSON Schema         | Export then import is lossless. Previous-version fixtures still import.   |
| Adapter tests               | Vitest + recorded fixtures   | Request mapping and stream parsing, including errors and cancellation     |
| End-to-end tests            | Playwright + a fake provider | The phase 1 user flows, without network access or API keys                |

Coverage is measured for `packages/core` only and is a signal, not a target.
Snapshot-only tests are not accepted as the sole test of a behaviour.

## 9. Proposed stack

Confirmed for `packages/core` in phase 0. The UI choices are confirmed in
phase 1. TypeScript is held at 6.0 until typescript-eslint supports 7.

| Concern    | Choice                         | Reason                                                      |
| ---------- | ------------------------------ | ----------------------------------------------------------- |
| Language   | TypeScript, `strict`           | Type-checked domain model                                   |
| Workspace  | pnpm workspaces                | Separates `core` from `web` with little tooling             |
| Build      | Vite                           | Standard, fast, well documented                             |
| UI         | React                          | Largest ecosystem for canvas and accessibility libraries    |
| Canvas     | React Flow (`@xyflow/react`)   | Mature node-graph rendering. Layout is computed separately. |
| State      | Zustand                        | Small, explicit, easy to test                               |
| Storage    | Dexie over IndexedDB           | Schema versioning and transactions                          |
| Validation | Zod, exported to JSON Schema   | One source for runtime validation and the published format  |
| Tests      | Vitest, fast-check, Playwright | See section 8                                               |
