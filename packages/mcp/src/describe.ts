import {
  assembleForUserTurn,
  currentSummaries,
  describeGraphError,
  err,
  ok,
  sessionBranch,
  sessionForest,
  type ClaudeCodeSession,
  type ConversationGraph,
  type NodeId,
  type ProviderMessage,
  type Result,
  type SessionStep,
  type TurnNode,
} from "@diagram-4-llm/core";

import type {
  FileProblem,
  LoadedConversation,
  SessionFile,
} from "./sources.js";

// Tool results are text for a model to read. Each one starts with what it
// is, lists IDs that other tools take, and says what was left out.

export function describeConversations(
  conversations: readonly LoadedConversation[],
  problems: readonly FileProblem[],
): string {
  const lines = conversations.map(({ file, graph }) => {
    const turns = [...graph.nodes.values()].filter((n) => n.kind !== "summary");
    return `- ${graph.conversation.title} (id ${graph.conversation.id}, file ${file}): ${count(turns.length, "turn")}, ${count(tipsOf(graph).length, "branch", "branches")}`;
  });
  return [
    conversations.length === 0
      ? "No exported conversations."
      : `${count(conversations.length, "conversation")}:`,
    ...lines,
    ...describeProblems(problems),
  ].join("\n");
}

/**
 * The conversation's tree, one turn per line, with the current summaries
 * after the turn they end at.
 */
export function describeConversationMap(graph: ConversationGraph): string {
  const summaries = currentSummaries(graph);
  const children = new Map<string | null, string[]>();
  for (const node of graph.nodes.values())
    if (node.kind !== "summary")
      children.set(node.parentId, [
        ...(children.get(node.parentId) ?? []),
        node.id,
      ]);
  return [
    `${graph.conversation.title} (id ${graph.conversation.id})`,
    "Each line is a turn: its ID, who wrote it and how it starts. Pass a turn ID to read_branch to read the branch up to it.",
    ...outline(children, (id) => {
      const turn = graph.nodes.get(id);
      if (turn === undefined || turn.kind === "summary") return null;
      return {
        line: `${roleOf(turn)}: ${firstLine(turn.content)}`,
        details: (summaries.get(id) ?? []).map(
          (summary) =>
            `summary ${summary.id} of ${summary.covers.fromId}..${summary.covers.toId}: ${firstLine(summary.content)}`,
        ),
      };
    }),
  ].join("\n");
}

/**
 * The branch up to a turn as the model saw it: the messages assembled for
 * the user turn, with attached turns and summaries in place, followed by
 * the answer when the turn is one.
 */
export function describeBranch(
  graph: ConversationGraph,
  turnId: NodeId,
): Result<string, string> {
  const turn = graph.nodes.get(turnId);
  if (turn === undefined || turn.kind === "summary")
    return err(`No turn with ID ${turnId} in this conversation.`);
  const userTurnId = turn.kind === "user" ? turn.id : turn.parentId;
  const assembled = assembleForUserTurn(graph, userTurnId, {
    systemPrompt: null,
  });
  if (!assembled.ok) return err(describeGraphError(assembled.error));
  const messages: ProviderMessage[] = [...assembled.value.messages];
  if (turn.kind === "assistant")
    messages.push({ role: "assistant", content: turn.content });
  return ok(
    [
      `The branch of ${graph.conversation.title} up to ${turnId}, ${count(messages.length, "message")}:`,
      ...messages.map((m) => `## ${m.role}\n\n${m.content}`),
    ].join("\n\n"),
  );
}

export function describeSessionFiles(
  sessions: readonly SessionFile[],
  problems: readonly FileProblem[],
  limit: number,
): string {
  const shown = sessions.slice(0, limit);
  return [
    sessions.length === 0
      ? "No Claude Code sessions."
      : `${count(sessions.length, "session")}, most recently changed first${sessions.length > limit ? `; the first ${String(limit)}` : ""}:`,
    ...shown.map(
      (s) =>
        `- ${s.path} (changed ${s.modified.toISOString()}, ${Math.ceil(s.bytes / 1024).toLocaleString("en")} KB)`,
    ),
    ...describeProblems(problems),
  ].join("\n");
}

/** The session's map, one step per line. */
export function describeSessionMap(
  path: string,
  session: ClaudeCodeSession,
): string {
  const byId = new Map(session.steps.map((step) => [step.id, step]));
  return [
    `${session.title ?? path} (${path})`,
    "Each line is a step: its ID, its kind and how it starts. Pass a step ID to read_claude_code_session to read the branch through it in full.",
    ...outline(sessionForest(session), (id) => {
      const step = byId.get(id);
      return step === undefined ? null : { line: outlineOf(step), details: [] };
    }),
    ...describeLeftOut(session),
  ].join("\n");
}

