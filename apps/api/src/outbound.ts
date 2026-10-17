/**
 * Every call Panki makes out (to Forvo, to an engine) carries a deadline: a service that never answers must never hold
 * a request open, and nginx gives up on the API after its own `proxy_read_timeout` anyway. The deadline is the
 * platform's `AbortSignal.timeout`, passed with the call; one it cuts rejects with a TimeoutError, told apart here so
 * the owner hears that the service was slow rather than unreachable.
 */
export const timedOut = (e: unknown): boolean => e instanceof DOMException && e.name === "TimeoutError";
