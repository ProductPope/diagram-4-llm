import {
  describeGraphError,
  exportConversation,
  finishAssistantTurn,
  importConversation,
  type ConversationDocument,
  type ConversationGraph,
  type ImportError,
  type ISODate,
} from "@diagram-4-llm/core";

export const DATABASE_NAME = "diagram-4-llm";
const DATABASE_VERSION = 1;
const STORE = "conversations";

/** One row per conversation. The document is the exported format. */
interface ConversationRecord {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: ISODate;
  readonly document: ConversationDocument;
}

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: ISODate;
}

export type StorageError =
  | { readonly code: "unavailable"; readonly message: string }
  | { readonly code: "not-found"; readonly id: string }
  | { readonly code: "corrupt"; readonly id: string; readonly message: string }
  | { readonly code: "io"; readonly message: string };

export type StorageResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: StorageError };

export function describeStorageError(error: StorageError): string {
  switch (error.code) {
    case "unavailable":
    case "io":
      return error.message;
    case "not-found":
      return `Conversation ${error.id} was not found.`;
    case "corrupt":
      return `Conversation ${error.id} is damaged and was not loaded: ${error.message}`;
  }
}

export interface ConversationStore {
  list(): Promise<StorageResult<ConversationSummary[]>>;
  /**
   * Loads a conversation through the same validation as a file import. Turns
   * left streaming by an earlier session are marked aborted, because no
   * request is still delivering them.
   */
  load(id: string): Promise<StorageResult<ConversationGraph>>;
  /** Replaces the stored conversation in a single transaction. */
  save(
    graph: ConversationGraph,
    updatedAt: ISODate,
  ): Promise<StorageResult<void>>;
  remove(id: string): Promise<StorageResult<void>>;
}

/**
 * Stores each conversation as one exported document (ARCHITECTURE section
 * 5). Writing whole documents keeps every save atomic and lets loading reuse
 * the import validation, at the cost of rewriting a conversation on each
 * save; conversations are small enough for that to be cheap.
 */
export async function openConversationStore(
  factory: IDBFactory = indexedDB,
): Promise<StorageResult<ConversationStore>> {
  const opened = await openDatabase(factory);
  if (!opened.ok) return opened;
  const db = opened.value;

  return {
    ok: true,
    value: {
      async list() {
        const records = await run<ConversationRecord[]>(
          db,
          "readonly",
          (store) => store.getAll(),
        );
        if (!records.ok) return records;
        const summaries = records.value
          .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { ok: true, value: summaries };
      },

      async load(id) {
        const record = await run<ConversationRecord | undefined>(
          db,
          "readonly",
          (store) => store.get(id),
        );
        if (!record.ok) return record;
        if (record.value === undefined)
          return { ok: false, error: { code: "not-found", id } };

        const imported = importConversation(record.value.document);
        if (!imported.ok) {
          return {
            ok: false,
            error: {
              code: "corrupt",
              id,
              message: describeImportError(imported.error),
            },
          };
        }
        return { ok: true, value: abortInterruptedTurns(imported.value) };
      },

      async save(graph, updatedAt) {
        const record: ConversationRecord = {
          id: graph.conversation.id,
          title: graph.conversation.title,
          updatedAt,
          document: exportConversation(graph),
        };
        const written = await run(db, "readwrite", (store) =>
          store.put(record),
        );
        return written.ok ? { ok: true, value: undefined } : written;
      },

      async remove(id) {
        const removed = await run(db, "readwrite", (store) => store.delete(id));
        return removed.ok ? { ok: true, value: undefined } : removed;
      },
    },
  };
}

function abortInterruptedTurns(graph: ConversationGraph): ConversationGraph {
  let result = graph;
  for (const node of graph.nodes.values()) {
    if (node.kind !== "assistant" || node.status !== "streaming") continue;
    const finished = finishAssistantTurn(result, node.id, {
      status: "aborted",
    });
    // The turn was found streaming in a valid graph, so finishing it cannot
    // fail; a failure here would be a bug in the core, not bad data.
    if (!finished.ok) throw new Error(describeGraphError(finished.error));
    result = finished.value;
  }
  return result;
}

export function describeImportError(error: ImportError): string {
  switch (error.code) {
    case "invalid-document":
      return error.issues;
    case "invalid-conversation":
      return describeGraphError(error.error);
    case "invalid-node":
      return `Node ${String(error.index)} (${error.nodeId}): ${describeGraphError(error.error)}`;
    case "invalid-meta":
      return `Metadata of ${error.nodeId}: ${describeGraphError(error.error)}`;
  }
}

function openDatabase(
  factory: IDBFactory,
): Promise<StorageResult<IDBDatabase>> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      resolve({
        ok: false,
        error: { code: "unavailable", message: messageOf(error) },
      });
      return;
    }
    request.onupgradeneeded = () => {
      // Version 1 creates the only store. Later versions add migrations here,
      // each with a test that upgrades a database of the previous version.
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version of the app in another tab upgrade the schema
      // instead of being blocked by this connection.
      db.onversionchange = () => {
        db.close();
      };
      resolve({ ok: true, value: db });
    };
    request.onerror = () => {
      resolve({
        ok: false,
        error: { code: "unavailable", message: messageOf(request.error) },
      });
    };
    request.onblocked = () => {
      resolve({
        ok: false,
        error: {
          code: "unavailable",
          message:
            "The database is open in another tab with an older version of the app.",
        },
      });
    };
  });
}

/** Runs one request in its own transaction and resolves when the transaction commits. */
function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest,
): Promise<StorageResult<T>> {
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    let request: IDBRequest;
    try {
      transaction = db.transaction(STORE, mode);
      request = makeRequest(transaction.objectStore(STORE));
    } catch (error) {
      resolve({ ok: false, error: { code: "io", message: messageOf(error) } });
      return;
    }
    transaction.oncomplete = () => {
      resolve({ ok: true, value: request.result as T });
    };
    transaction.onerror = () => {
      resolve({
        ok: false,
        error: { code: "io", message: messageOf(transaction.error) },
      });
    };
    transaction.onabort = () => {
      resolve({
        ok: false,
        error: { code: "io", message: messageOf(transaction.error) },
      });
    };
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
