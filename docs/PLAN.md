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
- Integrations that need a project-operated server, such as a remote MCP
  connector for claude.ai. Principle 4 rules them out.

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

**Progress** (updated with each merged change):

- [x] Canvas with automatic tree layout, pan and zoom
- [x] Collapsible subtrees on the canvas (saved with the conversation)
- [x] Fork by editing or regenerating; nothing is overwritten
- [x] Reading pane for the selected branch
- [x] Context inspector before sending (sources are shown as roles, not yet
      linked to nodes)
- [x] Anthropic and OpenAI-compatible adapters
- [x] Model selectable for each answer from a configured list; a branch
      keeps the model that answered last (one provider at a time)
- [x] Automatic node titles for answers, by a model chosen in the settings
      (off by default; user messages show their start)
- [x] Streaming, cancellation, and error states that keep partial output
- [x] Persistence in the browser
- [x] Export and import of the JSON format (an import never overwrites an
      existing conversation)
- [x] Keyboard navigation of the tree: arrow keys on the map move to the
      parent, a reply or another version, and Enter shows that branch
- [x] Keyboard shortcuts to fork (E on a message of the user in the map)
      and to focus the composer (/)
- [x] Markdown rendering of answers (no raw HTML; images shown as links)
- [x] Consistent visual design for everything except the map, light and
      dark ([ADR 0007](adr/0007-design-system.md))
- [x] A demo conversation that can be opened before connecting a provider
- [x] A setup assistant on first start: provider, connection test, models
      chosen from the provider's list
- [x] A welcome page that explains the app's value and privacy, written as
      a conversation, leading to the demo or to setup. It opens with an
      empty field; any key, click or tap types and sends the first question,
      and answers are written out as a model streams them
- [x] Usable 320 pixels wide (WCAG 1.4.10 reflow): below 800 pixels the
      app shows the conversation list, the conversation or the map, one at
      a time
- [x] The map can be minimized to a strip beside the conversation that
      outlines the selected branch, shows which turns are on screen and
      scrolls to a turn when one is chosen (wide screens)
- [x] A link to skip to the conversation, first in the tab order of the
      app (WCAG 2.4.1 bypass blocks)
- [x] Performance checked with a 1,000-turn conversation (render and branch
      switch budgets in an end-to-end test; panning frame rate not measured)
- [x] A features page, next to Settings, that explains each feature with
      an illustration built up step by step (still with reduced motion,
      and the animations can be paused)

### Phase 2: Context control

- References: attach any node from any branch to a new user turn.
- Summary nodes: generate, edit, reference.
- Merge workflows built from the two primitives above.
- Token budget warnings against each model's context window, with suggested
  actions (summarise, drop a reference) instead of silent truncation.
- Suggested branches: under an answer, two or three follow-up directions
  proposed by a model the user picks (off by default, like node titles).
  Choosing one forks the conversation; nothing is sent without user action.
  Sending several at once is allowed only after the combined cost is shown.

**Exit:** each of the four context modes in section 5 can be completed
through keyboard and mouse in under 10 seconds by a user who knows the app.

**Progress** (updated with each merged change):

- [x] References: any finished turn from another branch can be attached
      to the message being written (map context menu or the A key),
      shown in the composer and on the sent message, and removed before
      sending
- [x] Summary nodes: "Summarise" on an answer writes a summary of the
      branch up to it with the model chosen for the next answer; it can
      be edited (saved as a revision) and attached to a message on
      another branch ([ADR 0008](adr/0008-generating-summaries.md))
