/**
 * Slows a guessed password down: so many failed sign-ins from one address inside the window, and that address waits.
 * Kept in memory; a restart forgets, which is fine for a lock that lasts a minute. Time is passed in, never read here.
 */
const TRIES = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 60_000;

type Record_ = { failures: number[]; blockedUntil: number };

export function createThrottle() {
  const byAddress = new Map<string, Record_>();
  const recordOf = (address: string): Record_ => {
    let record = byAddress.get(address);
    if (!record) {
      record = { failures: [], blockedUntil: 0 };
      byAddress.set(address, record);
    }
    return record;
  };
  return {
    /** Whether the address has to wait right now. */
    blocked(address: string, now: number): boolean {
      return recordOf(address).blockedUntil > now;
    },
    /** One more wrong try; enough of them inside the window starts the wait. */
    failed(address: string, now: number): void {
      const record = recordOf(address);
      record.failures = record.failures.filter((at) => at > now - WINDOW_MS);
      record.failures.push(now);
      if (record.failures.length >= TRIES) {
        record.blockedUntil = now + BLOCK_MS;
        record.failures = [];
      }
    },
    /** A right sign-in clears the slate for that address. */
    passed(address: string): void {
      byAddress.delete(address);
    },
  };
}
export type Throttle = ReturnType<typeof createThrottle>;
