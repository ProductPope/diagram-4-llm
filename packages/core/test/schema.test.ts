// The published JSON Schema is generated from the runtime schema. This test
// fails when they drift apart. Regenerate with `pnpm --filter @diagram-4-llm/core schema`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";
import { z } from "zod";

import { conversationDocumentSchema } from "../src/index.js";

const schemaPath = fileURLToPath(
  new URL("../schema/conversation.v1.schema.json", import.meta.url),
);

it("matches the committed JSON Schema", () => {
  const generated = `${JSON.stringify(
    z.toJSONSchema(conversationDocumentSchema, { target: "draft-2020-12" }),
    null,
    2,
  )}\n`;
  if (process.env.UPDATE_SCHEMA === "1") writeFileSync(schemaPath, generated);
  expect(readFileSync(schemaPath, "utf8")).toBe(generated);
});
