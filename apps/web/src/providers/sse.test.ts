// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { readServerSentEvents } from "./sse";
import { collect, streamedResponse } from "./test-support/responses";

function bodyOf(
  text: string,
  chunkSizes?: readonly number[],
): ReadableStream<Uint8Array> {
  const response = streamedResponse(
    text,
    chunkSizes === undefined ? {} : { chunkSizes },
  );
  if (response.body === null) throw new Error("response has no body");
  return response.body;
}

describe("readServerSentEvents", () => {
  it("yields the data of each event and ignores other fields and comments", async () => {
    const text =
      ": keep-alive\nevent: delta\nid: 1\ndata: one\n\ndata: two\n\n";
    expect(await collect(readServerSentEvents(bodyOf(text)))).toEqual([
      "one",
      "two",
    ]);
  });

  it("joins multi-line data with newlines", async () => {
    expect(
      await collect(readServerSentEvents(bodyOf("data: a\ndata: b\n\n"))),
    ).toEqual(["a\nb"]);
  });

  it("accepts CRLF and CR line endings", async () => {
    expect(
      await collect(
        readServerSentEvents(bodyOf("data: a\r\n\r\ndata: b\r\rdata: c\n\n")),
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("keeps the leading space only when there is more than one", async () => {
    expect(
      await collect(
        readServerSentEvents(bodyOf("data:x\n\ndata:  y\n\ndata\n\n")),
      ),
    ).toEqual(["x", " y", ""]);
  });

  it("delivers a final event that has no trailing blank line", async () => {
    expect(
      await collect(readServerSentEvents(bodyOf("data: one\n\ndata: last"))),
    ).toEqual(["one", "last"]);
  });

  it("decodes multi-byte characters split across chunks", async () => {
    expect(
      await collect(readServerSentEvents(bodyOf("data: zażółć 🌳\n\n", [1]))),
    ).toEqual(["zażółć 🌳"]);
  });

  it("yields the same events however the body is split into chunks", async () => {
    const payload = fc
      .string({ unit: "grapheme", maxLength: 8 })
      .filter((s) => !/[\r\n]/.test(s));
    const lineBreak = fc.constantFrom("\n", "\r\n", "\r");
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(payload, lineBreak), { minLength: 1, maxLength: 6 }),
        fc.array(fc.integer({ min: 1, max: 7 }), {
          minLength: 1,
          maxLength: 5,
        }),
        async (events, chunkSizes) => {
          const text = events
            .map(([data, br]) => `data: ${data}${br}${br}`)
            .join("");
          const whole = await collect(readServerSentEvents(bodyOf(text)));
          const chunked = await collect(
            readServerSentEvents(bodyOf(text, chunkSizes)),
          );
          expect(chunked).toEqual(whole);
          expect(whole).toEqual(events.map(([data]) => data));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("cancels the body when the consumer stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const data of readServerSentEvents(body)) {
      expect(data).toBe("first");
      break;
    }
    expect(cancelled).toBe(true);
  });
});
