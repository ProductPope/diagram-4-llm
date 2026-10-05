import { useState, type SubmitEvent, type KeyboardEvent } from "react";

interface Props {
  readonly initialContent: string;
  readonly busy: boolean;
  /** Why sending is not possible right now, or null when it is. */
  readonly blockedReason: string | null;
  readonly onChange: (content: string) => void;
  readonly onSend: (content: string) => void;
  readonly onStop: () => void;
}

/** Message input. Ctrl+Enter or Cmd+Enter sends. */
export function Composer({
  initialContent,
  busy,
  blockedReason,
  onChange,
  onSend,
  onStop,
}: Props) {
  const [content, setContent] = useState(initialContent);

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
