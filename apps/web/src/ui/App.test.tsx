import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("offers setup first, and asks for a provider before sending if it is skipped", async () => {
  render(
    <App
      openStore={() => openConversationStore(new IDBFactory())}
      settingsStorage={localStorage}
    />,
  );

  expect(await screen.findByText("No conversations yet.")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Welcome" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(
    screen.getByText("Configure a provider in Settings before sending."),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: "Send" })).toHaveProperty(
    "disabled",
    true,
  );
});
