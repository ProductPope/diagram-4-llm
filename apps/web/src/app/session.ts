import type {
  ClaudeCodeSession,
  SessionProblem,
  SessionReadError,
  SessionStep,
} from "@diagram-4-llm/core";

/** The steps of a session as a forest, children in transcript order. */
export function sessionForest(
  session: ClaudeCodeSession,
): Map<string | null, string[]> {
  const children = new Map<string | null, string[]>();
  for (const step of session.steps) {
    children.set(step.parentId, [
      ...(children.get(step.parentId) ?? []),
      step.id,
    ]);
  }
  return children;
}

/**
 * The branch through `id`: the steps from its root to `id`, then on through
 * the latest reply of each step to the end, as the conversation's reading
 * pane does. Empty for an unknown step. The reader puts every parent before
 * its children, so both walks end.
 */
export function sessionBranch(
  session: ClaudeCodeSession,
  id: string,
): SessionStep[] {
  const byId = new Map(session.steps.map((step) => [step.id, step]));
  const children = sessionForest(session);
  const branch: SessionStep[] = [];
  let step = byId.get(id);
  while (step !== undefined) {
    branch.unshift(step);
    step = step.parentId === null ? undefined : byId.get(step.parentId);
  }
  let last = branch.at(-1);
  while (last !== undefined) {
    const next = children.get(last.id)?.at(-1);
    last = next === undefined ? undefined : byId.get(next);
    if (last !== undefined) branch.push(last);
  }
  return branch;
}

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
  if (notShown.size === 0) return null;
  const parts = [...notShown]
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${type} ${count.toLocaleString("en")}`);
  return `Lines not on the map, by type: ${parts.join(", ")}.`;
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

function shorten(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}
