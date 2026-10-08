import type { ProviderErrorInfo } from "@diagram-4-llm/core";
import { Alert, AlertDescription, AlertTitle } from "#components/ui/alert";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import { NativeSelect, NativeSelectOption } from "#components/ui/native-select";
import { Textarea } from "#components/ui/textarea";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  listModels,
  parseModelList,
  type Connection,
  type Desktop,
  type ProviderSettings,
} from "../app/settings";

type Step = "provider" | "connect" | "models";
type Choice = "anthropic" | "ollama" | "lm-studio" | "other";

const CHOICES: readonly {
  readonly value: Choice;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    description: "Use your Anthropic API key. You pay Anthropic per use.",
  },
  {
    value: "ollama",
    label: "Ollama",
    description: "Free models that run on your own computer.",
  },
  {
    value: "lm-studio",
    label: "LM Studio",
    description: "Free models that run on your own computer.",
  },
  {
    value: "other",
    label: "Another OpenAI-compatible server",
    description: "Any server or service with an OpenAI-style API.",
  },
];

/** The servers' documented default addresses. */
const LOCAL_URLS = {
  ollama: "http://localhost:11434/v1",
  "lm-studio": "http://localhost:1234/v1",
} as const;

/** Beyond this many models, a filter field is shown above the list. */
const FILTER_THRESHOLD = 8;

type Test =
  | { readonly status: "idle" }
  | { readonly status: "testing" }
  | { readonly status: "failed"; readonly error: ProviderErrorInfo }
  | { readonly status: "connected"; readonly models: readonly string[] };

interface Props {
  /** The app's origin, which local servers must be told to allow. */
  readonly origin: string;
  /**
   * In the desktop app servers need no CORS setup and the key is kept in the
   * system keychain.
   */
  readonly desktop: Desktop | null;
  /** Kept from the current settings; setup does not ask for it. */
  readonly systemPrompt: string;
  readonly onComplete: (settings: ProviderSettings) => void;
  /** Leaves setup from its first step. */
  readonly onBack: () => void;
}

/**
 * First-run setup: choose where answers come from, test the connection,
 * and pick models from the ones the provider actually offers. Every step
 * can be skipped; the same settings can be changed later in Settings.
 */
