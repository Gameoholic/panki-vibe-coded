import "./setup";
import { PIECE_MIME, UPDATE_NEEDED_STATUS, mediaMimeFor, type CardSource } from "@panki/contracts";
import { routePath } from "@web/routes";
import { hostPattern } from "./address";
import { latticeOf, lookUp } from "./dictionary/lookup";
import { listDictionaries } from "./dictionary/store";
import { lookAllowed, patternsOf, permissionsFor } from "./lookSettings";
import { popupLayoutOf, withMeanings } from "./popupLayout";
import { Ask, type Called, type Carded, type Done, type Heard, type Latticed, type Glanced, type Homed, type Known, type LookState, type Looked, type Moduled, type Pictured, type Pieced, type Redone, type Saved, type State, type Stretched, type Transcripted, type Trigger, type Updated, type Voiced, type Watched } from "./messages";
import { CLIENT } from "./client";
import { PankiError, panki, type Door } from "./panki";
import { mappingOn } from "./roles";
import { forgetSignIn, modulesOf, prefsOf, readStore, writeStore, type Stored } from "./storage";
import { sourceOf } from "./subtitles";
import { CHECK_EVERY_MINUTES, UPDATE_ALARM, checkForUpdate, downloadUpdate, noteRunning, readUpdate, runningBuild, showFolder } from "./updates";

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
    // Pop-up dictionary switched off, the key does nothing anywhere; Where is the global key's alone, never Panki's subtitles'.
    const usable = store.pankiOn && store.moduleLookup && on.length > 0;
    const url = sender.url ?? sender.tab?.url;
    return {
      ok: true,
      // Panki's own pages always count, whatever Where says (the owner, 2026-10-28): Where decides every other site.
      on: usable && (onPanki(url, store) || lookAllowed(store.lookWhere, store.lookSites, url)),
      key: store.lookKey,
      subtitleKey: store.lookKeySubtitles,
      subtitlesOn: usable,
      dictionaries: on.length,
      signature: on.map((d) => d.id).join(","),
      layout: popupLayoutOf(store.popupLayout, withMeanings(dictionaries)),
    };
  } catch (e) {
    console.error("Panki:", e);
    return { ok: false, message: "The dictionary couldn't be read." };
  }
}

/** How long the words in the cards are kept here before Panki is asked again: every page asks as it opens and gets the focus. */
const WORDS_KEPT_MS = 60_000;
/** The words in the cards of the sign-in in use (and those only suspended cards are), as last asked for, and when; let go when a card is added here. */
let wordsKept: { door: string; at: number; words: string[]; suspended: string[] } | null = null;

/** Whether a page is one of Panki's own: at the address of the sign-in in use or of any profile kept to switch to. */
function onPanki(url: string | undefined, store: Stored): boolean {
  if (!url) return false;
  const originOf = (address: string) => {
    try {
      return new URL(address).origin;
    } catch {
      return null;
    }
  };
  const here = originOf(url);
  return here !== null && [store.address, ...store.profiles.map((p) => p.address)].some((address) => address !== null && originOf(address) === here);
}

/**
 * What's marked as already in the cards, and where (`storage.ts` → `knownSubtitles`, `knownPages`, `knownColour`,
 * `knownSuspendedColour`): the words every card is called by, those only suspended cards are among them, kept a minute
 * (`WORDS_KEPT_MS`). Signed out, or with Panki off, nothing is; nor
 * on Panki's own pages, where every word is the cards' own (the owner, 2026-10-25: "it should only be used for
 * external" pages).
 */
async function known(sender: chrome.runtime.MessageSender): Promise<Known> {
  const store = await readStore();
  const off: Known = { ok: true, words: [], suspended: [], subtitles: false, pages: false, colour: store.knownColour, suspendedColour: store.knownSuspendedColour };
  if (onPanki(sender.url ?? sender.tab?.url, store)) return off;
  // The seek bar's mark of where they're said wants the words too, whatever the two highlights say.
  if (!store.pankiOn || (!store.knownSubtitles && !store.knownPages && !store.seekLook.known.shown && !store.seekLook.suspended.shown) || !store.address || !store.token) return off;
  const door: Door = { address: store.address, token: store.token };
  const at = Date.now();
  const doorKey = `${door.address}\n${door.token}`;
  if (wordsKept?.door !== doorKey || at - wordsKept.at > WORDS_KEPT_MS) {
    try {
      wordsKept = { door: doorKey, at, ...(await panki.wordsInCards(door)) };
    } catch (e) {
      console.error("Panki:", e);
      return off;
    }
  }
  return {
    ok: true,
    words: wordsKept.words,
    suspended: wordsKept.suspended,
    subtitles: store.knownSubtitles,
    pages: store.knownPages,
    colour: store.knownColour,
    suspendedColour: store.knownSuspendedColour,
  };
}

