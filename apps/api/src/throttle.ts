/**
 * Slows a guessed password down: so many failed sign-ins from one address inside the window, and that address waits.
 * Kept in memory; a restart forgets, which is fine for a lock that lasts a minute. Time is passed in, never read here.
 * Only an address with something still held against it is remembered, so a scan from many addresses can't grow this
 * without bound: asking whether an address waits writes nothing, and every wrong try first lets go of what has lapsed.
 */
const TRIES = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 60_000;

type Record_ = { failures: number[]; blockedUntil: number };

export function createThrottle() {
  const byAddress = new Map<string, Record_>();
  /** Forgets every address whose wait is over and whose wrong tries have all left the window. */
  const prune = (now: number) => {
    for (const [address, record] of byAddress) {
      if (record.blockedUntil <= now && record.failures.every((at) => at <= now - WINDOW_MS)) byAddress.delete(address);
    }
  };
  return {
    /** Whether the address has to wait right now. */
    blocked(address: string, now: number): boolean {
      return (byAddress.get(address)?.blockedUntil ?? 0) > now;
    },
    /** One more wrong try; enough of them inside the window starts the wait. */
    failed(address: string, now: number): void {
      prune(now);
      const record = byAddress.get(address) ?? { failures: [], blockedUntil: 0 };
      record.failures = record.failures.filter((at) => at > now - WINDOW_MS);
      record.failures.push(now);
      if (record.failures.length >= TRIES) {
        record.blockedUntil = now + BLOCK_MS;
        record.failures = [];
      }
      byAddress.set(address, record);
    },
    /** A right sign-in clears the slate for that address. */
    passed(address: string): void {
      byAddress.delete(address);
    },
  };
}
export type Throttle = ReturnType<typeof createThrottle>;
