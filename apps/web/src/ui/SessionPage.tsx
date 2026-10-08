import {
  err,
  estimateTokens,
  ok,
  readClaudeAiExport,
  readClaudeCodeSession,
  sessionBranch,
  type ActivityItem,
  type ClaudeAiConversation,
  type Result,
  type SessionStep,
} from "@diagram-4-llm/core";
import { Alert, AlertDescription } from "#components/ui/alert";
import { Badge } from "#components/ui/badge";
import { Button, buttonVariants } from "#components/ui/button";
import { NativeSelect, NativeSelectOption } from "#components/ui/native-select";
import { cn } from "#lib/utils";
import { ArrowLeft, CircleAlert, FileText, Shapes } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  describeExportError,
  describeExportProblems,
  describeHiddenContent,
  describeNotShown,
  describeProblems,
  describeSessionError,
} from "../app/session";
import { NARROW_SCREEN, useMediaQuery } from "../app/useMediaQuery";
import {
  detectTopics,
  topicMessage,
  type Topic,
  type TopicItem,
} from "../chat/topics";
import type { ProviderAdapter } from "../providers/types";
import { Brand } from "./Brand";
import { MarkdownContent } from "./MarkdownContent";
import { SessionMap } from "./SessionMap";

/** The model that detects topics, or null when no provider is set up. */
export interface TopicModel {
  readonly adapter: ProviderAdapter;
  readonly model: string;
  /** The model's context window, when the user entered one. */
  readonly contextWindow: number | undefined;
}

interface Props {
  readonly topicModel: TopicModel | null;
  readonly onBack: () => void;
}

type Topics =
  | { readonly status: "none" }
  | { readonly status: "detecting" }
  | { readonly status: "detected"; readonly topics: readonly Topic[] }
  | { readonly status: "failed"; readonly message: string };

/** One map: a Claude Code session, or one conversation of an export. */
interface MapView {
  readonly title: string;
  /** Parents before children. */
  readonly steps: readonly SessionStep[];
  readonly notShown: string | null;
}

interface Opened {
  /** A transcript holds one map, an export one per conversation. */
  readonly maps: readonly [MapView, ...MapView[]];
  readonly current: number;
  readonly problems: string | null;
  readonly isExport: boolean;
}

/**
 * A Claude Code session transcript, or a conversation of a Claude.ai data
 * export, as a read-only map. The file is read in the browser and kept only
 * while the page is open: both can hold secrets, and the user already keeps
 * the file.
 */
