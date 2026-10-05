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
