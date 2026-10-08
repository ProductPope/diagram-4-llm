# 0012. Topics on a session branch are detected on request and not stored

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 5: model-detected topics over a linear imported conversation.
The maintainer chose to start with Claude Code sessions (ADR 0009), the one
import the app has. A session's branch is long and linear, and its prompts
often hold pasted logs or files.

## Decision

- **On request, per branch.** "Detect topics" on the session page sends the
  prompts of the selected branch, numbered, to a model and asks for the
  prompt each topic starts at and a short title. Nothing is sent until the
  user asks, as with suggested branches.
- **The start of each prompt.** Each prompt is sent as its first 300
  characters on one line. Topics depend on what a prompt is about, not on
  the logs or files pasted into it, and whole prompts would make a long
  session's request many times larger. This is a request built for one
  task, not the context of a conversation, so the rule that context
  assembly never truncates does not apply to it. The estimate is checked
  against the model's context window when the user entered one, and an
  over-budget request is refused with the numbers rather than shortened.
- **The title model.** The model that writes titles, which the user chose
  for short helper requests, or else the first model. The page names it
  next to the button.
- **A reply that does not fit is reported.** Topics must start at the first
  prompt and move forward, so that each prompt is in exactly one topic. A
  reply that breaks this is shown as an error, not repaired.
- **Not stored.** Topics are shown as headings in the branch and as a list
  that jumps to each one, and are kept only while the page is open, like
  the session itself.

## Alternatives considered

- **Topics on conversations in the app.** They are trees the user builds
  on purpose, and storing topics would change the data model; left until
  there is a need.
- **Detecting topics locally, without a model.** Grouping by word overlap
  gives poor titles and boundaries for short prompts.

## Consequences

- Detecting topics costs one request to the user's provider; the request
  holds the starts of the user's prompts.
- The same code can serve Claude.ai exports (phase 3, item 4) once they
  are imported as linear conversations.
