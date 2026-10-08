import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import { NativeSelect, NativeSelectOption } from "#components/ui/native-select";
import { Textarea } from "#components/ui/textarea";
import { useState, type SubmitEvent } from "react";

import { parseModelList, type ProviderSettings } from "../app/settings";

interface Props {
  readonly initial: ProviderSettings | null;
  /** In the desktop app the key is kept in the system keychain. */
  readonly keyInKeychain: boolean;
  readonly onSave: (settings: ProviderSettings) => void;
  readonly onCancel: () => void;
  readonly onStartSetup: () => void;
}

export function SettingsForm({
  initial,
  keyInKeychain,
  onSave,
  onCancel,
  onStartSetup,
}: Props) {
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
  const [titleModel, setTitleModel] = useState(initial?.titleModel ?? "");
  const [suggestionModel, setSuggestionModel] = useState(
    initial?.suggestionModel ?? "",
  );
  // Kept for every model typed so far, so a window survives a model being
  // removed from the list and added back while the form is open.
  const [windows, setWindows] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      Object.entries(initial?.contextWindows ?? {}).map(([model, size]) => [
        model,
        String(size),
      ]),
    ),
  );
  const modelList = parseModelList(models);
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    // The textarea is required, but it can still hold only whitespace.
    if (modelList.length === 0) return;
    const contextWindows = Object.fromEntries(
      modelList.flatMap((model) => {
        const size = Number(windows[model] ?? "");
        return Number.isInteger(size) && size > 0 ? [[model, size]] : [];
      }),
    );
    const common = {
      apiKey,
      models: modelList,
      ...(titleModel.trim() === "" ? {} : { titleModel: titleModel.trim() }),
      ...(suggestionModel.trim() === ""
        ? {}
        : { suggestionModel: suggestionModel.trim() }),
      ...(Object.keys(contextWindows).length === 0 ? {} : { contextWindows }),
      systemPrompt,
    };
    onSave(
      adapter === "anthropic"
        ? { adapter, ...common }
        : { adapter, baseUrl, ...common },
    );
  };

  return (
    <Card className="mx-auto w-full max-w-xl">
      <form onSubmit={onSubmit} aria-label="Provider settings">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            {keyInKeychain
              ? "Where answers come from. The API key is stored in your system's keychain, everything else only in this app."
              : "Where answers come from. Everything here is stored only in this browser."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-provider">Provider</Label>
            <NativeSelect
              id="settings-provider"
              className="w-full"
              value={adapter}
              onChange={(event) => {
                setAdapter(
                  event.target.value === "anthropic"
                    ? "anthropic"
                    : "openai-compatible",
                );
              }}
            >
              <NativeSelectOption value="openai-compatible">
                OpenAI-compatible (Ollama, LM Studio, …)
              </NativeSelectOption>
              <NativeSelectOption value="anthropic">
                Anthropic
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {adapter === "openai-compatible" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-base-url">Server URL</Label>
              <Input
                id="settings-base-url"
                type="url"
                required
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-api-key">
              API key{adapter === "openai-compatible" ? " (optional)" : ""}
            </Label>
            <Input
              id="settings-api-key"
              type="password"
              autoComplete="off"
              required={adapter === "anthropic"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {keyInKeychain
                ? "The key is stored in your system's keychain and sent only to the provider you configure."
                : "The key is stored in this browser and sent only to the provider you configure. Anyone who can run scripts on this page could read it."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-models">
              Models (one per line; the first is the default)
            </Label>
            <Textarea
              id="settings-models"
              className="font-mono"
              required
              rows={3}
              value={models}
              onChange={(event) => {
                setModels(event.target.value);
              }}
            />
          </div>
          {modelList.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Context windows in tokens (optional)
              </legend>
              {modelList.map((model, index) => (
                <div key={model} className="flex items-center gap-2">
                  <Label
                    htmlFor={`settings-window-${String(index)}`}
                    className="min-w-0 flex-1 truncate font-mono font-normal"
                  >
                    {model}
                  </Label>
                  <Input
                    id={`settings-window-${String(index)}`}
                    className="w-32"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={windows[model] ?? ""}
                    onChange={(event) => {
                      setWindows((previous) => ({
                        ...previous,
                        [model]: event.target.value,
                      }));
                    }}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                The most a model can read at once, from its documentation or
                server settings. With it, the app warns before a message's
                context gets too large and blocks sending when it is larger.
                Nothing is ever cut off.
              </p>
            </fieldset>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-title-model">
              Model for node titles (optional)
            </Label>
            <Input
              id="settings-title-model"
              className="font-mono"
              type="text"
              value={titleModel}
              onChange={(event) => {
                setTitleModel(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              When set, this model gives each finished answer a short title on
              the map. Each title is one extra small request, so a cheap or
              local model is a good choice. Leave it empty to show the start of
              each answer.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-suggestion-model">
              Model for suggested branches (optional)
            </Label>
            <Input
              id="settings-suggestion-model"
              className="font-mono"
              type="text"
              value={suggestionModel}
              onChange={(event) => {
                setSuggestionModel(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              When set, this model proposes three follow-up questions under each
              finished answer. It is sent only that answer and its question, and
              nothing it proposes is sent until you choose it. Leave it empty to
              turn suggestions off.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-system-prompt">
              System prompt (optional)
            </Label>
            <Textarea
              id="settings-system-prompt"
              rows={3}
              value={systemPrompt}
              onChange={(event) => {
                setSystemPrompt(event.target.value);
              }}
            />
          </div>
        </CardContent>
        <CardFooter className="mt-5 justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onStartSetup}>
            Use the setup assistant
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
