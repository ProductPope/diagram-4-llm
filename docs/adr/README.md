# Architecture decision records

Each significant decision is recorded as a short document: the context, the
decision, the alternatives considered and the consequences. Records are not
edited after they are accepted. A changed decision gets a new record that
supersedes the old one.

| #                                        | Decision                                                                  | Status   |
| ---------------------------------------- | ------------------------------------------------------------------------- | -------- |
| [0001](0001-conversation-graph-model.md) | Conversation graph is a tree of turns plus explicit references            | Accepted |
| [0002](0002-local-first-browser-app.md)  | Local-first browser app with no project backend                           | Proposed |
| [0003](0003-provider-adapters.md)        | Two provider adapters: Anthropic and OpenAI-compatible                    | Accepted |
| [0004](0004-pure-core-package.md)        | Domain logic in a pure, framework-free core package                       | Accepted |
| [0005](0005-adapter-implementation.md)   | Anthropic adapter on the official SDK, OpenAI-compatible adapter on fetch | Accepted |
| [0006](0006-record-stop-reason.md)       | Record why a complete answer ended                                        | Accepted |
| [0007](0007-design-system.md)            | shadcn/ui on Tailwind CSS for everything except the map                   | Accepted |
| [0008](0008-generating-summaries.md)     | Summaries are generated from a transcript and saved only when finished    | Proposed |
| [0009](0009-claude-code-session-map.md)  | Claude Code sessions are read into a separate, read-only map              | Proposed |
| [0010](0010-local-mcp-server.md)         | A read-only local MCP server over exported files                          | Proposed |
| [0011](0011-session-map-pane.md)         | A Claude Code pane that draws the session map from the MCP server         | Proposed |
| [0012](0012-session-topics.md)           | Topics on a session branch are detected on request and not stored         | Proposed |
| [0013](0013-claude-ai-export-map.md)     | A Claude.ai data export is mapped read-only on the session page           | Proposed |

Records move from Proposed to Accepted when phase 0 implementation confirms
them.

## Template

```markdown
# NNNN. Title

Status: Proposed | Accepted | Superseded by NNNN
Date: YYYY-MM-DD

## Context

## Decision

## Alternatives considered

## Consequences
```
