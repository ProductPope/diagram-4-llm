export type Direction = "parent" | "child" | "previous" | "next";

/**
 * The turn reached from `id` by one step in `direction` on the map, or
 * undefined if there is none. `children` is the visible forest, so hidden
 * turns are never reached. Going down prefers the child on the selected
 * branch and otherwise takes the newest, as the reading pane does.
 */
export function neighbour(
  children: ReadonlyMap<string | null, readonly string[]>,
  id: string,
  direction: Direction,
  onBranch: ReadonlySet<string>,
): string | undefined {
  if (direction === "child") {
    const kids = children.get(id) ?? [];
    return kids.find((kid) => onBranch.has(kid)) ?? kids.at(-1);
  }
  const parent = parentOf(children, id);
  if (parent === undefined) return undefined;
  if (direction === "parent") return parent ?? undefined;
  const siblings = children.get(parent) ?? [];
  const index = siblings.indexOf(id);
  return siblings[direction === "previous" ? index - 1 : index + 1];
}

/** `null` for a root, undefined for a turn that is not in the forest. */
function parentOf(
  children: ReadonlyMap<string | null, readonly string[]>,
  id: string,
): string | null | undefined {
  for (const [parent, kids] of children) {
    if (kids.includes(id)) return parent;
  }
  return undefined;
}
