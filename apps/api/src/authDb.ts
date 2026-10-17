import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Session, User } from "@panki/contracts";

export type AuthDb = ReturnType<typeof openAuthDb>;

/** One signed-in device as the API keeps it: who it belongs to and what it looks like, never the cookie's secret. */
export type SessionRow = { id: string; userId: string; device: string; userAgent: string; createdAt: number; lastSeenAt: number };
type UserRow = { id: string; name: string; passwordHash: string; createdAt: number; admin: number };

/**
 * The accounts and their signed-in devices live in `auth.sqlite`, apart from every account's own data. Same discipline
 * as `db.ts`: migrations in order, `user_version` records how far we got, nothing is ever deleted.
 */
const MIGRATIONS: ReadonlyArray<(db: DatabaseSync) => void> = [
  (db) => {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    // The cookie carries a secret; the row keeps only its hash, so the file alone signs nobody in.
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id),
        user_agent TEXT NOT NULL,
        device TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER
      )
    `);
    db.exec("CREATE INDEX sessions_user_id ON sessions (user_id)");
    // Every try to sign in, right or wrong: the silo keeps it.
    db.exec(`
      CREATE TABLE login_attempts (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        name TEXT NOT NULL,
        ok INTEGER NOT NULL,
        address TEXT NOT NULL
      )
    `);
  },
  (db) => {
    // When a password changed, and nothing else: an old hash is a liability, not a record.
    db.exec(`
      CREATE TABLE password_changes (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // An admin changes what everyone shares (2026-10-17): the keys, the dictionaries kept on Panki, how transcribing
    // runs. Nobody is one until `pnpm user:admin` says so; every change of the flag is kept with its time.
    db.exec("ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      CREATE TABLE admin_changes (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        admin INTEGER NOT NULL,
        at INTEGER NOT NULL
      )
    `);
  },
];

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  MIGRATIONS.forEach((step, i) => {
    if (i < user_version) return;
    db.exec("BEGIN");
    try {
      step(db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}

export function openAuthDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "auth.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);

  const userColumns = "id, name, password_hash AS passwordHash, created_at AS createdAt, admin";
  const selectUsers = db.prepare(`SELECT ${userColumns} FROM users WHERE removed_at IS NULL ORDER BY created_at ASC, id ASC`);
  const selectUser = db.prepare(`SELECT ${userColumns} FROM users WHERE id = ? AND removed_at IS NULL`);
  const selectUserByName = db.prepare(`SELECT ${userColumns} FROM users WHERE name = ? AND removed_at IS NULL`);
  const countUsers = db.prepare("SELECT COUNT(*) AS n FROM users");
  const insertUser = db.prepare("INSERT INTO users (id, name, password_hash, created_at) VALUES (?, ?, ?, ?)");
  const updatePassword = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
  const insertPasswordChange = db.prepare("INSERT INTO password_changes (user_id, at) VALUES (?, ?)");
  const updateAdmin = db.prepare("UPDATE users SET admin = ? WHERE id = ?");
  const insertAdminChange = db.prepare("INSERT INTO admin_changes (user_id, admin, at) VALUES (?, ?, ?)");

  const sessionColumns = "s.id, s.user_id AS userId, s.device, s.user_agent AS userAgent, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt";
  const insertSession = db.prepare("INSERT INTO sessions (id, token_hash, user_id, user_agent, device, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  // A session is live while it isn't revoked and its account is still there.
  const live = "s.revoked_at IS NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id AND u.removed_at IS NULL)";
  const selectSessionByToken = db.prepare(`SELECT ${sessionColumns} FROM sessions s WHERE s.token_hash = ? AND ${live}`);
  const selectSessions = db.prepare(`SELECT ${sessionColumns} FROM sessions s WHERE s.user_id = ? AND s.revoked_at IS NULL ORDER BY s.created_at DESC, s.id DESC`);
  const touchSession = db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?");
  const revokeSession = db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL");
  const revokeSessions = db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL");
  const sessionExists = db.prepare("SELECT 1 FROM sessions WHERE id = ? AND user_id = ?");

  const insertAttempt = db.prepare("INSERT INTO login_attempts (at, name, ok, address) VALUES (?, ?, ?, ?)");

  const userFrom = (row: UserRow): User => User.parse({ id: row.id, name: row.name, createdAt: row.createdAt, admin: row.admin === 1 });

  return {
    listUsers(): User[] {
      return (selectUsers.all() as UserRow[]).map(userFrom);
    },
    getUser(id: string): User | null {
      const row = selectUser.get(id) as UserRow | undefined;
      return row ? userFrom(row) : null;
    },
    /** The account and its hash, for signing in. Names match whatever their case. */
    getUserByName(name: string): (User & { passwordHash: string }) | null {
      const row = selectUserByName.get(name) as UserRow | undefined;
      return row ? { ...userFrom(row), passwordHash: row.passwordHash } : null;
    },
    /** Whether any account was ever made, removed or not: the first one adopts the data from before accounts. */
    hasUsers(): boolean {
      return (countUsers.get() as { n: number }).n > 0;
    },
    /** "taken" when the name is someone's already, case aside. */
    insertUser(id: string, name: string, passwordHash: string, now: number): User | "taken" {
      if (selectUserByName.get(name)) return "taken";
      insertUser.run(id, name, passwordHash, now);
      return userFrom(selectUser.get(id) as UserRow);
    },
    /** A new password signs every device out (the standard safeguard) and records when it changed, never what from or to. */
    setPassword(userId: string, passwordHash: string, now: number): void {
      db.exec("BEGIN");
      try {
        updatePassword.run(passwordHash, userId);
        insertPasswordChange.run(userId, now);
        revokeSessions.run(now, userId);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    /** Makes the account an admin, or takes it back, recording the change; the same value again changes and records nothing. */
    setAdmin(userId: string, admin: boolean, now: number): "changed" | "same" {
      const row = selectUser.get(userId) as UserRow | undefined;
      if (!row || (row.admin === 1) === admin) return "same";
      db.exec("BEGIN");
      try {
        updateAdmin.run(admin ? 1 : 0, userId);
        insertAdminChange.run(userId, admin ? 1 : 0, now);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return "changed";
    },
    insertSession(session: { id: string; tokenHash: string; userId: string; userAgent: string; device: string }, now: number): void {
      insertSession.run(session.id, session.tokenHash, session.userId, session.userAgent, session.device, now, now);
    },
    /** The live session a cookie's secret names, or null. */
    sessionByToken(tokenHash: string): SessionRow | null {
      return (selectSessionByToken.get(tokenHash) as SessionRow | undefined) ?? null;
    },
    touchSession(id: string, now: number): void {
      touchSession.run(now, id);
    },
    /** The account's live sessions, newest first, the caller's marked. */
    listSessions(userId: string, currentId: string): Session[] {
      return (selectSessions.all(userId) as SessionRow[]).map((s) => Session.parse({ id: s.id, device: s.device, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === currentId }));
    },
    /** Revokes one of the account's sessions. "missing" when it isn't theirs or never existed; revoking twice keeps the first time. */
    revokeSession(userId: string, sessionId: string, now: number): "ok" | "missing" {
      if (!sessionExists.get(sessionId, userId)) return "missing";
      revokeSession.run(now, sessionId, userId);
      return "ok";
    },
    revokeAllSessions(userId: string, now: number): void {
      revokeSessions.run(now, userId);
    },
    recordLoginAttempt(now: number, name: string, ok: boolean, address: string): void {
      insertAttempt.run(now, name, ok ? 1 : 0, address);
    },
    close() {
      db.close();
    },
  };
}
