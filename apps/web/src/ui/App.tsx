import {
  createConversation,
  describeGraphError,
  isUsable,
  type ConversationGraph,
  type GraphError,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";
import { useEffect, useState } from "react";

import { visibleBranch } from "../app/branch";
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
import {
  describeStorageError,
  type ConversationStore,
  type ConversationSummary,
  type StorageResult,
} from "../storage/conversation-store";
import { Composer } from "./Composer";
import { ContextInspector } from "./ContextInspector";
import { ReadingPane } from "./ReadingPane";
import { SettingsForm } from "./SettingsForm";

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
  const [current, setCurrent] = useState<Store<ConversationGraph> | null>(null);
  const [anchor, setAnchor] = useState<NodeId | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const graph = useStoreValue(current);

  useEffect(() => {
    void openStore().then(async (opened) => {
      if (!opened.ok) {
        setStorage({
          status: "failed",
          message: describeStorageError(opened.error),
        });
        return;
      }
      setStorage({ status: "ready", store: opened.value });
      const listed = await opened.value.list();
      if (listed.ok) setConversations(listed.value);
      else setError(describeStorageError(listed.error));
    });
  }, [openStore]);

  // Saves at most every SAVE_DELAY_MS while the conversation changes, so a
  // long streamed answer is saved as it arrives, and immediately when
  // switching away.
  useEffect(() => {
    if (current === null || storage.status !== "ready") return;
    const store = storage.store;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = async () => {
      timer = undefined;
      const saved = await store.save(current.get(), env.now());
      if (!saved.ok) {
        setError(describeStorageError(saved.error));
        return;
      }
      const listed = await store.list();
      if (listed.ok) setConversations(listed.value);
    };
    const unsubscribe = current.subscribe(() => {
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

  const busy = controller !== null;
  const branch = graph === null ? [] : visibleBranch(graph, anchor);
  const parentId = editing !== null ? editing.parentId : continuationOf(branch);
  const blockedReason =
    settings === null
      ? "Configure a provider in Settings before sending."
      : parentId === undefined
        ? "The last answer is unfinished or failed. Regenerate it or edit your message to continue."
        : null;

  const generation = (configured: ProviderSettings): GenerationSettings => ({
    adapter: createAdapter(configured),
    ...(configured.adapter === "openai-compatible"
      ? { baseUrl: configured.baseUrl }
      : {}),
    model: configured.model,
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
    run(async (signal) =>
      sendMessage(
        store,
        { parentId, refs: [], content },
        generation(settings),
        env,
        signal,
      ),
    );
  };

  const regenerate = (userTurnId: NodeId) => {
    if (settings === null || current === null) return;
    const store = current;
    setAnchor(userTurnId);
    run(async (signal) =>
      generateAnswer(store, userTurnId, generation(settings), env, signal),
    );
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
    setCurrent(createStore(loaded.value));
    setAnchor(null);
    setEditing(null);
  };

  const newConversation = () => {
    if (busy) return;
    setCurrent(null);
    setAnchor(null);
    setEditing(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>diagram-4-llm</h1>
        <button
          type="button"
          onClick={() => {
            setShowSettings(true);
          }}
        >
          Settings
        </button>
      </header>

      <nav className="sidebar" aria-label="Conversations">
        <button type="button" onClick={newConversation} disabled={busy}>
          New conversation
        </button>
        {storage.status === "failed" && (
          <p role="alert">Conversations cannot be saved: {storage.message}</p>
        )}
        {conversations.length === 0 ? (
          <p>No conversations yet.</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={
                    graph?.conversation.id === c.id ? "page" : undefined
                  }
                  disabled={busy}
                  onClick={() => void openConversation(c.id)}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <main className="main">
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
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
          />
        ) : (
          <>
            {graph === null ? (
              <p className="empty">Start a new conversation below.</p>
            ) : (
              <ReadingPane
                graph={graph}
                branch={branch}
                busy={busy}
                onSelect={setAnchor}
                onEdit={startEditing}
                onRegenerate={regenerate}
              />
            )}
            {editing !== null && (
              <p className="editing">
                Editing creates a new version of the message; the original stays
                in the conversation.{" "}
                <button type="button" onClick={cancelEditing}>
                  Cancel editing
                </button>
              </p>
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
              onChange={setDraft}
              onSend={send}
              onStop={() => {
                controller?.abort();
              }}
            />
          </>
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
