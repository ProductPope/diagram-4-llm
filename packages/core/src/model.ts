/** Unique node identifier, supplied by the caller (UUIDv7 in the web app). */
export type NodeId = string;

/** ISO 8601 timestamp in UTC, for example `2026-10-05T12:00:00.000Z`. */
export type ISODate = string;

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: ISODate;
}

export interface UserTurn {
  readonly kind: "user";
  readonly id: NodeId;
  readonly conversationId: string;
  /** `null` when this turn starts a new root. */
  readonly parentId: NodeId | null;
  readonly content: string;
  /** Extra context attached to this turn, in the order it is sent. */
  readonly refs: readonly NodeId[];
  readonly createdAt: ISODate;
}

export type AssistantStatus = "streaming" | "complete" | "aborted" | "error";

export interface AssistantTurn {
  readonly kind: "assistant";
  readonly id: NodeId;
  readonly conversationId: string;
  readonly parentId: NodeId;
  /** Partial while streaming, and kept as-is if the turn is aborted or fails. */
  readonly content: string;
  readonly status: AssistantStatus;
  readonly error?: ProviderErrorInfo;
  readonly generation: GenerationRecord;
  readonly createdAt: ISODate;
}

export interface SummaryNode {
  readonly kind: "summary";
  readonly id: NodeId;
  readonly conversationId: string;
  /** Path segment from `fromId` down to `toId`, both inclusive. */
  readonly covers: { readonly fromId: NodeId; readonly toId: NodeId };
  readonly content: string;
  /** Set when this summary is a user edit of another summary. */
  readonly revises?: NodeId;
  /** Absent when the summary was written by hand. */
  readonly generation?: GenerationRecord;
  readonly createdAt: ISODate;
}

export type TurnNode = UserTurn | AssistantTurn;
export type GraphNode = TurnNode | SummaryNode;

export type AdapterId = "anthropic" | "openai-compatible";

export interface GenerationParams {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface GenerationRecord {
  readonly adapter: AdapterId;
  /** Endpoint for `openai-compatible` adapters. */
  readonly baseUrl?: string;
  readonly model: string;
  readonly params: GenerationParams;
  readonly systemPrompt: string | null;
  readonly manifest: ContextManifest;
  /** As reported by the provider, when it reports it. */
  readonly usage?: TokenUsage;
}

export interface ContextManifestEntry {
  readonly nodeId: NodeId;
  readonly via: "path" | "ref";
}

export interface ContextManifest {
  readonly entries: readonly ContextManifestEntry[];
  /** Heuristic estimate, not a tokenizer count. See `estimateTokens`. */
  readonly estimatedInputTokens: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ProviderErrorInfo {
  readonly code: string;
  readonly message: string;
}

/** Presentation state. Never affects what is sent to a model. */
export interface NodeMeta {
  readonly title?: string;
  readonly collapsed?: boolean;
}
