# @diagram-4-llm/core

The domain logic of diagram-4-llm: the conversation graph, its invariants,
context assembly and the JSON data format. It performs no I/O and has no
UI dependencies ([ADR 0004](../../docs/adr/0004-pure-core-package.md)).
Callers supply IDs and timestamps.

```ts
import {
  addUserTurn,
  assembleContext,
  createConversation,
} from "@diagram-4-llm/core";

const created = createConversation({
  id: "c1",
  title: "Databases",
  createdAt: "2026-10-05T12:00:00.000Z",
});
if (!created.ok) throw new Error("invalid conversation");

const added = addUserTurn(created.value, {
  id: "u1",
  createdAt: "2026-10-05T12:00:01.000Z",
  parentId: null,
  refs: [],
  content: "Which database should I use?",
});
```

Every operation returns a `Result` instead of throwing. The error codes and
the invariants they protect are listed in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#21-invariants).

| Module          | Responsibility                                                 |
| --------------- | -------------------------------------------------------------- |
| `model.ts`      | Types of the data model                                        |
| `schema.ts`     | Runtime schemas for the model types                            |
| `graph.ts`      | The immutable graph and read-only queries                      |
| `rules.ts`      | Structural rules for user turns, assistant turns and summaries |
| `validate.ts`   | `insertNode`, the single entry point for nodes                 |
| `context.ts`    | Context assembly and token estimates                           |
| `operations.ts` | Public operations that build and update nodes                  |
| `format.ts`     | Export and import of the JSON document                         |

The JSON Schema for the exported format is in
[`schema/conversation.v1.schema.json`](schema/conversation.v1.schema.json).
It is generated from the runtime schema. Regenerate it with `pnpm schema`
after changing `schema.ts` or `format.ts`.
