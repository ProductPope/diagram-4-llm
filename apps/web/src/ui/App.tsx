import {
  createConversation,
  describeGraphError,
  isUsable,
  setNodeMeta,
  type ConversationGraph,
  type GraphError,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";
import { Alert, AlertDescription } from "#components/ui/alert";
import { Badge } from "#components/ui/badge";
import { Button, buttonVariants } from "#components/ui/button";
import { NativeSelect, NativeSelectOption } from "#components/ui/native-select";
import { cn } from "#lib/utils";
import {
  CircleAlert,
  Download,
  GitFork,
  Network,
  Plus,
  Settings2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import { visibleBranch } from "../app/branch";
import { DEMO_CONVERSATION_ID, demoConversation } from "../app/demo";
import {
  exportFileName,
  parseConversationFile,
  serializeConversation,
} from "../app/transfer";
import {
  createAdapter,
  loadSettings,
  saveSettings,
  type ProviderSettings,
} from "../app/settings";
import { useStoreValue } from "../app/useStoreValue";
import {
  generateAnswer,
  sendMessage,
  type Environment,
  type GenerationSettings,
} from "../chat/generate";
import { uuidv7 } from "../chat/ids";
import { createStore, type Store } from "../chat/store";
import { titleAnswer } from "../chat/title";
import {
  describeStorageError,
  type ConversationStore,
  type ConversationSummary,
  type StorageResult,
} from "../storage/conversation-store";
import { Composer } from "./Composer";
import { ContextInspector } from "./ContextInspector";
import { ConversationMap } from "./ConversationMap";
import { ReadingPane } from "./ReadingPane";
import { SettingsForm } from "./SettingsForm";
import { SetupWizard } from "./SetupWizard";

export interface AppProps {
  readonly openStore: () => Promise<StorageResult<ConversationStore>>;
  readonly settingsStorage: Storage;
}

type StorageState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly store: ConversationStore }
  | { readonly status: "failed"; readonly message: string };

interface Editing {
  readonly parentId: NodeId | null;
  readonly content: string;
}

const env: Environment = {
  newId: () => uuidv7(),
  now: () => new Date().toISOString(),
};
const SAVE_DELAY_MS = 300;

export function App({ openStore, settingsStorage }: AppProps) {
  const [storage, setStorage] = useState<StorageState>({ status: "loading" });
  const [conversations, setConversations] = useState<
    readonly ConversationSummary[]
  >([]);
  const [settings, setSettings] = useState<ProviderSettings | null>(() =>
    loadSettings(settingsStorage),
  );
  const [showSettings, setShowSettings] = useState(false);
  // Offered on every start until a provider is configured; skipping hides
  // it only for this visit.
  const [showSetup, setShowSetup] = useState(() => settings === null);
  const [current, setCurrent] = useState<Store<ConversationGraph> | null>(null);
  const [anchor, setAnchor] = useState<NodeId | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "saved" | "unsaved" | "saving" | "failed"
  >("saved");
  const graph = useStoreValue(current);

  useEffect(() => {
    // Results that arrive after the component is gone must not update it.
    // Read through a function: the flag changes during the awaits below.
    let active = true;
    const isActive = () => active;
    void openStore().then(async (opened) => {
      if (!isActive()) return;
      if (!opened.ok) {
        setStorage({
          status: "failed",
          message: describeStorageError(opened.error),
        });
        return;
      }
      setStorage({ status: "ready", store: opened.value });
      const listed = await opened.value.list();
      if (!isActive()) return;
      if (listed.ok) setConversations(listed.value);
      else setError(describeStorageError(listed.error));
    });
    return () => {
      active = false;
    };
  }, [openStore]);

  // Saves at most every SAVE_DELAY_MS while the conversation changes, so a
  // long streamed answer is saved as it arrives, and immediately when
  // switching away. The save state is shown to the user and guards closing
  // the page, because the last changes can still be in flight.
  useEffect(() => {
    if (current === null || storage.status !== "ready") return;
    const store = storage.store;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let changes = 0;
    // A function, because both values change while a save is awaited.
    const nothingNewSince = (savedChanges: number) =>
      timer === undefined && changes === savedChanges;
    const save = async () => {
      timer = undefined;
      const savedChanges = changes;
      setSaveState("saving");
      const saved = await store.save(current.get(), env.now());
      if (!saved.ok) {
        setSaveState("failed");
        setError(describeStorageError(saved.error));
        return;
      }
      if (nothingNewSince(savedChanges)) setSaveState("saved");
      const listed = await store.list();
      if (listed.ok) setConversations(listed.value);
    };
    const unsubscribe = current.subscribe(() => {
      changes += 1;
      setSaveState("unsaved");
      timer ??= setTimeout(() => void save(), SAVE_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        void save();
      }
    };
  }, [current, storage]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [saveState]);

  const busy = controller !== null;
  const branch = graph === null ? [] : visibleBranch(graph, anchor);
  const parentId = editing !== null ? editing.parentId : continuationOf(branch);
  const blockedReason =
    settings === null
      ? "Configure a provider in Settings before sending."
      : parentId === undefined
        ? "The last answer is unfinished or failed. Regenerate it or edit your message to continue."
        : null;

  // The model for the next answer: the user's choice if it is still
  // configured, otherwise the model that answered last on this branch, so a
  // branch keeps its model, otherwise the first configured model.
  const configuredModels = settings?.models ?? [];
  const branchModel = branch.findLast((turn) => turn.kind === "assistant")
    ?.generation.model;
  const model =
    [modelChoice, branchModel].find(
      (candidate): candidate is string =>
        candidate !== null &&
        candidate !== undefined &&
        configuredModels.includes(candidate),
    ) ?? configuredModels[0];

  const generation = (configured: ProviderSettings): GenerationSettings => ({
    adapter: createAdapter(configured),
    ...(configured.adapter === "openai-compatible"
      ? { baseUrl: configured.baseUrl }
      : {}),
    model: model ?? configured.models[0] ?? "",
    params: {},
    systemPrompt:
      configured.systemPrompt === "" ? null : configured.systemPrompt,
  });

  const run = (
    task: (
      signal: AbortSignal,
    ) => Promise<{ ok: true } | { ok: false; error: GraphError }>,
  ) => {
    const abort = new AbortController();
    setController(abort);
    setError(null);
    void task(abort.signal).then((result) => {
      setController(null);
      if (!result.ok) setError(describeGraphError(result.error));
    });
  };

  // Collapsing is presentation state stored with the conversation, so it
  // survives a reload and travels with an export.
  const toggleCollapsed = (id: NodeId) => {
    if (current === null) return;
    const latest = current.get();
    const meta = latest.meta.get(id) ?? {};
    const updated = setNodeMeta(latest, id, {
      ...meta,
      collapsed: meta.collapsed !== true,
    });
    if (updated.ok) current.set(updated.value);
    else setError(describeGraphError(updated.error));
  };

  // Runs as part of the answer's task, so Stop cancels it and the
  // conversation cannot be switched away before the title is saved.
  const addTitle = async (
    store: Store<ConversationGraph>,
    answerId: NodeId,
    adapter: GenerationSettings["adapter"],
    titleModel: string | undefined,
    signal: AbortSignal,
  ) => {
    if (titleModel === undefined) return;
    const titled = await titleAnswer(
      store,
      answerId,
      adapter,
      titleModel,
      signal,
    );
    if (!titled.ok)
      setError(
        `The answer is saved, but its title could not be generated: ${titled.error.message}`,
      );
  };

  const send = (content: string) => {
    if (settings === null || parentId === undefined) return;
    let target = current;
    if (target === null) {
      const created = createConversation({
        id: env.newId(),
        title: titleFrom(content),
        createdAt: env.now(),
      });
      if (!created.ok) {
        setError(describeGraphError(created.error));
        return;
      }
      target = createStore(created.value);
      setCurrent(target);
    }
    if (editing !== null) {
      setAnchor(editing.parentId);
      setEditing(null);
    }
    const store = target;
    const answerSettings = generation(settings);
    run(async (signal) => {
      const sent = await sendMessage(
        store,
        { parentId, refs: [], content },
        answerSettings,
        env,
        signal,
      );
      if (sent.ok)
        await addTitle(
          store,
          sent.value.assistantTurnId,
          answerSettings.adapter,
          settings.titleModel,
          signal,
        );
      return sent;
    });
  };

  const regenerate = (userTurnId: NodeId) => {
    if (settings === null || current === null) return;
    const store = current;
    setAnchor(userTurnId);
    const answerSettings = generation(settings);
    run(async (signal) => {
      const answered = await generateAnswer(
        store,
        userTurnId,
        answerSettings,
        env,
        signal,
      );
      if (answered.ok)
        await addTitle(
          store,
          answered.value,
          answerSettings.adapter,
          settings.titleModel,
          signal,
        );
      return answered;
    });
  };

  const startEditing = (turn: TurnNode) => {
    setEditing({ parentId: turn.parentId, content: turn.content });
    setDraft(turn.content);
    setComposerKey((key) => key + 1);
  };

  const cancelEditing = () => {
    setEditing(null);
    setDraft("");
    setComposerKey((key) => key + 1);
  };

  const openConversation = async (id: string) => {
    if (storage.status !== "ready" || busy) return;
    const loaded = await storage.store.load(id);
    if (!loaded.ok) {
      setError(describeStorageError(loaded.error));
      return;
    }
    // Choosing a conversation, the demo included, takes the user out of
    // setup; it stays available from the composer and from Settings.
    setShowSetup(false);
    setCurrent(createStore(loaded.value));
    setAnchor(null);
    setEditing(null);
  };

  // The demo is saved like any other conversation the first time, so it can
  // be continued or exported; later it is only opened, never reset.
  const openDemo = async () => {
    if (storage.status !== "ready" || busy) return;
    if (!conversations.some((c) => c.id === DEMO_CONVERSATION_ID)) {
      const built = demoConversation();
      if (!built.ok) {
        setError(describeGraphError(built.error));
        return;
      }
      const saved = await storage.store.save(built.value, env.now());
      if (!saved.ok) {
        setError(describeStorageError(saved.error));
        return;
      }
      const listed = await storage.store.list();
      if (listed.ok) setConversations(listed.value);
    }
    setError(null);
    await openConversation(DEMO_CONVERSATION_ID);
  };

  const exportCurrent = () => {
    if (graph === null) return;
    const url = URL.createObjectURL(
      new Blob([serializeConversation(graph)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(graph);
    link.click();
    // Some browsers start the download asynchronously; release the URL after.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  /**
   * Imports an exported file as a new conversation. A conversation with the
   * same ID is never overwritten: the import is refused with an explanation.
   */
  const importFile = async (file: File) => {
    if (storage.status !== "ready" || busy) return;
    const parsed = parseConversationFile(await file.text());
    if (!parsed.ok) {
      setError(`${file.name} was not imported: ${parsed.error}`);
      return;
    }
    const id = parsed.value.conversation.id;
    if (conversations.some((c) => c.id === id)) {
      setError(
        `${file.name} was not imported: this conversation is already in the app. Nothing was changed.`,
      );
      return;
    }
    const saved = await storage.store.save(parsed.value, env.now());
    if (!saved.ok) {
      setError(describeStorageError(saved.error));
      return;
    }
    const listed = await storage.store.list();
    if (listed.ok) setConversations(listed.value);
    setError(null);
    await openConversation(id);
  };

  const newConversation = () => {
    if (busy) return;
    setCurrent(null);
    setAnchor(null);
    setEditing(null);
  };

  return (
    <div className="grid h-dvh grid-cols-[15rem_minmax(18rem,1fr)_minmax(26rem,46rem)] grid-rows-[auto_minmax(0,1fr)]">
      <header className="col-span-full flex h-14 items-center justify-between gap-4 border-b px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network className="size-4" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            diagram-4-llm
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {settings !== null && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {settings.adapter === "anthropic"
                ? "Anthropic"
                : "OpenAI-compatible"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowSettings(true);
            }}
          >
            <Settings2 aria-hidden="true" />
            Settings
          </Button>
        </div>
      </header>

      <nav
        className="flex min-h-0 flex-col gap-3 border-r bg-sidebar p-3 text-sidebar-foreground"
        aria-label="Conversations"
      >
        <Button onClick={newConversation} disabled={busy}>
          <Plus aria-hidden="true" />
          New conversation
        </Button>
        <label
          className={cn(
            buttonVariants({ variant: "outline" }),
            "has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-50 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
          )}
        >
          <Upload aria-hidden="true" />
          Import conversation
          <input
            type="file"
            className="sr-only"
            accept=".json,application/json"
            disabled={busy || storage.status !== "ready"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void importFile(file);
            }}
          />
        </label>
        <Button
          variant="ghost"
          className="justify-start"
          disabled={busy || storage.status !== "ready"}
          onClick={() => void openDemo()}
        >
          <Sparkles aria-hidden="true" />
          Open the demo
        </Button>
        <p className="px-1 text-xs text-muted-foreground" role="status">
          {saveStateText(saveState)}
        </p>
        {storage.status === "failed" && (
          <Alert variant="destructive">
            <AlertDescription>
              Conversations cannot be saved: {storage.message}
            </AlertDescription>
          </Alert>
        )}
        <h2 className="px-1 pt-2 text-xs font-medium text-muted-foreground">
          Conversations
        </h2>
        {conversations.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <Button
                  variant="ghost"
                  className="w-full justify-start truncate font-normal aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground"
                  aria-current={
                    graph?.conversation.id === c.id ? "page" : undefined
                  }
                  disabled={busy}
                  onClick={() => void openConversation(c.id)}
                >
                  <span className="truncate">{c.title}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {graph === null ? (
        <section
          className="flex flex-col items-center justify-center gap-2 border-r bg-muted/40 p-6 text-center text-sm text-muted-foreground"
          aria-label="Conversation map"
        >
          <GitFork className="size-6" aria-hidden="true" />
          <p>The map of the conversation appears here once it starts.</p>
        </section>
      ) : (
        <ConversationMap
          graph={graph}
          branch={branch}
          onSelect={(id) => {
            if (!busy) setAnchor(id);
          }}
          onToggleCollapsed={toggleCollapsed}
          onEdit={(turn) => {
            if (busy) return;
            setAnchor(turn.id);
            startEditing(turn);
          }}
        />
      )}

      <main className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {error !== null && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {showSettings ? (
            <SettingsForm
              initial={settings}
              onSave={(next) => {
                saveSettings(next, settingsStorage);
                setSettings(next);
                setShowSettings(false);
                setShowSetup(false);
              }}
              onCancel={() => {
                setShowSettings(false);
              }}
              onStartSetup={() => {
                setShowSettings(false);
                setShowSetup(true);
              }}
            />
          ) : showSetup ? (
            <SetupWizard
              origin={window.location.origin}
              systemPrompt={settings?.systemPrompt ?? ""}
              onComplete={(next) => {
                saveSettings(next, settingsStorage);
                setSettings(next);
                setShowSetup(false);
              }}
              onOpenDemo={() => void openDemo()}
              onSkip={() => {
                setShowSetup(false);
              }}
            />
          ) : graph === null ? (
            <p className="m-auto text-sm text-muted-foreground">
              Start a new conversation below.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
                  {graph.conversation.title}
                </h2>
                <Button variant="outline" size="sm" onClick={exportCurrent}>
                  <Download aria-hidden="true" />
                  Export conversation
                </Button>
              </div>
              <ReadingPane
                graph={graph}
                branch={branch}
                busy={busy}
                onSelect={setAnchor}
                onEdit={startEditing}
                onRegenerate={regenerate}
              />
            </>
          )}
        </div>

        {!showSettings && !showSetup && (
          <div className="flex flex-col gap-3 border-t bg-background px-6 py-4">
            {editing !== null && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                <p className="text-muted-foreground">
                  Editing creates a new version of the message; the original
                  stays in the conversation.
                </p>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel editing
                </Button>
              </div>
            )}
            {graph !== null && parentId !== undefined && (
              <ContextInspector
                graph={graph}
                draft={{ parentId, refs: [], content: draft }}
                systemPrompt={
                  settings === null || settings.systemPrompt === ""
                    ? null
                    : settings.systemPrompt
                }
              />
            )}
            <Composer
              key={composerKey}
              initialContent={editing?.content ?? ""}
              busy={busy}
              blockedReason={blockedReason}
              autoFocus={editing !== null}
              onChange={setDraft}
              onSend={send}
              onStop={() => {
                controller?.abort();
              }}
              options={
                settings === null ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowSetup(true);
                    }}
                  >
                    Connect a model
                  </Button>
                ) : (
                  configuredModels.length > 1 &&
                  model !== undefined && (
                    <NativeSelect
                      size="sm"
                      aria-label="Model for the next answer"
                      value={model}
                      disabled={busy}
                      onChange={(event) => {
                        setModelChoice(event.target.value);
                      }}
                    >
                      {configuredModels.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                          {option}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )
                )
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Where a new message continues the branch: after its last answer, or as a
 * new root in an empty conversation. Undefined when the branch ends in a
 * turn that cannot be continued.
 */
function continuationOf(
  branch: readonly TurnNode[],
): NodeId | null | undefined {
  const tip = branch.at(-1);
  if (tip === undefined) return null;
  return tip.kind === "assistant" && isUsable(tip) ? tip.id : undefined;
}

function titleFrom(content: string): string {
  const firstLine = content.trim().split("\n")[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
}

function saveStateText(
  state: "saved" | "unsaved" | "saving" | "failed",
): string {
  switch (state) {
    case "saved":
      return "All changes saved";
    case "unsaved":
    case "saving":
      return "Saving…";
    case "failed":
      return "Changes could not be saved";
  }
}
