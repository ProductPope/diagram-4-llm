import { expect, it } from "vitest";

import { createStore } from "./store";

it("notifies subscribers only when the value changes, until they unsubscribe", () => {
  const store = createStore(1);
  const seen: number[] = [];
  const unsubscribe = store.subscribe(() => seen.push(store.get()));

  store.set(2);
  store.set(2);
  unsubscribe();
  store.set(3);

  expect(seen).toEqual([2]);
  expect(store.get()).toBe(3);
});
