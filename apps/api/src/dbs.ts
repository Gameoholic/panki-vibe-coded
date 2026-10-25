import path from "node:path";
import { openDb, type Db } from "./db";
import { mediaDir } from "./mediaFiles";

/** Where an account's own Panki lives: its folder under `users/`, its `panki.sqlite` inside. */
export function userDir(dataDir: string, userId: string): string {
  return path.join(dataDir, "users", userId);
}

/**
 * Every account is a whole Panki of its own, one database each. Handles are opened the first time an account is
 * asked for (running its migrations then) and kept until shutdown.
 */
export function createDbs(dataDir: string, now: () => number, timeZone: string, finishedWithinMs?: () => number) {
  const open = new Map<string, Db>();
  return {
    dbFor(userId: string): Db {
      let db = open.get(userId);
      if (!db) {
        db = openDb(userDir(dataDir, userId), now, timeZone, finishedWithinMs);
        open.set(userId, db);
      }
      return db;
    },
    /** Where that account's files live: beside its database, so one folder is the whole of an account. */
    mediaDirFor(userId: string): string {
      return mediaDir(userDir(dataDir, userId));
    },
    closeAll(): void {
      for (const db of open.values()) db.close();
      open.clear();
    },
  };
}
export type Dbs = ReturnType<typeof createDbs>;