/** The branch through a step, with every answer, tool call and result. */
export function describeSessionBranch(
  path: string,
  session: ClaudeCodeSession,
  stepId: string,
): Result<string, string> {
  const branch = sessionBranch(session, stepId);
  if (branch.length === 0) return err(`No step with ID ${stepId} in ${path}.`);
  const parts = branch.map((step) => {
    switch (step.kind) {
      case "prompt":
        return `## prompt ${step.id}\n\n${step.text}`;
      case "compaction":
        return `## compaction ${step.id}\n\n${step.summary ?? "(no summary in the transcript)"}`;
      case "activity":
        return [
          `## ${step.model ?? "assistant"} ${step.id}`,
          ...step.items.map((item) =>
            item.kind === "text"
              ? item.text
              : `### tool ${item.name}\n\nInput:\n${item.input}\n\n${
                  item.result === null
                    ? "No result in the transcript."
                    : `${item.result.isError ? "Failed" : "Result"}:\n${item.result.text}`
                }`,
          ),
        ].join("\n\n");
    }
  });
  return ok(
    [
      `The branch of ${session.title ?? path} through ${stepId}:`,
      ...parts,
      ...describeLeftOut(session),
    ].join("\n\n"),
  );
}

function outlineOf(step: SessionStep): string {
  switch (step.kind) {
    case "prompt":
      return `prompt: ${firstLine(step.text)}`;
    case "compaction":
      return `compaction: ${firstLine(step.summary ?? "")}`;
    case "activity": {
      const tools = new Map<string, number>();
      for (const item of step.items)
        if (item.kind === "tool")
          tools.set(item.name, (tools.get(item.name) ?? 0) + 1);
      const used = [...tools]
        .map(([name, n]) => (n === 1 ? name : `${name} ×${String(n)}`))
        .join(", ");
      const text = step.items.findLast((item) => item.kind === "text");
      return `answer${used === "" ? "" : ` (tools: ${used})`}: ${text === undefined ? "" : firstLine(text.text)}`;
    }
  }
}

/**
 * A forest as an outline, one node per line. A line continues the one above
 * it. Where a node has more than one child, each child starts an indented
 * branch and names the node it follows, so long chains stay flat and the
 * outline stays unambiguous. An explicit stack keeps long chains from
 * overflowing the call stack.
 */
function outline(
  children: ReadonlyMap<string | null, readonly string[]>,
  describe: (
    id: string,
  ) => { readonly line: string; readonly details: readonly string[] } | null,
): string[] {
  const lines: string[] = [];
  const stack = (children.get(null) ?? [])
    .map((id) => ({ id, depth: 0, parent: null as string | null }))
    .reverse();
  let previous: string | null = null;
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const described = describe(frame.id);
    if (described === null) continue;
    const indent = "  ".repeat(frame.depth);
    const marker =
      frame.parent === previous
        ? ""
        : frame.parent === null
          ? " (new start)"
          : ` (after ${frame.parent})`;
    lines.push(`${indent}- ${frame.id}${marker} ${described.line}`);
    for (const detail of described.details)
      lines.push(`${indent}  * ${detail}`);
    previous = frame.id;
    const kids = children.get(frame.id) ?? [];
    const depth = kids.length > 1 ? frame.depth + 1 : frame.depth;
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = kids[i];
      if (kid !== undefined) stack.push({ id: kid, depth, parent: frame.id });
    }
  }
  return lines;
}

function describeLeftOut(session: ClaudeCodeSession): string[] {
  const lines: string[] = [];
  if (session.notShown.size > 0)
    lines.push(
      `Lines not included, by type: ${[...session.notShown].map(([type, n]) => `${type} ${String(n)}`).join(", ")}.`,
    );
  for (const problem of session.problems)
    lines.push(
      `Line ${String(problem.line)} could not be read: ${problem.message}`,
    );
  return lines;
}

function describeProblems(problems: readonly FileProblem[]): string[] {
  return problems.map((p) => `Could not read ${p.file}: ${p.message}`);
}

/** Turns no other turn continues: the ends of the branches. */
function tipsOf(graph: ConversationGraph): TurnNode[] {
  const parents = new Set<NodeId | null>();
  const turns: TurnNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind === "summary") continue;
    turns.push(node);
    parents.add(node.parentId);
  }
  return turns.filter((turn) => !parents.has(turn.id));
}

function roleOf(turn: TurnNode): string {
  return turn.kind === "user" ? "user" : `assistant (${turn.generation.model})`;
}

function firstLine(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}