export function SetupWizard({
  origin,
  desktop,
  systemPrompt,
  onComplete,
  onBack,
}: Props) {
  const [step, setStep] = useState<Step>("provider");
  const [choice, setChoice] = useState<Choice>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [test, setTest] = useState<Test>({ status: "idle" });
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [otherModels, setOtherModels] = useState("");
  const [filter, setFilter] = useState("");
  const [titleModel, setTitleModel] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );

  const connection = (): Connection =>
    choice === "anthropic"
      ? { adapter: "anthropic", apiKey: apiKey.trim() }
      : {
          adapter: "openai-compatible",
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
        };

  const resetTest = () => {
    pending.current?.abort();
    setTest({ status: "idle" });
  };

  const choose = (next: Choice) => {
    setChoice(next);
    setBaseUrl(
      next === "ollama" || next === "lm-studio" ? LOCAL_URLS[next] : "",
    );
    setApiKey("");
    setChosen([]);
    resetTest();
  };

  const runTest = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setTest({ status: "testing" });
    const listed = await listModels(
      connection(),
      controller.signal,
      desktop?.serverFetch ?? null,
    );
    if (controller.signal.aborted) return;
    if (!listed.ok) {
      setTest({ status: "failed", error: listed.error });
      return;
    }
    setTest({ status: "connected", models: listed.value });
    const first = listed.value[0];
    setChosen((current) =>
      current.length > 0 || first === undefined ? current : [first],
    );
  };

  const offered = test.status === "connected" ? test.models : [];
  const models = [
    ...offered.filter((id) => chosen.includes(id)),
    ...parseModelList(otherModels).filter((id) => !offered.includes(id)),
  ];

  const finish = () => {
    if (models.length === 0) return;
    const common = {
      apiKey: apiKey.trim(),
      models,
      ...(titleModel === "" ? {} : { titleModel }),
      systemPrompt,
    };
    onComplete(
      choice === "anthropic"
        ? { adapter: "anthropic", ...common }
        : { adapter: "openai-compatible", baseUrl: baseUrl.trim(), ...common },
    );
  };

  const canTest =
    choice === "anthropic" ? apiKey.trim() !== "" : baseUrl.trim() !== "";

  switch (step) {
    case "provider":
      return (
        <WizardCard
          step={1}
          title="Where should answers come from?"
          description="You can change this later in Settings."
          footer={
            <>
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep("connect");
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Provider</legend>
            {CHOICES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-checked:border-primary has-checked:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1 accent-primary"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => {
                    choose(option.value);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </WizardCard>
      );

    case "connect":
      return (
        <WizardCard
          step={2}
          title={`Connect ${CHOICES.find((c) => c.value === choice)?.label ?? ""}`}
          description="Test the connection to see which models you can use."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  resetTest();
                  setStep("provider");
                }}
              >
                Back
              </Button>
              <div className="flex gap-2">
                {test.status !== "connected" && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStep("models");
                    }}
                    disabled={!canTest}
                  >
                    Continue without testing
                  </Button>
                )}
                {test.status === "connected" ? (
                  <Button
                    onClick={() => {
                      setStep("models");
                    }}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    onClick={() => void runTest()}
                    disabled={!canTest || test.status === "testing"}
                  >
                    {test.status === "testing" && (
                      <LoaderCircle
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    Test connection
                  </Button>
                )}
              </div>
            </>
          }
        >
          {choice === "anthropic" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="setup-api-key">API key</Label>
              <Input
                id="setup-api-key"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  resetTest();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Create a key in the{" "}
                <a
                  className="text-foreground underline underline-offset-4"
                  href="https://platform.claude.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  Claude Console, under API keys
                </a>
                .{" "}
                {desktop === null
                  ? "It is stored only in this browser and sent only to Anthropic."
                  : "It is stored in your system's keychain and sent only to Anthropic."}
              </p>
            </div>
          ) : (
            <>
              {desktop === null && choice === "ollama" && (
                <OllamaSteps origin={origin} />
              )}
              {desktop === null && choice === "lm-studio" && (
                <p className="text-sm text-muted-foreground">
                  In LM Studio, start the local server and switch on{" "}
                  <strong className="text-foreground">Enable CORS</strong> in
                  its server settings, so this page may reach it.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="setup-base-url">Server URL</Label>
                <Input
                  id="setup-base-url"
                  type="url"
                  className="font-mono"
                  placeholder="https://example.com/v1"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    resetTest();
                  }}
                />
              </div>
              {choice === "other" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="setup-api-key">API key (optional)</Label>
                  <Input
                    id="setup-api-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      resetTest();
                    }}
                  />
                </div>
              )}
            </>
          )}
          <TestResult test={test} choice={choice} desktop={desktop !== null} />
        </WizardCard>
      );

    case "models": {
      const visible = offered.filter((id) =>
        id.toLowerCase().includes(filter.trim().toLowerCase()),
      );
      return (
        <WizardCard
          step={3}
          title="Choose your models"
          description="You pick one of these for each answer. The first one is the default."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("connect");
                }}
              >
                Back
              </Button>
              <Button onClick={finish} disabled={models.length === 0}>
                Start chatting
              </Button>
            </>
          }
        >
          {offered.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Available models
              </legend>
              {offered.length > FILTER_THRESHOLD && (
                <Input
                  aria-label="Filter models"
                  placeholder="Filter models"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                  }}
                />
              )}
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                {visible.map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-mono text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={chosen.includes(id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setChosen((current) =>
                          checked
                            ? [...current, id]
                            : current.filter((c) => c !== id),
                        );
                      }}
                    />
                    {id}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-other-models">
              {offered.length > 0
                ? "Other model IDs (optional, one per line)"
                : "Model IDs (one per line)"}
            </Label>
            <Textarea
              id="setup-other-models"
              className="font-mono"
              rows={2}
              value={otherModels}
              onChange={(event) => {
                setOtherModels(event.target.value);
              }}
            />
          </div>
          {models.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Default model:{" "}
              <span className="font-mono text-foreground">{models[0]}</span>
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-title-model">Titles on the map</Label>
            <NativeSelect
              id="setup-title-model"
              className="w-full"
              value={titleModel}
              onChange={(event) => {
                setTitleModel(event.target.value);
              }}
            >
              <NativeSelectOption value="">
                Off: show the start of each answer
              </NativeSelectOption>
              {models.map((id) => (
                <NativeSelectOption key={id} value={id}>
                  {id}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              A model can give each answer a short title on the map. Each title
              is one extra small request, so a cheap or local model is a good
              choice.
            </p>
          </div>
        </WizardCard>
      );
    }
  }
}

function WizardCard({
  step,
  title,
  description,
  children,
  footer,
}: {
  readonly step?: number;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}) {
  return (
    <Card className="mx-auto my-auto w-full max-w-xl">
      <CardHeader>
        {step !== undefined && (
          <p className="text-xs font-medium text-muted-foreground">
            Step {step} of 3
          </p>
        )}
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-5">{children}</CardContent>
      <CardFooter className="mt-5 justify-between gap-2">{footer}</CardFooter>
    </Card>
  );
}

/** Ollama only answers pages from origins listed in OLLAMA_ORIGINS. */
function OllamaSteps({ origin }: { readonly origin: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        Ollama answers only pages it trusts. Set the environment variable{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">
          OLLAMA_ORIGINS
        </code>{" "}
        to{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">
          {origin}
        </code>{" "}
        and restart Ollama.
      </p>
      <details className="group rounded-lg border px-3 py-2">
        <summary className="cursor-pointer font-medium">How to do this</summary>
        <div className="mt-2 flex flex-col gap-3 text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Windows</p>
            <ol className="list-decimal pl-5">
              <li>Quit Ollama from its icon in the task bar.</li>
              <li>
                In Settings, search for &quot;environment variables&quot; and
                open &quot;Edit environment variables for your account&quot;.
              </li>
              <li>
                Add a variable named <code>OLLAMA_ORIGINS</code> with the value{" "}
                <code>{origin}</code>, then click OK.
              </li>
              <li>Start Ollama again from the Start menu.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">macOS</p>
            <p>Run this in Terminal, then restart the Ollama app:</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs text-foreground">
              launchctl setenv OLLAMA_ORIGINS &quot;{origin}&quot;
            </pre>
          </div>
          <div>
            <p className="font-medium text-foreground">From a terminal</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs text-foreground">
              OLLAMA_ORIGINS={origin} ollama serve
            </pre>
          </div>
        </div>
      </details>
      <p className="text-xs text-muted-foreground">
        Your browser may also ask whether this site may connect to devices on
        your network; allow it.
      </p>
    </div>
  );
}

function TestResult({
  test,
  choice,
  desktop,
}: {
  readonly test: Test;
  readonly choice: Choice;
  /** The desktop app needs no CORS setup, so failures have other causes. */
  readonly desktop: boolean;
}) {
  switch (test.status) {
    case "idle":
    case "testing":
      return null;
    case "connected":
      return (
        <Alert>
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Connected</AlertTitle>
          <AlertDescription>
            {test.models.length === 1
              ? "1 model is available."
              : `${test.models.length} models are available.`}
          </AlertDescription>
        </Alert>
      );
    case "failed":
      return (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>The connection did not work</AlertTitle>
          <AlertDescription>
            <p>{failureHint(test.error, choice, desktop)}</p>
            <p className="text-xs">Details: {test.error.message}</p>
          </AlertDescription>
        </Alert>
      );
  }
}

function failureHint(
  error: ProviderErrorInfo,
  choice: Choice,
  desktop: boolean,
): string {
  if (choice === "anthropic") {
    return error.code === "authentication_error"
      ? "Anthropic did not accept this key. Check that it was copied completely."
      : "Anthropic could not be reached. Check your internet connection and try again.";
  }
  if (error.code === "network") {
    if (desktop)
      return "The server could not be reached. Check the address and that the server is running.";
    return choice === "other"
      ? "The server could not be reached. Check the address, and that the server allows requests from this page (CORS)."
      : "The server could not be reached. Check that it is running and that it allows this page, as described above.";
  }
  return "The server answered with an error. Check the address and the key.";
}
