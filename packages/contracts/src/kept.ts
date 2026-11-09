/** @panki What the extension keeps of Panki's and how it hears of a change: the state header and its kinds (`STATE_HEADER`, `KEPT_KINDS`, `formatState`, `parseState`). */
/**
 * What the extension keeps of Panki's, and how it learns that something changed. Every answer from the API carries one
 * header, `STATE_HEADER`, with a short hash for each kind of data the extension keeps, like
 * `shared=Qm9vb2tz account=c2VjcmV0 words=d29yZHM build=YnVpbGQ`. Each hash is worked out from the data as it stands,
 * never a counter bumped by hand, so every way of changing that data changes the hash. The extension notes the header
 * on every answer, and reads again anything it keeps whose kinds' hashes changed (its `kept.ts`).
 */

/** The header every API answer carries. */
export const STATE_HEADER = "X-Panki-State";

/**
 * The kinds of data the extension keeps, one entry each: what the hash covers. A new kind is one entry here and the API
 * hashing it (`apps/api/src/kept.ts`).
 */
export const KEPT_KINDS = {
  /** What every account shares: the shared settings (Panki AI's switch, provider and model; transcription; word audio) and which services have a key. */
  shared: { about: "Everyone's settings and keys" },
  /** The signed-in account's own settings and its Panki AI templates. Absent from an answer to a request that isn't signed in. */
  account: { about: "The account's settings and templates" },
  /** The words the account's cards are called by, and which of them only suspended cards are. Absent when not signed in. */
  words: { about: "The words in the account's cards" },
  /** The build of the extension this Panki carries, and the protocol it speaks. Absent when there's no build to hand out. */
  build: { about: "The extension's build" },
} as const;

export type KeptKind = keyof typeof KEPT_KINDS;
export const KEPT_KIND_IDS = Object.keys(KEPT_KINDS) as KeptKind[];

/** The hashes an answer carried, by kind; a kind the answer didn't carry is left out. */
export type KeptState = Partial<Record<KeptKind, string>>;

/** What a hash can be written as: base64url, a header's safe characters. */
const HASH = /^[A-Za-z0-9_-]{1,64}$/;
const isKind = (name: string): name is KeptKind => Object.hasOwn(KEPT_KINDS, name);

/** The header's value: `kind=hash` pairs, space-separated, in the registry's order. */
export function formatState(state: KeptState): string {
  return KEPT_KIND_IDS.flatMap((kind) => {
    const hash = state[kind];
    return hash !== undefined && HASH.test(hash) ? [`${kind}=${hash}`] : [];
  }).join(" ");
}

/** The header read back; a pair that isn't a known kind with a well-formed hash is left out. */
export function parseState(header: string | null | undefined): KeptState {
  const state: KeptState = {};
  for (const pair of (header ?? "").split(" ")) {
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const kind = pair.slice(0, at);
    const hash = pair.slice(at + 1);
    if (isKind(kind) && HASH.test(hash)) state[kind] = hash;
  }
  return state;
}
