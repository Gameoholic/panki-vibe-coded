import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AuthDb } from "./authDb";

/**
 * The sign-in cookie: a random secret the browser keeps for ten years, matched against the hash a session row holds.
 * Parsed by hand (one cookie, one shape) rather than through a library.
 */
export const SESSION_COOKIE = "panki_session";
const TEN_YEARS_S = 315_360_000;
// `last_seen_at` is touched at most this often per session, so a busy screen isn't a write per request.
const TOUCH_EVERY_MS = 60_000;

/** Who a request belongs to, once the middleware has let it through; `admin` is whether they may change what everyone shares. */
export type Signed = { user: { id: string; name: string; admin: boolean }; sessionId: string; device: string; userAgent: string };

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function cookieHeader(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
/** Secure only when the request came in over https (nginx's `X-Forwarded-Proto`, trusted from loopback), so plain http in dev still signs in. */
export function setSessionCookie(res: Response, token: string): void {
  res.setHeader("Set-Cookie", cookieHeader(token, TEN_YEARS_S, res.req.secure));
}
export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", cookieHeader("", 0, res.req.secure));
}

export function mintToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const isSigned = (value: unknown): value is Signed =>
  typeof value === "object" && value !== null && "user" in value && "sessionId" in value && "device" in value && "userAgent" in value;

/** The request's sign-in, set by `requireSession`; a route behind it can count on it. */
export function signedIn(res: Response): Signed {
  const signed: unknown = res.locals.signed;
  if (!isSigned(signed)) throw new Error("A route ran without a session.");
  return signed;
}

/**
 * The secret a request carries. The app's own is its cookie; something that can't keep one (the browser extension)
 * sends the same kind of secret as `Authorization: Bearer …`, got from a `bearer` sign-in. Either names a session row.
 */
function secretOf(req: Request): { token: string; fromCookie: boolean } | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return { token: header.slice("Bearer ".length).trim(), fromCookie: false };
  const cookie = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
  return cookie ? { token: cookie, fromCookie: true } : null;
}

/** Everything under `/api` but signing in itself needs a live session; a dead cookie is cleared as it's refused. */
export function requireSession(auth: AuthDb, now: () => number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = secretOf(req);
    const session = secret?.token ? auth.sessionByToken(hashToken(secret.token)) : null;
    const user = session ? auth.getUser(session.userId) : null;
    if (!session || !user) {
      if (secret?.fromCookie) clearSessionCookie(res);
      res.status(401).json({ error: { message: "Sign in to continue." } });
      return;
    }
    const at = now();
    if (at - session.lastSeenAt >= TOUCH_EVERY_MS) auth.touchSession(session.id, at);
    const signed: Signed = { user: { id: user.id, name: user.name, admin: user.admin }, sessionId: session.id, device: session.device, userAgent: session.userAgent };
    res.locals.signed = signed;
    next();
  };
}

/**
 * What everyone shares (the keys, the dictionaries kept on Panki, how transcribing runs) is changed by an admin alone;
 * everyone else reads it. Goes after `requireSession`, so the sign-in is there to look at.
 */
export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!signedIn(res).user.admin) {
    res.status(403).json({ error: { message: "Only an admin can change this." } });
    return;
  }
  next();
}
