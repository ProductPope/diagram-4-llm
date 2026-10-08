import { describe, expect, it } from "vitest";

import { defaultRoute, parseRoute, routeHash } from "./route";

describe("routes", () => {
  it("reads the page from the fragment", () => {
    expect(parseRoute("#/welcome")).toBe("welcome");
    expect(parseRoute("#/setup")).toBe("setup");
    expect(parseRoute("#/app")).toBe("app");
    expect(parseRoute("#/session")).toBe("session");
    expect(parseRoute("#app")).toBe("app");
  });

  it("has no page for an empty or unknown fragment", () => {
    expect(parseRoute("")).toBeNull();
    expect(parseRoute("#")).toBeNull();
    expect(parseRoute("#/elsewhere")).toBeNull();
  });

  it("writes fragments that read back as the same page", () => {
    for (const route of ["welcome", "setup", "app", "session"] as const) {
      expect(parseRoute(routeHash(route))).toBe(route);
    }
  });

  it("sends returning users to the app and new ones to the welcome page", () => {
    expect(defaultRoute(true)).toBe("app");
    expect(defaultRoute(false)).toBe("welcome");
  });
});
