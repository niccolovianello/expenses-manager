export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    get: () => state,
    set(patch) {
      const changes = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...changes };
      const changed = new Set(Object.keys(changes));
      listeners.forEach((listener) => listener(state, changed));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Esegue subito `fn` e poi a ogni modifica di una delle chiavi indicate.
export function watch(store, keys, fn) {
  fn(store.get());
  return store.subscribe((state, changed) => {
    if (keys.some((key) => changed.has(key))) fn(state);
  });
}
