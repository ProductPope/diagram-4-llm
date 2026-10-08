# 0011. A Claude Code pane that draws the session map from the MCP server

Status: Proposed
Date: 2026-10-08

## Context

Phase 3, item 3: a pane inside Claude Code, built as a mod on top of the
session map (ADR 0009) and the local MCP server (ADR 0010).

Claude Code documents mods: plugins with a JavaScript or TypeScript hooks
module that Claude Code runs in its own process
([overview](https://code.claude.com/docs/en/plugins/mods/overview)). A mod
can open a pane and draw text, buttons and fields in it, in the terminal
and the Code tab of the Desktop app. The hooks module has no Node.js APIs,
may import only files inside the plugin directory, and reads files through
`$.fs.read`, which stops at 4 MiB. Session transcripts pass that size.

## Decision

- **The pane draws what the MCP server returns.** The plugin,
  `packages/mcp/plugin`, lists the server in its manifest. The mod asks it
  for `read_claude_code_session` on the current transcript and draws the
  outline line by line, so the pane and Claude read the same map, and the
  transcript is read by Node and the core, with no size limit.
- **The pane follows the session.** The transcript's path reaches mods on
  the settings hook events `SessionStart` and `Stop`; on each, an open pane
  reads the map again. A button reads it on demand.
- **Read only, from a clone.** The mod draws and reads; it changes nothing
  in the session. The manifest points at the server's build in the clone,
  so the plugin is loaded with `--plugin-dir` and is not published to a
  marketplace.
- **Checked by Claude Code's own tools.** The mod is typed against
  declarations Claude Code writes when it loads the mod, which the
  repository does not carry. CI installs a pinned Claude Code and runs
  `claude plugin validate --strict` and `claude plugin test`, which need
  neither a sign-in nor the network.

## Alternatives considered

- **Parse the transcript in the mod.** The hooks module cannot import the
  core, which depends on Zod, without a bundling step, and `$.fs.read`
  cannot read large transcripts.
- **Build the map from `$.session.messages()`.** It returns the newest
  4,096 messages as a flat list, without the parent links that show
  branches and compactions.
- **Draw an interactive map with a button per step.** It needs the map as
  data rather than text, which the server does not return yet. The text
  outline comes first; steps can become buttons once there is use for it.

## Consequences

- The pane needs Claude Code 2.1.287 or later, and draws nothing in the
  VS Code extension's chat panel; there `/session-map` prints the map.
- The pane depends on the outline text of `read_claude_code_session`; a
  change to it changes the pane too.
- CI downloads Claude Code on each run, about 250 MB unpacked.
