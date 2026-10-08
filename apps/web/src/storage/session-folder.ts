import { err, ok, type Result } from "@diagram-4-llm/core";
import { z } from "zod";

import { messageOf, type Invoke } from "./keychain";

const sessionListSchema = z.object({
  sessions: z.array(
    z.object({
      path: z.string(),
      project: z.string(),
      modified: z.number(),
      bytes: z.number(),
    }),
  ),
  problems: z.array(z.string()),
});

export type SessionList = z.infer<typeof sessionListSchema>;
export type SessionFile = SessionList["sessions"][number];

/**
 * Claude Code's session transcripts in `~/.claude/projects`, which only the
 * desktop app can reach without the user picking each file (ADR 0016).
 */
export interface SessionFolder {
  /** Most recently changed first. */
  readonly list: () => Promise<Result<SessionList, string>>;
  /** A transcript's text, by its path relative to the folder. */
  readonly read: (path: string) => Promise<Result<string, string>>;
}

/** The folder through the commands in `apps/desktop/src-tauri/src/lib.rs`. */
export function openSessionFolder(invoke: Invoke): SessionFolder {
  return {
    list: async () => {
      let listed: unknown;
      try {
        listed = await invoke("list_sessions");
      } catch (reason) {
        return err(messageOf(reason));
      }
      const parsed = sessionListSchema.safeParse(listed);
      return parsed.success
        ? ok(parsed.data)
        : err("The desktop app returned something other than a list.");
    },
    read: async (path) => {
      let text: unknown;
      try {
        text = await invoke("read_session", { path });
      } catch (reason) {
        return err(messageOf(reason));
      }
      return typeof text === "string"
        ? ok(text)
        : err("The desktop app returned something other than text.");
    },
  };
}
