# Contributing

Issues and pull requests are welcome. This project follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Read the [plan](docs/PLAN.md): it says which phase is in progress and what
  is out of scope. Work on a later phase or a non-goal is unlikely to be
  merged; open an issue to discuss it first.
- The [architecture](docs/ARCHITECTURE.md) and the
  [decision records](docs/adr/) explain the data model, its invariants and
  the choices already made. Changing an invariant needs a new ADR.
- [CLAUDE.md](CLAUDE.md) holds the code standards. They are written for AI
  agents, and they apply to every change, whoever writes it.

## Making a change

1. Set up the repository as described in the
   [README](README.md#development).
2. Keep each pull request to one purpose, made of small commits whose
   messages explain why the change is needed.
3. Add tests for behaviour changes in `packages/core`, and property-based
   tests for changes to invariants.
4. Before opening the pull request, run `pnpm check`, and `pnpm e2e` if the
   change touches the interface.

## Reporting a vulnerability

Do not open a public issue. Follow the [security policy](SECURITY.md).
