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

it("welcomes a new visitor before showing the app", async () => {
  window.location.hash = "";
  render(
    <App
      openStore={() => openConversationStore(new IDBFactory())}
      settingsStorage={localStorage}
      desktop={null}
    />,
  );

  // The welcome page opens with an empty field, after a pause.
  expect(
    await screen.findByLabelText("Next question", undefined, {
      timeout: 2000,
    }),
  ).toHaveProperty("value", "");
  fireEvent.keyDown(window, { key: "a" });
  // The question is typed into the field, then sent.
  expect(
    await screen.findByRole(
      "heading",
      { name: "What is this?" },
      { timeout: 3000 },
    ),
  ).toBeDefined();
});

it("starts the app with no conversations and asks for a provider before sending", async () => {
  window.location.hash = "#/app";
  render(
    <App
      openStore={() => openConversationStore(new IDBFactory())}
      settingsStorage={localStorage}
      desktop={null}
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
