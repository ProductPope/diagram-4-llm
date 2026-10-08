import { describe, expect, it } from "vitest";

import {
  describeImportError,
  exportConversation,
  importConversation,
  setNodeMeta,
  type ConversationDocument,
} from "../src/index.js";
import { answer, errorOf, newGraph, say, unwrap } from "./helpers.js";

function sampleDocument(): ConversationDocument {
  let graph = newGraph();
  graph = say(graph, "U1", null, "question");
  graph = answer(graph, "A1", "U1", "answer");
  graph = say(graph, "U2", "A1", "follow-up");
  graph = unwrap(setNodeMeta(graph, "U1", { title: "Start" }));
  return exportConversation(graph);
}

/** A JSON round trip, as when the document is saved to a file and read back. */
function viaJson(document: ConversationDocument): unknown {
  return JSON.parse(JSON.stringify(document));
}

describe("export and import", () => {
  it("round-trips through JSON without loss", () => {
    const document = sampleDocument();
    const imported = unwrap(importConversation(viaJson(document)));
    expect(exportConversation(imported)).toEqual(document);
  });

  it("rejects a document with an unknown format version", () => {
    const document = { ...sampleDocument(), formatVersion: 2 };
    expect(
      errorOf(
        importConversation(
          viaJson(document as unknown as ConversationDocument),
        ),
      ),
    ).toMatchObject({
      code: "invalid-document",
    });
  });

  it("rejects unknown fields instead of silently dropping them", () => {
    const document = viaJson(sampleDocument()) as {
      nodes: Record<string, unknown>[];
    };
    const first = document.nodes[0];
    if (first === undefined) throw new Error("fixture has no nodes");
    first.extra = true;
    expect(errorOf(importConversation(document))).toMatchObject({
      code: "invalid-document",
    });
  });

  it("rejects a node that points to a later node, which is how cycles would enter", () => {
    const document = sampleDocument();
    const [u1, a1, u2] = document.nodes;
    if (u1 === undefined || a1 === undefined || u2 === undefined)
      throw new Error("fixture changed");
    const reordered = { ...document, nodes: [u1, u2, a1] };
    expect(errorOf(importConversation(viaJson(reordered)))).toEqual({
      code: "invalid-node",
      index: 1,
      nodeId: "U2",
      error: { code: "unknown-node", id: "A1" },
    });
  });

  it("rejects a recorded context that does not match the graph", () => {
    const document = viaJson(sampleDocument()) as {
      nodes: { generation?: { manifest: { entries: unknown[] } } }[];
    };
    document.nodes[1]?.generation?.manifest.entries.pop();
    expect(errorOf(importConversation(document))).toMatchObject({
      code: "invalid-node",
      nodeId: "A1",
      error: { code: "manifest-mismatch" },
    });
  });

  it("rejects a stop reason or error that does not match the status", () => {
    for (const change of [
      { status: "aborted" },
      { stopReason: undefined },
      { error: { code: "x", message: "y" } },
    ]) {
      const document = viaJson(sampleDocument()) as {
        nodes: Record<string, unknown>[];
      };
      const answer = document.nodes[1];
      if (answer === undefined) throw new Error("fixture has no answer");
      Object.assign(answer, change);
      if (answer.stopReason === undefined) delete answer.stopReason;
      expect(errorOf(importConversation(document))).toMatchObject({
        code: "invalid-node",
        nodeId: "A1",
        error: { code: "inconsistent-status", id: "A1" },
      });
    }
  });

  it("names the failing node or field when describing a rejection", () => {
    expect(
      describeImportError({
        code: "invalid-node",
        index: 1,
        nodeId: "U2",
        error: { code: "unknown-node", id: "A1" },
      }),
    ).toMatch(/^Node 1 \(U2\): .*A1/);
    expect(
      describeImportError({ code: "invalid-document", issues: "✖ format" }),
    ).toBe("✖ format");
  });

  it("rejects metadata for a node that does not exist", () => {
    const document = { ...sampleDocument(), meta: { ghost: { title: "x" } } };
    expect(errorOf(importConversation(viaJson(document)))).toEqual({
      code: "invalid-meta",
      nodeId: "ghost",
      error: { code: "unknown-node", id: "ghost" },
    });
  });

  it("rejects nodes from another conversation", () => {
    const document = viaJson(sampleDocument()) as {
      nodes: { conversationId: string }[];
    };
    const first = document.nodes[0];
    if (first === undefined) throw new Error("fixture has no nodes");
    first.conversationId = "other";
    expect(errorOf(importConversation(document))).toMatchObject({
      code: "invalid-node",
      error: { code: "conversation-mismatch" },
    });
  });
});
