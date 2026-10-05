import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { App } from "./App";

it("shows the empty state when there are no conversations", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "diagram-4-llm" })).toBeDefined();
  expect(screen.getByText("No conversations yet.")).toBeDefined();
});
