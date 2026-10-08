// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type {
  ChatRequest,
  ProviderAdapter,
  StreamEvent,
} from "../providers/types";
import { detectTopics, parseTopics, topicMessage } from "./topics";

const ITEMS = [
  { id: "p1", text: "The build fails" },
  { id: "p2", text: "Fix the type error" },
  { id: "p3", text: "Now write the release notes" },
];

function scriptedAdapter(
  events: readonly StreamEvent[],
  requests: ChatRequest[] = [],
): ProviderAdapter {
  return {
    id: "anthropic",
    async *stream(request) {
      requests.push(request);
      for (const event of events) {
        await Promise.resolve();
        yield event;
      }
    },
  };
}

describe("detectTopics", () => {
  it("sends the numbered prompts and reads the topics back", async () => {
    const requests: ChatRequest[] = [];
    const result = await detectTopics(
      ITEMS,
      scriptedAdapter(
        [
          { type: "text", text: "1: Failing build\n" },
          { type: "text", text: "3: Release notes" },
          { type: "done", stopReason: "end" },
        ],
        requests,
      ),
      "helper",
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { title: "Failing build", itemIds: ["p1", "p2"] },
        { title: "Release notes", itemIds: ["p3"] },
      ],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.model).toBe("helper");
    expect(requests[0]?.context.messages).toEqual([
      {
        role: "user",
        content:
          "1. The build fails\n2. Fix the type error\n3. Now write the release notes",
      },
    ]);
  });

  it("passes on provider errors and stops quietly when aborted", async () => {
    const error = { code: "rate-limited", message: "Slow down." };
    expect(
      await detectTopics(
        ITEMS,
        scriptedAdapter([{ type: "error", error }]),
        "helper",
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, error });
    expect(
      await detectTopics(
        ITEMS,
        scriptedAdapter([{ type: "aborted" }]),
        "helper",
        new AbortController().signal,
      ),
    ).toEqual({ ok: true, value: null });
  });

  it("asks nothing when there are no prompts", async () => {
    const requests: ChatRequest[] = [];
    const result = await detectTopics(
      [],
      scriptedAdapter([], requests),
      "helper",
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });
});

describe("topicMessage", () => {
  it("lists the start of each prompt on one line", () => {
    const long = `${"word ".repeat(100)}\n\nlog line`;
    const [line] = topicMessage([{ id: "p", text: long }]).split("\n");
    expect(line).toHaveLength(303);
    expect(line?.endsWith("…")).toBe(true);
  });
});

describe("parseTopics", () => {
  it("skips lines that are not topics and the markers models add", () => {
    expect(
      parseTopics('Topics:\n- 1. "Failing build"\n\n2) Fixing it', ITEMS),
    ).toEqual({
      ok: true,
      value: [
        { title: "Failing build", itemIds: ["p1"] },
        { title: "Fixing it", itemIds: ["p2", "p3"] },
      ],
    });
  });

  it("reports replies that do not cover the prompts in order", () => {
    for (const reply of [
      "",
      "No topics here.",
      "2: Fixing it",
      "1: Build\n1: Again",
      "1: Build\n3: Notes\n2: Fix",
      "1: Build\n4: Beyond the end",
    ])
      expect(parseTopics(reply, ITEMS).ok).toBe(false);
  });

  it("covers every prompt once, in order, for any topics that move forward", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            // Topic starts after the first, as prompt numbers from 2 up.
            later: fc.uniqueArray(fc.integer({ min: 2, max: count }), {
              maxLength: count - 1,
            }),
          }),
        ),
        ({ count, later }) => {
          const items = Array.from({ length: count }, (_, i) => ({
            id: `p${String(i)}`,
            text: `prompt ${String(i)}`,
          }));
          const starts = [1, ...later.sort((a, b) => a - b)];
          const reply = starts.map((s) => `${String(s)}: topic`).join("\n");
          const parsed = parseTopics(reply, items);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.value).toHaveLength(starts.length);
          expect(parsed.value.flatMap((topic) => topic.itemIds)).toEqual(
            items.map((item) => item.id),
          );
        },
      ),
    );
  });
});
