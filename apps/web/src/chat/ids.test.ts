import { describe, expect, it } from "vitest";

import { uuidv7 } from "./ids";

const zeros = (bytes: Uint8Array) => {
  bytes.fill(0);
};
const ones = (bytes: Uint8Array) => {
  bytes.fill(0xff);
};

describe("uuidv7", () => {
  it("encodes the time, version and variant as RFC 9562 specifies", () => {
    // 0x017f22e279b0 ms is 2022-02-22T19:22:22Z, the example time in RFC 9562.
    expect(uuidv7(0x017f22e279b0, zeros)).toBe(
      "017f22e2-79b0-7000-8000-000000000000",
    );
    expect(uuidv7(0x017f22e279b0, ones)).toBe(
      "017f22e2-79b0-7fff-bfff-ffffffffffff",
    );
  });

  it("sorts by creation time", () => {
    const earlier = uuidv7(1_000);
    const later = uuidv7(2_000);
    expect(earlier < later).toBe(true);
  });

  it("produces different IDs within the same millisecond", () => {
    expect(uuidv7(5)).not.toBe(uuidv7(5));
  });
});
