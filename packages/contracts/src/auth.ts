import { z } from "zod";

/**
 * Who is signed in. Every account is a whole Panki of its own (its own decks, types and settings); the API keeps
 * each one's data apart. Accounts are made from the terminal (`pnpm user:add`), never from the app.
 */
export const UserId = z.uuid();
/** Short, typed on a phone: letters, digits, dot, dash, underscore. */
export const UserName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, "Letters, digits, dots, dashes and underscores only.");
export const PASSWORD_MIN = 10;
/** What a new password must be; signing in takes whatever was typed and lets the hash decide. */
export const NewPassword = z.string().min(PASSWORD_MIN).max(200);

/** What signs in besides the app itself, and which version of it: "extension/0.1.0". */
export const ClientName = z.string().regex(/^[a-z]{1,20}\/\d{1,3}\.\d{1,3}\.\d{1,3}$/);

/**
 * `bearer` is for something that can't keep the app's cookie (the browser extension): the answer then carries the
 * session's secret itself (`BearerLogin`), to be sent back as `Authorization: Bearer …`, and no cookie is set. `client`
 * says what it is, so the list of signed-in devices can name it.
 */
export const Login = z.object({ name: UserName, password: z.string().min(1).max(200), bearer: z.boolean().optional(), client: ClientName.optional() });
export type Login = z.infer<typeof Login>;

/**
 * An admin is an account that changes what everyone shares: the keys, the dictionaries kept on Panki, how transcribing
 * runs. Made one from the terminal (`pnpm user:admin <name>`), never from the app. Everyone else sees those things
 * and changes none of them.
 */
export const User = z.object({ id: UserId, name: UserName, createdAt: z.number().int().nonnegative(), admin: z.boolean() });
export type User = z.infer<typeof User>;

/** One signed-in device. Its id names the row, never the cookie's secret. */
export const SessionId = z.uuid();
export const Session = z.object({
  id: SessionId,
  /** In the app's words, from the browser's own description of itself: "Firefox on Windows", "Chrome on Android". */
  device: z.string(),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
  /** The one that made this request. */
  current: z.boolean(),
});
export type Session = z.infer<typeof Session>;

export const MeResponse = z.object({ user: User, sessions: z.array(Session) });
/** What a `bearer` sign-in answers: who it is, and the secret that says so from then on. */
export const BearerLogin = MeResponse.extend({ token: z.string().min(1) });
export const SessionList = z.object({ sessions: z.array(Session) });
