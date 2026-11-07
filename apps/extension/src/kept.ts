import { z } from "zod";
import { ExtensionBuild, WordsInCards, type KeptKind, type KeptState, type PankiAiStatus } from "@panki/contracts";
import { AiShown } from "./messages";
import { panki, stateSeen } from "./panki";
import type { Stored } from "./storage";

/**
 * Everything the worker keeps of what Panki tells it, one entry each, and the one way it's kept: in the browser's
 * session storage (a worker keeps nothing between wakings), under the sign-in or the Panki it came from, and read again
 * once Panki's state header says one of its kinds changed (`panki.ts` notes it on every answer; the contracts'
 * `kept.ts`). Each entry's lifetime is a safety net for a change made while the extension called Panki for nothing
 * else; the header is how a change is learned. The worker alone.
 */

/** Whose an entry is: the account signed in on that Panki (dropped as the sign-in changes), or anyone's at that Panki. */
type Scope = "signIn" | "address";

type Entry<T> = {
  /** What's kept, read back through it: a kept value that no longer reads is asked for again. */
  schema: z.ZodType<T>;
  /** The kinds of the state header it's made from: a change to any of them and it's asked for again. */
  kinds: readonly KeptKind[];
  scope: Scope;
  /** How long it's trusted with nothing heard of a change. */
  lifeMs: number;
  /** How it's asked of Panki. A sign-in's entry is asked with its secret, anyone's without. */
  ask: (address: string, token: string | null) => Promise<T>;
};
const entry = <T>(e: Entry<T>): Entry<T> => e;

/** Panki AI as the worker hands it to a page: never an admin's saved key (`AiShown`). */
export function aiShownOf(ai: PankiAiStatus): AiShown {
  return {
    settings: ai.settings,
    key: ai.key,
    learningLanguage: ai.learningLanguage,
    language: ai.language,
    templates: ai.templates,
    defaults: ai.defaults,
    askOverMicros: ai.askOverMicros,
    showCostOverMicros: ai.showCostOverMicros,
  };
}

const MINUTE = 60_000;

const signedIn = (token: string | null): string => {
  if (!token) throw new Error("Kept for a sign-in, asked with none.");
  return token;
};

/** The registry. A new thing kept of Panki's is one entry here. */
export const KEPT = {
  /** The words the account's cards are called by, those only suspended cards are and those a flagged card is: marked in subtitles and on pages (`capture/known.ts`). */
  words: entry({ schema: WordsInCards, kinds: ["words"], scope: "signIn", lifeMs: MINUTE, ask: (address, token) => panki.wordsInCards({ address, token: signedIn(token) }) }),
  /** Panki AI as it stands for everyone and for the account: what Explain, Touch up and Proofread are worked out from. */
  ai: entry({ schema: AiShown, kinds: ["shared", "account"], scope: "signIn", lifeMs: MINUTE, ask: async (address, token) => aiShownOf(await panki.ai({ address, token: signedIn(token) })) }),
  /** The build of the extension the Panki carries (`updates.ts`): anyone's, so asked with no sign-in. */
  build: entry({ schema: ExtensionBuild, kinds: ["build"], scope: "address", lifeMs: 60 * MINUTE, ask: (address) => panki.extensionBuild(address) }),
} as const;

export type KeptName = keyof typeof KEPT;
type ValueOf<N extends KeptName> = (typeof KEPT)[N] extends Entry<infer T> ? T : never;

const KeptRecord = z.object({ who: z.string(), at: z.number(), state: z.record(z.string(), z.string()), value: z.unknown() });
const keyOf = (name: KeptName) => `kept:${name}`;

/** Whose an entry is, from the store: the Panki and the account signed in to it, or the Panki alone. */
function whoOf(scope: Scope, store: Stored): string | null {
  if (!store.address) return null;
  if (scope === "address") return store.address;
  return store.token ? `${store.address}\n${store.userName ?? ""}` : null;
}

/** The hashes of an entry's kinds as last seen from its Panki. */
async function stateOf(kinds: readonly KeptKind[], address: string): Promise<KeptState> {
  const seen = await stateSeen(address);
  return Object.fromEntries(kinds.flatMap((kind) => (seen[kind] === undefined ? [] : [[kind, seen[kind]]])));
}

/** An entry as it's kept, when it's this one's and still reads; how fresh it is is the caller's to judge. */
async function keptOf<N extends KeptName>(name: N, store: Stored): Promise<{ at: number; state: KeptState; value: ValueOf<N> } | null> {
  const e = KEPT[name] as Entry<ValueOf<N>>;
  const who = whoOf(e.scope, store);
  const kept = KeptRecord.safeParse((await chrome.storage.session.get(keyOf(name)))[keyOf(name)]);
  if (who === null || !kept.success || kept.data.who !== who) return null;
  const value = e.schema.safeParse(kept.data.value);
  return value.success ? { at: kept.data.at, state: kept.data.state as KeptState, value: value.data } : null;
}

/** Keeps a value Panki just gave, stamped with its kinds' hashes as they stand now. */
export async function putKept<N extends KeptName>(name: N, store: Stored, value: ValueOf<N>): Promise<ValueOf<N>> {
  const e = KEPT[name] as Entry<ValueOf<N>>;
  const who = whoOf(e.scope, store);
  if (who === null || !store.address) return value;
  const state = await stateOf(e.kinds, store.address);
  await chrome.storage.session.set({ [keyOf(name)]: { who, at: Date.now(), state, value } satisfies z.infer<typeof KeptRecord> });
  return value;
}

/**
 * The value kept, as long as it's this sign-in's (or this Panki's), younger than its lifetime and none of its kinds has
 * changed since it was kept; asked of Panki otherwise, and with `fresh` whatever. A kind that either side never heard
 * of judges nothing. A failure to ask is the caller's: what was kept stays as it was.
 */
export async function readKept<N extends KeptName>(name: N, store: Stored, fresh = false): Promise<ValueOf<N>> {
  const e = KEPT[name] as Entry<ValueOf<N>>;
  if (!store.address) throw new Error("No Panki to ask.");
  if (!fresh) {
    const kept = await keptOf(name, store);
    if (kept && Date.now() - kept.at < e.lifeMs) {
      const now = await stateOf(e.kinds, store.address);
      if (e.kinds.every((kind) => now[kind] === undefined || kept.state[kind] === undefined || now[kind] === kept.state[kind])) return kept.value;
    }
  }
  return putKept(name, store, await e.ask(store.address, store.token));
}

/** The value kept, however old, and when it was kept; never asks Panki. Null when there's none of this sign-in's or Panki's. */
export async function peekKept<N extends KeptName>(name: N, store: Stored): Promise<{ at: number; value: ValueOf<N> } | null> {
  return keptOf(name, store);
}

/** Every entry kept for a sign-in let go: the sign-in in use changed (signed in, signed out, another profile). */
export async function forgetSignedIn(): Promise<void> {
  const names = (Object.keys(KEPT) as KeptName[]).filter((name) => KEPT[name].scope === "signIn");
  await chrome.storage.session.remove(names.map(keyOf));
}
