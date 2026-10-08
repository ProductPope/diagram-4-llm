import { useSyncExternalStore } from "react";

/**
 * Below this width the sidebar, the conversation and the map cannot all have
 * their minimum widths (180, 360 and 240 pixels), so one is shown at a time,
 * and the session page stacks its map under the branch. WCAG 1.4.10 asks
 * for the app to work 320 pixels wide, which is what a 1280-pixel window
 * shows at 400% zoom.
 */
export const NARROW_SCREEN = "(width < 50rem)";

/**
 * Whether the media query matches, re-rendering when that changes. False
 * where `matchMedia` does not exist, as in jsdom.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => {
        list.removeEventListener("change", listener);
      };
    },
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
}
