import { describe, expect, it } from "vitest";

import { neighbour } from "./navigation";

// Roots r and s; r → a → { b → c, d }.
const children = new Map<string | null, string[]>([
  [null, ["r", "s"]],
  ["r", ["a"]],
  ["a", ["b", "d"]],
  ["b", ["c"]],
]);
const none = new Set<string>();

describe("neighbour", () => {
  it("goes up to the parent and not above a root", () => {
    expect(neighbour(children, "c", "parent", none)).toBe("b");
    expect(neighbour(children, "r", "parent", none)).toBeUndefined();
  });

  it("goes down to the child on the selected branch", () => {
    expect(neighbour(children, "a", "child", new Set(["r", "a", "b"]))).toBe(
      "b",
    );
  });

  it("goes down to the newest child when no child is on the branch", () => {
    expect(neighbour(children, "a", "child", none)).toBe("d");
    expect(neighbour(children, "c", "child", none)).toBeUndefined();
  });

  it("moves between siblings in order and stops at the ends", () => {
    expect(neighbour(children, "b", "next", none)).toBe("d");
    expect(neighbour(children, "d", "previous", none)).toBe("b");
    expect(neighbour(children, "d", "next", none)).toBeUndefined();
    expect(neighbour(children, "b", "previous", none)).toBeUndefined();
  });

  it("treats roots as siblings", () => {
    expect(neighbour(children, "r", "next", none)).toBe("s");
  });

  it("does not move from a turn outside the forest", () => {
    expect(neighbour(children, "hidden", "next", none)).toBeUndefined();
    expect(neighbour(children, "hidden", "parent", none)).toBeUndefined();
  });
});
