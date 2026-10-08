# @diagram-4-llm/mcp

A local MCP server that lets agents such as Claude Code or Claude Desktop
read your diagram-4-llm conversations and Claude Code sessions. It runs on
your computer, talks MCP over standard input and output, and only reads
files ([ADR 0010](../../docs/adr/0010-local-mcp-server.md)).

It reads two folders:

- **Exported conversations** (`--conversations <folder>`): the files the
  app's "Export conversation" saves. The app keeps conversations in the
  browser, where no other program can read them, so the server sees a
  conversation once it is exported to this folder. Exporting again
  replaces what it sees. Without this option the conversation tools are
  not offered.
- **Claude Code sessions** (`--claude-projects <folder>`, default
  `~/.claude/projects`): the transcripts Claude Code keeps for each
  session. Nothing outside this folder is read.

Both folders are read again on every call.

## Tools

| Tool                        | What it returns                                                                   |
| --------------------------- | --------------------------------------------------------------------------------- |
| `list_conversations`        | Exported conversations with their IDs, turn and branch counts.                    |
| `read_conversation_map`     | A conversation's tree, one turn per line, with the current summaries.             |
| `read_branch`               | The branch up to a turn as the model saw it, with attachments in place.           |
| `list_claude_code_sessions` | Session transcripts, most recently changed first.                                 |
| `read_claude_code_session`  | A session's map of prompts, answers and compactions, or one branch of it in full. |

## Set up

Build it from a clone of the repository:

```sh
pnpm install
pnpm build
```

Add it to Claude Code for all your projects:

```sh
claude mcp add --transport stdio --scope user diagram-4-llm -- \
  node /path/to/diagram-4-llm/packages/mcp/dist/main.js \
  --conversations ~/Documents/diagram-4-llm
```

For Claude Desktop, add the same command to the `mcpServers` section of
its configuration:

```json
{
  "mcpServers": {
    "diagram-4-llm": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/diagram-4-llm/packages/mcp/dist/main.js",
        "--conversations",
        "/Users/you/Documents/diagram-4-llm"
      ]
    }
  }
}
```

Session transcripts can contain anything that passed through a tool,
including secrets. An agent with this server can read every session in
the projects folder, so add it only to agents you would let read them.
