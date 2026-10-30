const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

// Locks the app after a period without interaction: the in-memory key is discarded with the page.
export function startIdleLock(minutes, onLock) {
  if (!minutes) return () => {};
  let timer;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(onLock, minutes * 60_000);
  };
  ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));
  reset();
  return () => {
    clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
  };
}
