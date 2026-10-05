# Product plan

Status: **draft**, design phase. Nothing described here is implemented yet.

## 1. Problem

Long conversations with an LLM rarely stay on one topic. A single chat
accumulates several threads: a main question, a tangent, a comparison of two
options, a detour into a definition. Linear chat interfaces handle this badly
in two distinct ways:

1. **Orientation.** The user loses track of which threads exist, where each
   one is, and what was concluded in it.
2. **Context pollution.** Every message is sent with the entire history, so
   unrelated threads leak into each answer. Answer quality degrades, and it
   degrades faster on models with small context windows, such as most models
   that run locally.

A visual map addresses (1). Only **isolating context per branch** addresses
(2). This project treats (2) as the core problem and the diagram as the
interface to it: the map is how the user sees, navigates and controls what
each branch knows.

## 2. Target user

The first user is the author: someone who thinks visually, holds
multi-threaded conversations, uses Claude through the web app and the API, and
is starting to run local models. Secondary users are people with the same
habits who are comfortable entering an API key or pointing the app at a local
model server.

## 3. Product principles

1. **What the model sees is never hidden.** For every answer, the user can
   inspect the exact context that was sent. The app never truncates, reorders
   or summarises context silently.
2. **Branching is cheaper than starting a new chat.** If forking takes more
   effort than opening a new tab, the tool will not be used.
3. **Read linearly, navigate spatially.** Long text is unreadable on a canvas.
   The canvas is for orientation and navigation. Messages are read in a linear
   pane that shows the currently selected path.
4. **Local-first.** Conversations and API keys stay on the user's device. No
   project-operated backend, no telemetry.
5. **Open data.** The conversation graph has a documented, versioned JSON
   format that users can export and process with other tools.

## 4. Non-goals (for now)

- Feature parity with chat products: file uploads, web search, voice, image
  generation, mobile apps.
- Accounts, sync, sharing or collaboration.
- Agentic sessions (tool use, code execution). Importing Claude Code sessions
  for viewing is a later possibility (phase 3), but running them is not.
- Automatically restructuring conversations without user action.

## 5. Core concepts

Detailed in [ARCHITECTURE.md](ARCHITECTURE.md) and
[ADR 0001](adr/0001-conversation-graph-model.md).

- **Turn node:** a user message or an assistant answer.
- **Parent edge:** each turn has at most one conversational predecessor, so
  turns form a tree. A **branch** is the path from a root to any node. Forking
  means adding a second child to an existing node.
- **Reference:** a user turn may attach other nodes as extra context (a
  message from another branch, or a summary). References turn the tree into a
  directed acyclic graph without making "the path to this message" ambiguous.
- **Summary node:** a model-generated, user-editable condensation of a path
  segment. Summaries are referenced like any other node.

These primitives cover the four ways of building context for a new branch:

| Context mode                   | How it is expressed                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Inherit the path from the root | Fork: new child of an existing node                                                                          |
| Hand-pick messages             | User turn with references to chosen nodes                                                                    |
| Summarise a branch             | Summary node, then a reference to it                                                                         |
| Merge branches                 | User turn on branch A that references a summary of branch B, or a new root that references summaries of both |

## 6. Scope by phase

Each phase ends with an exit criterion that can be checked, not a date.

### Phase 0: Foundations

- Repository, CI (typecheck, lint, test, build), coding standards.
- `core` package: data model, invariants, context assembly, JSON format
  with schema validation, all covered by unit and property-based tests.
- No user interface.

**Exit:** the context assembler produces the documented output for every
scenario in section 8, and CI enforces this on every change.

### Phase 1: MVP, branching chat on a canvas

- Canvas with turn nodes, automatic tree layout, pan and zoom, collapsible
  subtrees.
- Fork from any node. Edit-and-resend creates a sibling and never overwrites.
- Linear reading pane showing the selected path.
- Context inspector: the exact messages to be sent, their sources and an
  estimated token count, shown before sending.
- Two provider adapters: Anthropic, and OpenAI-compatible (covers Ollama, LM
  Studio, llama.cpp server, vLLM and hosted compatible APIs). Model selectable
  per branch.
- Short automatic titles for nodes, generated by a model the user picks (can
  be a local one).
- Streaming, cancellation, and error states that keep partial output.
- Persistence in the browser. Export and import of the JSON format.
- Keyboard navigation: parent, child, sibling, fork, focus composer.

