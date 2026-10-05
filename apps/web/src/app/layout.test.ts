import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { layoutForest, NODE_WIDTH } from "./layout";

function forest(
  edges: Record<string, string[]>,
  roots: string[],
): Map<string | null, string[]> {
  return new Map<string | null, string[]>([
    [null, roots],
    ...Object.entries(edges),
  ]);
}

describe("layoutForest", () => {
  it("stacks a chain vertically", () => {
    const positions = layoutForest(forest({ a: ["b"], b: ["c"] }, ["a"]));
    expect([...positions.values()].map((p) => p.x)).toEqual([0, 0, 0]);
    expect(positions.get("c")?.y).toBeGreaterThan(
      positions.get("b")?.y ?? Infinity,
    );
  });

  it("centres a parent above its children and keeps roots apart", () => {
    const positions = layoutForest(forest({ a: ["b", "c"] }, ["a", "r"]));
    const b = positions.get("b");
    const c = positions.get("c");
    expect(positions.get("a")?.x).toBe(((b?.x ?? 0) + (c?.x ?? 0)) / 2);
    expect(positions.get("r")?.x).toBeGreaterThan(c?.x ?? Infinity);
  });

  it("places every node of any forest without overlaps, children below parents", () => {
    // Random forest: node i picks a parent among the nodes before it, or none.
    const parents = fc.array(fc.option(fc.nat(), { nil: null }), {
      maxLength: 60,
    });
    fc.assert(
      fc.property(parents, (picks) => {
        const children = new Map<string | null, string[]>([[null, []]]);
        const parentOf = new Map<string, string | null>();
        picks.forEach((pick, i) => {
          const id = `n${String(i)}`;
          const parent =
            pick === null || i === 0 ? null : `n${String(pick % i)}`;
          parentOf.set(id, parent);
          children.set(parent, [...(children.get(parent) ?? []), id]);
        });

        const positions = layoutForest(children);
        expect(positions.size).toBe(picks.length);

        const all = [...positions.entries()];
        for (const [id, p] of all) {
          const parent = parentOf.get(id);
          if (parent !== null && parent !== undefined) {
            expect(p.y).toBeGreaterThan(positions.get(parent)?.y ?? Infinity);
          }
          for (const [otherId, q] of all) {
            if (otherId === id || q.y !== p.y) continue;
            expect(Math.abs(q.x - p.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("handles a chain deeper than a recursive layout could", () => {
    const edges: Record<string, string[]> = {};
    for (let i = 0; i < 20_000; i++)
      edges[`n${String(i)}`] = [`n${String(i + 1)}`];
    expect(layoutForest(forest(edges, ["n0"])).size).toBe(20_001);
  });
});
