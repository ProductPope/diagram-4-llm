# 0013. A Claude.ai data export is mapped read-only on the session page

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 4: import of Claude.ai data exports into read-only graphs. A
Claude.ai data export holds every conversation of the account in
`conversations.json`. We found no documentation of its format; the fields
below are as found in an export made on 2026-10-08. Each conversation has a
title, an update time and a list of messages, each with a sender (`human`
or `assistant`), a parent message and typed content blocks: text,
thinking, tool calls and their results, and blocks Claude.ai adds to a
prompt. The parent links make the messages a tree, so a conversation
can branch; the sample had no branches.

The session page already shows a Claude Code session as a read-only tree
of prompts and answers with tool calls (ADR 0009), with topics on request
(ADR 0012).

## Decision

- **The session page, not the conversation list.** An export opens on the
  same page as a transcript, picked by its `.json` extension, with a list
  to switch between its conversations, most recently updated first. Each
  conversation becomes the same steps a session does: each message of
  the user a prompt, each answer an activity with its text and tool calls,
  so the map, the branch view and topics work unchanged.
- **Not stored, like a session.** The file is read in the tab and kept
  only while the page is open. An export holds the user's whole Claude.ai
  history, and the user already keeps the file.
- **Not conversations of the app.** Importing an export as editable
  conversations would store copies of the whole history and needs a
  model per answer, which the export does not record. A conversation can
  still be carried over by hand.
- **Lenient reading.** Only the fields used are required; others are
  ignored, so later exports with more fields still load. A conversation
  or message that cannot be read is reported and the rest loads, as with
  transcript lines. Messages whose parents never reach the start of the
  conversation are reported and left off the map.
- **What is not shown is counted.** Thinking, the blocks Claude.ai adds
  to prompts and messages with nothing to show are counted by kind under
  the map. Attached files are named in the prompt; their extracted text
  is not shown. A message with nothing to show is left out and its
  children are attached to the nearest step above it.
- **Blocks, not the `text` field.** A message's `text` repeats its text
  blocks with a placeholder for each tool call, so the blocks are read.

## Alternatives considered

- **A separate page for exports.** It would repeat the session page.

## Consequences

- The reader follows an undocumented format and may need changes when
  Claude.ai changes it; unknown block kinds are counted, not lost
  silently.
- The test fixtures are made up in the shape of the format. No real
  export is in the repository.
