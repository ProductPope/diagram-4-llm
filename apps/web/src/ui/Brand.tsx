import { Network } from "lucide-react";

import { routeHash } from "../app/route";

/** The app's name and mark, linking to the welcome page. */
export function Brand() {
  return (
    <a
      href={routeHash("welcome")}
      className="flex items-center gap-2 rounded-lg whitespace-nowrap font-heading text-base font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <Network className="size-4" />
      </span>
      diagram-4-llm
    </a>
  );
}
