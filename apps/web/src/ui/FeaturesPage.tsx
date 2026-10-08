import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import { ArrowLeft, Pause, Play } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Brand } from "./Brand";

interface Props {
  readonly onBack: () => void;
}

/**
 * When a part of an illustration appears in its animation. Parts without a
 * step are always shown; with the animation paused or reduced motion
 * requested, every part is shown at once and the picture is static.
 */
type Step = 1 | 2 | 3 | 4;

const NODE_WIDTH = 44;
const NODE_HEIGHT = 18;

function stepClass(step: Step | undefined): string | undefined {
  return step === undefined
    ? undefined
    : `feature-step feature-step-${String(step)}`;
}

type NodeKind = "user" | "answer" | "suggested" | "attached" | "branch";

const NODE_CLASS: Record<NodeKind, string> = {
  user: "feature-node feature-node-user",
  answer: "feature-node",
  suggested: "feature-node feature-node-suggested",
  attached: "feature-node feature-node-attached",
  branch: "feature-node feature-node-branch",
};

/** A turn on the map, centred on (x, y). */
function Turn({
  x,
  y,
  kind,
  step,
}: {
  readonly x: number;
  readonly y: number;
  readonly kind: NodeKind;
  readonly step?: Step;
}) {
  return (
    <rect
      className={cn(NODE_CLASS[kind], stepClass(step))}
      x={x - NODE_WIDTH / 2}
      y={y - NODE_HEIGHT / 2}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      rx={4}
    />
  );
}

type EdgeKind = "parent" | "reference" | "branch";

const EDGE_CLASS: Record<EdgeKind, string> = {
  parent: "feature-edge",
  reference: "feature-edge feature-edge-reference",
  branch: "feature-edge feature-edge-branch",
};

/** A line between two points, drawn as an edge of the map. */
function Edge({
  from,
  to,
  kind = "parent",
  step,
}: {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly kind?: EdgeKind | undefined;
  readonly step?: Step | undefined;
}) {
  return (
    <line
      className={cn(EDGE_CLASS[kind], stepClass(step))}
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
    />
  );
}

/** An edge from the bottom of the turn at `parent` to the top of `child`. */
function ChildEdge({
  parent,
  child,
  kind,
  step,
}: {
  readonly parent: readonly [number, number];
  readonly child: readonly [number, number];
  readonly kind?: EdgeKind;
  readonly step?: Step;
}) {
  return (
    <Edge
      from={[parent[0], parent[1] + NODE_HEIGHT / 2]}
      to={[child[0], child[1] - NODE_HEIGHT / 2]}
      kind={kind}
      step={step}
    />
  );
}

/** Lines of text in a card, as grey bars. */
function TextLines({
  x,
  y,
  widths,
  step,
}: {
  readonly x: number;
  readonly y: number;
  readonly widths: readonly number[];
  readonly step?: Step;
}) {
  return (
    <g className={stepClass(step)}>
      {widths.map((width, index) => (
        <rect
          key={index}
          className="feature-text-line"
          x={x}
          y={y + index * 8}
          width={width}
          height={3}
          rx={1.5}
        />
      ))}
    </g>
  );
}

