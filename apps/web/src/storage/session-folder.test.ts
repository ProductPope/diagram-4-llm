import { err, ok } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import type { Invoke } from "./keychain";
import { openSessionFolder } from "./session-folder";

const listed = {
  sessions: [
    {
      path: "-home-me-app/a.jsonl",
      project: "-home-me-app",
      modified: 1_791_460_800_000,
      bytes: 120,
    },
  ],
  problems: [],
};

describe("desktop session folder", () => {
  it("lists and reads transcripts through the desktop app's commands", async () => {
    const calls: unknown[] = [];
    const invoke: Invoke = (command, args) => {
      calls.push([command, args]);
      return Promise.resolve(
        command === "list_sessions" ? listed : '{"type":"user"}\n',
      );
    };
    const folder = openSessionFolder(invoke);
    expect(await folder.list()).toEqual(ok(listed));
    expect(await folder.read("-home-me-app/a.jsonl")).toEqual(
      ok('{"type":"user"}\n'),
    );
    expect(calls).toEqual([
      ["list_sessions", undefined],
      ["read_session", { path: "-home-me-app/a.jsonl" }],
    ]);
  });

  it("reports the desktop app's errors and answers it cannot use", async () => {
    const failing = openSessionFolder(() =>
      Promise.reject(
        new Error("The path is outside the Claude Code projects folder."),
      ),
    );
    expect(await failing.list()).toEqual(
      err("The path is outside the Claude Code projects folder."),
    );
    expect(await failing.read("../x.jsonl")).toEqual(
      err("The path is outside the Claude Code projects folder."),
    );
    const odd = openSessionFolder(() => Promise.resolve(42));
    expect(await odd.list()).toEqual(
      err("The desktop app returned something other than a list."),
    );
    expect(await odd.read("a.jsonl")).toEqual(
      err("The desktop app returned something other than text."),
    );
  });
});
