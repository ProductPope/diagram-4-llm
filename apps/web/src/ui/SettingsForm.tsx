import { useState, type SubmitEvent } from "react";

import { parseModelList, type ProviderSettings } from "../app/settings";

interface Props {
  readonly initial: ProviderSettings | null;
  readonly onSave: (settings: ProviderSettings) => void;
  readonly onCancel: () => void;
}

export function SettingsForm({ initial, onSave, onCancel }: Props) {
  const [adapter, setAdapter] = useState<ProviderSettings["adapter"]>(
    initial?.adapter ?? "openai-compatible",
  );
  const [baseUrl, setBaseUrl] = useState(
    initial?.adapter === "openai-compatible"
      ? initial.baseUrl
      : "http://localhost:11434/v1",
  );
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [models, setModels] = useState(initial?.models.join("\n") ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const list = parseModelList(models);
    // The textarea is required, but it can still hold only whitespace.
    if (list.length === 0) return;
    onSave(
      adapter === "anthropic"
        ? { adapter, apiKey, models: list, systemPrompt }
        : { adapter, baseUrl, apiKey, models: list, systemPrompt },
    );
  };

  return (
    <form
      className="settings"
      onSubmit={onSubmit}
      aria-label="Provider settings"
    >
      <label>
        Provider
        <select
          value={adapter}
          onChange={(event) => {
            setAdapter(
              event.target.value === "anthropic"
                ? "anthropic"
                : "openai-compatible",
            );
          }}
        >
          <option value="openai-compatible">
            OpenAI-compatible (Ollama, LM Studio, …)
          </option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      {adapter === "openai-compatible" && (
        <label>
          Server URL
          <input
            type="url"
            required
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
            }}
          />
        </label>
      )}
      <label>
        API key{adapter === "openai-compatible" ? " (optional)" : ""}
        <input
          type="password"
          autoComplete="off"
          required={adapter === "anthropic"}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
          }}
        />
      </label>
      <p className="settings-note">
        The key is stored in this browser and sent only to the provider you
        configure. Anyone who can run scripts on this page could read it.
      </p>
      <label>
        Models (one per line; the first is the default)
        <textarea
          required
          rows={3}
          value={models}
          onChange={(event) => {
            setModels(event.target.value);
          }}
        />
      </label>
      <label>
        System prompt (optional)
        <textarea
          rows={3}
          value={systemPrompt}
          onChange={(event) => {
            setSystemPrompt(event.target.value);
          }}
        />
      </label>
      <div className="settings-actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
