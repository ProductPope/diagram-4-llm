import { Button } from "#components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#components/ui/dropdown-menu";
import { Input } from "#components/ui/input";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ConversationSummary } from "../storage/conversation-store";

interface Props {
  readonly conversations: readonly ConversationSummary[];
  readonly currentId: string | undefined;
  readonly busy: boolean;
  readonly onOpen: (id: string) => void;
  readonly onRename: (id: string, title: string) => void;
  readonly onDelete: (id: string) => void;
}

type Action =
  | { readonly kind: "rename"; readonly id: string; readonly title: string }
  | { readonly kind: "delete"; readonly id: string };

/**
 * The saved conversations, newest first. Each has a menu to rename or
 * delete it; deleting asks for confirmation in place, because a modal
 * dialog would need styles the Content Security Policy blocks.
 */
export function ConversationList({
  conversations,
  currentId,
  busy,
  onOpen,
  onRename,
  onDelete,
}: Props) {
  const [action, setAction] = useState<Action | null>(null);

  if (conversations.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No conversations yet.
      </p>
    );
  }

  const finishRename = (id: string, title: string) => {
    const trimmed = title.trim();
    setAction(null);
    if (trimmed !== "") onRename(id, trimmed);
  };

  return (
    <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
      {conversations.map((c) => (
        <li key={c.id} className="group/conversation flex flex-col">
          {action?.kind === "rename" && action.id === c.id ? (
            <Input
              aria-label="Conversation title"
              autoFocus
              value={action.title}
              onChange={(event) => {
                setAction({ ...action, title: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRename(c.id, action.title);
                if (event.key === "Escape") setAction(null);
              }}
              onBlur={() => {
                finishRename(c.id, action.title);
              }}
            />
          ) : (
            <div className="flex items-center">
              <Button
                variant="ghost"
                className="min-w-0 flex-1 justify-start font-normal aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground"
                aria-current={currentId === c.id ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  onOpen(c.id);
                }}
              >
                <span className="truncate">{c.title}</span>
              </Button>
              {/* Not modal: a modal menu locks page scrolling with an
                  injected style element, which the CSP blocks. */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 opacity-0 group-hover/conversation:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                    aria-label={`Actions for ${c.title}`}
                    disabled={busy}
                  >
                    <Ellipsis aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={() => {
                      setAction({ kind: "rename", id: c.id, title: c.title });
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      setAction({ kind: "delete", id: c.id });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {action?.kind === "delete" && action.id === c.id && (
            <div
              className="mt-1 mb-2 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs"
              role="group"
              aria-label={`Delete ${c.title}`}
            >
              <p>
                Delete this conversation? This cannot be undone. Export it first
                if you want to keep a copy.
              </p>
              <div className="flex justify-end gap-2">
                {/* Focus starts on Cancel, so a stray Enter keeps the
                    conversation. */}
                <Button
                  variant="ghost"
                  size="xs"
                  autoFocus
                  onClick={() => {
                    setAction(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => {
                    setAction(null);
                    onDelete(c.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