/** Panki's own addresses, as the browser matches them: the sign-in in use and every profile kept, each allowed as it was signed in to. */
function pankiPatterns(store: Stored): string[] {
  const patterns = [store.address, ...store.profiles.map((p) => p.address)].flatMap((address) => {
    try {
      return address ? [hostPattern(address)] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(patterns)];
}

/**
 * Panki's script on every page, for pointing at a word: put there by the browser on each page it loads while the
 * setting and the browser's permission both allow it, and taken off when either stops; and always on Panki's own
 * pages, where both keys work whatever Where says, its words and its cards' clips' subtitles (the worker's `lookState` tells the
 * page which of its words it may look up). The video site is left out: its own script does the same there. Without
 * this, the script is only ever put into a tab when the owner acts (the menu, the button).
 */
const PAGE_SCRIPT = "panki-page";
async function placePageScript(): Promise<void> {
  const store = await readStore();
  const wanted = permissionsFor(store.lookWhere, store.lookSites);
  const allowed = wanted.length > 0 && (await chrome.permissions.contains({ origins: wanted }));
  const own = (await Promise.all(pankiPatterns(store).map(async (pattern) => ((await chrome.permissions.contains({ origins: [pattern] })) ? [pattern] : [])))).flat();
  const matches = [...new Set([...(allowed ? wanted : []), ...own])];
  const there = (await chrome.scripting.getRegisteredContentScripts({ ids: [PAGE_SCRIPT] })).length > 0;
  if (there) await chrome.scripting.unregisterContentScripts({ ids: [PAGE_SCRIPT] });
  if (matches.length === 0) return;
  // Sites left out by Where are left out but for Panki itself, whose subtitles are looked up all the same.
  const ownHosts = new Set(own.map((pattern) => new URL(pattern).hostname));
  const leftOut = store.lookWhere === "except" ? patternsOf(store.lookSites.filter((site) => !ownHosts.has(site))) : [];
  await chrome.scripting.registerContentScripts([{ id: PAGE_SCRIPT, js: ["page.js"], matches, excludeMatches: [VIDEO_SITE, ...leftOut], runAt: "document_idle", persistAcrossSessions: true }]);
}
const LOOK_KEYS = new Set(["lookWhere", "lookSites", "address", "profiles"]);
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

/**
 * Whether there's a newer build on Panki (`updates.ts`): asked as Chrome starts and as the extension is installed or
 * reloaded (an update put in place shows as up to date at once), every hour on an alarm (which wakes the worker), and
 * when the profile in use changes to another Panki.
 */
function startChecking() {
  void chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: CHECK_EVERY_MINUTES });
  // The code just loaded is the build in the folder now: noted first, so the check compares Panki's with it.
  void noteRunning().then(checkForUpdate);
}
chrome.runtime.onStartup.addListener(startChecking);
chrome.runtime.onInstalled.addListener(startChecking);
// Reloaded from the options page with Reload Panki: that page, closed by the reload, opens again.
chrome.runtime.onInstalled.addListener(() => {
  void readStore().then(async (store) => {
    if (!store.reopenOptions) return;
    await writeStore({ reopenOptions: false });
    await chrome.runtime.openOptionsPage();
  });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) void checkForUpdate();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "address" in changes) void checkForUpdate();
});

/** A video's transcript with what runs transcribing, asked of Panki in one go, and this browser's own: where the words come from, and how transcribing behaves for this viewer. */
async function transcripted(door: Door, videoId: string, store: Stored): Promise<Transcripted> {
  const [transcript, transcription] = await Promise.all([panki.transcript(door, videoId), panki.transcription(door)]);
  return {
    ok: true,
    transcript,
    settings: transcription.settings,
    // The language this account's videos are told to the engine in: its own. The page reads it to say so.
    language: transcription.own,
    key: transcription.key !== null,
    estimate: transcription.estimate,
    source: sourceOf(store.subtitleSource),
    prefs: prefsOf(store),
  };
}

/** A capture's source with the build that made it written into what it knew (`CaptureFacts.build`): as it came when there's no source, or the build can't be told. */
async function stamped(source: CardSource | undefined): Promise<{ source?: CardSource }> {
  if (!source) return {};
  const build = await runningBuild();
  return { source: build ? { ...source, capture: { ...source.capture, build } } : source };
}

