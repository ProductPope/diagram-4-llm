import { Button } from "#components/ui/button";
import { Textarea } from "#components/ui/textarea";
import { ArrowUp, Info, Square } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SubmitEvent,
} from "react";

interface Props {
  readonly initialContent: string;
  readonly busy: boolean;
  /** Why sending is not possible right now, or null when it is. */
  readonly blockedReason: string | null;
  /** Takes focus when it appears, for example when editing starts. */
  readonly autoFocus: boolean;
  readonly onChange: (content: string) => void;
  readonly onSend: (content: string) => void;
  readonly onStop: () => void;
  /** Controls shown next to the send button, such as the model choice. */
  readonly options?: ReactNode;
}

/** Message input. Ctrl+Enter or Cmd+Enter sends; "/" elsewhere focuses it. */
export function Composer({
  initialContent,
  busy,
  blockedReason,
  autoFocus,
  onChange,
  onSend,
  onStop,
  options,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focusOnSlash = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        acceptsText(event.target)
      )
        return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => {
      window.removeEventListener("keydown", focusOnSlash);
    };
  }, []);

  const send = () => {
    if (busy || blockedReason !== null || content.trim() === "") return;
    onSend(content);
    setContent("");
    onChange("");
  };
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    send();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit}>
      <label htmlFor="composer-input" className="sr-only">
        Message
      </label>
      <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Textarea
          id="composer-input"
          ref={input}
          aria-keyshortcuts="/"
          autoFocus={autoFocus}
          placeholder="Ask anything…"
          className="max-h-60 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          value={content}
          rows={3}
          onChange={(event) => {
            setContent(event.target.value);
            onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            {options}
            <span className="hidden truncate text-xs text-muted-foreground md:inline">
              Ctrl+Enter to send
            </span>
          </div>
          {busy ? (
            <Button type="button" variant="outline" size="sm" onClick={onStop}>
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={blockedReason !== null || content.trim() === ""}
            >
              <ArrowUp aria-hidden="true" />
              Send
            </Button>
          )}
        </div>
      </div>
      {blockedReason !== null && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          {blockedReason}
        </p>
      )}
    </form>
  );
}

/** A "/" typed into a field is text, not a shortcut. */
function acceptsText(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        !["button", "checkbox", "radio", "submit", "reset"].includes(
          target.type,
        )))
  );
}
