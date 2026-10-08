/**
 * The app's pages, addressed by the URL fragment (`#/setup`) so a static
 * host serves every page from the same file.
 */
export type Route = "welcome" | "setup" | "app" | "session" | "features";

const ROUTES: readonly Route[] = [
  "welcome",
  "setup",
  "app",
  "session",
  "features",
];

/** The page a fragment names, or null for an empty or unknown fragment. */
export function parseRoute(hash: string): Route | null {
  const name = hash.replace(/^#\/?/, "");
  return ROUTES.find((route) => route === name) ?? null;
}

export function routeHash(route: Route): string {
  return `#/${route}`;
}

/**
 * Where a visit without a fragment lands: people who have used the app go
 * straight to it, everyone else sees the welcome page first.
 */
export function defaultRoute(hasUsedApp: boolean): Route {
  return hasUsedApp ? "app" : "welcome";
}
