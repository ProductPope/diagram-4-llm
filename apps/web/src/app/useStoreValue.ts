import { useSyncExternalStore } from "react";

import type { Store } from "../chat/store";

const noSubscription = () => () => undefined;
const noValue = () => null;

/** The store's current value, re-rendering on change; null without a store. */
export function useStoreValue<T>(store: Store<T> | null): T | null {
  return useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.get ?? noValue,
  );
}
