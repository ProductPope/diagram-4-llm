import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  describeImportError,
  err,
  importConversation,
  ok,
  type ConversationGraph,
  type Result,
} from "@diagram-4-llm/core";

/** Where the server reads from. Nothing is ever written. */
export interface Sources {
  /** A folder of conversations exported from the app, or null for none. */
  readonly conversationsDir: string | null;
  /** Where Claude Code keeps session transcripts, normally ~/.claude/projects. */
  readonly claudeProjectsDir: string;
}

export interface LoadedConversation {
  readonly file: string;
  readonly graph: ConversationGraph;
}

/** A file or folder that could not be read, and why. */
export interface FileProblem {
  readonly file: string;
  readonly message: string;
}

export interface SessionFile {
  /** Relative to the projects folder: `<project>/<session>.jsonl`. */
  readonly path: string;
  readonly project: string;
  readonly modified: Date;
  readonly bytes: number;
}

/** Exports are JSON files; any name is read, since people rename them. */
const EXPORT_SUFFIX = ".json";

/**
 * Reads every exported conversation in the folder. Each file goes through
 * the core's import, which checks every node, so a damaged file is
 * reported instead of partly read. The folder is read again on every call,
 * so a new export is seen without restarting the server.
 */
export async function loadConversations(dir: string): Promise<{
  readonly conversations: readonly LoadedConversation[];
  readonly problems: readonly FileProblem[];
}> {
  const names = await listFolder(dir);
  if (!names.ok)
    return {
      conversations: [],
      problems: [{ file: dir, message: names.error }],
    };

  const conversations: LoadedConversation[] = [];
  const problems: FileProblem[] = [];
  for (const name of names.value.filter((n) => n.endsWith(EXPORT_SUFFIX))) {
    const text = await readText(join(dir, name));
    if (!text.ok) {
      problems.push({ file: name, message: text.error });
      continue;
    }
    let document: unknown;
    try {
      document = JSON.parse(text.value);
    } catch (error) {
      problems.push({
        file: name,
        message: `Not valid JSON: ${messageOf(error)}`,
      });
      continue;
    }
    const imported = importConversation(document);
    if (imported.ok) conversations.push({ file: name, graph: imported.value });
    else
      problems.push({
        file: name,
        message: describeImportError(imported.error),
      });
  }
  return { conversations, problems };
}

/** Session transcripts in every project folder, most recently changed first. */
export async function listSessionFiles(dir: string): Promise<{
  readonly sessions: readonly SessionFile[];
  readonly problems: readonly FileProblem[];
}> {
  const projects = await listFolder(dir);
  if (!projects.ok)
    return { sessions: [], problems: [{ file: dir, message: projects.error }] };

  const sessions: SessionFile[] = [];
  const problems: FileProblem[] = [];
  for (const project of projects.value) {
    const files = await listFolder(join(dir, project));
    // Other entries of ~/.claude/projects, if any, are not project folders.
    if (!files.ok) continue;
    for (const name of files.value.filter((n) => n.endsWith(".jsonl"))) {
      const path = join(project, name);
      try {
        const info = await stat(join(dir, path));
        sessions.push({
          path: path.split(sep).join("/"),
          project,
          modified: info.mtime,
          bytes: info.size,
        });
      } catch (error) {
        problems.push({ file: path, message: messageOf(error) });
      }
    }
  }
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return { sessions, problems };
}

/**
 * Reads a transcript named by its path relative to the projects folder.
 * Paths that lead outside the folder, also through a link, are refused,
 * so a tool call cannot read other files of the user.
 */
export async function readSessionFile(
  dir: string,
  path: string,
): Promise<Result<string, string>> {
  if (!path.endsWith(".jsonl"))
    return err("A session transcript ends with .jsonl.");
  let root: string;
  let file: string;
  try {
    root = await realpath(dir);
    file = await realpath(join(dir, path));
  } catch (error) {
    return err(messageOf(error));
  }
  const inside = relative(root, file);
  if (inside === "" || inside.startsWith("..") || inside.startsWith(sep))
    return err("The path is outside the Claude Code projects folder.");
  return readText(file);
}

async function listFolder(dir: string): Promise<Result<string[], string>> {
  try {
    return ok((await readdir(dir)).sort());
  } catch (error) {
    return err(messageOf(error));
  }
}

async function readText(file: string): Promise<Result<string, string>> {
  try {
    return ok(await readFile(file, "utf8"));
  } catch (error) {
    return err(messageOf(error));
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