async function answer(ask: Ask, sender: chrome.runtime.MessageSender): Promise<State | Done | LookState | Looked | Latticed | Voiced | Heard | Pictured | Carded | Called | Transcripted | Pieced | Redone | Stretched | Moduled | Watched | Homed | Glanced | Saved | Updated> {
  // Keeping the extension up to date needs no sign-in: Panki's build is anyone's to ask about and download.
  if (ask.kind === "update") return { ok: true, update: await readUpdate() };
  if (ask.kind === "checkUpdate") return { ok: true, update: await checkForUpdate() };
  if (ask.kind === "downloadUpdate") return (await downloadUpdate()) ? { ok: true } : { ok: false, message: "Set where your Panki is first." };
  if (ask.kind === "showFolder") {
    await showFolder();
    return { ok: true };
  }
  if (ask.kind === "reloadPanki") {
    // Asked from the options page, which the reload closes: it opens again on its About tab once the extension is back.
    if (ask.reopen) await writeStore({ reopenOptions: true, optionsTab: "account" });
    // Answered first: the reload takes this worker, and every script of this extension's on a page, with it.
    setTimeout(() => chrome.runtime.reload(), 100);
    return { ok: true };
  }
  if (ask.kind === "options") {
    // The page opens on that tab, or turns to it if it's open already (it reads the store again as it gets the focus).
    if (ask.tab) await writeStore({ optionsTab: ask.tab });
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (ask.kind === "open") {
    // Panki, as the profile in use knows it (the owner, 2026-10-17: "it grabs the url from the extension profile"); the
    // page never holds the address itself. A card is opened by its ids alone, at the address the app reads them from.
    const { address, token } = await readStore();
    const at = ask.card ? routePath({ kind: "deck", id: encodeURIComponent(ask.card.deckId), tab: "cards", card: encodeURIComponent(ask.card.cardId) }) : "/";
    if (address && token) await chrome.tabs.create({ url: `${address}${at}` });
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
    const { trigger, overVideo, style, markUnder, markOver, mode } = ask.prefs;
    await writeStore({
      ...(trigger !== undefined ? { transcribeTrigger: trigger } : {}),
      ...(overVideo !== undefined ? { transcribeOverVideo: overVideo } : {}),
      ...(style !== undefined ? { subtitleStyle: style } : {}),
      ...(markUnder !== undefined ? { markUnder } : {}),
      ...(markOver !== undefined ? { markOver } : {}),
      ...(mode !== undefined ? { transcribeMode: mode } : {}),
    });
    return { ok: true };
  }
  if (ask.kind === "lookState" || ask.kind === "lookup" || ask.kind === "lattice") return look(ask, sender);
  if (ask.kind === "known") return known(sender);
  if (ask.kind === "modules") return { ok: true, modules: modulesOf(await readStore()) };
  if (ask.kind === "pankiOn") {
    await writeStore({ pankiOn: ask.on });
    return { ok: true };
  }
  const store = await readStore();
  if (!store.address || !store.token) return { ok: false, message: SIGN_IN_FIRST, signedOut: true };
  const door: Door = { address: store.address, token: store.token };
  try {
    if (ask.kind === "state") {
      const [decks, types, srsTypes, subtitleStyle] = await Promise.all([panki.decks(door), panki.types(door), panki.srsTypes(door), panki.subtitleStyle(door)]);
      const decksOn = decks.filter((deck) => mappingOn(store.mappingOn, store.maps, deck.id)).map((deck) => deck.id);
      return { ok: true, decks, types, srsTypes, maps: store.maps, decksOn, defaultDeckId: store.defaultDeckId, subtitleStyle };
    }
    if (ask.kind === "add") {
      await panki.addCard(door, ask.deckId, { ...ask.card, ...(await stamped(ask.card.source)) });
      // A card's words are words in the cards now: asked for afresh next time.
      wordsKept = null;
      return { ok: true };
    }
    if (ask.kind === "addExample") {
      await panki.addExample(door, ask.deckId, ask.cardId, { ...ask.example, ...(await stamped(ask.example.source)) });
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
    // A video's pictures, kept by Panki for everyone: each asked for on its own, so one that YouTube won't give leaves the other.
    if (ask.kind === "pictures") {
      const shown = async (file: Promise<Blob>) => {
        try {
          const blob = await file;
          return { mime: blob.type || "image/jpeg", base64: await base64Of(blob) };
        } catch (e) {
          if (e instanceof PankiError && e.status === 401) throw e;
          return null;
        }
      };
      const [thumbnail, avatar] = await Promise.all([shown(panki.thumbnail(door, ask.videoId)), ask.avatar === null ? null : shown(panki.avatar(door, ask.videoId, ask.avatar))]);
      return { ok: true, thumbnail, avatar };
    }
    if (ask.kind === "videoCards") return { ok: true, cards: await panki.videoCards(door, ask.videoId) };
    // What's kept of the account's watching: a video as it opens, the stretches watched, a video marked.
    if (ask.kind === "watched") return { ok: true, video: await panki.watched(door, ask.videoId) };
    if (ask.kind === "watch") {
      await panki.watch(door, ask.batch);
      return { ok: true };
    }
    if (ask.kind === "watchMark") return { ok: true, video: await panki.watchMark(door, ask.videoId, ask.mark, ask.source) };
    // Panki on YouTube's own pages: the tiles over its home's videos, and the marks on its thumbnails.
    if (ask.kind === "home") {
      const [stats, decks, settings, saved] = await Promise.all([panki.stats(door), panki.decks(door), panki.settings(door), panki.saved(door)]);
      // The profile's own name when it has one ("Prod", "Dev"), the account's otherwise: the pill says which Panki this is.
      return { ok: true, name: store.userName ?? "", profile: store.profileName || (store.userName ?? ""), stats, decks, settings, saved };
    }
    if (ask.kind === "glance") return { ok: true, videos: await panki.glance(door, ask.videoIds) };
    // Saved for later, the account's own on Panki: a save from a thumbnail's button, or one taken back.
    if (ask.kind === "save") return { ok: true, videos: await panki.save(door, ask.videoId, ask.about) };
    if (ask.kind === "called") return { ok: true, cards: await panki.cardsCalled(door, ask.words) };
    // A video's transcript, the pieces of its sound on their way to the engine through Panki, and a word fixed by
    // hand: Panki's server holds the engine's key and the transcript, shared by everyone.
    if (ask.kind === "transcript") return transcripted(door, ask.videoId, store);
    if (ask.kind === "poll") return { ok: true, transcript: await panki.transcript(door, ask.videoId), engineMs: null };
    if (ask.kind === "whole") return { ok: true, transcript: await panki.wholeVideo(door, ask.videoId, ask.lengthMs), engineMs: null };
    if (ask.kind === "piece") {
      let wav: Uint8Array<ArrayBuffer> | null = null;
      if (ask.base64 !== null) {
        try {
          wav = bytesOf(ask.base64);
        } catch {
          return { ok: false, message: "The chunk didn't arrive whole." };
        }
      }
      const meta = { startMs: ask.startMs, soundMs: ask.soundMs, endMs: ask.endMs, since: ask.since, redo: ask.redo };
      const heard = await panki.putPiece(door, ask.videoId, ask.pieceId, meta, wav ? new Blob([wav], { type: PIECE_MIME }) : null);
      return { ok: true, transcript: heard.transcript, engineMs: heard.engineMs };
    }
    if (ask.kind === "fix") {
      await panki.fixWord(door, ask.videoId, ask.fix);
      return transcripted(door, ask.videoId, store);
    }
    if (ask.kind === "line") {
      await panki.fixLine(door, ask.videoId, ask.fix);
      return transcripted(door, ask.videoId, store);
    }
    if (ask.kind === "forget") {
      await panki.forgetTranscript(door, ask.videoId, ask.stretch ?? {});
      return transcripted(door, ask.videoId, store);
    }
    if (ask.kind === "redoStretch") return { ok: true, stretch: await panki.redoStretch(door, ask.videoId, ask.stretch.startMs, ask.stretch.endMs) };
    if (ask.kind === "redo") {
      const taken = await panki.startRedo(door, ask.videoId, ask.redo);
      return { ok: true, transcript: taken.transcript, redo: taken.redo };
    }
    if (ask.kind === "redoEnd") {
      const transcript = ask.done ? await panki.finishRedo(door, ask.videoId, ask.redoId) : await panki.cancelRedo(door, ask.videoId, ask.redoId);
      return { ok: true, transcript, engineMs: null };
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
    // How it was recorded, kept with it for recording it again later. It never stops the card: a Panki from before that
    // can't keep it leaves the file as it is, and the fault goes to the worker's console.
    if (ask.recording) {
      const build = await runningBuild();
      await panki
        .putRecording(door, ask.mediaId, { ...ask.recording, client: CLIENT, ...(build ? { build } : {}) })
        .catch((e: unknown) => console.error("Panki: how the recording was made wasn't kept.", e instanceof Error ? e.message : e));
    }
    return { ok: true };
  } catch (e) {
    // Signed out from Panki's own Settings: the secret is no good any more, and is forgotten here too.
    if (e instanceof PankiError && e.status === 401) {
      await forgetSignIn();
      return { ok: false, message: SIGN_IN_FIRST, signedOut: true };
    }
    // Refused as too old for Panki: asked again at once, so every page and the badge say "Update needed".
    if (e instanceof PankiError && e.status === UPDATE_NEEDED_STATUS) void checkForUpdate();
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
  if (!ask.success) {
    // Said, not left unanswered: an unanswered message reads on the page as the extension gone. Where it's wrong, never
    // what it held (a sign-in's password is one of the messages).
    console.error("Panki: a request it can't read:", ask.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    respond({ ok: false, message: "Panki couldn't read this request." });
    return false;
  }
  void answer(ask.data, sender).then(respond);
  // The answer comes later: the channel is held open for it.
  return true;
});
