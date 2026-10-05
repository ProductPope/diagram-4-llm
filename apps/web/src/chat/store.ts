/** Members are plain functions, so they can be passed around unbound. */
export interface Store<T> {
  readonly get: () => T;
  readonly set: (next: T) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * A minimal observable value, shaped for React's `useSyncExternalStore`.
 * Listeners run only when the value actually changes.
 */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
