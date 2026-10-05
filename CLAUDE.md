# Instructions for AI coding agents

This repository is public and is built with AI assistance. Reviewers will
read it looking for the usual signs of careless generated code. Every change
must hold up to a skeptical senior engineer reading the diff line by line.

Read before changing anything:

- [docs/PLAN.md](docs/PLAN.md): what is being built, in which phase, and what is out of scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, invariants, context assembly
- [docs/adr/](docs/adr/): decisions already made and why

## Scope

- Work only on the current phase in PLAN.md. If a task needs something from a
  later phase or a non-goal, stop and ask.
- Do not change the semantics of the data model or the invariants in
  ARCHITECTURE.md section 2.1 without a new ADR that the maintainer approves.
- Keep each change to one purpose. Do not refactor, rename or reformat
  unrelated code in the same change.

## Architecture rules

- `packages/core` performs no I/O and imports no UI framework, browser API or
  storage library. Time and ID generation are injected.
- `apps/web` may import `core`. `core` must never import `apps/web`.
- Context assembly never drops, truncates or reorders content. Over-budget
  context is reported to the caller, never fixed silently.
- Model output is untrusted input. Render Markdown with raw HTML disabled.

## Code standards

- TypeScript `strict`. No `any`, no `@ts-ignore` or `@ts-expect-error`, no
  non-null assertions (`!`) unless a comment explains why the value cannot be
  null.
- Expected failures (network errors, provider errors, invalid import files)
  are modelled as values and handled. Never swallow an error with an empty
  `catch`.
- No dead code, commented-out code, unused exports or placeholder
  implementations. No `TODO` without a linked issue.
- Comments explain why, not what. Do not add comments that restate the code.
- Follow the naming and structure of surrounding code. Do not introduce a new
  pattern when an existing one fits.

## Dependencies and external APIs

- Do not add a dependency without stating in the commit message what it does,
  why existing code or the platform cannot do it, and its install size.
- Never write code against a library or provider API from memory. Check the
  installed version's type definitions or the official documentation first.
  If you cannot verify an API, say so instead of guessing.

## Tests

- Every behaviour change in `packages/core` comes with tests. Changes to
  invariants come with property-based tests.
- Tests check behaviour through public functions, not implementation details.
  A snapshot alone is not a test of a behaviour.
- Never skip, disable or loosen a test to make a change pass. If a test is
  wrong, fix it in a separate commit that explains why.
- Tests must not use the network or real API keys. Use recorded fixtures and
  the fake provider.

## Definition of done

A change is done only when all of the following pass locally:

1. typecheck
2. lint
3. unit and property-based tests
4. build
5. end-to-end tests, if the change touches the UI

Then re-read your own diff as a hostile reviewer and fix what you find.
Update PLAN.md, ARCHITECTURE.md or an ADR if the change makes them inaccurate.

## Git

- Small commits in Conventional Commits format (`feat(core): …`,
  `fix(web): …`, `docs: …`). The body explains why the change is needed.
- Never push to the default branch, never rewrite published history, never
  merge your own pull request. The maintainer reviews and merges every change.

## Communication

- Report what you verified and how. If something was not run or could not be
  verified, say so explicitly.
- Prefer stopping with a precise question over guessing on product or
  architecture decisions.
