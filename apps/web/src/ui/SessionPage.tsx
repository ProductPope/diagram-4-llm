import {
  readClaudeCodeSession,
  type ActivityItem,
  type ClaudeCodeSession,
  type SessionStep,
} from "@diagram-4-llm/core";
import { Alert, AlertDescription } from "#components/ui/alert";
import { Badge } from "#components/ui/badge";
import { Button, buttonVariants } from "#components/ui/button";
import { cn } from "#lib/utils";
import { ArrowLeft, CircleAlert, FileText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  describeNotShown,
  describeProblems,
  describeSessionError,
  sessionBranch,
} from "../app/session";
import { NARROW_SCREEN, useMediaQuery } from "../app/useMediaQuery";
import { Brand } from "./Brand";
import { MarkdownContent } from "./MarkdownContent";
import { SessionMap } from "./SessionMap";

interface Props {
  readonly onBack: () => void;
}

interface Opened {
  readonly name: string;
  readonly session: ClaudeCodeSession;
}

/**
 * A Claude Code session transcript as a read-only map. The file is read in
 * the browser and kept only while the page is open: transcripts can hold
 * secrets that passed through a tool, and Claude Code already keeps them.
 */
export function SessionPage({ onBack }: Props) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const narrow = useMediaQuery(NARROW_SCREEN);

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
    const read = readClaudeCodeSession(text);
    if (!read.ok) {
      setError(
        `${file.name} could not be opened: ${describeSessionError(read.error)}`,
      );
      return;
    }
    setError(null);
    setOpened({ name: file.name, session: read.value });
    setSelectedId(read.value.steps.at(-1)?.id ?? null);
  };

  const picker = (
    <label
      className={cn(
        buttonVariants({ variant: opened === null ? "default" : "outline" }),
        "has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
      )}
    >
      <FileText aria-hidden="true" />
      {opened === null ? "Open a session transcript" : "Open another session"}
      <input
        type="file"
        className="sr-only"
        accept=".jsonl"
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
      {opened === null || selectedId === null ? (
        <main className="flex flex-1 flex-col items-start gap-4 overflow-y-auto p-6">
          <h2 className="text-lg font-semibold">
            Map of a Claude Code session
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Claude Code keeps each session as a transcript in{" "}
            <code>
              ~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl
            </code>
            . Open one to see its prompts, answers and tool calls as a tree. The
            file is read in this tab only: nothing is saved or sent, and the map
            is gone when you leave this page.
          </p>
          {picker}
          {error !== null && <ErrorNotice text={error} />}
        </main>
      ) : (
        <Session
          opened={opened}
          selectedId={selectedId}
          onSelect={setSelectedId}
          picker={picker}
          error={error}
          narrow={narrow}
        />
      )}
    </div>
  );
}

function Session({
  opened,
  selectedId,
  onSelect,
  picker,
  error,
  narrow,
}: {
  readonly opened: Opened;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly picker: ReactNode;
  readonly error: string | null;
  readonly narrow: boolean;
}) {
  const { session, name } = opened;
  const branch = sessionBranch(session, selectedId);
  const notShown = describeNotShown(session.notShown);
  const problems = describeProblems(session.problems);
  return (
    <div
      className={cn("flex min-h-0 flex-1", narrow ? "flex-col" : "flex-row")}
    >
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{session.title ?? name}</h2>
          {picker}
        </div>
        {error !== null && <ErrorNotice text={error} />}
        {problems !== null && <ErrorNotice text={problems} />}
        {notShown !== null && (
          <p className="text-xs text-muted-foreground">{notShown}</p>
        )}
        <SessionBranch branch={branch} selectedId={selectedId} />
      </main>
      <div
        className={cn(
          "shrink-0 border-muted",
          narrow ? "h-[45dvh] border-t" : "w-2/5 border-l",
        )}
      >
        <SessionMap
          session={session}
          branch={branch}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
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
}: {
  readonly branch: readonly SessionStep[];
  readonly selectedId: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-step-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "start" });
  }, [selectedId]);
  return (
    <ol ref={list} className="flex flex-col gap-5" aria-label="Selected branch">
      {branch.map((step) => (
        <li
          key={step.id}
          data-step-id={step.id}
          className={cn(
            "flex scroll-mt-4 flex-col gap-2",
            step.kind === "prompt" && "items-end",
          )}
          aria-label={STEP_NAMES[step.kind]}
        >
          <StepView step={step} />
        </li>
      ))}
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
