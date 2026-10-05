import { describe, expect, it } from "vitest";

import { visibleForest } from "./collapse";

// r → a → { b → c, d }, plus a second root s.
const children = new Map<string | null, string[]>([
  [null, ["r", "s"]],
  ["r", ["a"]],
  ["a", ["b", "d"]],
  ["b", ["c"]],
]);

describe("visibleForest", () => {
  it("keeps everything when nothing is collapsed", () => {
    const { visible, hiddenCounts } = visibleForest(children, () => false);
    expect(visible).toEqual(children);
    expect(hiddenCounts.size).toBe(0);
  });

  it("hides the descendants of a collapsed node and counts them", () => {
    const { visible, hiddenCounts } = visibleForest(
      children,
      (id) => id === "a",
    );
    expect(visible).toEqual(
      new Map<string | null, string[]>([
        [null, ["r", "s"]],
        ["r", ["a"]],
      ]),
    );
    expect(hiddenCounts).toEqual(new Map([["a", 3]]));
  });

  it("ignores a collapsed flag on a node without children", () => {
    const { visible, hiddenCounts } = visibleForest(
      children,
      (id) => id === "c",
    );
    expect(visible).toEqual(children);
    expect(hiddenCounts.size).toBe(0);
  });

  it("does not count nodes hidden by an outer collapsed ancestor separately", () => {
    const { hiddenCounts } = visibleForest(
      children,
      (id) => id === "r" || id === "b",
    );
    expect(hiddenCounts).toEqual(new Map([["r", 4]]));
  });
});
