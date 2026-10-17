import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { NewPassword, PASSWORD_MIN, UserName } from "@panki/contracts";
import { openAuthDb, type AuthDb } from "../authDb";
import { userDir } from "../dbs";
import { env } from "../env";
import { hashPassword } from "../password";

/**
 * Accounts are made from the terminal, never from the app: `pnpm user:add <name> <password>` (the owner's choice to
 * pass the password on the command line), `pnpm user:password <name> <newPassword>`, `pnpm user:list`, and
 * `pnpm user:admin <name> [off]`, which makes an account an admin (one that changes what everyone shares) or takes it back.
 * Expected failures print one line and exit 1; nothing else is printed about a password.
 */

class Refusal extends Error {}

const USAGE = ["pnpm user:add <name> <password>", "pnpm user:password <name> <newPassword>", "pnpm user:list", "pnpm user:admin <name> [off]"].join("\n");
const COMMANDS = ["add", "password", "list", "admin"] as const;
type Command = (typeof COMMANDS)[number];
const isCommand = (word: string | undefined): word is Command => COMMANDS.some((command) => command === word);

function nameOf(raw: string | undefined): string {
  const parsed = UserName.safeParse(raw ?? "");
  if (!parsed.success) throw new Refusal("A name is letters, digits, dots, dashes and underscores, up to 40 of them.");
  return parsed.data;
}
function passwordOf(raw: string | undefined): string {
  const parsed = NewPassword.safeParse(raw ?? "");
  if (!parsed.success) throw new Refusal(`A password is at least ${PASSWORD_MIN} characters.`);
  return parsed.data;
}
const madeOn = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * The data from before accounts existed becomes the first account's: `panki.sqlite` (and its WAL files) is moved,
 * never copied, into that account's folder. Windows won't move a file another process holds open, which is the API.
 */
function adopt(dataDir: string, userId: string): boolean {
  const names = ["panki.sqlite", "panki.sqlite-wal", "panki.sqlite-shm"].filter((name) => existsSync(path.join(dataDir, name)));
  if (!names.includes("panki.sqlite")) return false;
  const target = userDir(dataDir, userId);
  mkdirSync(target, { recursive: true });
  try {
    for (const name of names) renameSync(path.join(dataDir, name), path.join(target, name));
  } catch (e) {
    // The folder was made for a move that didn't happen; it's empty, and the account it was for is never made.
    rmSync(target, { recursive: true, force: true });
    const code = typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
    if (code === "EBUSY" || code === "EPERM") throw new Refusal("Stop `pnpm dev` first, then try again.");
    throw e;
  }
  return true;
}

async function add(auth: AuthDb, args: string[]) {
  const name = nameOf(args[0]);
  const password = passwordOf(args[1]);
  if (auth.getUserByName(name)) throw new Refusal(`${name} is taken.`);
  const id = crypto.randomUUID();
  // The move comes first: if it can't happen, no account is made and nothing has changed.
  const adopted = !auth.hasUsers() && adopt(env.dataDir, id);
  const made = auth.insertUser(id, name, await hashPassword(password), Date.now());
  if (made === "taken") throw new Refusal(`${name} is taken.`);
  console.log(`Made ${name}.`);
  if (adopted) console.log(`Moved panki.sqlite into ${userDir(env.dataDir, id)}: the decks and cards from before are ${name}'s.`);
}

async function password(auth: AuthDb, args: string[]) {
  const name = nameOf(args[0]);
  const next = passwordOf(args[1]);
  const user = auth.getUserByName(name);
  if (!user) throw new Refusal(`There's no account called ${name}.`);
  auth.setPassword(user.id, await hashPassword(next), Date.now());
  console.log(`Changed the password for ${user.name}. Every device was signed out; sign in again with the new one.`);
}

function list(auth: AuthDb) {
  const users = auth.listUsers();
  if (users.length === 0) {
    console.log("No accounts yet.");
    return;
  }
  for (const user of users) console.log(`${user.name} · made ${madeOn(user.createdAt)}${user.admin ? " · admin" : ""}`);
}

/** `admin <name>` makes the account an admin; `admin <name> off` takes it back. Either again changes nothing and says so. */
function admin(auth: AuthDb, args: string[]) {
  const name = nameOf(args[0]);
  if (args[1] !== undefined && args[1] !== "off") throw new Refusal(USAGE);
  const on = args[1] !== "off";
  const user = auth.getUserByName(name);
  if (!user) throw new Refusal(`There's no account called ${name}.`);
  if (auth.setAdmin(user.id, on, Date.now()) === "same") console.log(on ? `${user.name} is an admin already.` : `${user.name} isn't an admin.`);
  else console.log(on ? `Made ${user.name} an admin.` : `${user.name} is no longer an admin.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!isCommand(command)) throw new Refusal(USAGE);
  const auth = openAuthDb(env.dataDir);
  try {
    if (command === "add") await add(auth, args);
    else if (command === "password") await password(auth, args);
    else if (command === "admin") admin(auth, args);
    else list(auth);
  } finally {
    auth.close();
  }
}

main().catch((e: unknown) => {
  if (e instanceof Refusal) console.error(e.message);
  else console.error("Something went wrong.", e);
  process.exitCode = 1;
});
