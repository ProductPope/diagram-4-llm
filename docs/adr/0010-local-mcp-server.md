# 0010. A read-only local MCP server over exported files

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 2: a local MCP server, run on the user's machine for Claude
Desktop or Claude Code, so that agents can read branches and summaries as
context and build a map of the session they are in. The product stays
local-first, with no server operated by the project (ADR 0002).

The app keeps conversations in the browser's IndexedDB, which no other
process can read. Claude Code keeps session transcripts as files, which
the core can already read (ADR 0009).

## Decision

- **A new package, `packages/mcp`.** A Node program that serves MCP over
  standard input and output with the official TypeScript SDK
  (`@modelcontextprotocol/server`, v2). All logic about conversations and
  sessions stays in the core; the package reads files and formats tool
  results as text for a model.
- **Exported files, not the browser's storage.** Conversations are read
  from a folder of files exported from the app, given with
  `--conversations`. Each file goes through the core's import, so a
  damaged file is reported, not partly read. Sessions are read from
  `~/.claude/projects`, or the folder given with `--claude-projects`.
  Both are read again on every call.
- **Read only.** Every tool only reads and is annotated as read-only. A
  session path that leads outside the projects folder, also through a
  link, is refused.
- **Branches as the model saw them.** `read_branch` returns the messages
  the core assembles for a turn, with attached turns and summaries in
  place, not the raw turns.
- **Maps as outlines.** Conversation and session maps are one node per
  line. Chains stay flat; a branch is indented and names the node it
  follows, so a session of hundreds of steps does not become hundreds of
  levels deep.

## Alternatives considered

- **Sync from the app to the server over localhost.** Keeps the server
  current without exports, but needs the app to find and trust a local
  server, a wider Content Security Policy, and a protocol between the two.
  It can be added later if exporting turns out to be a burden.
- **Implement the protocol by hand.** Avoids a dependency, but the
  protocol has versions, capability negotiation and transports that the
  SDK keeps current.
- **SDK v1 (`@modelcontextprotocol/sdk`).** One package that also brings
  HTTP frameworks this server does not use. v2 splits the server into its
  own package, which depends only on the SDK core and Zod.

## Consequences

- A conversation is visible to agents only after it is exported, and
  shows the state of the export.
- The package adds `@modelcontextprotocol/server` and, for its tests,
  `@modelcontextprotocol/client`. The web app is unchanged.
- Agents with the server can read every Claude Code session on the
  machine, which can hold secrets that passed through a tool. The README
  says so where the server is set up.
