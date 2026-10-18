import { ForvoItem, ForvoList, ForvoSaid, type ForvoVoice } from "@panki/contracts";
import { sniffMimes } from "./mediaFiles";
import { timedOut } from "./outbound";

/**
 * Word audio recorded by people, from Forvo (the owner's choice, 2026-10-15, on its $2 a month plan): the one service
 * besides the owner's own that Panki calls, and only Forvo's own addresses. Nothing here is generated: each recording
 * is someone saying the word. Forvo's terms, as the owner pasted them that day: "Pronunciations by Forvo" is said where
 * they're used, a link to a file works for two hours, every list asked for and every file fetched counts against the
 * day's 500. They also say not to keep copies of the recordings; the owner, who pays for them and is their only
 * listener, decided Panki keeps each one it fetches as the account's file ("we are going to do caching"), which is
 * also what spares Forvo a request at every play; since 2026-10-18 it's kept once for everyone in the shared store
 * ("cached globally, not per account"), and so is a word's list while its links last.
 *
 * The shape of its answer isn't documented, so it's read defensively: each recording is checked on its own, one that
 * doesn't fit is dropped, and its file is fetched only from Forvo's own addresses, whatever the answer says.
 */

const API = "https://apifree.forvo.com";
/** The most a word's recording can weigh: a few seconds of sound is a few dozen kilobytes. */
const FILE_MAX = 2_000_000;
/** How long a word's list is trusted: Forvo's links to its files work for two hours from when they're given. */
const LINKS_LAST_MS = 90 * 60 * 1000;
/** How many words' lists are remembered at once. */
const REMEMBERED = 200;
/** How long a word's list or a recording may take to come back. */
const TIMEOUT_MS = 20_000;

/** The call didn't come back: cut by the deadline, or never reached. */
const unreached = (e: unknown) => new ForvoError(timedOut(e) ? "Forvo took too long to answer." : "Couldn't reach Forvo.", 502);

/** What went wrong, in the owner's words, with the answer it gets: Forvo's fault (502), or a recording that isn't there (404). */
export class ForvoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}


/** Whether an address is Forvo's own, over https: the only kind a file is fetched from. */
function isForvos(address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === "https:" && (url.hostname === "forvo.com" || url.hostname.endsWith(".forvo.com"));
  } catch {
    return false;
  }
}

export type Forvo = ReturnType<typeof createForvo>;
/** A recording fetched: its bytes (an mp3) and who said it. */
export type Fetched = { bytes: Buffer; voice: ForvoVoice };

const voiceOf = (item: ForvoItem): ForvoVoice => ({ id: item.id, by: item.username, sex: item.sex, country: item.country, votes: item.num_positive_votes });

/**
 * `fetcher` and `now` are passed in, like the API's clock, so a test can stand in for Forvo. `onRequest` is told of
 * every request made (a word's list, a file), for the count against the day's 500 that Forvo itself doesn't give.
 */
export function createForvo(fetcher: typeof fetch = fetch, now: () => number = Date.now, onRequest: () => void = () => undefined) {
  /**
   * The words' lists already asked for, oldest first, with when: one for everyone, as the key is (the owner,
   * 2026-10-18: "cached globally, not per account"; each account had its own until then, from when each had its own
   * key). The key is never part of what's kept.
   */
  const asked = new Map<string, { items: ForvoItem[]; at: number }>();

  /** A word's recordings, the best rated first. */
  async function itemsOf(key: string, word: string): Promise<ForvoItem[]> {
    const known = asked.get(word);
    if (known && now() - known.at < LINKS_LAST_MS) return known.items;
    asked.delete(word);
    let res: Response;
    onRequest();
    try {
      // The key goes in the address, as Forvo has it: the address is never logged.
      res = await fetcher(`${API}/key/${encodeURIComponent(key)}/format/json/action/word-pronunciations/word/${encodeURIComponent(word)}/language/ja/order/rate-desc`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw unreached(e);
    }
    const body: unknown = await res.json().catch(() => null);
    // Forvo says what's wrong as a list of sentences.
    const said = ForvoSaid.safeParse(body);
    if (said.success && said.data[0]) throw new ForvoError(`Forvo: ${said.data[0].slice(0, 200)}`, 502);
    if (!res.ok) throw new ForvoError("Forvo refused. Check the key in Settings.", 502);
    const listed = ForvoList.safeParse(body);
    if (!listed.success) throw new ForvoError("Forvo's answer couldn't be read.", 502);
    const items = listed.data.items.flatMap((raw) => {
      const item = ForvoItem.safeParse(raw);
      return item.success && isForvos(item.data.pathmp3) ? [item.data] : [];
    });
    // Forvo puts the best rated first; liked by more, first, settles the rest.
    items.sort((a, b) => b.num_positive_votes - a.num_positive_votes);
    asked.set(word, { items, at: now() });
    for (const old of asked.keys()) {
      if (asked.size <= REMEMBERED) break;
      asked.delete(old);
    }
    return items;
  }

  return {
    async voices(key: string, word: string): Promise<ForvoVoice[]> {
      return (await itemsOf(key, word)).map(voiceOf);
    },
    /** One recording's file, found by its id among the word's: the address is Forvo's list's, never the asker's. */
    async fetch(key: string, word: string, id: number): Promise<Fetched> {
      const item = (await itemsOf(key, word)).find((i) => i.id === id);
      if (!item) throw new ForvoError("That recording isn't on Forvo any more.", 404);
      let res: Response;
      onRequest();
      try {
        res = await fetcher(item.pathmp3, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        throw unreached(e);
      }
      // Sent on somewhere else, what came back must still be Forvo's own to be kept.
      if (!res.ok || !isForvos(res.url)) throw new ForvoError("Forvo didn't send the recording.", 502);
      const said = Number(res.headers.get("content-length"));
      if (Number.isFinite(said) && said > FILE_MAX) throw new ForvoError("Forvo sent something that isn't a recording.", 502);
      const bytes = Buffer.from(await res.arrayBuffer());
      // Believed only as far as its own first bytes, like any file Panki keeps.
      if (bytes.length === 0 || bytes.length > FILE_MAX || !sniffMimes(bytes).includes("audio/mpeg")) throw new ForvoError("Forvo sent something that isn't a recording.", 502);
      return { bytes, voice: voiceOf(item) };
    },
  };
}
