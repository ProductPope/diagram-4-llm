import { z } from "zod";

import { err, ok, type Result } from "./result.js";

// Claude Code keeps each session as a JSON Lines transcript in
// `~/.claude/projects/<project>/<session>.jsonl`. The location is documented
// (https://code.claude.com/docs/en/claude-directory); the line format is
// not. The schemas below read only the fields this module uses, as written
// by Claude Code 2.1.294, and ignore any others so that newer versions that
// add fields still load. See ADR 0009.

/** Any content block; each use reads it again with a schema below. */
const anyBlock = z.object({ type: z.string() }).loose();
const textBlock = z.object({ type: z.literal("text"), text: z.string() });
const toolUseBlock = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const toolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(anyBlock)]).optional(),
  is_error: z.boolean().optional(),
});

const linked = {
  uuid: z.string().min(1),
  parentUuid: z.string().min(1).nullable(),
  timestamp: z.string().optional(),
};

const userLine = z.object({
  ...linked,
  type: z.literal("user"),
  isMeta: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(anyBlock)]),
  }),
});

const assistantLine = z.object({
  ...linked,
  type: z.literal("assistant"),
  message: z.object({
    id: z.string().optional(),
    model: z.string().optional(),
    content: z.array(anyBlock),
  }),
});

const systemLine = z.object({
  ...linked,
  type: z.literal("system"),
  subtype: z.string().optional(),
  logicalParentUuid: z.string().min(1).nullable().optional(),
});

const titleLine = z.object({
  type: z.literal("ai-title"),
  aiTitle: z.string(),
});

/** Any line that is not one of the above, kept only to count it. */
const otherLine = z.object({
  type: z.string(),
  uuid: z.string().min(1).optional(),
  parentUuid: z.string().min(1).nullable().optional(),
});

/** Something Claude did between two prompts, in the order it happened. */
export type ActivityItem =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly name: string;
      /** The tool's input as indented JSON. */
      readonly input: string;
      /** Null while no result is in the transcript. */
      readonly result: {
        readonly text: string;
        readonly isError: boolean;
      } | null;
    };

/**
 * One node of the session's map. Steps form a forest through `parentId`:
 * a prompt sent again from an earlier point of the session starts a
 * branch, as in a conversation of the app.
 */
export type SessionStep =
  | {
      readonly kind: "prompt";
      readonly id: string;
      readonly parentId: string | null;
      readonly text: string;
      readonly timestamp: string | null;
    }
  | {
      /** Consecutive answers and tool calls with no branch between them. */
      readonly kind: "activity";
      readonly id: string;
      readonly parentId: string | null;
      readonly model: string | null;
      readonly items: readonly ActivityItem[];
      readonly timestamp: string | null;
    }
  | {
      /** Claude Code replaced the history before this point by a summary. */
      readonly kind: "compaction";
      readonly id: string;
      readonly parentId: string | null;
      readonly summary: string | null;
      readonly timestamp: string | null;
    };

export interface ClaudeCodeSession {
  readonly title: string | null;
  /** In the order of the transcript; a step's parent comes before it. */
  readonly steps: readonly SessionStep[];
  /**
   * Lines with nothing to show on the map, such as attachments, hidden
   * messages or internal records, counted by their `type`. Reported so
   * that the map does not appear to be the whole transcript.
   */
  readonly notShown: ReadonlyMap<string, number>;
  /** Lines that could not be read. The rest of the session still loads. */
  readonly problems: readonly SessionProblem[];
}

export interface SessionProblem {
  /** 1-based, as editors number lines. */
  readonly line: number;
  readonly message: string;
}

export type SessionReadError =
  | { readonly code: "empty" }
  | {
      readonly code: "no-steps";
      readonly problems: readonly SessionProblem[];
    };

/**
 * Reads a Claude Code session transcript into a map of its prompts, the
 * work done for each, and compactions. Tool results are shown with the
 * call they answer instead of as nodes of their own. Reading is
 * read-only and lossy by design: it is a view of the transcript, never a
 * conversation of the app, and what it leaves out is counted in
 * `notShown` and `problems`.
 */
export function readClaudeCodeSession(
  text: string,
): Result<ClaudeCodeSession, SessionReadError> {
  const lines = text.split("\n");
  if (lines.every((line) => line.trim() === "")) return err({ code: "empty" });

  const reader = new SessionReader();
  for (const [index, line] of lines.entries()) {
    if (line.trim() !== "") reader.read(line, index + 1);
  }
  return reader.finish();
}

interface MutableActivity {
  kind: "activity";
  id: string;
  parentId: string | null;
  model: string | null;
  items: ActivityItem[];
  timestamp: string | null;
}

