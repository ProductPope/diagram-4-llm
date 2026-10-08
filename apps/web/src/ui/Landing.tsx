import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import {
  ArrowRight,
  Code,
  Eye,
  FileJson,
  GitFork,
  KeyRound,
  Layers,
  Network,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Brand } from "./Brand";

const REPOSITORY = "https://github.com/ProductPope/diagram-4-llm";

/** How long the "assistant" appears to type before an answer shows. */
const TYPING_MS = 700;

interface Props {
  readonly demoReady: boolean;
  readonly onOpenDemo: () => void;
  readonly onSetup: () => void;
  readonly onOpenApp: () => void;
}

/**
 * The welcome page, written as a conversation with the app: each section
 * is a question and an answer, and each exchange appears as it scrolls into
 * view, the way a chat builds up. Everything it claims is something the app
 * does today; planned work is labelled as planned.
 */
export function Landing({ demoReady, onOpenDemo, onSetup, onOpenApp }: Props) {
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onOpenDemo} disabled={!demoReady}>
        <Sparkles aria-hidden="true" />
        Explore the demo
      </Button>
      <Button variant="outline" onClick={onSetup}>
        Connect a model
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/90 px-4 backdrop-blur">
        <Brand />
        <nav className="flex items-center gap-1" aria-label="Site">
          <Button variant="ghost" asChild>
            <a href={REPOSITORY} target="_blank" rel="noreferrer">
              <Code aria-hidden="true" />
              Source
            </a>
          </Button>
          <Button variant="ghost" onClick={onOpenApp}>
            Open the app
            <ArrowRight aria-hidden="true" />
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-4 pt-10 pb-40">
        <h1 className="sr-only">
          diagram-4-llm: branching conversations with AI models
        </h1>

        <Exchange question="What is this?" immediate>
          <p className="font-heading text-2xl leading-snug font-semibold tracking-tight text-balance sm:text-3xl">
            A chat client for AI models in which a conversation is a map, not a
            scroll.
          </p>
          <p>
            Fork at any message, see every branch side by side, and decide
            exactly what each branch sends to the model. It works with
            Anthropic&apos;s models and with models running on your own
            computer.
          </p>
          <BranchSketch />
          {actions}
        </Exchange>

        <Exchange question="Why not just keep chatting in one thread?">
          <p>Long conversations drift. Two things go wrong:</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              You lose track of which threads exist and what was concluded in
              each.
            </li>
            <li>
              Every new question is sent with the whole history, so unrelated
              threads leak into the answer. It is worse with local models, which
              can read less at once.
            </li>
          </ul>
          <p>
            Branches fix both. Each branch keeps its own context, and the map
            shows where everything is.
          </p>
        </Exchange>

        <Exchange question="What can I do with it today?">
          <ul className="grid gap-3 sm:grid-cols-2">
            <Feature icon={<GitFork />} title="Branch from any message">
              Right-click a message on the map and choose{" "}
              <em>Branch from here</em>. Editing or regenerating adds a new
              version; nothing is overwritten.
            </Feature>
            <Feature icon={<Eye />} title="See what the model sees">
              Before you send, check the exact messages that will go to the
              model, with a token estimate.
            </Feature>
            <Feature icon={<Network />} title="Navigate the map">
              Click a node to read its branch, collapse what you do not need,
              and move with the arrow keys.
            </Feature>
            <Feature icon={<Layers />} title="Choose the model per answer">
              Anthropic, or any OpenAI-compatible server, including Ollama and
              LM Studio on your own computer.
            </Feature>
            <Feature icon={<FileJson />} title="Keep your conversations">
              Export a conversation as a documented JSON file and import it
              anywhere the app runs.
            </Feature>
            <Feature icon={<KeyRound />} title="Bring your own key">
              No account and no subscription. You pay your provider directly, or
              nothing with a local model.
            </Feature>
          </ul>
          <p className="text-sm text-muted-foreground">
            Planned next: bringing a single message from one branch into
            another, and summaries of whole branches.
          </p>
        </Exchange>

        <Exchange question="Where does my data go?">
          <p className="font-medium">
            Only to the model provider you choose, and with a local model, not
            even there.
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              The app runs entirely in your browser. There is no account, no
              server of ours, no analytics and no third-party scripts or fonts.
            </li>
            <li>
              Conversations are stored in this browser on this device. Export
              one to keep a copy elsewhere.
            </li>
            <li>
              Your API key is stored in this browser and sent only to the
              provider you configure.
            </li>
            <li>
              A strict Content Security Policy stops the page from loading code
              from anywhere else, and model answers are displayed without
              running any HTML they contain.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            The honest caveat: a key kept in a browser can be read by any script
            running on the page. The policy above is what keeps other scripts
            out, and the code is open, so you can check it.
          </p>
        </Exchange>

        <Exchange question="Who built it, and how?">
          <p>
            It is built with substantial help from AI coding tools, under the
            direction of a human maintainer, and it is meant to be judged on
            evidence:
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              significant design decisions are written down as decision records,
            </li>
            <li>
              the conversation logic lives in a small, separately tested
              package, with property-based tests for its rules,
            </li>
            <li>
              every change goes through a pull request that automated checks
              must pass, including browser tests of the main features,
            </li>
            <li>the rules given to the AI agents are public.</li>
          </ul>
          <p>
            <a
              className="font-medium underline underline-offset-4"
              href={REPOSITORY}
              target="_blank"
              rel="noreferrer"
            >
              Read the code and the decisions on GitHub
            </a>{" "}
            (MIT licence).
          </p>
        </Exchange>

        <Exchange question="How do I start?">
          <div className="grid gap-3 sm:grid-cols-2">
            <StartCard
              title="Explore the demo"
              description="No setup. A short branched conversation you can click through."
              action={
                <Button onClick={onOpenDemo} disabled={!demoReady}>
                  <Sparkles aria-hidden="true" />
                  Open the demo
                </Button>
              }
            />
            <StartCard
              title="Connect a model"
              description="An Anthropic API key or a local model. It takes about a minute."
              action={
                <Button variant="outline" onClick={onSetup}>
                  Start setup
                </Button>
              }
            />
          </div>
          <p className="text-sm">
            Or{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-4"
              onClick={onOpenApp}
            >
              skip straight to the app
            </button>
            .
          </p>
        </Exchange>
      </main>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        Open source under the MIT licence ·{" "}
        <a className="underline underline-offset-4" href={REPOSITORY}>
          GitHub
        </a>
      </footer>
    </div>
  );
}

