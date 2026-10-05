# 0004. Domain logic in a pure, framework-free core package

Status: Accepted
Date: 2026-10-05

## Context

Correctness of the graph invariants and of context assembly is the product's
central promise. Logic mixed into UI components is hard to test and is where
code generated quickly, whether by people or AI tools, degrades fastest.
Later consumers (MCP server, CLI, desktop shell) need the same logic.

## Decision

`packages/core` contains the data model, invariants, operations, context
assembly and the JSON format. It:

- performs no I/O (no network, storage, timers or global state),
- depends on no UI framework,
- receives IDs and timestamps from the caller as plain values, so the same
  inputs always produce the same graph,
- is tested with unit tests and property-based tests.

`apps/web` depends on `core`. `core` never depends on `apps/web`.

These rules are enforced mechanically. The core's build configuration
includes no DOM or Node.js type definitions, so I/O APIs do not compile.
Lint rules restrict Node.js, UI and storage imports, and the `Date`,
`fetch`, timer and `Math.random` globals.

## Alternatives considered

- **Single package.** Less structure to set up, but nothing stops domain
  logic from leaking into components.

## Consequences

- A small amount of extra tooling: workspaces and a dependency rule.
- The most important behaviour can be verified in milliseconds without a
  browser.