/** Where a line of the transcript ended up on the map. */
interface Placement {
  /** The step showing the line, or the nearest step above a hidden line. */
  readonly step: string | null;
  /** The line itself when it is shown, or the nearest shown line above. */
  readonly shown: string | null;
}

class SessionReader {
  private readonly steps: (SessionStep | MutableActivity)[] = [];
  private readonly placements = new Map<string, Placement>();
  private readonly activities = new Map<string, MutableActivity>();
  /** Shown lines that another shown line already follows. */
  private readonly followed = new Set<string>();
  /** The model response each shown answer line is part of. */
  private readonly responses = new Map<string, string>();
  private readonly toolCalls = new Map<
    string,
    { activity: MutableActivity; index: number }
  >();
  private readonly notShown = new Map<string, number>();
  private readonly problems: SessionProblem[] = [];
  private title: string | null = null;

  read(line: string, number: number): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.problems.push({
        line: number,
        message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const kind = z.object({ type: z.string() }).safeParse(value);
    if (!kind.success) {
      this.problems.push({ line: number, message: "The line has no type." });
      return;
    }
    // Steps are identified by their first line, so a repeated line would
    // give two steps the same ID.
    const identified = z.object({ uuid: z.string() }).safeParse(value);
    if (identified.success && this.placements.has(identified.data.uuid)) {
      this.problems.push({
        line: number,
        message: `Repeats the line with uuid ${identified.data.uuid}.`,
      });
      return;
    }
    switch (kind.data.type) {
      case "user":
        this.parse(userLine, value, number, (entry) => {
          this.readUser(entry);
        });
        return;
      case "assistant":
        this.parse(assistantLine, value, number, (entry) => {
          this.readAssistant(entry);
        });
        return;
      case "system":
        this.parse(systemLine, value, number, (entry) => {
          this.readSystem(entry);
        });
        return;
      case "ai-title":
        this.parse(titleLine, value, number, (entry) => {
          this.title = entry.aiTitle;
        });
        return;
      default:
        this.parse(otherLine, value, number, (entry) => {
          this.hide(entry.type, entry.uuid, entry.parentUuid ?? null);
        });
    }
  }

  finish(): Result<ClaudeCodeSession, SessionReadError> {
    if (this.steps.length === 0)
      return err({ code: "no-steps", problems: this.problems });
    return ok({
      title: this.title,
      steps: this.steps,
      notShown: this.notShown,
      problems: this.problems,
    });
  }

  private parse<T>(
    schema: z.ZodType<T>,
    value: unknown,
    number: number,
    use: (entry: T) => void,
  ): void {
    const parsed = schema.safeParse(value);
    if (parsed.success) use(parsed.data);
    else
      this.problems.push({
        line: number,
        message: z.prettifyError(parsed.error),
      });
  }

  private readUser(entry: z.infer<typeof userLine>): void {
    const content = entry.message.content;
    if (entry.isCompactSummary === true) {
      this.readCompactSummary(entry, content);
      return;
    }
    if (typeof content !== "string") {
      const results = content.flatMap((block) => {
        const result = toolResultBlock.safeParse(block);
        return result.success ? [result.data] : [];
      });
      if (results.length > 0) {
        // A result is shown with its call, so only one without a call in
        // the transcript is missing from the map.
        const answered = results.map((result) => this.answer(result));
        if (answered.every(Boolean)) this.place(entry.uuid, entry.parentUuid);
        else this.hide("tool result", entry.uuid, entry.parentUuid);
        return;
      }
    }
    if (entry.isMeta === true) {
      this.hide("user", entry.uuid, entry.parentUuid);
      return;
    }
    const above = this.shownAbove(entry.parentUuid);
    this.add(entry.uuid, above, {
      kind: "prompt",
      id: entry.uuid,
      parentId: this.stepOf(above),
      text: typeof content === "string" ? content : textOf(content),
      timestamp: entry.timestamp ?? null,
    });
  }

  private readCompactSummary(
    entry: z.infer<typeof userLine>,
    content: z.infer<typeof userLine>["message"]["content"],
  ): void {
    const id = this.stepOf(this.shownAbove(entry.parentUuid));
    const index = this.steps.findIndex((step) => step.id === id);
    const compaction = this.steps[index];
    if (compaction?.kind !== "compaction") {
      this.hide("user", entry.uuid, entry.parentUuid);
      return;
    }
    this.steps[index] = {
      ...compaction,
      summary: typeof content === "string" ? content : textOf(content),
    };
    this.placements.set(entry.uuid, {
      step: compaction.id,
      shown: this.shownAbove(entry.parentUuid),
    });
  }

  private readAssistant(entry: z.infer<typeof assistantLine>): void {
    const items: ActivityItem[] = [];
    const calls: { id: string; index: number }[] = [];
    for (const block of entry.message.content) {
      const text = textBlock.safeParse(block);
      const call = toolUseBlock.safeParse(block);
      if (text.success && text.data.text.trim() !== "") {
        items.push({ kind: "text", text: text.data.text });
      } else if (call.success) {
        calls.push({ id: call.data.id, index: items.length });
        items.push({
          kind: "tool",
          name: call.data.name,
          input: JSON.stringify(call.data.input, null, 2),
          result: null,
        });
      }
    }
    // Thinking is not kept: the transcript holds only its signature.
    if (items.length === 0) {
      this.hide("assistant", entry.uuid, entry.parentUuid);
      return;
    }

    const above = this.shownAbove(entry.parentUuid);
    const previous =
      above === null
        ? undefined
        : this.activities.get(this.stepOf(above) ?? "");
    const response = entry.message.id;
    if (response !== undefined) this.responses.set(entry.uuid, response);
    // Claude Code writes each block of a response as its own line, and the
    // session continues from any of them, so lines of one response are
    // parts of it rather than ways the session went on.
    const sameResponse =
      above !== null &&
      response !== undefined &&
      this.responses.get(above) === response;
    let activity: MutableActivity;
    // An answer continues the work it follows unless the session already
    // went on from that point another way, which makes this a branch.
    if (
      previous !== undefined &&
      above !== null &&
      (sameResponse || !this.followed.has(above))
    ) {
      activity = previous;
      if (!sameResponse) this.followed.add(above);
      this.placements.set(entry.uuid, { step: previous.id, shown: entry.uuid });
    } else {
      activity = {
        kind: "activity",
        id: entry.uuid,
        parentId: this.stepOf(above),
        model: entry.message.model ?? null,
        items: [],
        timestamp: entry.timestamp ?? null,
      };
      this.add(entry.uuid, above, activity);
      this.activities.set(activity.id, activity);
    }
    const start = activity.items.length;
    activity.items.push(...items);
    for (const call of calls)
      this.toolCalls.set(call.id, { activity, index: start + call.index });
  }

  private readSystem(entry: z.infer<typeof systemLine>): void {
    if (entry.subtype !== "compact_boundary") {
      this.hide("system", entry.uuid, entry.parentUuid);
      return;
    }
    // A compaction starts a new chain whose first line has no parent; the
    // line it logically follows is kept separately.
    const above = this.shownAbove(
      entry.parentUuid ?? entry.logicalParentUuid ?? null,
    );
    this.add(entry.uuid, above, {
      kind: "compaction",
      id: entry.uuid,
      parentId: this.stepOf(above),
      summary: null,
      timestamp: entry.timestamp ?? null,
    });
  }

  /** Records a tool result with its call; false if there is no call. */
  private answer(block: z.infer<typeof toolResultBlock>): boolean {
    const call = this.toolCalls.get(block.tool_use_id);
    const item = call?.activity.items[call.index];
    if (call === undefined || item?.kind !== "tool") return false;
    call.activity.items[call.index] = {
      ...item,
      result: {
        text:
          typeof block.content === "string"
            ? block.content
            : textOf(block.content ?? []),
        isError: block.is_error === true,
      },
    };
    return true;
  }

  private add(
    lineId: string,
    above: string | null,
    step: SessionStep | MutableActivity,
  ): void {
    this.steps.push(step);
    this.placements.set(lineId, { step: step.id, shown: lineId });
    if (above !== null) this.followed.add(above);
  }

  private hide(
    type: string,
    lineId: string | undefined,
    parentUuid: string | null,
  ): void {
    this.notShown.set(type, (this.notShown.get(type) ?? 0) + 1);
    if (lineId !== undefined) this.place(lineId, parentUuid);
  }

  /** Places a line that is not a step of its own under the step above it. */
  private place(lineId: string, parentUuid: string | null): void {
    const shown = this.shownAbove(parentUuid);
    this.placements.set(lineId, { step: this.stepOf(shown), shown });
  }

  /**
   * The nearest shown line at or above a parent. A parent outside the
   * transcript, as in a session resumed from another file, gives null: the
   * line becomes a root.
   */
  private shownAbove(parentUuid: string | null): string | null {
    return parentUuid === null
      ? null
      : (this.placements.get(parentUuid)?.shown ?? null);
  }

  private stepOf(lineId: string | null): string | null {
    return lineId === null ? null : (this.placements.get(lineId)?.step ?? null);
  }
}

/** The text of content blocks, with other blocks named in brackets. */
function textOf(blocks: readonly z.infer<typeof anyBlock>[]): string {
  return blocks
    .map((block) => {
      const text = textBlock.safeParse(block);
      return text.success ? text.data.text : `[${block.type}]`;
    })
    .join("\n\n");
}
