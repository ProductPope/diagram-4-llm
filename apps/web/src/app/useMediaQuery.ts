import { useSyncExternalStore } from "react";

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
