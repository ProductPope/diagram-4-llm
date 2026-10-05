const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Reads a server-sent events body and yields the `data` payload of each
 * event. Multi-line data is joined with "\n", comment lines and other
 * fields are ignored, and "\n", "\r\n" and "\r" line endings are all
 * accepted, as the HTML specification requires. If the consumer stops
 * early, the body is cancelled so the request does not keep streaming.
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let data: string[] = [];
  let finished = false;

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      for (;;) {
        const match = LINE_BREAK.exec(buffer);
        if (match === null) break;
        // A "\r" at the very end may be the first half of a "\r\n" split
        // across chunks, so wait for more input before deciding.
        if (!finished && match[0] === "\r" && match.index === buffer.length - 1)
          break;

        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (line === "") {
          if (data.length > 0) yield data.join("\n");
          data = [];
        } else {
          const value = dataValue(line);
          if (value !== null) data.push(value);
        }
      }
    }

    // The specification discards an event that is not followed by a blank
    // line, but servers often omit it after the last event; keep it.
    const value = buffer === "" ? null : dataValue(buffer);
    if (value !== null) data.push(value);
    if (data.length > 0) yield data.join("\n");
  } finally {
    if (!finished) await reader.cancel();
    reader.releaseLock();
  }
}

/** The value of a `data` field line, or null for any other line. */
function dataValue(line: string): string | null {
  if (line === "data") return "";
  if (!line.startsWith("data:")) return null;
  return line.slice(line.startsWith("data: ") ? 6 : 5);
}
