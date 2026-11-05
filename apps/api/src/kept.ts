import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { NextFunction, Request, Response } from "express";
import { STATE_HEADER, formatState, type KeptState } from "@panki/contracts";

/**
 * The state header on every API answer (the contracts' `kept.ts`): a short hash of each kind of data the extension
 * keeps, so it learns of a change from whatever call it makes next. Each hash is worked out from the data itself; what
 * keeps it cheap is that it's worked out again only once its database has changed (`whileUnchanged`), by SQLite's own
 * count of changes, never by a bump written beside each write.
 */

/** A short hash of some values as they stand: the first 72 bits of their SHA-256, base64url. */
export function hashOf(...values: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("base64url").slice(0, 12);
}

/**
 * A value worked out from a database, worked out again only when the database has changed since: the rows changed on
 * this connection (`total_changes()`) and what other connections committed (`PRAGMA data_version`), both SQLite's own.
 * A change that turns out to touch nothing the value reads only works it out again for nothing.
 */
export function whileUnchanged<T>(db: DatabaseSync, work: () => T): () => T {
  const changes = db.prepare("SELECT total_changes() AS n");
  const version = db.prepare("PRAGMA data_version");
  let kept: { mark: string; value: T } | null = null;
  return () => {
    const mark = `${(changes.get() as { n: number }).n}:${(version.get() as { data_version: number }).data_version}`;
    if (kept?.mark !== mark) kept = { mark, value: work() };
    return kept.value;
  };
}

/**
 * Puts the header on every answer under `/api`, worked out as the answer's headers go out, so it says how things stand
 * after whatever the request changed. `state(res)` is the hashes for this answer (the account's only once
 * `requireSession` has put the sign-in on it). A hash that can't be worked out leaves the header off, the answer as it was.
 */
export function stateHeader(state: (res: Response) => KeptState) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: unknown[]) {
      if (!res.headersSent && !res.hasHeader(STATE_HEADER)) {
        try {
          const value = formatState(state(res));
          if (value) res.setHeader(STATE_HEADER, value);
        } catch (e) {
          console.error("The state header couldn't be worked out:", e);
        }
      }
      return (writeHead as (...a: unknown[]) => Response).apply(this, args);
    } as typeof res.writeHead;
    next();
  };
}
