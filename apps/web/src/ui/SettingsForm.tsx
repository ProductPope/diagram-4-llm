import { useState, type SubmitEvent } from "react";

import type { ProviderSettings } from "../app/settings";

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
  const [model, setModel] = useState(initial?.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    onSave(
      adapter === "anthropic"
        ? { adapter, apiKey, model, systemPrompt }
        : { adapter, baseUrl, apiKey, model, systemPrompt },
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
        Model
        <input
          required
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
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
