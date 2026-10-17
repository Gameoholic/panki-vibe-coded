import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Passwords are kept as scrypt hashes, nothing else: Node's own `scrypt`, no dependency. The stored string carries its
 * own parameters, so raising the cost later only changes what new hashes look like; old ones still verify as they were.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// scrypt needs 128 · N · r bytes of working memory; Node's default ceiling (32 MiB) is just under what this N takes.
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem: MAX_MEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$N$r$p$salt$key`, salt and key base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Whether the password is the one the stored hash was made from. A malformed hash is simply never matched. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | null = null;
/**
 * A hash of nothing anyone knows, to verify against when the name isn't an account: the work takes as long either way,
 * so the timing of a refusal says nothing about which names exist. Made once, on the first miss.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummy;
}