**Exit:** the author uses the app as their primary chat client for two
consecutive weeks and records the friction points in issues.

### Phase 2: Context control

- References: attach any node from any branch to a new user turn.
- Summary nodes: generate, edit, reference.
- Merge workflows built from the two primitives above.
- Token budget warnings against each model's context window, with suggested
  actions (summarise, drop a reference) instead of silent truncation.

**Exit:** each of the four context modes in section 5 can be completed
through keyboard and mouse in under 10 seconds by a user who knows the app.

### Phase 3: Reach

Candidates, prioritised after phase 2 based on observed use:

- Import of Claude.ai data exports and Claude Code session logs (JSONL) into
  read-only graphs.
- Topic view: model-detected topics over a linear imported conversation.
- MCP server exposing the graph, so that agents can read branches and
  summaries as context.
- Desktop packaging (Tauri) for OS keychain storage and no CORS setup.

## 7. Success criteria

- Phase 1: two-week dogfooding period completed (see exit criterion).
- Public release: a new user goes from `git clone` to a first branched
  conversation with a local model in under 10 minutes by following the README.
- Quality: CI green on the default branch, and no open bug labelled `data-loss`.

## 8. Reference scenarios

These scenarios are the acceptance tests for the core package and, later,
end-to-end tests. They are deliberately generic: the tool is not tied to any
domain, so the scenarios exercise the graph operations rather than a
particular kind of conversation. New scenarios are added when dogfooding
reveals a case they do not cover.

1. **Fork.** A conversation about choosing a database: R → A1. The user forks
   at A1 twice, asking about PostgreSQL in one branch and SQLite in the
   other. The context for the SQLite branch contains R, A1 and the SQLite
   question, and nothing from the PostgreSQL branch.
2. **Edit and resend.** The user rewrites R as R'. R' becomes a new root
   sibling and the original branch is unchanged.
3. **Cherry-pick.** In the SQLite branch, the user references one answer from
   the PostgreSQL branch. The context contains the SQLite path plus that
   single answer, inside a marked block. The PostgreSQL question is not
   included.
4. **Summarise and merge.** The user summarises the PostgreSQL branch,
   edits the summary, and starts a new root that references both branch
   summaries. The context contains only the two summaries and the new
   question.
5. **Over budget.** A path exceeds the selected local model's context window.
   Sending is blocked with an explanation and suggested actions. Nothing is
   truncated.

## 9. Risks

| Risk                                                           | Impact | Mitigation                                                                                                                                                                |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat vendors ship native branching that is good enough         | High   | Focus on what vendors are unlikely to build: cross-provider and local models, references and merges, an open data format.                                                 |
| Existing tools already solve this                              | High   | Evaluate existing branching and canvas chat tools before phase 1 and record findings in `docs/research/`.                                                                 |
| The project looks like low-effort AI-generated code            | High   | Engineering standards in [CLAUDE.md](../CLAUDE.md), a pure, tested core, ADRs for every significant decision, small reviewed commits, open disclosure of how it is built. |
| Scope creep                                                    | High   | Non-goals in section 4. Phase exit criteria gate new work.                                                                                                                |
| API keys stored in the browser can be read by injected scripts | High   | No third-party scripts, strict Content Security Policy, sanitised Markdown rendering with no raw HTML, desktop keychain in phase 3. Documented honestly in the README.    |
| Canvas becomes an unreadable hairball beyond about 100 nodes   | Medium | Collapsible subtrees, node titles instead of content, linear reading pane, performance budget tested with generated graphs of 1,000 nodes.                                |
| Browser cannot reach local model servers (CORS)                | Medium | Setup guide per server (for example `OLLAMA_ORIGINS` for Ollama). Desktop build removes the issue.                                                                        |
| Token counts in the browser are estimates                      | Low    | Label them as estimates. Record actual usage reported by the provider after each answer.                                                                                  |
| Summaries silently lose important details                      | Medium | Summaries are visible, editable nodes, never applied automatically.                                                                                                       |

## 10. Open questions

- [ ] Weekly time budget. Determines whether phase 1 is weeks or months.
- [ ] License. MIT is the working assumption, not a decision.
- [ ] Product name. `diagram-4-llm` is the repository name.
- [ ] Which existing tools to evaluate in `docs/research/`.
