/**
 * The part of a forest that remains visible when some nodes are collapsed:
 * a collapsed node stays visible, its descendants do not. Returns the
 * visible children map, for layout, and how many nodes each collapsed node
 * hides, for its label.
 */
export function visibleForest(
  children: ReadonlyMap<string | null, readonly string[]>,
  isCollapsed: (id: string) => boolean,
): {
  visible: Map<string | null, string[]>;
  hiddenCounts: Map<string, number>;
} {
  const visible = new Map<string | null, string[]>();
  const hiddenCounts = new Map<string, number>();
  const stack: (string | null)[] = [null];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined) break;
    const kids = children.get(id) ?? [];
    if (id !== null && isCollapsed(id) && kids.length > 0) {
      hiddenCounts.set(id, countDescendants(children, id));
      continue;
    }
    if (kids.length > 0) visible.set(id, [...kids]);
    stack.push(...kids);
  }
  return { visible, hiddenCounts };
}

function countDescendants(
  children: ReadonlyMap<string | null, readonly string[]>,
  id: string,
): number {
  let count = 0;
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    count += 1;
    stack.push(...(children.get(next) ?? []));
  }
  return count;
}