- [x] Merge workflows: "Attach a summary of this branch" on an answer
      (reuses the branch's summary or writes one), and "New first
      message", which sees only what is attached to it; attachments stay
      while the user moves between branches
- [x] Token budget warnings: a context window per model in the settings;
      a warning from 80% of it, and above it sending is blocked with
      suggestions (continue from a summary, remove a large attachment)
- [x] Suggested branches: three follow-up questions under each answer
      from a model chosen in the settings (off by default), kept only
      while the page is open; choosing one fills the composer, and several
      are sent only after their combined estimate is confirmed

### Phase 3: Reach

Candidates, in the order currently planned, re-prioritised after phase 2
based on observed use. Each one runs on the user's device:

1. Map of Claude Code sessions: import of the session logs (JSONL) that
   Claude Code keeps on disk into read-only graphs, with no manual export.
2. Local MCP server exposing the graph, run on the user's machine for
   Claude Desktop or Claude Code: agents read branches and summaries as
   context, and can build a map of the current session.
3. A pane inside Claude Code built as a mod on top of 1 and 2.
4. Import of Claude.ai data exports into read-only graphs.
5. Topic view: model-detected topics over a linear imported conversation.
6. Desktop packaging (Tauri) for OS keychain storage, no CORS setup and
   reading session logs without the user picking files.

**Progress** (updated with each merged change):

- [x] Map of Claude Code sessions: a session transcript opened from
      `~/.claude/projects` is shown as a read-only map of prompts, the
      work done for each (answers and tool calls with their results) and
      compactions, kept only while the page is open
      ([ADR 0009](adr/0009-claude-code-session-map.md))
- [x] Local MCP server (`packages/mcp`): read-only tools for Claude Code
      and Claude Desktop over exported conversations (maps, branches as
      the model saw them, summaries) and Claude Code sessions (list, map,
      a branch in full) ([ADR 0010](adr/0010-local-mcp-server.md))
- [x] Session map pane in Claude Code (`packages/mcp/plugin`): a mod whose
      `/session-map` command opens a pane with the current session's map,
      read from the MCP server and read again after each answer
      ([ADR 0011](adr/0011-session-map-pane.md))
- [x] Topics on a Claude Code session: "Detect topics" sends the starts of
      the selected branch's prompts to the title model and shows its topics
      as headings in the branch, kept while the page is open
      ([ADR 0012](adr/0012-session-topics.md))
- [x] Claude.ai data exports: `conversations.json` opens on the session
      page as a read-only map per conversation, with a list to switch
      between them, kept only while the page is open
      ([ADR 0013](adr/0013-claude-ai-export-map.md))

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

| Risk                                                           | Impact | Mitigation                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat vendors ship native branching that is good enough         | High   | Focus on what vendors are unlikely to build: cross-provider and local models, references and merges, an open data format.                                                                                                       |
| Existing tools already solve this                              | High   | Reviewed in [docs/research/2026-10-existing-tools.md](research/2026-10-existing-tools.md): branching is common, explicit and visible context control is rare. Hands-on testing of the closest open tools before phase 1 closes. |
| The project looks like low-effort AI-generated code            | High   | Engineering standards in [CLAUDE.md](../CLAUDE.md), a pure, tested core, ADRs for every significant decision, small reviewed commits, open disclosure of how it is built.                                                       |
| Scope creep                                                    | High   | Non-goals in section 4. Phase exit criteria gate new work.                                                                                                                                                                      |
| API keys stored in the browser can be read by injected scripts | High   | No third-party scripts, strict Content Security Policy, sanitised Markdown rendering with no raw HTML, desktop keychain in phase 3. Documented honestly in the README.                                                          |
| Canvas becomes an unreadable hairball beyond about 100 nodes   | Medium | Collapsible subtrees, node titles instead of content, linear reading pane, performance budget tested with generated graphs of 1,000 nodes.                                                                                      |
| Browser cannot reach local model servers (CORS)                | Medium | Setup guide per server (for example `OLLAMA_ORIGINS` for Ollama). Desktop build removes the issue.                                                                                                                              |
| Token counts in the browser are estimates                      | Low    | Label them as estimates. Record actual usage reported by the provider after each answer.                                                                                                                                        |
| Summaries silently lose important details                      | Medium | Summaries are visible, editable nodes, never applied automatically.                                                                                                                                                             |

## 10. Open questions

- [ ] Weekly time budget. Determines whether phase 1 is weeks or months.
- [ ] Product name. `diagram-4-llm` is the repository name.
