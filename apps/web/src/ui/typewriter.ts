import { cloneElement, isValidElement, type ReactNode } from "react";

/**
 * How many characters `writeOut` needs to show the whole of `node`. An
 * element without children (an icon, a picture, a card built from props)
 * counts as one character, because it appears whole.
 */
export function textLength(node: ReactNode): number {
  if (typeof node === "string") return node.length;
  if (typeof node === "number") return String(node).length;
  if (Array.isArray(node))
    return node.reduce<number>(
      (total, child: ReactNode) => total + textLength(child),
      0,
    );
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const { children } = node.props;
    return children === undefined ? 1 : textLength(children);
  }
  return 0;
}

/**
 * The first `length` characters of `node`, as if it were being typed: text
 * is cut, elements keep their props, and elements not reached yet are left
 * out so that they appear only when the text reaches them.
 */
export function writeOut(node: ReactNode, length: number): ReactNode {
  return clip(node, { left: length });
}

function clip(node: ReactNode, budget: { left: number }): ReactNode {
  if (budget.left <= 0) return null;
  if (typeof node === "string" || typeof node === "number") {
    const text = String(node).slice(0, budget.left);
    budget.left -= text.length;
    return text;
  }
  if (Array.isArray(node))
    return node.map((child: ReactNode) => clip(child, budget));
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const { children } = node.props;
    if (children === undefined) {
      budget.left -= 1;
      return node;
    }
    // Spread, so that children written as siblings in JSX stay siblings
    // and React does not ask them for keys.
    return cloneElement(
      node,
      undefined,
      ...(Array.isArray(children)
        ? children.map((child: ReactNode) => clip(child, budget))
        : [clip(children, budget)]),
    );
  }
  return node;
}