export function SessionPage({ topicModel, onBack }: Props) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topics>({ status: "none" });
  const detecting = useRef<AbortController | null>(null);
  const narrow = useMediaQuery(NARROW_SCREEN);

  useEffect(() => () => detecting.current?.abort(), []);

  const detect = async (items: readonly TopicItem[]) => {
    if (topicModel === null) return;
    const { adapter, model, contextWindow } = topicModel;
    const tokens = estimateTokens(topicMessage(items));
    if (contextWindow !== undefined && tokens > contextWindow) {
      setTopics({
        status: "failed",
        message: `The prompts on this branch come to about ${String(tokens)} tokens, more than the ${String(contextWindow)} of ${model}'s context window.`,
      });
      return;
    }
    detecting.current?.abort();
    const controller = new AbortController();
    detecting.current = controller;
    setTopics({ status: "detecting" });
    const result = await detectTopics(items, adapter, model, controller.signal);
    if (controller.signal.aborted) return;
    if (!result.ok)
      setTopics({
        status: "failed",
        message: `Topics could not be detected: ${result.error.message}`,
      });
    else if (result.value !== null)
      setTopics({ status: "detected", topics: result.value });
  };

  const open = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch (reason) {
      setError(
        `${file.name} could not be read: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
      return;
    }
    const read = file.name.toLowerCase().endsWith(".json")
      ? openExport(text)
      : openTranscript(file.name, text);
    if (!read.ok) {
      setError(`${file.name} could not be opened: ${read.error}`);
      return;
    }
    setError(null);
    show(read.value, 0);
  };

  const show = (next: Opened, current: number) => {
    detecting.current?.abort();
    setTopics({ status: "none" });
    setOpened({ ...next, current });
    setSelectedId(next.maps[current]?.steps.at(-1)?.id ?? null);
  };

  const picker = (
    <label
      className={cn(
        buttonVariants({ variant: opened === null ? "default" : "outline" }),
        "has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
      )}
    >
      <FileText aria-hidden="true" />
      {opened === null ? "Open a transcript or export" : "Open another file"}
      <input
        type="file"
        className="sr-only"
        accept=".jsonl,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) void open(file);
        }}
      />
    </label>
  );

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
      {opened === null ? (
        <main className="flex flex-1 flex-col items-start gap-4 overflow-y-auto p-6">
          <h2 className="text-lg font-semibold">
            Map of a Claude Code session or Claude.ai conversation
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Claude Code keeps each session as a transcript in{" "}
            <code>
              ~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl
            </code>
            . A Claude.ai data export holds all your conversations in{" "}
            <code>conversations.json</code>. Open either to see the prompts,
            answers and tool calls as a tree. The file is read in this tab only:
            nothing is saved or sent, and the map is gone when you leave this
            page.
          </p>
          {picker}
          {error !== null && <ErrorNotice text={error} />}
        </main>
      ) : (
        <Session
          opened={opened}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onShowMap={(index) => {
            show(opened, index);
          }}
          picker={picker}
          error={error}
          narrow={narrow}
          topicModel={topicModel}
          topics={topics}
          onDetectTopics={(items) => void detect(items)}
        />
      )}
    </div>
  );
}

function openTranscript(name: string, text: string): Result<Opened, string> {
  const read = readClaudeCodeSession(text);
  if (!read.ok) return err(describeSessionError(read.error));
  const session = read.value;
  return ok({
    maps: [
      {
        title: session.title ?? name,
        steps: session.steps,
        notShown: describeNotShown(session.notShown),
      },
    ],
    current: 0,
    problems: describeProblems(session.problems),
    isExport: false,
  });
}

function openExport(text: string): Result<Opened, string> {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (reason) {
    return err(
      `It is not valid JSON: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
  const read = readClaudeAiExport(document);
  if (!read.ok) return err(describeExportError(read.error));
  const toMap = (conversation: ClaudeAiConversation): MapView => ({
    title: conversation.title,
    steps: conversation.steps,
    notShown: describeHiddenContent(conversation.notShown),
  });
  const [first, ...rest] = read.value.conversations;
  return ok({
    maps: [toMap(first), ...rest.map(toMap)],
    current: 0,
    problems: describeExportProblems(read.value.problems),
    isExport: true,
  });
}

function Session({
  opened,
  selectedId,
  onSelect,
  onShowMap,
  picker,
  error,
  narrow,
  topicModel,
  topics,
  onDetectTopics,
}: {
  readonly opened: Opened;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onShowMap: (index: number) => void;
  readonly picker: ReactNode;
  readonly error: string | null;
  readonly narrow: boolean;
  readonly topicModel: TopicModel | null;
  readonly topics: Topics;
  readonly onDetectTopics: (items: readonly TopicItem[]) => void;
}) {
  const view = opened.maps[opened.current] ?? opened.maps[0];
  const branch = selectedId === null ? [] : sessionBranch(view, selectedId);
  const prompts = branch.flatMap((step) =>
    step.kind === "prompt" ? [{ id: step.id, text: step.text }] : [],
  );
  return (
    <div
      className={cn("flex min-h-0 flex-1", narrow ? "flex-col" : "flex-row")}
    >
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{view.title}</h2>
          {picker}
        </div>
        {opened.isExport && (
          <NativeSelect
            aria-label="Conversation"
            className="w-full max-w-md"
            value={String(opened.current)}
            onChange={(event) => {
              onShowMap(Number(event.target.value));
            }}
          >
            {opened.maps.map((map, index) => (
              <NativeSelectOption key={index} value={String(index)}>
                {map.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {error !== null && <ErrorNotice text={error} />}
        {opened.problems !== null && <ErrorNotice text={opened.problems} />}
        {view.notShown !== null && (
          <p className="text-xs text-muted-foreground">{view.notShown}</p>
        )}
        <TopicsView
          topicModel={topicModel}
          topics={topics}
          canDetect={prompts.length > 0}
          onDetect={() => {
            onDetectTopics(prompts);
          }}
          onSelect={onSelect}
        />
        {selectedId === null ? (
          <p className="text-sm text-muted-foreground">
            This conversation has nothing to show on the map.
          </p>
        ) : (
          <SessionBranch
            branch={branch}
            selectedId={selectedId}
            topicStarts={topicStarts(topics)}
          />
        )}
      </main>
      <div
        className={cn(
          "shrink-0 border-muted",
          narrow ? "h-[45dvh] border-t" : "w-2/5 border-l",
        )}
      >
        {selectedId !== null && (
          <SessionMap
            key={opened.current}
            steps={view.steps}
            branch={branch}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

/** The title of each topic, by the prompt it starts at. */
function topicStarts(topics: Topics): ReadonlyMap<string, string> {
  if (topics.status !== "detected") return new Map();
  return new Map(
    topics.topics.flatMap((topic) => {
      const first = topic.itemIds[0];
      return first === undefined ? [] : [[first, topic.title] as const];
    }),
  );
}

/**
 * Topics are detected on request only: it sends the starts of the branch's
 * prompts to a model. They cover the branch they were detected on and are
 * kept while the page is open.
 */
function TopicsView({
  topicModel,
  topics,
  canDetect,
  onDetect,
  onSelect,
}: {
  readonly topicModel: TopicModel | null;
  readonly topics: Topics;
  readonly canDetect: boolean;
  readonly onDetect: () => void;
  readonly onSelect: (id: string) => void;
}) {
  if (topicModel === null)
    return (
      <p className="text-xs text-muted-foreground">
        Set up a provider to divide this session into topics.
      </p>
    );
  return (
    <section aria-label="Topics" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canDetect || topics.status === "detecting"}
          onClick={onDetect}
        >
          <Shapes aria-hidden="true" />
          {topics.status === "detecting"
            ? "Detecting topics…"
            : topics.status === "detected"
              ? "Detect topics again"
              : "Detect topics"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Sends the start of each prompt on this branch to {topicModel.model}.
        </span>
      </div>
      {topics.status === "failed" && <ErrorNotice text={topics.message} />}
      {topics.status === "detected" && (
        <ol className="flex flex-wrap gap-1.5">
          {topics.topics.map((topic) => {
            const first = topic.itemIds[0];
            return (
              first !== undefined && (
                <li key={first}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onSelect(first);
                    }}
                  >
                    {topic.title}
                  </Button>
                </li>
              )
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ErrorNotice({ text }: { readonly text: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** The selected branch, scrolled to the step chosen on the map. */
function SessionBranch({
  branch,
  selectedId,
  topicStarts,
}: {
  readonly branch: readonly SessionStep[];
  readonly selectedId: string;
  readonly topicStarts: ReadonlyMap<string, string>;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-step-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "start" });
  }, [selectedId]);
  return (
    <ol ref={list} className="flex flex-col gap-5" aria-label="Selected branch">
      {branch.map((step) => {
        const topic = topicStarts.get(step.id);
        return (
          <li
            key={step.id}
            data-step-id={step.id}
            className={cn(
              "flex scroll-mt-4 flex-col gap-2",
              step.kind === "prompt" && "items-end",
            )}
            aria-label={STEP_NAMES[step.kind]}
          >
            {topic !== undefined && (
              <h3 className="self-stretch border-b pb-1 text-sm font-semibold">
                {topic}
              </h3>
            )}
            <StepView step={step} />
          </li>
        );
      })}
    </ol>
  );
}

const STEP_NAMES: Readonly<Record<SessionStep["kind"], string>> = {
  prompt: "Prompt",
  activity: "Answer",
  compaction: "Compaction",
};

function StepView({ step }: { readonly step: SessionStep }) {
  switch (step.kind) {
    case "prompt":
      return (
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-sm break-words whitespace-pre-wrap">
          {step.text}
        </div>
      );
    case "compaction":
      return (
        <details className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Claude Code summarised the session up to here
          </summary>
          {step.summary !== null && <MarkdownContent text={step.summary} />}
        </details>
      );
    case "activity":
      return (
        <>
          <Badge variant="outline" className="font-mono font-normal">
            {step.model ?? "Claude"}
          </Badge>
          {step.items.map((item, index) => (
            <ActivityItemView key={index} item={item} />
          ))}
        </>
      );
  }
}

function ActivityItemView({ item }: { readonly item: ActivityItem }) {
  if (item.kind === "text")
    return (
      <div className="w-full">
        <MarkdownContent text={item.text} />
      </div>
    );
  const status =
    item.result === null
      ? " · no result"
      : item.result.isError
        ? " · failed"
        : "";
  return (
    <details className="w-full rounded-lg border px-3 py-1.5 text-sm">
      <summary className="cursor-pointer font-mono text-xs">
        {item.name}
        <span className="text-muted-foreground">{status}</span>
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap break-words">
        {item.input}
      </pre>
      {item.result !== null && (
        <pre
          className={cn(
            "mt-2 overflow-x-auto border-t pt-2 text-xs whitespace-pre-wrap break-words",
            item.result.isError && "text-destructive",
          )}
        >
          {item.result.text}
        </pre>
      )}
    </details>
  );
}
