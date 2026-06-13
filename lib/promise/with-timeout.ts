export class TimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

/**
 * Reject with a {@link TimeoutError} if `promise` hasn't settled within `ms`.
 *
 * The underlying promise is *not* cancelled — it keeps running until it
 * settles on its own (and is then ignored). This is intentional for fire-and-
 * forget work like a best-effort auth refresh: we want a hard wall-clock
 * ceiling on how long a caller blocks, regardless of what the work does
 * internally (stalled socket, hung TLS handshake, no built-in timeout, …).
 *
 * Without this guard, a hung network call in edge middleware never returns and
 * the platform eventually kills the whole invocation with a gateway timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
