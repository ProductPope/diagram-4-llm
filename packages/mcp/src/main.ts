#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createServer } from "./server.js";

const USAGE = `Usage: diagram-4-llm-mcp [--conversations <folder>] [--claude-projects <folder>]

  --conversations    A folder of conversations exported from diagram-4-llm.
  --claude-projects  Where Claude Code keeps sessions (default ~/.claude/projects).

The server talks MCP over standard input and output and only reads files.`;

let options;
try {
  options = parseArgs({
    options: {
      conversations: { type: "string" },
      "claude-projects": { type: "string" },
      help: { type: "boolean" },
    },
  }).values;
} catch (error) {
  // Standard output carries the protocol, so messages go to standard error.
  console.error(
    `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
  );
  process.exit(2);
}

if (options.help === true) {
  console.error(USAGE);
  process.exit(0);
}

const sources = {
  conversationsDir: options.conversations ?? null,
  claudeProjectsDir:
    options["claude-projects"] ?? join(homedir(), ".claude", "projects"),
};
serveStdio(() => createServer(sources));
