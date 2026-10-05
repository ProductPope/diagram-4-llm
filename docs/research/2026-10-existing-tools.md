# Existing tools for branching LLM conversations

Date: 2026-10-05. Required by PLAN section 9 before phase 1.

## Method and limits

This review is based on public documentation, repository READMEs, articles
and one research paper. **No tool was installed or tested hands-on.** Claims
below describe what each source says, not verified behaviour. Repository
activity figures are as shown on GitHub on the date above.

## Findings

| Tool                                                                                                                                                                                                  | Kind                                                                      | Branch structure                                                                                                 | Visual map                                                                    | Control over branch context                                                    | Local models              | Open data           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------- | ------------------- |
| [ChatGPT](https://techtip.blog/how-to-use-the-chatgpt-branch-in-new-chat-and-how-it-works/)                                                                                                           | Hosted product                                                            | "Branch in new chat" copies history up to a message into a new chat                                              | No                                                                            | Path only                                                                      | No                        | Account data export |
| [Claude.ai](https://nodea.ai/blog/branching-ai-chat-guide)                                                                                                                                            | Hosted product                                                            | Editing a message or retrying creates a branch, switched with `<` `>` arrows                                     | No, the tree is hidden                                                        | Path only                                                                      | No                        | Account data export |
| [Open WebUI](https://docs.openwebui.com/features/chat-conversations/chat-features/)                                                                                                                   | Self-hosted app                                                           | Messages store `parentId` and `childrenIds`. "Fork chat" copies history into a new chat                          | "Chat Overview" panel. The docs do not say whether it is an interactive graph | Path, plus whole-chat compaction                                               | Yes                       | JSON export         |
| [LibreChat](https://www.librechat.ai/docs/features/fork)                                                                                                                                              | Self-hosted app                                                           | Fork into a new chat with three options: visible path only, related branches, or everything to or from a message | Not documented                                                                | Choice of which branches to copy, at fork time                                 | Yes                       | Export              |
| [Msty](https://www.promptquorum.com/power-local-llm/msty-review)                                                                                                                                      | Desktop app, closed source                                                | Branching and side-by-side "split chats" across models                                                           | No canvas found                                                               | Not documented                                                                 | Yes, local-first          | Not documented      |
| [Flowith](https://dupple.com/tools/flowith)                                                                                                                                                           | Hosted product                                                            | Prompts and replies are nodes on an infinite canvas that can be branched and merged                              | Yes, canvas                                                                   | Not documented in detail                                                       | No                        | Not documented      |
| [Nodea](https://nodea.ai/blog/branching-ai-chat-guide)                                                                                                                                                | Hosted product and a browser extension that draws Claude.ai's hidden tree | Tree, fork from any node                                                                                         | Yes, pan-and-zoom canvas                                                      | Not documented                                                                 | Not documented            | Not documented      |
| [AIbranch](https://bioengineer.org/aibranch-platform-lets-users-branch-conversations-across-multiple-llms/) ([repo](https://github.com/jdkim/llm_meta_chat), Apache-2.0, paper in SoftwareX 35, 2026) | Open-source web platform                                                  | Tree of turns with parent pointers. DAG explicitly deferred                                                      | Vertical history list with lineage arcs                                       | Recent turns verbatim, older turns automatically summarised by a cheap model   | Yes, Ollama               | Not documented      |
| [Forky](https://github.com/ishandhanani/forky) (37 stars)                                                                                                                                             | Open-source web UI and CLI                                                | DAG with git-style three-way merge                                                                               | Graph view                                                                    | Merge: LLM summarises both branches and combines them, with conflict detection | Not documented            | Not documented      |
| [chat-tree-canvas](https://github.com/asehmi/chat-tree-canvas-distro) (MIT, 1 star)                                                                                                                   | Open-source Python app with a React Flow component                        | Tree, branch forks full ancestor history                                                                         | Yes, React Flow canvas                                                        | Path only                                                                      | No, cloud providers       | SQLite              |
| [Obsidian Canvas Context](https://github.com/ff6347/obsidian-canvas-context) (GPL-3.0, 3 stars)                                                                                                       | Obsidian plugin                                                           | Vertical edges between cards define message order                                                                | Yes, Obsidian Canvas                                                          | Edges into the side of a card add that card as extra context                   | Yes, Ollama and LM Studio | Markdown files      |
| [CanvasConvo](https://arxiv.org/html/2605.15848v1) (LMU Munich and others, arXiv, May 2026)                                                                                                           | Research prototype                                                        | Branch from any message, history duplicated up to that point                                                     | Canvas with four semantic zoom levels, plus chat and timeline views           | Path only                                                                      | Not stated                | Not stated          |

## What the user study says

CanvasConvo is the only source with user evidence: a five-day field
deployment with 24 participants.

- **Branching on a canvas helps orientation.** 96% found it easy to revisit
  earlier parts of a conversation and 91% said it helped track ideas. The
  System Usability Scale score was 78.9.
- **Users could not tell what a branch knows.** One participant: "I didn't
  know what the branch knows and what it doesn't know."
- **Switching between canvas and chat was confusing** for some
  participants.
- **Cross-branch synthesis was missing.** The authors recommend git-like
  merge and cross-branch comparison as future work.

## Conclusions

1. **Branching itself is not a differentiator.** It exists in the two
   largest hosted products, in the main self-hosted clients and in several
   canvas tools. A project whose pitch is "branching chat on a canvas"
   enters a crowded field.
2. **Context transparency and control are rare.** Most tools only inherit
   the path. The exceptions handle extra context in opaque ways (AIbranch
   summarises automatically, Forky merges through an LLM) or only inside
   Obsidian (Canvas Context). None of the sources describes showing the
   user the exact context before sending. The CanvasConvo study names this
   as a real user problem.
3. **The design choices in ADR 0001 hold up.** AIbranch also chose a tree
   and deferred a DAG. Obsidian Canvas Context arrived independently at the
   same idea as references: explicit, separately drawn edges for extra
   context. Forky shows the alternative: a merge decided by a model, which
   conflicts with the principle that what the model sees is never hidden.
4. **Local models plus a canvas plus explicit context is an open
   combination.** Obsidian Canvas Context comes closest, but it requires
   Obsidian and manual note frontmatter.

## Implications for the plan

- **Positioning.** Lead with control over what each branch knows, not with
  branching or the canvas. Suggested one-line pitch: _see and control
  exactly what each branch of a conversation sends to the model, with any
  model, including local ones._
- **Phase 1.** The context inspector is the core feature, not an extra. In
  the canvas, each node should show at a glance what its branch inherits
  (for example, highlighting the path and references when a node is
  selected), which answers the question from the user study directly.
- **Phase 1.** Keep the canvas and the reading pane synchronised (one
  selection, both views) to avoid the view-switching confusion reported in
  the study.
- **Phase 2.** Draw references as separate edges entering the side of a
  node, a convention already used by Obsidian Canvas Context.
- **Hands-on testing.** Before phase 1 closes, try Open WebUI, LibreChat
  and Obsidian Canvas Context with a local model. They are free and
  self-hostable, and they are the closest open alternatives.
