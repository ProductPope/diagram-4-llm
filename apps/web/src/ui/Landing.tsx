import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import {
  ArrowRight,
  ArrowUp,
  Code,
  Eye,
  FileJson,
  GitFork,
  KeyRound,
  Layers,
  Network,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

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

interface Topic {
  readonly question: string;
  readonly answer: ReactNode;
}

/**
 * The welcome page, written as a conversation with the app. It opens with
 * one exchange; the visitor asks the next question by pressing Enter or
 * Send, or picks another one, and each answer is "typed" before it shows.
 * "Show everything" reveals the whole page at once. Everything it claims is
 * something the app does today; planned work is labelled as planned.
 */
export function Landing({ demoReady, onOpenDemo, onSetup, onOpenApp }: Props) {
  const topics = landingTopics({ demoReady, onOpenDemo, onSetup, onOpenApp });
  const [asked, setAsked] = useState<readonly number[]>([0]);
  const [typing, setTyping] = useState<number | null>(() =>
    animationsAllowed() ? 0 : null,
  );
  const latest = useRef<HTMLElement>(null);
  const remaining = topics
    .map((_, index) => index)
    .filter((index) => !asked.includes(index));
  const next = remaining[0];

  const ask = (index: number) => {
    if (typing !== null || asked.includes(index)) return;
    setAsked([...asked, index]);
    setTyping(animationsAllowed() ? index : null);
  };
  const showEverything = () => {
    setAsked([...asked, ...remaining]);
    setTyping(null);
  };

  useEffect(() => {
    if (typing === null) return;
    const timer = setTimeout(() => {
      setTyping(null);
    }, TYPING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [typing]);

  // A newly asked question scrolls into view, as a sent message does.
  useEffect(() => {
    if (asked.length > 1)
      latest.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [asked.length]);

  // Enter anywhere outside a control asks the suggested question.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        next === undefined ||
        (event.target instanceof HTMLElement &&
          event.target.closest("button, a, input, textarea, select") !== null)
      )
        return;
      event.preventDefault();
      ask(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  });

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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-4 pt-10 pb-16">
        <h1 className="sr-only">
          diagram-4-llm: branching conversations with AI models
        </h1>
        {asked.map((index, position) => {
          const topic = topics[index];
          if (topic === undefined) return null;
          return (
            <Exchange
              key={index}
              ref={position === asked.length - 1 ? latest : undefined}
              question={topic.question}
              typing={typing === index}
            >
              {topic.answer}
            </Exchange>
          );
        })}
      </main>

      {next !== undefined && (
        <section
          className="sticky bottom-0 bg-linear-to-t from-background from-70% to-transparent pt-6"
          aria-label="Ask a question"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              {remaining.slice(1).map((index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={typing !== null}
                  onClick={() => {
                    ask(index);
                  }}
                >
                  {topics[index]?.question}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={showEverything}
              >
                Show everything
              </Button>
            </div>
            <form
              className="flex items-center gap-2 rounded-xl border bg-card p-2 pl-4 shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              onSubmit={(event) => {
                event.preventDefault();
                ask(next);
              }}
            >
              <label htmlFor="landing-question" className="sr-only">
                Next question
              </label>
              <input
                id="landing-question"
                readOnly
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                value={topics[next]?.question ?? ""}
              />
              <Button type="submit" size="sm" disabled={typing !== null}>
                <ArrowUp aria-hidden="true" />
                Send
              </Button>
            </form>
          </div>
        </section>
      )}

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        Open source under the MIT licence ·{" "}
        <a className="underline underline-offset-4" href={REPOSITORY}>
          GitHub
        </a>
      </footer>
    </div>
  );
}

/** The conversation, in the order it is suggested. The first opens the page. */
function landingTopics({
  demoReady,
  onOpenDemo,
  onSetup,
  onOpenApp,
}: Props): readonly Topic[] {
  return [
    {
      question: "What is this?",
      answer: (
        <>
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
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={onOpenDemo} disabled={!demoReady}>
              <Sparkles aria-hidden="true" />
              Explore the demo
            </Button>
            <Button size="lg" variant="outline" onClick={onSetup}>
              Connect a model
            </Button>
          </div>
          <figure className="mt-2 flex flex-col items-center gap-2 rounded-xl border bg-muted/40 p-4">
            <BranchSketch />
            <figcaption className="text-xs text-muted-foreground">
              One question, one answer, two follow-ups: each branch keeps its
              own context.
            </figcaption>
          </figure>
        </>
      ),
    },
    {
      question: "Why not just keep chatting in one thread?",
      answer: (
        <>
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
        </>
      ),
    },
    {
      question: "What can I do with it today?",
      answer: (
        <>
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
        </>
      ),
    },
    {
      question: "Where does my data go?",
      answer: (
        <>
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
        </>
      ),
    },
    {
      question: "Who built it, and how?",
      answer: (
        <>
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
        </>
      ),
    },
    {
      question: "How do I start?",
      answer: (
        <>
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
        </>
      ),
    },
  ];
}

/** One question and its answer, with a typing indicator while it "writes". */
function Exchange({
  ref,
  question,
  typing,
  children,
}: {
  readonly ref?: Ref<HTMLElement> | undefined;
  readonly question: string;
  readonly typing: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      ref={ref}
      className="flex scroll-mt-20 flex-col gap-4"
      aria-label={question}
      data-phase={typing ? "typing" : "answered"}
    >
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5">
        <h2 className="text-sm font-normal sm:text-base">{question}</h2>
      </div>
      <div className="flex gap-3">
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <Network className="size-4" />
        </span>
        {typing ? (
          <p className="flex h-7 items-center gap-1" aria-label="Typing">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </p>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-4 leading-relaxed">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

function animationsAllowed(): boolean {
  return (
    typeof window.matchMedia !== "function" ||
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
