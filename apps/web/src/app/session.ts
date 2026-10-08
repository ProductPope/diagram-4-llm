import type {
  ClaudeAiExportError,
  SessionProblem,
  SessionReadError,
  SessionStep,
} from "@diagram-4-llm/core";

/** A step's text on one line, for the map. */
export function stepLabel(step: SessionStep): string {
  switch (step.kind) {
    case "prompt":
      return shorten(step.text);
    case "compaction":
      return shorten(step.summary ?? "Earlier work was summarised");
    case "activity": {
      const calls = step.items.filter((item) => item.kind === "tool").length;
      const text = step.items.findLast((item) => item.kind === "text");
      if (text !== undefined) return shorten(text.text);
      return `${calls} tool ${calls === 1 ? "call" : "calls"}`;
    }
  }
}

/** Who a step is from, for the line above its label. */
export function stepRole(step: SessionStep): string {
  switch (step.kind) {
    case "prompt":
      return "Prompt";
    case "compaction":
      return "Compaction";
    case "activity": {
      const calls = step.items.filter((item) => item.kind === "tool").length;
      const model = step.model ?? "Claude";
      return calls === 0
        ? model
        : `${model} · ${calls} tool ${calls === 1 ? "call" : "calls"}`;
    }
  }
}

/** What the map leaves out, largest first, for a notice under it. */
export function describeNotShown(
  notShown: ReadonlyMap<string, number>,
): string | null {
  const counts = largestFirst(notShown);
  return counts === null ? null : `Lines not on the map, by type: ${counts}.`;
}

/** How many lines could not be read, and why the first could not. */
export function describeProblems(
  problems: readonly SessionProblem[],
): string | null {
  const first = problems[0];
  if (first === undefined) return null;
  const count =
    problems.length === 1
      ? "1 line could not be read and is"
      : `${problems.length.toLocaleString("en")} lines could not be read and are`;
  return `${count} not on the map. The first, line ${first.line}: ${first.message}`;
}

/** Entries of Claude Code's folder that could not be listed. */
export function describeListProblems(
  problems: readonly string[],
): string | null {
  const first = problems[0];
  if (first === undefined) return null;
  const count =
    problems.length === 1
      ? "1 entry of Claude Code's folder could not be read"
      : `${problems.length.toLocaleString("en")} entries of Claude Code's folder could not be read`;
  return `${count}; the sessions in it may be missing from the list. The first: ${first}`;
}

/** A file's size, rounded to the unit people read it in. */
export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString("en")} bytes`;
  if (bytes < 1024 * 1024)
    return `${Math.round(bytes / 1024).toLocaleString("en")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function describeSessionError(error: SessionReadError): string {
  switch (error.code) {
    case "empty":
      return "The file is empty.";
    case "no-steps": {
      const first = error.problems[0];
      return first === undefined
        ? "The file has no prompts or answers. Is it a Claude Code session transcript?"
        : `The file is not a Claude Code session transcript: line ${first.line}: ${first.message}`;
    }
  }
}

/** What a Claude.ai conversation's map leaves out, largest first. */
export function describeHiddenContent(
  notShown: ReadonlyMap<string, number>,
): string | null {
  const counts = largestFirst(notShown);
  return counts === null ? null : `Content not on the map, by kind: ${counts}.`;
}

/** How many parts of an export could not be read, and the first. */
export function describeExportProblems(
  problems: readonly string[],
): string | null {
  const first = problems[0];
  if (first === undefined) return null;
  const count =
    problems.length === 1
      ? "1 part of the export could not be read and is"
      : `${problems.length.toLocaleString("en")} parts of the export could not be read and are`;
  return `${count} not shown. The first: ${first}`;
}

export function describeExportError(error: ClaudeAiExportError): string {
  switch (error.code) {
    case "not-an-export":
      return "The file is not the conversations.json of a Claude.ai data export.";
    case "empty":
      return "The export has no conversations.";
    case "no-conversations":
      return `No conversation in the export could be read. The first problem: ${error.problems[0] ?? "unknown"}`;
  }
}

function largestFirst(counts: ReadonlyMap<string, number>): string | null {
  if (counts.size === 0) return null;
  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .map(([kind, count]) => `${kind} ${count.toLocaleString("en")}`)
    .join(", ");
}

function shorten(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}
