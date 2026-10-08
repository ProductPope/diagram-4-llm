// Run with `claude plugin test`, which loads the mod and fires events at it
// the way Claude Code would, with the MCP server answered by stubs.
import { expect, mock, test } from "claude-code/testing";

import { sessionPathOf } from "./session-map.js";

const TRANSCRIPT = "/home/me/.claude/projects/-home-me-app/s1.jsonl";
const SERVER = "plugin:diagram-4-llm:diagram-4-llm";

const PANE = {
  plugin: "diagram-4-llm",
  component: "Pane",
  requestId: "session-map",
  surface: "terminal",
  viewport: { columns: 100, rows: 30 },
  props: {
    title: "Session map",
    isFocused: true,
    bodyColumns: 60,
    placement: "inline",
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

const BASE = {
  session_id: "s1",
  transcript_path: TRANSCRIPT,
  cwd: "/home/me/app",
} as const;

/** /session-map typed at the prompt of a terminal. */
const RUN = {
  command: "session-map",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: false, columns: 100 },
} as const;

test("a transcript path becomes the path the server takes", () => {
  expect(sessionPathOf(TRANSCRIPT)).toBe("-home-me-app/s1.jsonl");
  expect(
    sessionPathOf("C:\\Users\\me\\.claude\\projects\\C--app\\s1.jsonl"),
  ).toBe("C--app/s1.jsonl");
  expect(sessionPathOf("/tmp/notes.txt")).toBe(null);
});

test("/session-map opens a pane with the map the server returns", async ($, on) => {
  const clock = mock.clock(on);
  const calls: unknown[] = [];
  on("session.start", () => ({ cwd: "/home/me/app" }));
  on("classic.SessionStart", () => ({}));
  on("command.register", () => ({ value: { command: "session-map" } }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.panes", () => ({ value: [] }));
  on("mcp.connect", () => ({ value: { isConnected: true, server: SERVER } }));
  on("mcp.call", ($, e) => {
    calls.push(e);
    return {
      value: {
        content: [
          { type: "text", text: "Fix the build\n- p1 prompt: The build fails" },
        ],
        isError: false,
      },
    };
  });

  await $.session.start({
    surface: "terminal",
    isInteractive: true,
    cwd: "/home/me/app",
  });
  await $.classic.SessionStart({ ...BASE, source: "startup" });
  await clock.settle();
  expect(await $.command.run(RUN)).toEqual({});

  expect(calls).toEqual([
    {
      server: SERVER,
      tool: "read_claude_code_session",
      args: { path: "-home-me-app/s1.jsonl" },
    },
  ]);
  const ui = await $.ui.mount(PANE);
  expect(
    await ui.find({ type: "Text", text: "- p1 prompt: The build fails" }),
  ).toBeDefined();
  await ui.unmount();
});

test("an open pane follows the session after each answer", async ($, on) => {
  const clock = mock.clock(on);
  let answer = "- p1 prompt: The build fails";
  on("classic.Stop", () => ({}));
  on("ui.panes", () => ({
    value: [
      {
        id: "session-map",
        title: "Session map",
        isShown: true,
        isFocused: false,
        isPlaced: true,
      },
    ],
  }));
  on("mcp.connect", () => ({ value: { isConnected: true, server: SERVER } }));
  on("mcp.call", () => ({
    value: { content: [{ type: "text", text: answer }], isError: false },
  }));

  answer = "- r1 answer (tools: Bash): Fixed it.";
  await $.classic.Stop({ ...BASE, stop_hook_active: false });
  await clock.settle();

  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: "Text", text: answer })).toBeDefined();
  await ui.unmount();
});

test("the pane says why when the server is not connected", async ($, on) => {
  const clock = mock.clock(on);
  on("classic.SessionStart", () => ({}));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.panes", () => ({ value: [] }));
  on("mcp.connect", () => ({
    value: {
      isConnected: false,
      reason: "failed",
      message: "The server exited before it answered.",
    },
  }));

  await $.classic.SessionStart({ ...BASE, source: "startup" });
  await clock.settle();
  await $.command.run(RUN);

  const ui = await $.ui.mount(PANE);
  expect(
    await ui.find({
      type: "Text",
      text: "The diagram-4-llm MCP server is not connected: The server exited before it answered.",
    }),
  ).toBeDefined();
  await ui.unmount();
});

test("where nothing draws, the map is the command's reply", async ($, on) => {
  const clock = mock.clock(on);
  on("classic.SessionStart", () => ({}));
  on("session.surfaces", () => ({ value: [] }));
  on("ui.panes", () => ({ value: [] }));
  on("mcp.connect", () => ({ value: { isConnected: true, server: SERVER } }));
  on("mcp.call", () => ({
    value: {
      content: [{ type: "text", text: "- p1 prompt: The build fails" }],
      isError: false,
    },
  }));

  await $.classic.SessionStart({ ...BASE, source: "startup" });
  await clock.settle();
  expect(await $.command.run(RUN)).toEqual({
    text: "- p1 prompt: The build fails",
  });
});
