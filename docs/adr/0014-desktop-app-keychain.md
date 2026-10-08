# 0014. The desktop app wraps the web build and keeps the API key in the keychain

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 6: desktop packaging with Tauri, for OS keychain storage, no
CORS setup and reading session logs without picking files (ADR 0002 left
it to this phase). In the browser the API key sits in local storage, where
any script running on the page could read it. The maintainer chose to start
with the app shell and the key, and to add CORS and session logs in later
changes.

## Decision

- **The web build in a Tauri 2 window.** `apps/desktop` builds the web app
  with `vite build --mode desktop` and serves it from the app. There is no
  second interface: everything the browser version does works the same.
  The desktop mode differs only in its Content Security Policy, which also
  allows Tauri's IPC (`ipc:` and `http://ipc.localhost`).
- **The API key in the operating system's credential store.** Two commands,
  `load_api_key` and `save_api_key`, read and write one entry through the
  `keyring` crate: Keychain Services on macOS, Credential Manager on
  Windows and the Secret Service on Linux. The other settings stay in the
  page's storage, without the key. Only the key goes to the store, because
  it is the secret and because Credential Manager limits an entry's size.
- **Read once at start.** The page reads the key before its first render,
  so settings stay synchronous as in the browser. Saving waits for the
  store and saves nothing when it fails; the settings then apply until the
  app is closed and the error says so. A store that cannot be read at start
  is reported, and the user is asked for the key again.
- **Unsigned builds.** Signing needs the maintainer's Apple and Windows
  certificates; it is left until there are releases to sign.
- **Tested through the real store.** An end-to-end test on Linux drives the
  built app with `tauri-driver`, saves a key in an isolated, unlocked
  GNOME keyring and checks that the page's storage does not hold it and
  that a new start reads it back.

## Alternatives considered

- **Tauri's stronghold plugin.** It keeps secrets in an encrypted file
  whose password the app would have to hold or ask for; the system store
  already protects the key with the user's login.
- **Storing all settings in the keychain.** The system prompt can exceed
  Credential Manager's limit, and the rest is not secret.
- **Electron.** It ships a whole browser with each app, and Tauri was the
  option named in PLAN.

## Consequences

- Building the desktop app needs Rust and, on Linux, the WebKitGTK and
  related system packages; the web app's build is unchanged.
- CI builds the app and runs its end-to-end test on Linux only. macOS and
  Windows builds are not checked by CI.
- Local model servers still need CORS set up until a later change routes
  their requests through the app.
