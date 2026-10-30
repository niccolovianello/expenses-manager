// Recomputes only when at least one argument changes (by identity).
export function memo(compute) {
  let lastArgs = null;
  let lastResult;
  return (...args) => {
    if (lastArgs && args.length === lastArgs.length && args.every((arg, i) => arg === lastArgs[i])) return lastResult;
    lastArgs = args;
    lastResult = compute(...args);
    return lastResult;
  };
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
