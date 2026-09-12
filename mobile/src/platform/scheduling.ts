/**
 * Defers work until the JS thread is idle.
 *
 * React Native has deprecated `InteractionManager` in favour of
 * `requestIdleCallback`, so that is what this uses, with a `setTimeout`
 * fallback for any runtime that lacks it (older web targets, and the TV
 * runtimes a future client may land on).
 */

type IdleHandle = { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> };

interface IdleGlobals {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * Runs `task` once the thread is idle, and returns a cancel function.
 *
 * `timeoutMs` is a guarantee, not a delay: a busy thread would otherwise
 * postpone the callback indefinitely, and background work that never runs is
 * worse than work that runs slightly early.
 */
export function runWhenIdle(task: () => void, timeoutMs = 1_000): () => void {
  const scope = globalThis as IdleGlobals;

  if (typeof scope.requestIdleCallback === 'function') {
    const handle: IdleHandle = {
      kind: 'idle',
      id: scope.requestIdleCallback(task, { timeout: timeoutMs }),
    };
    return () => {
      scope.cancelIdleCallback?.(handle.id);
    };
  }

  const handle: IdleHandle = { kind: 'timeout', id: setTimeout(task, 0) };
  return () => {
    clearTimeout(handle.id);
  };
}
