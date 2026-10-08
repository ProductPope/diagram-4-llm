import { useSyncExternalStore } from "react";

import { parseRoute, routeHash, type Route } from "./route";

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
  };
}

/** The page named by the current URL fragment, or null if none is named. */
export function useRoute(): Route | null {
  return useSyncExternalStore(subscribe, () =>
    parseRoute(window.location.hash),
  );
}

/** Goes to a page, adding it to the browser history. */
export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}
