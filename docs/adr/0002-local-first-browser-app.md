# 0002. Local-first browser app with no project backend

Status: Proposed
Date: 2026-10-05

## Context

Conversations with LLMs often contain personal or confidential material. The
project is open source and maintained by one person, so running a hosted
service would add cost, operational work and responsibility for user data.
Users bring their own API keys or run local models.

## Decision

Phases 0 to 2 ship a static web app that runs entirely in the browser. Data
is stored in IndexedDB. The app calls model providers directly from the
browser. The project operates no server and collects no telemetry.

Desktop packaging with Tauri is evaluated in phase 3.

## Alternatives considered

- **Hosted web app with a backend.** Enables sync and keeps keys off the
  client, but it requires operating a service and holding user data.
- **Desktop app from day one (Tauri or Electron).** Solves key storage and
  CORS, but it adds packaging, signing and update work before the core idea
  is validated.
- **Local backend process (for example Node) plus a web UI.** Solves CORS
  and key storage, but it raises the setup cost for every user.

## Consequences

- API keys live in browser storage. The security section of ARCHITECTURE.md
  lists the mitigations, and the README states the risk plainly.
- Calling local model servers requires CORS configuration by the user.
- Data is per browser profile. Export and import is the only way to move it,
  so the JSON format must be robust and versioned.
- The app can be served from any static host or run from `localhost`.
