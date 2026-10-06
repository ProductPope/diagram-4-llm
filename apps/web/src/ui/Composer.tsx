import {
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
  type KeyboardEvent,
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
    <form className="composer" onSubmit={onSubmit}>
      <label htmlFor="composer-input">Message</label>
      <textarea
        id="composer-input"
        ref={input}
        aria-keyshortcuts="/"
        autoFocus={autoFocus}
        value={content}
        rows={4}
        onChange={(event) => {
          setContent(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {blockedReason !== null && (
        <p className="composer-blocked">{blockedReason}</p>
      )}
      <div className="composer-actions">
        {busy ? (
          <button type="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={blockedReason !== null || content.trim() === ""}
          >
            Send
          </button>
        )}
      </div>
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
