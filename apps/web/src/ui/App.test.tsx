import { render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";

import { openConversationStore } from "../storage/conversation-store";
import { App } from "./App";

it("starts with no conversations and asks for a provider before sending", async () => {
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
