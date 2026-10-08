import {
  addSummary,
  assembleContext,
  createConversation,
  currentSummaries,
  describeGraphError,
  isUsable,
  pathTo,
  renameConversation,
  setNodeMeta,
  type ConversationGraph,
  type GraphError,
  type NodeId,
  type SummaryNode,
  type TurnNode,
} from "@diagram-4-llm/core";
import { Alert, AlertDescription } from "#components/ui/alert";
import { Badge } from "#components/ui/badge";
import { Button, buttonVariants } from "#components/ui/button";
import { NativeSelect, NativeSelectOption } from "#components/ui/native-select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "#components/ui/resizable";
import { cn } from "#lib/utils";
import {
  CircleAlert,
  Download,
  FileText,
  GitFork,
  MessageSquarePlus,
  PanelRightClose,
  Plus,
  Settings2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useDefaultLayout } from "react-resizable-panels";

import { visibleBranch } from "../app/branch";
import {
  contextBudget,
  referencesBySize,
  type ContextBudget,
} from "../app/budget";
import { labelOf } from "../app/label";
import { referencesOnPath, toggleReference } from "../app/references";
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
import { defaultRoute } from "../app/route";
import { navigate, useRoute } from "../app/useRoute";
import { NARROW_SCREEN, useMediaQuery } from "../app/useMediaQuery";
import { useStoreValue } from "../app/useStoreValue";
import {
  generateAnswer,
  sendMessage,
  type Environment,
  type GenerationSettings,
} from "../chat/generate";
import { uuidv7 } from "../chat/ids";
import { createStore, type Store } from "../chat/store";
import { summarise } from "../chat/summary";
import { suggestFollowUps } from "../chat/suggestions";
import { titleAnswer } from "../chat/title";
import {
  describeStorageError,
  type ConversationStore,
  type ConversationSummary,
  type StorageResult,
} from "../storage/conversation-store";
import { AttachedReferences } from "./AttachedReferences";
import { BudgetNotice } from "./BudgetNotice";
import { Composer } from "./Composer";
import { ContextInspector } from "./ContextInspector";
import { ConversationList } from "./ConversationList";
import { ConversationMap } from "./ConversationMap";
import { ReadingPane } from "./ReadingPane";
import { SettingsForm } from "./SettingsForm";
import { Brand } from "./Brand";
import { BranchStrip } from "./BranchStrip";
import { Landing } from "./Landing";
import { SessionPage, type TopicModel } from "./SessionPage";
import { SetupPage } from "./SetupPage";

export interface AppProps {
  readonly openStore: () => Promise<StorageResult<ConversationStore>>;
  readonly settingsStorage: Storage;
}

type StorageState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly store: ConversationStore }
  | { readonly status: "failed"; readonly message: string };

/**
 * The composer writing somewhere other than the end of the branch: a new
 * version of an existing message, a new message after an earlier answer,
 * or a new first message that sees only what is attached to it. Either way
 * the original turns stay as they are.
 */
interface Editing {
  readonly kind: "edit" | "branch" | "root";
  readonly parentId: NodeId | null;
  readonly content: string;
}

const env: Environment = {
  newId: () => uuidv7(),
  now: () => new Date().toISOString(),
};
const SAVE_DELAY_MS = 300;
const USED_APP_KEY = "diagram-4-llm.used-app";
const MAP_MINIMIZED_KEY = "diagram-4-llm.map-minimized";

type View = "list" | "conversation" | "map";

const NARROW_VIEWS: readonly { readonly id: View; readonly label: string }[] = [
  { id: "list", label: "Conversations" },
  { id: "conversation", label: "Conversation" },
  { id: "map", label: "Map" },
];

