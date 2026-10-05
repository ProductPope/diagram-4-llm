import { z } from "zod";

import type {
  AssistantTurn,
  ContextManifest,
  Conversation,
  GenerationRecord,
  NodeMeta,
  SummaryNode,
  UserTurn,
} from "./model.js";

// Runtime schemas for the types in model.ts. `satisfies` keeps the concrete
// schema types (needed by discriminatedUnion) while making the compiler check
// that each schema produces the corresponding model type.

const id = z.string().min(1);
const isoDate = z.iso.datetime();
const tokenCount = z.number().int().nonnegative();
const nonEmptyText = z.string().min(1);

export const conversationSchema = z.strictObject({
  id,
  title: z.string(),
  createdAt: isoDate,
}) satisfies z.ZodType<Conversation>;

const manifestSchema = z.strictObject({
  entries: z.array(
    z.strictObject({ nodeId: id, via: z.enum(["path", "ref"]) }),
  ),
  estimatedInputTokens: tokenCount,
}) satisfies z.ZodType<ContextManifest>;

const generationSchema = z.strictObject({
  adapter: z.enum(["anthropic", "openai-compatible"]),
  baseUrl: z.exactOptional(z.url()),
  model: nonEmptyText,
  params: z.strictObject({
    temperature: z.exactOptional(z.number().nonnegative()),
    maxOutputTokens: z.exactOptional(z.number().int().positive()),
  }),
  systemPrompt: z.string().nullable(),
  manifest: manifestSchema,
  usage: z.exactOptional(
    z.strictObject({ inputTokens: tokenCount, outputTokens: tokenCount }),
  ),
}) satisfies z.ZodType<GenerationRecord>;

export const userTurnSchema = z.strictObject({
  kind: z.literal("user"),
  id,
  conversationId: id,
  parentId: id.nullable(),
  content: z.string(),
  refs: z.array(id),
  createdAt: isoDate,
}) satisfies z.ZodType<UserTurn>;

export const assistantTurnSchema = z.strictObject({
  kind: z.literal("assistant"),
  id,
  conversationId: id,
  parentId: id,
  content: z.string(),
  status: z.enum(["streaming", "complete", "aborted", "error"]),
  stopReason: z.exactOptional(
    z.enum(["end", "max-tokens", "refusal", "other"]),
  ),
  error: z.exactOptional(
    z.strictObject({ code: nonEmptyText, message: z.string() }),
  ),
  generation: generationSchema,
  createdAt: isoDate,
}) satisfies z.ZodType<AssistantTurn>;

export const summaryNodeSchema = z.strictObject({
  kind: z.literal("summary"),
  id,
  conversationId: id,
  covers: z.strictObject({ fromId: id, toId: id }),
  content: z.string(),
  revises: z.exactOptional(id),
  generation: z.exactOptional(generationSchema),
  createdAt: isoDate,
}) satisfies z.ZodType<SummaryNode>;

export const graphNodeSchema = z.discriminatedUnion("kind", [
  userTurnSchema,
  assistantTurnSchema,
  summaryNodeSchema,
]);

export const nodeMetaSchema = z.strictObject({
  title: z.exactOptional(z.string()),
  collapsed: z.exactOptional(z.boolean()),
}) satisfies z.ZodType<NodeMeta>;
