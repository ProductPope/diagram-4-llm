import { cleanup, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it } from "vitest";

import { openConversationStore } from "../storage/conversation-store";
import { App } from "./App";

// Vitest globals are off, so Testing Library cannot register its automatic
// cleanup. Unmounting explicitly stops async work started by the component
// from updating it after the test environment is torn down.
afterEach(() => {
  cleanup();
});

// jsdom computes no layout and has no ResizeObserver, which the resizable
// panels require. Sizes are not under test here, so an observer that never
// reports is enough.
globalThis.ResizeObserver = class {
  observe(): void {
    // Never reports: jsdom has no layout to observe.
  }
  unobserve(): void {
    // Nothing is observed.
  }
  disconnect(): void {
    // Nothing is observed.
  }
};

it("welcomes a new visitor before showing the app", async () => {
  window.location.hash = "";
  render(
    <App
      openStore={() => openConversationStore(new IDBFactory())}
      settingsStorage={localStorage}
    />,
  );

  expect(
    await screen.findByRole("heading", { name: "What is this?" }),
  ).toBeDefined();
  // The first answer is "typed" before its buttons appear.
  expect(
    await screen.findByRole("button", { name: "Connect a model" }),
  ).toBeDefined();
});

it("starts the app with no conversations and asks for a provider before sending", async () => {
  window.location.hash = "#/app";
  render(
    <App
      openStore={() => openConversationStore(new IDBFactory())}
      settingsStorage={localStorage}
    />,
  );

  expect(await screen.findByText("No conversations yet.")).toBeDefined();
  expect(
    screen.getByText("Configure a provider in Settings before sending."),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: "Send" })).toHaveProperty(
    "disabled",
    true,
  );
});
