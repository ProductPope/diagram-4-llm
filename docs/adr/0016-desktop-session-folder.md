# 0016. The desktop app lists Claude Code's sessions itself

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 6, third part: reading session logs without the user picking
files. Claude Code keeps each session as a transcript in
`~/.claude/projects/<project>/<session>.jsonl`. The browser can read a file
only when the user picks it, so the session page asks for one each time,
and the hidden `.claude` folder is awkward to reach in file dialogs. The
desktop app can read the folder.

## Decision

- **Two commands of the app.** `list_sessions` lists the transcripts in
  each project folder, most recently changed first, with their size and
  the time they last changed; `read_session` returns one transcript's text
  by its path relative to the projects folder. They follow the rules of the
  MCP server's `listSessionFiles` and `readSessionFile`
  ([ADR 0010](0010-local-mcp-server.md)): a missing folder is an empty
  list, entries that cannot be read are reported and the rest listed, and
  only `.jsonl` files inside the projects folder are read, also when a link
  points elsewhere.
- **Only that folder.** The page gets no general file access, so a script
  in the page could read Claude Code's transcripts but no other file. The
  file system plugin with a scope was not needed for two read-only
  operations.
- **On the session page.** In the desktop app the page lists the recent
  sessions under the file picker, and a session opened from the list is
  read like a picked transcript: kept only while the page is open, never
  stored. "Recent sessions" returns to the list, which is read again so
  that it includes sessions written since. The browser version is
  unchanged.

## Alternatives considered

- **Tauri's file system plugin with a scope on `$HOME/.claude/projects`.**
  It adds a dependency and a permission set for what two short commands
  do, and its scope would also allow reading files other than transcripts.
- **Watching the folder.** Reading the list again when it is shown is
  enough for picking a session; following a running session live is what
  the Claude Code pane does ([ADR 0011](0011-session-map-pane.md)).

## Consequences

- Transcripts can hold secrets that appeared in a session. A script
  injected into the page could read them in the desktop app, as it could
  read a transcript the user opened. The page's protections against
  injected scripts (section 7 of ARCHITECTURE.md) are what guards both.
- Claude Code may change where it keeps sessions; the folder is the one the
  MCP server already reads.
- Rust unit tests cover listing and the refusal of paths outside the
  folder, and the desktop end-to-end test opens a session from the list in
  a home folder of its own.