export function App({ openStore, settingsStorage }: AppProps) {
  const [storage, setStorage] = useState<StorageState>({ status: "loading" });
  const [conversations, setConversations] = useState<
    readonly ConversationSummary[]
  >([]);
  const [settings, setSettings] = useState<ProviderSettings | null>(() =>
    loadSettings(settingsStorage),
  );
  const [showSettings, setShowSettings] = useState(false);
  const narrow = useMediaQuery(NARROW_SCREEN);
  // Only used on a narrow screen. Opening, starting or choosing something
  // shows the conversation, where its result and any error appear.
  const [view, setView] = useState<View>("conversation");
  const conversationRef = useRef<HTMLElement>(null);
  const route = useRoute();
  const page =
    route ??
    defaultRoute(
      settings !== null || settingsStorage.getItem(USED_APP_KEY) !== null,
    );
  // Remembered so that a later visit to the bare address opens the app.
  useEffect(() => {
    if (page === "app") settingsStorage.setItem(USED_APP_KEY, "1");
  }, [page, settingsStorage]);
  const [current, setCurrent] = useState<Store<ConversationGraph> | null>(null);
  const [anchor, setAnchor] = useState<NodeId | null>(null);
  const [reveal, setReveal] = useState<{
    readonly id: NodeId;
    readonly request: number;
  } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState("");
  // Turns attached to the message being written, sent in this order.
  const [refs, setRefs] = useState<readonly NodeId[]>([]);
  const [pendingSummary, setPendingSummary] = useState<PendingSummary | null>(
    null,
  );
  // Follow-up questions proposed for answers. They are suggestions, not
  // part of the conversation, so they are kept only while the page is open.
  const [suggestions, setSuggestions] = useState<
    ReadonlyMap<NodeId, readonly string[]>
  >(() => new Map());
  const [controller, setController] = useState<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "saved" | "unsaved" | "saving" | "failed"
  >("saved");
  const graph = useStoreValue(current);
  // Panel widths are kept in the browser, like the provider settings.
  const layout = useDefaultLayout({
    id: "diagram-4-llm.layout",
    storage: settingsStorage,
    onlySaveAfterUserInteractions: true,
  });
  // Without the map the panels have other widths, kept under their own key
  // so that each arrangement opens as the user left it.
  const minimizedLayout = useDefaultLayout({
    id: "diagram-4-llm.layout-minimized",
    storage: settingsStorage,
    onlySaveAfterUserInteractions: true,
  });
  // Only on a wide screen; a narrow one shows the map as a view of its own.
  const [mapMinimized, setMapMinimized] = useState(
    () => settingsStorage.getItem(MAP_MINIMIZED_KEY) !== null,
  );
  const [turnsInView, setTurnsInView] = useState<ReadonlySet<NodeId>>(
    () => new Set(),
  );
  const minimizeMapRef = useRef<HTMLButtonElement>(null);
  const restoreMapRef = useRef<HTMLButtonElement>(null);
  const stripShown = mapMinimized && !narrow;

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
  const refsOnPath =
    graph === null || parentId === undefined
      ? new Set<NodeId>()
      : referencesOnPath(graph, parentId, refs);

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

  const systemPrompt =
    settings === null || settings.systemPrompt === ""
      ? null
      : settings.systemPrompt;
  const assembled =
    graph === null || parentId === undefined || draft.trim() === ""
      ? null
      : assembleContext(
          graph,
          { parentId, refs, content: draft },
          { systemPrompt },
        );
  const budget: ContextBudget =
    assembled?.ok === true
      ? contextBudget(
          assembled.value.manifest.estimatedInputTokens,
          model === undefined ? undefined : settings?.contextWindows?.[model],
        )
      : { status: "unknown" };

  const blockedReason =
    settings === null
      ? "Configure a provider in Settings before sending."
      : parentId === undefined
        ? "The last answer is unfinished or failed. Regenerate it or edit your message to continue."
        : refsOnPath.size > 0
          ? "An attached turn is already in this branch. Remove it to send."
          : budget.status === "over"
            ? "The context is larger than the model's context window. Make it smaller to send."
            : null;

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

  // Runs as part of a task like addTitle, so Stop cancels it too.
  const addSuggestions = async (
    store: Store<ConversationGraph>,
    answerId: NodeId,
    adapter: GenerationSettings["adapter"],
    suggestionModel: string | undefined,
    signal: AbortSignal,
  ) => {
    if (suggestionModel === undefined) return;
    const suggested = await suggestFollowUps(
      store.get(),
      answerId,
      adapter,
      suggestionModel,
      signal,
    );
    if (!suggested.ok) {
      setError(
        `Follow-up questions could not be suggested: ${suggested.error.message}`,
      );
      return;
    }
    const list = suggested.value;
    if (list !== null)
      setSuggestions((previous) => new Map(previous).set(answerId, list));
  };

  // What follows a finished answer: its title, then suggested follow-ups,
  // each only when a model is chosen for it.
  const afterAnswer = async (
    store: Store<ConversationGraph>,
    answerId: NodeId,
    configured: ProviderSettings,
    adapter: GenerationSettings["adapter"],
    signal: AbortSignal,
  ) => {
    await addTitle(store, answerId, adapter, configured.titleModel, signal);
    await addSuggestions(
      store,
      answerId,
      adapter,
      configured.suggestionModel,
      signal,
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
    const draftRefs = refs;
    setRefs([]);
    run(async (signal) => {
      const sent = await sendMessage(
        store,
        { parentId, refs: draftRefs, content },
        answerSettings,
        env,
        signal,
      );
      if (sent.ok)
        await afterAnswer(
          store,
          sent.value.assistantTurnId,
          settings,
          answerSettings.adapter,
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
        await afterAnswer(
          store,
          answered.value,
          settings,
          answerSettings.adapter,
          signal,
        );
      return answered;
    });
  };

  // A summary always covers the branch from its first message, so that it
  // can stand in for the whole branch when it is attached elsewhere. With
  // `attach`, the finished summary is attached to the message being written.
  const summariseBranch = (answerId: NodeId, attach: boolean) => {
    if (settings === null || current === null) return;
    const fromId = firstTurnOf(current.get(), answerId);
    if (fromId === undefined) return;
    const store = current;
    const answerSettings = generation(settings);
    setPendingSummary({ toId: answerId, text: "", attach });
    run(async (signal) => {
      const summarised = await summarise(
        store,
        { fromId, toId: answerId },
        answerSettings,
        env,
        signal,
        (text) => {
          setPendingSummary({ toId: answerId, text, attach });
        },
      );
      setPendingSummary(null);
      if (!summarised.ok)
        setError(
          `The summary could not be written: ${summarised.error.message}`,
        );
      else if (attach && summarised.value !== null) {
        const id = summarised.value;
        setRefs((previous) => [...previous, id]);
      }
      return { ok: true };
    });
  };

  // Brings a branch into the message being written as its summary: the
  // current one if the branch has one, otherwise a new one.
  const attachBranchSummary = (answerId: NodeId) => {
    if (current === null) return;
    const latest = current.get();
    const fromId = firstTurnOf(latest, answerId);
    const existing = currentSummaries(latest)
      .get(answerId)
      ?.findLast((summary) => summary.covers.fromId === fromId);
    if (existing === undefined) {
      summariseBranch(answerId, true);
      return;
    }
    setRefs((previous) =>
      previous.includes(existing.id) ? previous : [...previous, existing.id],
    );
  };

  // An edit is a new summary that revises the old one. If the old one is
  // attached to the message being written, the edit takes its place.
  const reviseSummary = (summary: SummaryNode, content: string) => {
    if (current === null) return;
    const id = env.newId();
    const revised = addSummary(current.get(), {
      id,
      createdAt: env.now(),
      covers: summary.covers,
      content,
      revises: summary.id,
    });
    if (!revised.ok) {
      setError(describeGraphError(revised.error));
      return;
    }
    current.set(revised.value);
    setRefs((previous) =>
      previous.map((ref) => (ref === summary.id ? id : ref)),
    );
  };

  // The new version starts with the original's attachments, which the
  // user can remove like any other.
  const startEditing = (turn: TurnNode) => {
    setView("conversation");
    setEditing({
      kind: "edit",
      parentId: turn.parentId,
      content: turn.content,
    });
    setDraft(turn.content);
    setRefs(turn.kind === "user" ? turn.refs : []);
    setComposerKey((key) => key + 1);
  };

  // The new message continues from the answer, so the model sees the
  // branch up to that answer and nothing that came after it.
  const startBranch = (answerId: NodeId, content = "") => {
    setView("conversation");
    setAnchor(answerId);
    setEditing({ kind: "branch", parentId: answerId, content });
    setDraft(content);
    setComposerKey((key) => key + 1);
  };

  const suggestFor = (answerId: NodeId) => {
    if (settings === null || current === null) return;
    const store = current;
    const configured = settings;
    const adapter = generation(settings).adapter;
    run(async (signal) => {
      await addSuggestions(
        store,
        answerId,
        adapter,
        configured.suggestionModel,
        signal,
      );
      return { ok: true };
    });
  };

  // Each suggestion becomes its own branch from the answer, sent one after
  // another. Stop ends the one being answered and sends no more.
  const sendSuggestions = (answerId: NodeId, texts: readonly string[]) => {
    if (settings === null || current === null) return;
    const store = current;
    const configured = settings;
    const answerSettings = generation(settings);
    setAnchor(answerId);
    run(async (signal) => {
      for (const content of texts) {
        if (signal.aborted) break;
        const sent = await sendMessage(
          store,
          { parentId: answerId, refs: [], content },
          answerSettings,
          env,
          signal,
        );
        if (!sent.ok) return sent;
        await afterAnswer(
          store,
          sent.value.assistantTurnId,
          configured,
          answerSettings.adapter,
          signal,
        );
      }
      return { ok: true };
    });
  };

  // What sending each text as a branch from the answer would cost: the
  // branch is sent again with each of them.
  const estimateSuggestions = (answerId: NodeId, texts: readonly string[]) =>
    graph === null
      ? 0
      : texts.reduce((total, content) => {
          const context = assembleContext(
            graph,
            { parentId: answerId, refs: [], content },
            { systemPrompt },
          );
          return context.ok
            ? total + context.value.manifest.estimatedInputTokens
            : total;
        }, 0);

  // A first message continues nothing, so the model sees only the message
  // and what is attached to it, such as summaries of the branches it
  // brings together. The text and attachments written so far are kept.
  const startRoot = () => {
    setView("conversation");
    setEditing({ kind: "root", parentId: null, content: draft });
    setComposerKey((key) => key + 1);
  };

  // Attachments belong to the message being written, so they stay, except
  // the ones a new version of a message started with.
  const cancelEditing = () => {
    if (editing?.kind === "edit") setRefs([]);
    setEditing(null);
    setDraft("");
    setComposerKey((key) => key + 1);
  };

  const openConversation = async (id: string) => {
    if (storage.status !== "ready" || busy) return;
    setView("conversation");
    const loaded = await storage.store.load(id);
    if (!loaded.ok) {
      setError(describeStorageError(loaded.error));
      return;
    }
    setCurrent(createStore(loaded.value));
    setAnchor(null);
    setEditing(null);
    setRefs([]);
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

  const refreshList = async (store: ConversationStore) => {
    const listed = await store.list();
    if (listed.ok) setConversations(listed.value);
    else setError(describeStorageError(listed.error));
  };

  // The open conversation is renamed in memory and saved like any other
  // change; any other one is loaded, renamed and saved directly.
  const renameStored = async (id: string, title: string) => {
    if (storage.status !== "ready" || busy) return;
    if (current !== null && current.get().conversation.id === id) {
      current.set(renameConversation(current.get(), title));
      return;
    }
    const loaded = await storage.store.load(id);
    if (!loaded.ok) {
      setError(describeStorageError(loaded.error));
      return;
    }
    const saved = await storage.store.save(
      renameConversation(loaded.value, title),
      env.now(),
    );
    if (!saved.ok) {
      setError(describeStorageError(saved.error));
      return;
    }
    await refreshList(storage.store);
  };

  const deleteStored = async (id: string) => {
    if (storage.status !== "ready" || busy) return;
    if (current !== null && current.get().conversation.id === id) {
      // Closing a conversation saves its pending changes. IndexedDB runs
      // write transactions in the order they are created, so the close is
      // committed first; otherwise that save would run after the delete
      // and bring the conversation back.
      flushSync(() => {
        setCurrent(null);
        setAnchor(null);
        setEditing(null);
        setRefs([]);
      });
    }
    const removed = await storage.store.remove(id);
    if (!removed.ok) {
      setError(describeStorageError(removed.error));
      return;
    }
    await refreshList(storage.store);
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
    setView("conversation");
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
    setView("conversation");
    setCurrent(null);
    setAnchor(null);
    setEditing(null);
    setRefs([]);
    // Without a provider nothing can be sent, so the settings come first.
    // Saving them closes the form onto the new conversation.
    if (settings === null) setShowSettings(true);
  };

  // The button that was pressed disappears, so focus moves to the one that
  // takes its place.
  const minimizeMap = (minimized: boolean) => {
    if (minimized) settingsStorage.setItem(MAP_MINIMIZED_KEY, "1");
    else settingsStorage.removeItem(MAP_MINIMIZED_KEY);
    flushSync(() => {
      setMapMinimized(minimized);
    });
    (minimized ? restoreMapRef : minimizeMapRef).current?.focus();
  };

  // The map is for finding a turn; the conversation shows it.
  const revealTurn = (id: NodeId) => {
    setReveal((previous) => ({
      id,
      request: (previous?.request ?? 0) + 1,
    }));
  };

  const exploreDemo = async () => {
    await openDemo();
    navigate("app");
  };
  const saveSetup = (next: ProviderSettings) => {
    saveSettings(next, settingsStorage);
    setSettings(next);
    navigate("app");
  };

  if (page === "welcome") {
    return (
      <Landing
        demoReady={storage.status === "ready"}
        onOpenDemo={() => void exploreDemo()}
        onSetup={() => {
          navigate("setup");
        }}
        onOpenApp={() => {
          navigate("app");
        }}
      />
    );
  }
  if (page === "session") {
    return (
      <SessionPage
        topicModel={sessionTopicModel(settings)}
        onBack={() => {
          navigate("app");
        }}
      />
    );
  }
  if (page === "setup") {
    return (
      <SetupPage
        origin={window.location.origin}
        systemPrompt={settings?.systemPrompt ?? ""}
        onComplete={saveSetup}
        onBack={() => {
          navigate(settings === null ? "welcome" : "app");
        }}
        demoReady={storage.status === "ready"}
        onOpenDemo={() => void exploreDemo()}
        onSkip={() => {
          navigate("app");
        }}
      />
    );
  }

  // The app routes on the URL fragment, so following "#conversation" would
  // leave the app page. Focus moves by hand instead.
  const skipToConversation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    // A hidden element cannot take focus, and on a narrow screen the
    // conversation may be hidden behind another view.
    flushSync(() => {
      setView("conversation");
    });
    conversationRef.current?.focus();
  };

  const sidebar = (
    <nav
      className="flex h-full flex-col gap-3 bg-sidebar p-3 text-sidebar-foreground"
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
      <Button
        variant="ghost"
        className="justify-start"
        onClick={() => {
          navigate("session");
        }}
      >
        <FileText aria-hidden="true" />
        Map a Claude Code session
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
      <ConversationList
        conversations={conversations}
        currentId={graph?.conversation.id}
        busy={busy}
        onOpen={(id) => void openConversation(id)}
        onRename={(id, title) => void renameStored(id, title)}
        onDelete={(id) => void deleteStored(id)}
      />
    </nav>
  );
  const conversation = (
    <main
      ref={conversationRef}
      id="conversation"
      tabIndex={-1}
      className="flex h-full flex-col"
    >
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
            }}
            onCancel={() => {
              setShowSettings(false);
            }}
            onStartSetup={() => {
              setShowSettings(false);
              navigate("setup");
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
              <span className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={startRoot}
                >
                  <MessageSquarePlus aria-hidden="true" />
                  New first message
                </Button>
                <Button variant="outline" size="sm" onClick={exportCurrent}>
                  <Download aria-hidden="true" />
                  Export conversation
                </Button>
              </span>
            </div>
            <ReadingPane
              graph={graph}
              branch={branch}
              busy={busy}
              onSelect={setAnchor}
              onShowTurn={(id) => {
                setAnchor(id);
                revealTurn(id);
              }}
              onEdit={startEditing}
              onRegenerate={regenerate}
              onSummarise={
                settings === null
                  ? undefined
                  : (answerId) => {
                      summariseBranch(answerId, false);
                    }
              }
              pendingSummary={pendingSummary}
              onReviseSummary={reviseSummary}
              suggestions={suggestions}
              onSuggest={
                settings?.suggestionModel === undefined ? undefined : suggestFor
              }
              onChooseSuggestion={(answerId, text) => {
                if (!busy) startBranch(answerId, text);
              }}
              estimateSuggestions={estimateSuggestions}
              onSendSuggestions={(answerId, texts) => {
                if (!busy) sendSuggestions(answerId, texts);
              }}
              attached={refs}
              onToggleReference={(id) => {
                setRefs((previous) => toggleReference(previous, id));
              }}
              reveal={reveal}
              onTurnsInView={stripShown ? setTurnsInView : undefined}
            />
          </>
        )}
      </div>

      {!showSettings && (
        <div className="flex flex-col gap-3 border-t bg-background px-6 py-4">
          {editing !== null && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {editingNotice[editing.kind]}
              </p>
              <Button variant="ghost" size="sm" onClick={cancelEditing}>
                {cancelLabel[editing.kind]}
              </Button>
            </div>
          )}
          {graph !== null && (
            <AttachedReferences
              graph={graph}
              refs={refs}
              pending={
                pendingSummary?.attach === true ? pendingSummary.toId : null
              }
              onPath={refsOnPath}
              onRemove={(id) => {
                setRefs((previous) => previous.filter((ref) => ref !== id));
              }}
            />
          )}
          {graph !== null && model !== undefined && (
            <BudgetNotice
              budget={budget}
              model={model}
              references={referencesBySize(graph, refs).map((reference) => {
                const node = graph.nodes.get(reference.id);
                return {
                  ...reference,
                  label:
                    graph.meta.get(reference.id)?.title ??
                    (node === undefined ? reference.id : labelOf(node)),
                };
              })}
              onRemoveReference={(id) => {
                setRefs((previous) => previous.filter((ref) => ref !== id));
              }}
              onContinueFromSummary={
                typeof parentId === "string" && !busy
                  ? () => {
                      attachBranchSummary(parentId);
                      startRoot();
                    }
                  : undefined
              }
            />
          )}
          {graph !== null && parentId !== undefined && (
            <ContextInspector assembled={assembled} />
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
                    navigate("setup");
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
  );
  const mapContent =
    graph === null ? (
      <section
        className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center text-sm text-muted-foreground"
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
          if (busy) return;
          setView("conversation");
          setAnchor(id);
          revealTurn(id);
        }}
        onToggleCollapsed={toggleCollapsed}
        onEdit={(turn) => {
          if (busy) return;
          setAnchor(turn.id);
          startEditing(turn);
        }}
        onBranchFrom={(answerId) => {
          if (!busy) startBranch(answerId);
        }}
        attachTo={parentId}
        attached={refs}
        onToggleReference={(id) => {
          setRefs((previous) => toggleReference(previous, id));
        }}
        onSummarise={
          settings === null
            ? undefined
            : (answerId) => {
                if (busy) return;
                setView("conversation");
                setAnchor(answerId);
                summariseBranch(answerId, false);
              }
        }
        onAttachSummary={
          settings === null
            ? undefined
            : (answerId) => {
                if (!busy) attachBranchSummary(answerId);
              }
        }
      />
    );
  const map = narrow ? (
    mapContent
  ) : (
    <div className="relative h-full">
      <Button
        ref={minimizeMapRef}
        variant="outline"
        size="icon"
        className="absolute top-2 right-2 z-10"
        aria-label="Minimize the map"
        title="Minimize the map"
        onClick={() => {
          minimizeMap(true);
        }}
      >
        <PanelRightClose aria-hidden="true" />
      </Button>
      {mapContent}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col">
      {/* Without a transition, the link appears and disappears at once
          instead of growing out of and shrinking into a single pixel. */}
      <a
        href="#conversation"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "absolute top-3 left-4 z-50 transition-none not-focus:sr-only",
        )}
        onClick={skipToConversation}
      >
        Skip to the conversation
      </a>
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <h1>
          <Brand />
        </h1>
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
              setView("conversation");
            }}
          >
            <Settings2 aria-hidden="true" />
            Settings
          </Button>
        </div>
      </header>

      {narrow ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex shrink-0 gap-1 border-b p-2"
            role="group"
            aria-label="View"
          >
            {NARROW_VIEWS.map(({ id, label }) => (
              <Button
                key={id}
                variant={view === id ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === id}
                onClick={() => {
                  setView(id);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {/* The list and the conversation stay mounted while hidden, so
              a draft in the composer survives a switch. The map mounts when
              shown, because it fits itself to its size on mount and a
              hidden element has none. */}
          <div className={cn("min-h-0 flex-1", view !== "list" && "hidden")}>
            {sidebar}
          </div>
          <div
            className={cn(
              "min-h-0 flex-1",
              view !== "conversation" && "hidden",
            )}
          >
            {conversation}
          </div>
          {view === "map" && <div className="min-h-0 flex-1">{map}</div>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-w-0 flex-1"
            defaultLayout={
              mapMinimized
                ? minimizedLayout.defaultLayout
                : layout.defaultLayout
            }
            onLayoutChanged={
              mapMinimized
                ? minimizedLayout.onLayoutChanged
                : layout.onLayoutChanged
            }
          >
            <ResizablePanel
              id="sidebar"
              defaultSize="18"
              minSize={180}
              maxSize="30"
            >
              {sidebar}
            </ResizablePanel>
            <ResizableHandle aria-label="Resize the sidebar" />
            <ResizablePanel id="chat" minSize={360}>
              {conversation}
            </ResizablePanel>
            {!mapMinimized && (
              <>
                <ResizableHandle aria-label="Resize the map" />
                <ResizablePanel id="map" defaultSize="40" minSize={240}>
                  {map}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
          {mapMinimized && (
            <BranchStrip
              graph={graph}
              branch={branch}
              inView={turnsInView}
              onReveal={revealTurn}
              onRestore={() => {
                minimizeMap(false);
              }}
              restoreRef={restoreMapRef}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A summary being written, shown after the answer it ends at. */
interface PendingSummary {
  readonly toId: NodeId;
  readonly text: string;
  /** Attached to the message being written once it is finished. */
  readonly attach: boolean;
}

/** The first message of the branch that ends at `id`. */
function firstTurnOf(graph: ConversationGraph, id: NodeId): NodeId | undefined {
  const path = pathTo(graph, id);
  return path.ok ? path.value[0]?.id : undefined;
}

const editingNotice: Readonly<Record<Editing["kind"], string>> = {
  edit: "Editing creates a new version of the message; the original stays in the conversation.",
  branch:
    "New branch from the selected answer. The model sees the conversation up to that answer, and nothing after it.",
  root: "New first message. The model sees only this message and what you attach to it, such as summaries of other branches.",
};

const cancelLabel: Readonly<Record<Editing["kind"], string>> = {
  edit: "Cancel editing",
  branch: "Cancel branch",
  root: "Cancel new message",
};

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

/**
 * Topics are found by the model that writes titles, which the user chose
 * for short helper requests, or else by the first model.
 */
function sessionTopicModel(
  settings: ProviderSettings | null,
): TopicModel | null {
  const model = settings?.titleModel ?? settings?.models[0];
  if (settings === null || model === undefined) return null;
  return {
    adapter: createAdapter(settings),
    model,
    contextWindow: settings.contextWindows?.[model],
  };
}
