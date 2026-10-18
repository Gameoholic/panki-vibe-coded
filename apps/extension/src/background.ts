import "./setup";
import { PIECE_MIME, mediaMimeFor } from "@panki/contracts";
import { latticeOf, lookUp } from "./dictionary/lookup";
import { listDictionaries } from "./dictionary/store";
import { lookAllowed, patternsOf, permissionsFor } from "./lookSettings";
import { popupLayoutOf, withMeanings } from "./popupLayout";
import { Ask, type Done, type Heard, type Latticed, type LookState, type Looked, type Pieced, type State, type Transcripted, type Trigger, type Voiced } from "./messages";
import { PankiError, panki, type Door } from "./panki";
import { mappingOn } from "./roles";
import { forgetSignIn, prefsOf, readStore, writeStore, type Stored } from "./storage";
import { sourceOf } from "./subtitles";

/**
 * The extension's one worker. It holds the sign-in and is the only thing that talks to Panki (word audio from Forvo
 * included: Panki's server is what calls Forvo); a page's script asks it, by message, and never sees the secret. It also hears the two ways a capture is asked for from outside a page
 * (the right-click menu, the toolbar button) and tells the page in front to capture, putting Panki's script into that
 * one tab first when it isn't there. It looks words up in the dictionaries for the pages' scripts (`dictionary/`), and
 * puts the script that does that onto every page the owner allows. It is woken for each of these and keeps nothing
 * between them but what's in storage and the dictionaries' database (a few look-ups are remembered while it's
 * awake). (There was a keyboard shortcut too, Alt+P; the owner had it taken out on 2026-10-11.)
 */
const MENU = "add-to-panki";
const SIGN_IN_FIRST = "Sign in to Panki first.";
/** The video site has its own script, written into the manifest. */
const VIDEO_SITE = "https://www.youtube.com/*";

chrome.runtime.onInstalled.addListener((details) => {
  // The browser keeps the menu from here on; it's made again on an update, so it's cleared first.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU, title: "Add to Panki", contexts: ["selection"] });
  });
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});

/**
 * Tells the page in a tab to capture what's there. A video page has Panki's script already; any other gets it now,
 * which the browser allows in the tab that was just acted on and nowhere else. A page no extension may touch (the
 * browser's own, its store) is left alone.
 */
async function capture(tabId: number, frameId?: number) {
  const trigger: Trigger = { kind: "capture" };
  const where = frameId === undefined ? {} : { frameId };
  try {
    await chrome.tabs.sendMessage(tabId, trigger, where);
    return;
  } catch {
    // Nothing of Panki's is on this page yet.
  }
  try {
    await chrome.scripting.executeScript({ target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] }, files: ["page.js"] });
    await chrome.tabs.sendMessage(tabId, trigger, where);
  } catch {
    // Not a page Panki can be put on.
  }
}

async function captureIn(tab: chrome.tabs.Tab | undefined) {
  const id = tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (id !== undefined) await capture(id);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU && tab?.id !== undefined) void capture(tab.id, info.frameId);
});
chrome.action.onClicked.addListener((tab) => void captureIn(tab));

/** A clip as it came through a message, back into bytes. */
function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** A file as text, for a message. (A worker has no FileReader.) */
async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) text += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(text);
}

/** The dictionary's answers. They need no sign-in: the dictionaries are this browser's own, and nothing goes to Panki. */
async function look(ask: Extract<Ask, { kind: "lookState" | "lookup" | "lattice" }>, sender: chrome.runtime.MessageSender): Promise<LookState | Looked | Latticed> {
  try {
    if (ask.kind === "lookup") return { ok: true, found: await lookUp(ask.text) };
    if (ask.kind === "lattice") return { ok: true, lattice: await latticeOf(ask.text) };
    const [store, dictionaries] = await Promise.all([readStore(), listDictionaries()]);
    const on = dictionaries.filter((d) => d.on);
    return {
      ok: true,
      on: on.length > 0 && lookAllowed(store.lookWhere, store.lookSites, sender.url ?? sender.tab?.url),
      key: store.lookKey,
      dictionaries: on.length,
      signature: on.map((d) => d.id).join(","),
      layout: popupLayoutOf(store.popupLayout, withMeanings(dictionaries)),
    };
  } catch (e) {
    console.error("Panki:", e);
    return { ok: false, message: "The dictionary couldn't be read." };
  }
}

