# 0001. Conversation graph is a tree of turns plus explicit references

Status: Accepted
Date: 2026-10-05

## Context

Users need to fork a conversation at any message, hand-pick context from
other branches, and combine branches. Whatever structure supports this also
decides what "the context of a message" means. That definition has to be
deterministic and something the user can inspect, because the product
promises that context is never hidden.

## Decision

- Turns (user and assistant messages) have at most one parent and form a
  tree, possibly with several roots per conversation.
- Cross-branch context is expressed as an ordered list of references on a
  user turn. A reference points to an existing node: a turn or a summary.
- Summaries are separate nodes that cover a path segment. They are only
  included in context through references.
- Nodes are immutable. Edits create siblings or revisions.

The resulting graph is a DAG: parent edges plus reference edges. It is
acyclic by construction because references can only point to nodes that
already exist.

## Alternatives considered

- **Plain tree, no references.** Simple, but it cannot express
  cherry-picking or merging, which are core requirements.
- **General DAG with multi-parent merge nodes.** Expresses merges directly,
  but a node with two histories has no single path. Building context would
  then need an ordering rule (interleave? concatenate? which first?) that
  users cannot predict. It can also produce consecutive messages with the
  same role, which providers handle inconsistently.
- **Linear chat with topic tags.** Requires no change to how users chat, but
  it does not isolate context, which is the core problem.

## Consequences

- Context assembly is a deterministic, pure function of a node and its
  references.
- Merging is a two-step workflow (summarise, then reference) rather than one
  gesture. The UI must make this fast, and phase 2 has an exit criterion for
  it.
- References to a single node include only that node, not its ancestors.
  Users must understand this distinction, so the context inspector shows it.