function Art({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      className="feature-art"
      viewBox="0 0 240 150"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function BranchingArt() {
  return (
    <Art>
      <Turn x={120} y={20} kind="user" />
      <ChildEdge parent={[120, 20]} child={[120, 55]} />
      <Turn x={120} y={55} kind="answer" />
      <ChildEdge parent={[120, 55]} child={[65, 90]} step={1} />
      <Turn x={65} y={90} kind="user" step={1} />
      <ChildEdge parent={[65, 90]} child={[65, 125]} step={1} />
      <Turn x={65} y={125} kind="answer" step={1} />
      <ChildEdge parent={[120, 55]} child={[175, 90]} step={2} />
      <Turn x={175} y={90} kind="user" step={2} />
      <ChildEdge parent={[175, 90]} child={[175, 125]} step={2} />
      <Turn x={175} y={125} kind="answer" step={2} />
      <g className={stepClass(3)}>
        <ChildEdge parent={[120, 20]} child={[120, 55]} kind="branch" />
        <ChildEdge parent={[120, 55]} child={[175, 90]} kind="branch" />
        <ChildEdge parent={[175, 90]} child={[175, 125]} kind="branch" />
        <Turn x={120} y={20} kind="branch" />
        <Turn x={120} y={55} kind="branch" />
        <Turn x={175} y={90} kind="branch" />
        <Turn x={175} y={125} kind="branch" />
      </g>
    </Art>
  );
}

function ReferencesArt() {
  return (
    <Art>
      <Turn x={120} y={20} kind="user" />
      <ChildEdge parent={[120, 20]} child={[120, 55]} />
      <Turn x={120} y={55} kind="answer" />
      <ChildEdge parent={[120, 55]} child={[65, 90]} />
      <Turn x={65} y={90} kind="user" />
      <ChildEdge parent={[65, 90]} child={[65, 125]} />
      <Turn x={65} y={125} kind="answer" />
      <ChildEdge parent={[120, 55]} child={[175, 90]} />
      <Turn x={175} y={90} kind="answer" />
      <Turn x={65} y={125} kind="attached" step={1} />
      <ChildEdge parent={[175, 90]} child={[175, 125]} step={2} />
      <Turn x={175} y={125} kind="user" step={2} />
      <Edge
        from={[65 + NODE_WIDTH / 2, 125]}
        to={[175 - NODE_WIDTH / 2, 125]}
        kind="reference"
        step={3}
      />
    </Art>
  );
}

function SummariesArt() {
  const branch = [20, 55, 90, 125] as const;
  return (
    <Art>
      <Edge from={[60, 20]} to={[60, 125]} />
      {branch.map((y, index) => (
        <Turn key={y} x={60} y={y} kind={index % 2 === 0 ? "user" : "answer"} />
      ))}
      <path
        className={cn("feature-edge", stepClass(1))}
        d="M 92 11 h 6 v 123 h -6 M 98 72 h 14"
      />
      <g className={stepClass(2)}>
        <rect
          className="feature-node feature-node-summary"
          x={118}
          y={42}
          width={100}
          height={60}
          rx={6}
        />
        <TextLines x={128} y={54} widths={[60, 80, 70, 40]} />
      </g>
      <rect
        className={cn("feature-text-line-edited", stepClass(3))}
        x={128}
        y={70}
        width={70}
        height={3}
        rx={1.5}
      />
    </Art>
  );
}

function MergeArt() {
  return (
    <Art>
      <Turn x={50} y={20} kind="user" />
      <ChildEdge parent={[50, 20]} child={[50, 55]} />
      <Turn x={50} y={55} kind="answer" />
      <Turn x={190} y={20} kind="user" />
      <ChildEdge parent={[190, 20]} child={[190, 55]} />
      <Turn x={190} y={55} kind="answer" />
      <g className={stepClass(1)}>
        <Edge from={[50, 64]} to={[50, 81]} />
        <rect
          className="feature-node feature-node-summary"
          x={22}
          y={81}
          width={56}
          height={22}
          rx={4}
        />
        <TextLines x={30} y={88} widths={[40, 30]} />
      </g>
      <g className={stepClass(2)}>
        <Edge from={[190, 64]} to={[190, 81]} />
        <rect
          className="feature-node feature-node-summary"
          x={162}
          y={81}
          width={56}
          height={22}
          rx={4}
        />
        <TextLines x={170} y={88} widths={[40, 30]} />
      </g>
      <Turn x={120} y={130} kind="user" step={3} />
      <g className={stepClass(4)}>
        <Edge from={[78, 103]} to={[105, 121]} kind="reference" />
        <Edge from={[162, 103]} to={[135, 121]} kind="reference" />
      </g>
    </Art>
  );
}

function BudgetArt() {
  // The context window spans x 20 to 200; 80% of it ends at 164.
  return (
    <Art>
      <text x={20} y={34}>
        context window
      </text>
      <rect
        className="feature-meter"
        x={20}
        y={42}
        width={180}
        height={24}
        rx={4}
      />
      <rect
        className="feature-meter-part"
        x={22}
        y={44}
        width={50}
        height={20}
        rx={2}
      />
      <rect
        className={cn("feature-meter-part", stepClass(1))}
        x={74}
        y={44}
        width={50}
        height={20}
        rx={2}
      />
      <rect
        className={cn("feature-meter-part feature-meter-warning", stepClass(2))}
        x={126}
        y={44}
        width={50}
        height={20}
        rx={2}
      />
      <rect
        className={cn("feature-meter-part feature-meter-over", stepClass(3))}
        x={178}
        y={44}
        width={44}
        height={20}
        rx={2}
      />
      <line className="feature-edge" x1={164} y1={38} x2={164} y2={70} />
      <text x={164} y={80} textAnchor="middle">
        80%
      </text>
      <g className={stepClass(4)}>
        <rect
          className="feature-node feature-node-summary"
          x={20}
          y={98}
          width={200}
          height={32}
          rx={6}
        />
        <text x={30} y={118}>
          Continue from a summary
        </text>
      </g>
    </Art>
  );
}

function SuggestionsArt() {
  const options = [55, 120, 185] as const;
  return (
    <Art>
      <Turn x={120} y={20} kind="user" />
      <ChildEdge parent={[120, 20]} child={[120, 55]} />
      <Turn x={120} y={55} kind="answer" />
      <g className={stepClass(1)}>
        {options.map((x) => (
          <g key={x}>
            <ChildEdge parent={[120, 55]} child={[x, 95]} kind="reference" />
            <Turn x={x} y={95} kind="suggested" />
          </g>
        ))}
      </g>
      <g className={stepClass(2)}>
        <ChildEdge parent={[120, 55]} child={[120, 95]} />
        <Turn x={120} y={95} kind="user" />
      </g>
      <ChildEdge parent={[120, 95]} child={[120, 130]} step={3} />
      <Turn x={120} y={130} kind="answer" step={3} />
    </Art>
  );
}

function SessionMapArt() {
  return (
    <Art>
      <rect
        className="feature-node feature-node-summary"
        x={16}
        y={22}
        width={60}
        height={106}
        rx={6}
      />
      <text x={24} y={38}>
        .jsonl
      </text>
      <TextLines x={24} y={48} widths={[44, 36, 40, 30, 44, 34, 38, 26, 40]} />
      <path
        className={cn("feature-edge", stepClass(1))}
        d="M 84 75 h 26 m -6 -5 l 6 5 l -6 5"
      />
      <g className={stepClass(2)}>
        <Turn x={175} y={20} kind="user" />
        <ChildEdge parent={[175, 20]} child={[175, 55]} />
        <rect
          className="feature-tool"
          x={128}
          y={49}
          width={22}
          height={12}
          rx={3}
        />
        <rect
          className="feature-tool"
          x={200}
          y={49}
          width={22}
          height={12}
          rx={3}
        />
        <Turn x={175} y={55} kind="answer" />
      </g>
      <g className={stepClass(3)}>
        <ChildEdge parent={[175, 55]} child={[145, 95]} />
        <Turn x={145} y={95} kind="user" />
        <ChildEdge parent={[175, 55]} child={[205, 95]} />
        <Turn x={205} y={95} kind="user" />
        <ChildEdge parent={[205, 95]} child={[205, 130]} />
        <Turn x={205} y={130} kind="answer" />
      </g>
    </Art>
  );
}

function McpArt() {
  return (
    <Art>
      <rect
        className="feature-node"
        x={8}
        y={30}
        width={62}
        height={30}
        rx={6}
      />
      <text x={39} y={48} textAnchor="middle">
        exports
      </text>
      <rect
        className="feature-node"
        x={8}
        y={90}
        width={62}
        height={30}
        rx={6}
      />
      <text x={39} y={108} textAnchor="middle">
        sessions
      </text>
      <rect
        className="feature-node feature-node-summary"
        x={92}
        y={58}
        width={56}
        height={34}
        rx={6}
      />
      <text x={120} y={78} textAnchor="middle">
        MCP
      </text>
      <g className={stepClass(1)}>
        <Edge from={[70, 45]} to={[92, 68]} />
        <Edge from={[70, 105]} to={[92, 82]} />
      </g>
      <Edge from={[148, 75]} to={[166, 75]} step={2} />
      <g className={stepClass(2)}>
        <rect
          className="feature-node"
          x={166}
          y={20}
          width={66}
          height={110}
          rx={6}
        />
        <text x={199} y={36} textAnchor="middle">
          Claude Code
        </text>
      </g>
      <g className={stepClass(3)}>
        <rect
          className="feature-tool"
          x={190}
          y={48}
          width={18}
          height={10}
          rx={2}
        />
        <Edge from={[199, 58]} to={[185, 76]} />
        <Edge from={[199, 58]} to={[213, 76]} />
        <rect
          className="feature-tool"
          x={176}
          y={76}
          width={18}
          height={10}
          rx={2}
        />
        <rect
          className="feature-tool"
          x={204}
          y={76}
          width={18}
          height={10}
          rx={2}
        />
        <Edge from={[213, 86]} to={[213, 102]} />
        <rect
          className="feature-tool"
          x={204}
          y={102}
          width={18}
          height={10}
          rx={2}
        />
      </g>
    </Art>
  );
}

interface Feature {
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly Art: () => ReactNode;
}

const FEATURES: readonly Feature[] = [
  {
    title: "Branches on a map",
    summary:
      "A conversation is a tree. Each branch sends the model only its own path from the first message, so a tangent never leaks into another answer.",
    steps: [
      "Edit a message or regenerate an answer: the new version becomes a sibling and nothing is overwritten.",
      "On the map, right-click a turn and choose “Branch from here”, or press E on one of your messages to write a new version of it.",
      "Choose any turn to read its branch in the conversation; the map highlights it.",
    ],
    Art: BranchingArt,
  },
  {
    title: "Attachments from other branches",
    summary:
      "A message can carry turns from other branches as extra context, without bringing along the rest of their branch.",
    steps: [
      "On the map, right-click a finished turn on another branch and choose “Attach to your message”, or move to it and press A.",
      "The attachment is shown above the composer and can be removed before sending.",
      "The sent message keeps its attachments, and the context inspector shows exactly how they are sent.",
    ],
    Art: ReferencesArt,
  },
  {
    title: "Summaries",
    summary:
      "A summary condenses a branch up to an answer. It is a visible, editable card, never applied on its own.",
    steps: [
      "Choose “Summarise” under an answer. The model chosen for the next answer writes the summary.",
      "Edit the summary if something is missing; each edit is kept as a revision.",
      "Attach the summary to a message on another branch, like any other turn.",
    ],
    Art: SummariesArt,
  },
  {
    title: "Merging branches",
    summary:
      "Two lines of thought come together through their summaries, so the new message sees the conclusions and not every turn.",
    steps: [
      "On the map, right-click an answer and choose “Attach a summary of this branch”. It reuses the branch's summary or writes one.",
      "Do the same on the other branch. Attachments stay while you move between branches.",
      "Choose “New first message” to start a message that sees only what is attached to it.",
    ],
    Art: MergeArt,
  },
  {
    title: "Token budget",
    summary:
      "The app estimates the size of the context before sending and compares it with the model's context window. It never cuts anything on its own.",
    steps: [
      "In Settings, enter the context window of each model.",
      "From 80% of the window, a warning appears above the composer.",
      "Above the window, sending is blocked, with ways to shrink the context: continue from a summary, or remove a large attachment.",
    ],
    Art: BudgetArt,
  },
  {
    title: "Suggested branches",
    summary:
      "Under an answer, a model proposes three follow-up questions. Nothing is sent until you choose.",
    steps: [
      "In Settings, enter a model for suggested branches. It is off until you do.",
      "Choose “Suggest follow-ups” under an answer.",
      "Choose one to put it in the composer, or select several and confirm their combined estimate to send each as its own branch.",
    ],
    Art: SuggestionsArt,
  },
  {
    title: "Map of a Claude Code session",
    summary:
      "Claude Code keeps every session as a transcript. Opened here, it becomes a read-only map of prompts, answers, tool calls and compactions.",
    steps: [
      "In the sidebar, choose “Map a Claude Code session”.",
      "Open a transcript from ~/.claude/projects/<project>/<session>.jsonl.",
      "Choose a step on the map to read its branch. The file is read in this tab only and nothing is saved.",
      "With a model for node titles in Settings, “Detect topics” sends the start of each prompt on the branch to it and shows the topics as headings.",
    ],
    Art: SessionMapArt,
  },
  {
    title: "Local MCP server and session pane",
    summary:
      "A server on your computer lets Claude Code and Claude Desktop read exported conversations and Claude Code sessions. It only reads files.",
    steps: [
      "Export conversations into a folder, and add the server from packages/mcp to Claude Code or Claude Desktop.",
      "Agents can list conversations, read a branch as the model saw it, and read summaries and sessions.",
      "In Claude Code, the /session-map command of the plugin opens a pane with the current session's map.",
    ],
    Art: McpArt,
  },
];

/**
 * What each feature does and how to use it, each with an illustration that
 * builds up step by step. The animations loop, so they can be paused
 * (WCAG 2.2.2), and they do not run when reduced motion is requested.
 */
export function FeaturesPage({ onBack }: Props) {
  const [paused, setPaused] = useState(false);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-2">
        <h1>
          <Brand />
        </h1>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to conversations
        </Button>
      </header>
      <main
        className={cn(
          "flex flex-1 flex-col gap-6 overflow-y-auto p-6",
          paused && "features-paused",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Features</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              What each feature does and how to use it. The pictures show the
              idea, not your conversations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="motion-reduce:hidden"
            onClick={() => {
              setPaused((previous) => !previous);
            }}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            {paused ? "Play animations" : "Pause animations"}
          </Button>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {FEATURES.map(({ title, summary, steps, Art: Illustration }) => (
            <li key={title}>
              <article className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
                <div className="rounded-lg border bg-background p-2">
                  <Illustration />
                </div>
                <h3 className="font-heading text-base font-semibold">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground">{summary}</p>
                <ol className="list-decimal pl-5 text-sm">
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
