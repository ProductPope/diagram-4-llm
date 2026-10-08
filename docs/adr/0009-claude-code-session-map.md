# 0009. Claude Code sessions are read into a separate, read-only map

Status: Proposed
Date: 2026-10-08

## Context

Phase 3 starts with a map of Claude Code sessions: reading the transcripts
Claude Code keeps on disk into read-only graphs, with no manual export.

Claude Code writes each session to
`~/.claude/projects/<project>/<session>.jsonl`. That location is documented
(<https://code.claude.com/docs/en/claude-directory>); the format of the
lines is not. The reader was written against transcripts of Claude Code
2.1.294, which show:

- each line is a JSON object with a `type`. Lines that are part of the
  conversation (`user`, `assistant`, `system`, `attachment`) have a `uuid`
  and a `parentUuid`, so the lines form a tree, and a parent always comes
  earlier in the file;
- each content block of a model response is a line of its own, sharing the
  response's `message.id`. With parallel tool calls the session continues
  from the result of the first call, so the other calls' lines look like
  branches although they are not;
- tool results are `user` lines holding `tool_result` blocks that name the
  call they answer;
- a compaction is a `system` line with subtype `compact_boundary` and no
  parent; `logicalParentUuid` names the line it follows, and a later
  `user` line with `isCompactSummary` holds the summary;
- other lines (attachments, `queue-operation`, `last-prompt`, titles and
  more) hold state of Claude Code itself.

A session is not a conversation of the app. Its answers were not generated
by the app, so they have no `GenerationRecord` and no manifest the core
could check (invariant 7), and it contains tool use, which the data model
does not have. The conversation format is released, so any change to it
increases `formatVersion`.

## Decision

- **A separate model.** `readClaudeCodeSession` in the core reads a
  transcript into a `ClaudeCodeSession`: a forest of steps, each a prompt,
  the activity that followed it (answers and tool calls, each call with
  its result), or a compaction with its summary. It is pure, so a later
  MCP server can use it too. The conversation model, its format and its
  invariants do not change.
- **Steps, not lines.** Lines of one response, and answers that follow
  each other with no branch between them, form one activity step. A line
  that is not shown hangs its children from the nearest shown line above
  it. A step that follows a line that already has a shown follower starts
  a branch.
- **Tolerant reading, reported.** Only the fields the reader uses are
  checked, and unknown fields are ignored, so newer versions of Claude
  Code that add fields still load. Lines that cannot be read are listed
  with their number and reason, and lines with nothing to show are
  counted by type; the page shows both, so the map never looks like the
  whole transcript when it is not. A file with no step at all is
  rejected.
- **Read only, kept only in the tab.** The page `#/session` opens a
  transcript with a file picker and shows the map next to the selected
  branch. Nothing is stored or sent: transcripts can hold secrets that
  passed through a tool, and Claude Code already keeps them. Opening the
  file again shows the session as it is then.

## Alternatives considered

- **Import sessions as conversations.** Lets every feature of the app work
  on a session, but needs new node kinds for tool calls and a generation
  record that does not claim the app assembled the context, which means
  format version 2 and a migration. It can be built on this reader later
  if using a session as context turns out to be needed.
- **Store opened sessions in IndexedDB.** Lets a map be reopened without
  the file, but copies possibly secret content into browser storage and
  goes stale as the session continues.
- **Show every line as a node.** Faithful to the file, but a typical
  session has hundreds of tool calls and parallel calls would appear as
  false branches.

## Consequences

- The reader depends on an undocumented format. A change in Claude Code
  can stop it from reading lines; the problems notice makes that visible,
  and the test fixtures record the shapes it was written against.
- Subagent transcripts (`<session>/subagents/`) are separate files and
  are not part of the map. Thinking is not shown: the transcript keeps
  only its signature.
- A step that follows a line in the middle of an activity is attached to
  the whole activity. Branches in Claude Code start from prompts, so this
  was not seen in practice.
