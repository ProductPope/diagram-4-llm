// A pane that shows the current session as a map. The map comes from the
// plugin's own MCP server (packages/mcp), so the pane and Claude read the
// same outline, and the transcript is read by Node, which has no size limit
// like the 4 MiB one on $.fs.read.
import type { EngineInterface, On } from "claude-code";

const PANE = "session-map";
const SERVER = "diagram-4-llm";

/** Where Claude Code writes this session's transcript, once it has said. */
let transcriptPath: string | null = null;
/** The text the pane shows. */
let shown = "Loading the map…";

/**
 * The transcript's path as the server takes it, relative to the Claude Code
 * projects folder: `<project>/<session>.jsonl`.
 */
export function sessionPathOf(transcript: string): string | null {
  const parts = transcript.split(/[\\/]/);
  const file = parts.at(-1);
  const project = parts.at(-2);
  if (file === undefined || project === undefined || project === "")
    return null;
  return file.endsWith(".jsonl") ? `${project}/${file}` : null;
}

async function refresh($: EngineInterface): Promise<void> {
  shown = await readMap($);
  $.ui.invalidate("ui.render");
}

async function readMap($: EngineInterface): Promise<string> {
  if (transcriptPath === null)
    return "Claude Code has not said where this session's transcript is yet. It does when the session starts and after each answer.";
  const path = sessionPathOf(transcriptPath);
  if (path === null) return `${transcriptPath} is not a session transcript.`;
  const connected = await $.mcp.connect(SERVER);
  if (!connected.isConnected)
    return `The diagram-4-llm MCP server is not connected: ${connected.message}`;
  try {
    const result = await $.mcp.call(
      connected.server,
      "read_claude_code_session",
      { path },
    );
    return result.content
      .map((block) => block.text ?? "")
      .join("\n")
      .trim();
  } catch (error) {
    return `The map could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function refreshIfOpen($: EngineInterface): Promise<void> {
  if ((await $.ui.panes()).some((pane) => pane.id === PANE)) await refresh($);
}

export function register(on: On): void {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "session-map",
      description: "Show this session as a map of prompts, answers and tools",
      immediate: true,
    });
    return next(e);
  });

  // The transcript path reaches mods only on settings hook events. Stop
  // fires after each answer, which is also when the map changes. The map is
  // read on a timer so that reading it does not hold up the event.
  on("classic.SessionStart", async ($, e, next) => {
    transcriptPath = e.transcript_path;
    $.clock.after(0, () => refreshIfOpen($));
    return next(e);
  });
  on("classic.Stop", async ($, e, next) => {
    transcriptPath = e.transcript_path;
    $.clock.after(0, () => refreshIfOpen($));
    return next(e);
  });

  on("command.run", { command: "session-map" }, async ($) => {
    // Where nothing draws, such as `claude -p`, the map is the reply.
    if ((await $.session.surfaces()).length === 0)
      return { text: await readMap($) };
    await $.ui.open({
      id: PANE,
      title: "Session map",
      focus: true,
      closeOnEscape: true,
    });
    await refresh($);
    return {};
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    return Box({
      flexDirection: "column",
      children: [
        Button({
          key: "refresh",
          label: "Refresh",
          hotkey: "r",
          plain: true,
          onPress: () => refresh($),
        }),
        ...shown
          .split("\n")
          .map((line) => Text({ wrap: "truncate-end", children: [line] })),
      ],
    });
  });
}
