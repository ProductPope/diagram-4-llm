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

## Session map pane in Claude Code

`plugin/` is a Claude Code plugin with a
[mod](https://code.claude.com/docs/en/plugins/mods/overview) that adds a
`/session-map` command. It opens a pane beside the transcript, or above the
prompt in a narrow terminal, with the map of the session you are in, the
same outline `read_claude_code_session` gives Claude. The pane follows the
session after each answer; press `r` to read it again. The plugin starts
its own copy of the server, so the session tools work without
`claude mcp add`.

Mods need Claude Code 2.1.287 or later, and draw only in the terminal and
the Code tab of the Desktop app. Elsewhere, such as `claude -p`,
`/session-map` prints the map instead. After `pnpm build`, load the
plugin for one session:

```sh
claude --plugin-dir /path/to/diagram-4-llm/packages/mcp/plugin
```

To load it in every session, add its absolute path to
`CLAUDE_CODE_PLUGIN_DIRS`. If Claude Code refuses the pane's call to the
server, as `claude -p` does until it is allowed, allow the tool with
`--allowedTools mcp__plugin_diagram-4-llm_diagram-4-llm__read_claude_code_session`
or the same name in the `permissions.allow` list of your settings.

The plugin points at `../dist/main.js`, so it runs from a clone and is
not installable from a marketplace.

Session transcripts can contain anything that passed through a tool,
including secrets. An agent with this server can read every session in
the projects folder, so add it only to agents you would let read them.
