# 0015. The desktop app sends requests to OpenAI-compatible servers itself

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 6, second part: no CORS setup in the desktop app. A page may
read a server's answer only if the server allows the page's origin, so
local servers such as Ollama and LM Studio must be configured first (the
setup assistant explains how). In the desktop app the page's origin is
`tauri://localhost`, or `http://tauri.localhost` on Windows, which those
servers do not know either.

## Decision

- **Requests from the app, not the page.** In the desktop app the
  OpenAI-compatible adapter uses the `fetch` of Tauri's HTTP plugin, which
  makes the request in Rust, where CORS does not apply. It streams the
  response body and honours an abort signal, as the page's `fetch` does.
  The adapter already took a `fetch` for its tests, so nothing else in it
  changes.
- **No Origin header.** The plugin adds the page's origin as `Origin`,
  which servers such as Ollama check against a list. The app sends an empty
  Origin, which the plugin's `unsafe-headers` feature turns into none, so
  servers treat the app like any other local client.
- **The same reach as the page.** The plugin's scope allows HTTPS on any
  port and HTTP on `localhost` and `127.0.0.1`, the hosts the page's
  Content Security Policy allows, so scripts in the page reach nothing
  they could not reach before. Servers elsewhere on the network stay out
  of reach, as in the browser.
- **Anthropic stays in the page.** Its API allows browser requests, and
  the SDK's own `fetch` keeps working as before.
- **The setup assistant and Settings drop the CORS steps** in the desktop
  app, and say that the key is kept in the system keychain.

## Alternatives considered

- **Telling the user to allow `tauri://localhost`.** It keeps the setup
  step that this part of phase 3 is meant to remove.
- **A command of our own that makes the request.** It would repeat what
  the plugin does, including streaming and cancelling.
- **Allowing any host.** It would let a script in the page reach any
  device on the local network.

## Consequences

- `unsafe-headers` also lets the page set other headers that browsers
  forbid, such as `Host` or `Cookie`, on requests to the hosts above.
- The desktop end-to-end test talks to a server with no CORS headers and
  checks that the answer arrives and that no Origin is sent.