type Phase = "waiting" | "typing" | "answered";

/**
 * One question and its answer. The question appears when the exchange
 * scrolls into view, then a typing indicator, then the answer. Without
 * IntersectionObserver, or when the user prefers reduced motion, the
 * answer is shown at once.
 */
function Exchange({
  question,
  immediate = false,
  children,
}: {
  readonly question: string;
  readonly immediate?: boolean;
  readonly children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>(() => {
    if (!animationsAllowed()) return "answered";
    return immediate ? "typing" : "waiting";
  });

  // Waiting to be seen: starts typing once the exchange scrolls into view.
  useEffect(() => {
    const element = root.current;
    if (phase !== "waiting" || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setPhase("typing");
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [phase]);

  // Typing: the answer follows after a short pause.
  useEffect(() => {
    if (phase !== "typing") return;
    const timer = setTimeout(() => {
      setPhase("answered");
    }, TYPING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  return (
    <section
      ref={root}
      className="flex flex-col gap-4"
      aria-label={question}
      data-phase={phase}
    >
      <div
        className={cn(
          "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 transition-all duration-500",
          phase === "waiting" && "translate-y-2 opacity-0",
        )}
      >
        <h2 className="text-sm font-normal sm:text-base">{question}</h2>
      </div>
      <div className="flex gap-3">
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <Network className="size-4" />
        </span>
        {/* The answer keeps its space while hidden, so only exchanges that
            are really in view start, and the page does not jump. */}
        <div className="relative min-w-0 flex-1">
          {phase === "typing" && (
            <p
              className="absolute top-0 left-0 flex h-7 items-center gap-1"
              aria-label="Typing"
            >
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
            </p>
          )}
          <div
            className={cn(
              "flex flex-col gap-4 leading-relaxed transition-all duration-500",
              phase !== "answered" && "translate-y-2 opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function animationsAllowed(): boolean {
  return (
    typeof IntersectionObserver !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-xl border bg-card p-3 text-sm">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

function StartCard({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-auto">{action}</div>
    </div>
  );
}

/**
 * A small picture of a branched conversation: one question, one answer,
 * and two follow-ups, with the selected branch highlighted as on the map.
 */
function BranchSketch() {
  return (
    <svg
      viewBox="0 0 360 170"
      className="w-full max-w-md"
      role="img"
      aria-label="A conversation that forks into two branches after the first answer"
    >
      <g className="fill-none stroke-border" strokeWidth="1.5">
        <path d="M180 38 V60" />
        <path d="M180 92 C180 106 95 104 95 118" />
      </g>
      <path
        d="M180 92 C180 106 265 104 265 118"
        className="fill-none stroke-branch"
        strokeWidth="2"
      />
      <SketchNode x={110} y={8} label="Which database?" />
      <SketchNode x={110} y={62} label="It depends on…" branch />
      <SketchNode x={25} y={120} label="Tell me about Postgres" />
      <SketchNode x={195} y={120} label="Tell me about SQLite" branch />
    </svg>
  );
}

function SketchNode({
  x,
  y,
  label,
  branch = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly branch?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="140"
        height="30"
        rx="7"
        className={cn("fill-card", branch ? "stroke-branch" : "stroke-border")}
        strokeWidth={branch ? 2 : 1.5}
      />
      <text x={x + 10} y={y + 19.5} className="fill-foreground text-[11px]">
        {label}
      </text>
    </g>
  );
}
