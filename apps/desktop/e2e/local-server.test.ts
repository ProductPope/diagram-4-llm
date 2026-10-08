import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { withApp } from "./driver.ts";

/**
 * An OpenAI-compatible server that, like a local one with no CORS setup,
 * sends no CORS headers: a page could not read its answers.
 */
function startServer() {
  const seen: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    seen.push(request.headers);
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "local-model" }] }));
      return;
    }
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      chunk({ content: "Hello from the local server." }, null) +
        chunk({}, "stop") +
        "data: [DONE]\n\n",
    );
  });
  return new Promise<{
    readonly url: string;
    readonly seen: readonly IncomingHttpHeaders[];
    readonly close: () => void;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${String(port)}/v1`,
        seen,
        close: () => server.close(),
      });
    });
  });
}

void test("talks to a local server that has no CORS setup", async () => {
  const server = await startServer();
  try {
    await withApp(async ({ until, type, click }) => {
      await click("Settings");
      await until(
        `return document.querySelector("#settings-base-url") !== null`,
      );
      await type("#settings-base-url", server.url);
      await type("#settings-api-key", "");
      await type("#settings-models", "local-model");
      await click("Save");
      await type("#composer-input", "Hello");
      await click("Send");
      await until(
        `return document.body.textContent.includes("Hello from the local server.")`,
      );
    });
    // The app sends no Origin, as other local clients do.
    assert.ok(server.seen.length > 0);
    for (const headers of server.seen) assert.equal(headers.origin, undefined);
  } finally {
    server.close();
  }
});