/**
 * Panki's script on every page, for pointing at a word: put there by the browser on each page it loads while the
 * setting and the browser's permission both allow it, and taken off when either stops. The video site is left out:
 * its own script does the same there. Without this, the script is only ever put into a tab when the owner acts (the
 * menu, the button).
 */
const PAGE_SCRIPT = "panki-page";
async function placePageScript(): Promise<void> {
  const store = await readStore();
  const wanted = permissionsFor(store.lookWhere, store.lookSites);
  const allowed = wanted.length > 0 && (await chrome.permissions.contains({ origins: wanted }));
  const there = (await chrome.scripting.getRegisteredContentScripts({ ids: [PAGE_SCRIPT] })).length > 0;
  if (there) await chrome.scripting.unregisterContentScripts({ ids: [PAGE_SCRIPT] });
  if (!allowed) return;
  const left = [VIDEO_SITE, ...(store.lookWhere === "except" ? patternsOf(store.lookSites) : [])];
  await chrome.scripting.registerContentScripts([{ id: PAGE_SCRIPT, js: ["page.js"], matches: wanted, excludeMatches: left, runAt: "document_idle", persistAcrossSessions: true }]);
}
const LOOK_KEYS = new Set(["lookWhere", "lookSites"]);
/** One at a time: two settled at once would both take the script off and both put it back. */
let placing = Promise.resolve();
const replace = () => {
  placing = placing.then(placePageScript).catch((e: unknown) => console.error("Panki:", e));
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((key) => LOOK_KEYS.has(key))) replace();
});
chrome.permissions.onAdded.addListener(replace);
chrome.permissions.onRemoved.addListener(replace);
chrome.runtime.onStartup.addListener(replace);
chrome.runtime.onInstalled.addListener(replace);

/** A video's transcript with what runs transcribing, asked of Panki in one go, and this browser's own: where the words come from, and how transcribing behaves for this viewer. */
async function transcripted(door: Door, videoId: string, store: Stored): Promise<Transcripted> {
  const [transcript, transcription] = await Promise.all([panki.transcript(door, videoId), panki.transcription(door)]);
  return { ok: true, transcript, settings: transcription.settings, key: transcription.key !== null, source: sourceOf(store.subtitleSource), prefs: prefsOf(store) };
}

