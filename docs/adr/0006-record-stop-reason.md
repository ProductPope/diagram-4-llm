# 0006. Record why a complete answer ended

Status: Accepted (approved by the maintainer)
Date: 2026-10-05

## Context

Providers report why an answer ended: normally, at an output or context
limit, or because the model refused. The adapters normalise this to `end`,
`max-tokens`, `refusal` or `other` (ADR 0005), but the data model had no
place for it. A truncated or refused answer was stored exactly like a
normal one, and the information was lost on reload, export and import.
That contradicts the principle that what the model did is never hidden.

## Decision

- `AssistantTurn` gets an optional `stopReason`, set exactly when the
  status is `complete`. An `error` is set exactly when the status is
  `error`. The core rejects any other combination, including on import.
- Truncated and refused answers stay `complete`: their content is real
  output that the user may read, continue from, reference or summarise.
  The UI shows the reason.
- Server-side refusal fallbacks, which re-run a refused request on another
  model, are not used. The answer always comes from the model the user
  chose; after a refusal the user can retry with another model in a new
  branch.
- The data format stays at version 1. Documents written before this change
  are still valid. No version has been released yet; from the first public
  release on, any change to the format increases `formatVersion`.

## Alternatives considered

- **Show the reason only while the page is open.** No data model change,
  but the information disappears on reload, which hides how an answer
  ended.
- **Model truncation and refusal as statuses.** `complete` would no longer
  mean "the provider finished", and every check for usable turns would
  need to list the new statuses.
- **Enable refusal fallbacks by default**, as Anthropic recommends for
  applications. In a tool whose purpose is control over what each branch
  sends to which model, an answer silently produced by a different model
  would be surprising, and it would need its own recording and display.

## Consequences

- `finishAssistantTurn` requires a stop reason for complete answers.
- A document containing `stopReason` cannot be imported by builds made
  before this change. This is acceptable only while no version has been
  released.
