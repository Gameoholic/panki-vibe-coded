import type { EventBatch, EventKind, NewEvent } from "@panki/contracts";
import { api } from "./api";

/**
 * The ledger's end in the browser: what happens here that no table is shaped for (the app opened, shown, hidden, a
 * screen reached, the home laid out) is queued and sent in batches, a few seconds after the first one or when enough
 * are waiting, and as the page goes away by a beacon, so nothing is lost to a closed tab. Nothing is sent while signed
 * out. The times are the browser's, a hint for ordering; the API stamps the ones that count.
 */
const FLUSH_AFTER_MS = 3000;
const FLUSH_AT = 20;
/** The most a batch may carry (`EventBatch`). */
const BATCH_MAX = 100;

let queue: NewEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let signedIn = false;

function take(): EventBatch | null {
  if (queue.length === 0) return null;
  const events = queue.slice(0, BATCH_MAX);
  queue = queue.slice(BATCH_MAX);
  return { events };
}

function flush() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!signedIn) return;
  const batch = take();
  if (!batch) return;
  api.sendEvents(batch).catch(() => {
    // Not reached, or refused: the events go back to the front and ride with the next batch. A lost sign-in empties
    // the queue through `stop`, so nothing is sent on someone else's behalf.
    if (signedIn) queue = [...batch.events, ...queue];
  });
  if (queue.length > 0) flush();
}

/** As the page goes away: a beacon outlives the tab where a fetch may not. */
function flushNow() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!signedIn) return;
  for (let batch = take(); batch; batch = take()) api.beaconEvents(batch);
}

export const ledger = {
  /** Queues one event. Dropped while signed out. */
  record(kind: EventKind, extra: Omit<NewEvent, "kind" | "at"> = {}) {
    if (!signedIn) return;
    queue.push({ kind, at: Date.now(), ...extra });
    if (queue.length >= FLUSH_AT) flush();
    else if (timer === null) timer = setTimeout(flush, FLUSH_AFTER_MS);
  },
  /** Sign-in confirmed: from here on, events are sent. */
  start() {
    signedIn = true;
  },
  /** Signed out: nothing more is sent, and what was waiting is dropped. */
  stop() {
    signedIn = false;
    queue = [];
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  },
  /**
   * Listens for the page being hidden or left. Hidden and shown are recorded here, before the beacon that carries
   * them, so the hide is never left behind in the queue. Gives back the way to stop listening.
   */
  install(): () => void {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        ledger.record("app-hide");
        flushNow();
      } else ledger.record("app-show");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
    };
  },
};
