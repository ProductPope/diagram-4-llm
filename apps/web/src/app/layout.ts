export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;
const HORIZONTAL_GAP = 24;
const VERTICAL_GAP = 40;

export interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * Positions a forest as a tidy tree: each leaf gets its own column, each
 * parent is centred above its children, and each level of depth is one
 * row. `children` maps a node, or `null` for the roots, to its children in
 * display order. Uses an explicit stack, so long conversations cannot
 * overflow the call stack.
 */
export function layoutForest(
  children: ReadonlyMap<string | null, readonly string[]>,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  let nextColumn = 0;
  const stack: { id: string; depth: number; expanded: boolean }[] = (
    children.get(null) ?? []
  )
    .map((id) => ({ id, depth: 0, expanded: false }))
    .reverse();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const kids = children.get(frame.id) ?? [];
    const y = frame.depth * (NODE_HEIGHT + VERTICAL_GAP);

    if (kids.length === 0) {
      positions.set(frame.id, {
        x: nextColumn * (NODE_WIDTH + HORIZONTAL_GAP),
        y,
      });
      nextColumn += 1;
    } else if (frame.expanded) {
      // Children are placed before their parent is revisited.
      const first = positions.get(kids[0] ?? "");
      const last = positions.get(kids.at(-1) ?? "");
      if (first === undefined || last === undefined)
        throw new Error("Children were not laid out before their parent.");
      positions.set(frame.id, { x: (first.x + last.x) / 2, y });
    } else {
      stack.push({ ...frame, expanded: true });
      for (let i = kids.length - 1; i >= 0; i--) {
        const kid = kids[i];
        if (kid !== undefined)
          stack.push({ id: kid, depth: frame.depth + 1, expanded: false });
      }
    }
  }
  return positions;
}