async function answer(ask: Ask, sender: chrome.runtime.MessageSender): Promise<State | Done | LookState | Looked | Latticed | Voiced | Heard | Transcripted | Pieced> {
  if (ask.kind === "options") {
    // The page opens on that tab, or turns to it if it's open already (it reads the store again as it gets the focus).
    if (ask.tab) await writeStore({ optionsTab: ask.tab });
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (ask.kind === "open") {
    // Panki, as the profile in use knows it (the owner, 2026-10-17: "it grabs the url from the extension profile"); the page never holds the address itself.
    const { address, token } = await readStore();
    if (address && token) await chrome.tabs.create({ url: `${address}/` });
    else {
      await writeStore({ optionsTab: "account" });
      await chrome.runtime.openOptionsPage();
    }
    return { ok: true };
  }
  if (ask.kind === "deck") {
    await writeStore({ defaultDeckId: ask.deckId });
    return { ok: true };
  }
  if (ask.kind === "subtitles") {
    await writeStore({ subtitleSource: sourceOf(ask.source) });
    return { ok: true };
  }
  if (ask.kind === "prefs") {
    const { trigger, paused, overVideo, style, markUnder, markOver } = ask.prefs;
    await writeStore({
      ...(trigger !== undefined ? { transcribeTrigger: trigger } : {}),
      ...(paused !== undefined ? { transcribePaused: paused } : {}),
      ...(overVideo !== undefined ? { transcribeOverVideo: overVideo } : {}),
      ...(style !== undefined ? { subtitleStyle: style } : {}),
      ...(markUnder !== undefined ? { markUnder } : {}),
      ...(markOver !== undefined ? { markOver } : {}),
    });
    return { ok: true };
  }
  if (ask.kind === "lookState" || ask.kind === "lookup" || ask.kind === "lattice") return look(ask, sender);
  const store = await readStore();
  if (!store.address || !store.token) return { ok: false, message: SIGN_IN_FIRST, signedOut: true };
  const door: Door = { address: store.address, token: store.token };
  try {
    if (ask.kind === "state") {
      const [decks, types, srsTypes] = await Promise.all([panki.decks(door), panki.types(door), panki.srsTypes(door)]);
      const decksOn = decks.filter((deck) => mappingOn(store.mappingOn, store.maps, deck.id)).map((deck) => deck.id);
      return { ok: true, decks, types, srsTypes, maps: store.maps, decksOn, defaultDeckId: store.defaultDeckId, clipToWords: store.clipToWords };
    }
    if (ask.kind === "add") {
      await panki.addCard(door, ask.deckId, ask.card);
      return { ok: true };
    }
    // Word audio from Forvo, through Panki, whose server holds the key: a word's recordings, and one of them kept as
    // a file, with its bytes for the drawer to play.
    if (ask.kind === "voices") return { ok: true, voices: await panki.forvoVoices(door, ask.word) };
    if (ask.kind === "voice") {
      const mediaId = await panki.forvoTake(door, { word: ask.word, id: ask.id });
      const file = await panki.media(door, mediaId);
      return { ok: true, mediaId, mime: file.type || "audio/mpeg", base64: await base64Of(file) };
    }
    // A video's transcript, the pieces of its sound on their way to the engine through Panki, and a word fixed by
    // hand: Panki's server holds the engine's key and the transcript, shared by everyone.
    if (ask.kind === "transcript") return transcripted(door, ask.videoId, store);
    if (ask.kind === "piece") {
      let wav: Uint8Array<ArrayBuffer> | null = null;
      if (ask.base64 !== null) {
        try {
          wav = bytesOf(ask.base64);
        } catch {
          return { ok: false, message: "The piece didn't arrive whole." };
        }
      }
      const meta = { startMs: ask.startMs, soundMs: ask.soundMs, endMs: ask.endMs, check: ask.check };
      const heard = await panki.putPiece(door, ask.videoId, ask.pieceId, meta, wav ? new Blob([wav], { type: PIECE_MIME }) : null);
      return { ok: true, transcript: heard.transcript, language: heard.language, verdict: heard.verdict };
    }
    if (ask.kind === "fix") {
      await panki.fixWord(door, ask.videoId, ask.fix);
      return transcripted(door, ask.videoId, store);
    }
    if (ask.kind === "forget") {
      await panki.forgetTranscript(door, ask.videoId, ask.stretch ?? {});
      return transcripted(door, ask.videoId, store);
    }
    // A clip recorded for a card: kept as a file on Panki, to be named in the card's field when the card is made.
    const mime = mediaMimeFor(ask.mediaKind, ask.mime);
    if (!mime) return { ok: false, message: "This browser recorded a kind of file Panki doesn't take." };
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = bytesOf(ask.base64);
    } catch {
      return { ok: false, message: "The clip didn't arrive whole." };
    }
    await panki.uploadMedia(door, ask.mediaId, mime, new Blob([bytes], { type: mime }));
    // What's said in it, kept with it: a card plays the clip with its subtitles. A clip that can't keep them isn't made.
    if (ask.cues && ask.cues.length > 0) await panki.putCues(door, ask.mediaId, ask.cues);
    return { ok: true };
  } catch (e) {
    // Signed out from Panki's own Settings: the secret is no good any more, and is forgotten here too.
    if (e instanceof PankiError && e.status === 401) {
      await forgetSignIn();
      return { ok: false, message: SIGN_IN_FIRST, signedOut: true };
    }
    if (e instanceof PankiError) return { ok: false, message: e.message, status: e.status };
    // Nothing Panki said: a fault of the extension's own. Its words go to the worker's console (never anything of the
    // sign-in), so "Something went wrong" can be looked into from the extension's card in the browser.
    console.error("Panki:", e);
    return { ok: false, message: "Something went wrong." };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  // Only this extension's own pages and scripts are answered, and only for a message of a known shape.
  if (sender.id !== chrome.runtime.id) return false;
  const ask = Ask.safeParse(message);
  if (!ask.success) return false;
  void answer(ask.data, sender).then(respond);
  // The answer comes later: the channel is held open for it.
  return true;
});
