# 0008. Generating summaries

Status: Proposed
Date: 2026-10-08

## Context

Summary nodes are part of the data model from the start (ADR 0001): a
model-generated, user-editable condensation of a path segment that other
turns can reference. Phase 2 makes them usable. Three questions were open:
what is sent to the model, which range a summary covers, and what happens
when generation does not finish.

## Decision

- **What is sent.** `assembleForSummary` in the core builds the request
  from the covered segment: every turn, with the references it was sent
  with, as one user message holding a transcript of `<turn role="…">`
  blocks. Sending the turns as messages of their own roles is not
  possible, because a segment can start with an answer and providers
  require the first message to be the user's. The function returns a
  manifest like any assembled context, recorded in the summary's
  `GenerationRecord`.
- **Instruction.** The app's summary instruction is sent as the system
  prompt instead of the user's own, which is written for answering. It is
  recorded with the summary, so what the model was asked is visible.
- **Range.** The app creates summaries from the first message of the
  branch to an answer, so a summary can stand in for the whole branch when
  it is attached elsewhere, which is how branches are merged. The data
  model keeps allowing any segment; imported summaries of other ranges are
  shown and can be attached.
- **Only finished summaries are saved.** A summary has no status, and one
  cut off by the output limit, refused, stopped or failed would silently
  lose part of the branch. Nothing is saved then, and the user is told why.
- **Editing** adds a summary with `revises` set, without a
  `GenerationRecord`. The app shows the newest revision of each summary;
  earlier ones stay in the conversation and its export.

## Alternatives considered

- **The turns as role messages after the user's own system prompt.**
  Fails for segments that start with an answer, and lets an answering
  prompt shape the summary.
- **Saving incomplete summaries with a marker.** Needs a status on summary
  nodes, a data model change, for output the user would have to redo.
- **Checking the summary's manifest on import, as for answers (invariant
  7).** Worth doing, but it changes an invariant and needs its own record.

## Consequences

- Invariant 7 still covers answers only. A summary's manifest is computed
  by the core when it is generated, but an imported one is not checked.
- Summaries are shown in the reading pane after the answer they end at,
  not on the map.
