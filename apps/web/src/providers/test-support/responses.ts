/** A streamed HTTP response whose body arrives in chunks of the given sizes. */
export function streamedResponse(
  body: string,
  options: {
    status?: number;
    chunkSizes?: readonly number[];
    contentType?: string;
  } = {},
): Response {
  const bytes = new TextEncoder().encode(body);
  const sizes = options.chunkSizes ?? [bytes.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let offset = 0;
      let i = 0;
      while (offset < bytes.length) {
        const size = Math.max(1, sizes[i % sizes.length] ?? bytes.length);
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
        i += 1;
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: options.status ?? 200,
    headers: { "content-type": options.contentType ?? "text/event-stream" },
  });
}

/** Formats payloads as server-sent events, optionally with event names. */
export function sse(
  events: readonly (string | { event: string; data: unknown })[],
): string {
  return events
    .map((e) =>
      typeof e === "string"
        ? `data: ${e}\n\n`
        : `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
    )
    .join("");
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

export function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/** The JSON body of a request made by an adapter. Adapters always send strings. */
export function jsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string")
    throw new Error("Expected a string request body.");
  return JSON.parse(init.body);
}
