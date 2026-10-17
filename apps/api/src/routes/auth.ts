import { Router, type Request } from "express";
import { EventBatch, Login, SessionId } from "@panki/contracts";
import type { AuthDb } from "../authDb";
import type { Db } from "../db";
import { deviceOf } from "../device";
import { dummyHash, verifyPassword } from "../password";
import { clearSessionCookie, hashToken, mintToken, setSessionCookie, signedIn } from "../session";
import type { Throttle } from "../throttle";

export type AuthDeps = { auth: AuthDb; throttle: Throttle; now: () => number };

const MISMATCH = "That name and password don't match.";
const addressOf = (req: Request) => req.ip ?? "";

/** `POST /api/login`: the one route open without a session. */
export function loginRouter({ auth, throttle, now }: AuthDeps) {
  const router = Router();

  router.post("/", async (req, res) => {
    const address = addressOf(req);
    if (throttle.blocked(address, now())) {
      res.status(429).json({ error: { message: "Too many tries. Wait a minute." } });
      return;
    }
    const parsed = Login.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That sign-in isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const { name, password, bearer = false, client } = parsed.data;
    const user = auth.getUserByName(name);
    // An unknown name still does the work of a check, so the time a refusal takes says nothing about which names exist.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    const at = now();
    auth.recordLoginAttempt(at, name, ok && user !== null, address);
    if (!ok || !user) {
      throttle.failed(address, at);
      res.status(401).json({ error: { message: MISMATCH } });
      return;
    }
    throttle.passed(address);
    const token = mintToken();
    const userAgent = req.headers["user-agent"] ?? "";
    const sessionId = crypto.randomUUID();
    // Something that isn't the app says what it is, and the list of devices says it too: "Panki extension · Chrome on Windows".
    const device = client ? `Panki ${client.split("/")[0]} · ${deviceOf(userAgent)}` : deviceOf(userAgent);
    auth.insertSession({ id: sessionId, tokenHash: hashToken(token), userId: user.id, userAgent, device }, at);
    const me = { user: { id: user.id, name: user.name, createdAt: user.createdAt, admin: user.admin }, sessions: auth.listSessions(user.id, sessionId) };
    // A bearer sign-in is handed the secret itself and gets no cookie; it is a session like any other from there on,
    // listed with the devices and signed out the same ways.
    if (bearer) {
      res.json({ ...me, token });
      return;
    }
    setSessionCookie(res, token);
    res.json(me);
  });

  return router;
}

/** The signed-in account: who it is, its devices, signing out, and the ledger of what happens in the browser. */
export function accountRouter({ auth, now }: AuthDeps, dbOf: (userId: string) => Db) {
  const router = Router();

  router.get("/me", (_req, res) => {
    const { user, sessionId } = signedIn(res);
    const account = auth.getUser(user.id);
    if (!account) {
      res.status(401).json({ error: { message: "Sign in to continue." } });
      return;
    }
    res.json({ user: account, sessions: auth.listSessions(user.id, sessionId) });
  });

  router.post("/logout", (_req, res) => {
    const { user, sessionId } = signedIn(res);
    auth.revokeSession(user.id, sessionId, now());
    clearSessionCookie(res);
    res.status(204).end();
  });

  // Sign out everywhere, this device included.
  router.delete("/sessions", (_req, res) => {
    const { user } = signedIn(res);
    auth.revokeAllSessions(user.id, now());
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.delete("/sessions/:sessionId", (req, res) => {
    const { user, sessionId } = signedIn(res);
    const id = SessionId.safeParse(req.params.sessionId);
    if (!id.success || auth.revokeSession(user.id, id.data, now()) === "missing") {
      res.status(404).json({ error: { message: "That device isn't signed in." } });
      return;
    }
    if (id.data === sessionId) clearSessionCookie(res);
    res.status(204).end();
  });

  // The browser's ledger: stored as it comes, stamped with the API's clock; its own clock is kept beside it.
  router.post("/events", (req, res) => {
    const signed = signedIn(res);
    const parsed = EventBatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Those events aren't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    dbOf(signed.user.id).insertEvents(parsed.data.events, { sessionId: signed.sessionId, device: signed.device }, now());
    res.status(204).end();
  });

  return router;
}
