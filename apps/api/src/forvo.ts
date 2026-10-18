import { ForvoItem, ForvoList, ForvoSaid, type ForvoVoice } from "@panki/contracts";
import { sniffMimes } from "./mediaFiles";
import { timedOut } from "./outbound";

/**
 * Word audio recorded by people, from Forvo (the owner's choice, 2026-10-15, on its $2 a month plan): the one service
 * besides the owner's own that Panki calls, and only Forvo's own addresses. Nothing here is generated: each recording
 * is someone saying the word. Forvo's terms, as the owner pasted them that day: "Pronunciations by Forvo" is said where
 * they're used, a link to a file works for two hours, every list asked for and every file fetched counts against the
 * day's 500. They also say not to keep copies of the recordings; the owner, who pays for them and is their only
 * listener, decided Panki keeps what it fetches ("we are going to do caching"), and since 2026-10-18 keeps it on disk
 * for everyone, for good: "it needs to be saved on disk globally, cached forever so we never go to the API for a word
 * we already asked for in the past". That's the route's to do (`routes/forvo.ts`, the shared store); this is only the
 * calls themselves.
 *
 * The shape of its answer isn't documented, so it's read defensively: each recording is checked on its own, one that
 * doesn't fit is dropped, and its file is fetched only from Forvo's own addresses, whatever the answer says.
 */

const API = "https://apifree.forvo.com";
/** The most a word's recording can weigh: a few seconds of sound is a few dozen kilobytes. */
const FILE_MAX = 2_000_000;
/** How long a word's list or a recording may take to come back. */
const TIMEOUT_MS = 20_000;
/**
 * How many of a word's recordings are kept, the best liked: all of them are fetched with the list, the one time it's
 * asked for (its links last two hours, so one not fetched then could never be fetched without asking again), and each
 * counts against the day's 500. A common word has dozens; past these few nobody listens.
 */
export const KEPT_PER_WORD = 8;

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

/** A recording as Panki tells of it: who said it, from where, and how many liked it. */
export const voiceOf = (item: ForvoItem): ForvoVoice => ({ id: item.id, by: item.username, sex: item.sex, country: item.country, votes: item.num_positive_votes });

/**
 * `fetcher` is passed in, like the API's clock, so a test can stand in for Forvo. `onRequest` is told of every request
 * made (a word's list, a file), for the count against the day's 500 that Forvo itself doesn't give.
 */
export function createForvo(fetcher: typeof fetch = fetch, onRequest: () => void = () => undefined) {
  return {
    /** A word's recordings as Forvo lists them now, the best liked first: one request. */
    async list(key: string, word: string): Promise<ForvoItem[]> {
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
      return items.sort((a, b) => b.num_positive_votes - a.num_positive_votes);
    },
    /** One recording's file (an mp3), from the address its word's list gave: Forvo's own, and good for two hours. One request. */
    async download(item: ForvoItem): Promise<Buffer> {
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
      return bytes;
    },
  };
}
