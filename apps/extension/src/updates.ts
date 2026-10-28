import { EXTENSION_PROTOCOL, ExtensionBuildFile, type ExtensionBuild } from "@panki/contracts";
import { NO_UPDATE, type UpdateState } from "./messages";
import { panki } from "./panki";
import { readStore, writeStore } from "./storage";

/**
 * Whether this extension is the build Panki carries (the contracts' `extension.ts`), kept up to date by hand without a
 * store (the owner, 2026-10-22). The worker asks the Panki the profile in use points at, as Chrome starts, as the
 * extension is (re)loaded, every hour on an alarm, when the profile changes, when a call is refused as too old, and at
 * Check now; the answer is kept in storage, where the strip, the pill and the options page read it (through the
 * worker), and is put on the toolbar button's badge. A check that fails (offline, Panki restarting) leaves the last
 * answer standing. The worker alone.
 *
 * Two builds are told apart: the one **running**, noted as the extension's code is loaded (it's what the browser runs
 * until the next reload), and the one **in the folder** now, read from disk each time: Chrome reads an unpacked
 * extension's files afresh, so the moment Update Panki (or a zip extracted by hand) has put another build there, the
 * notice says it's ready and Reload Panki wakes (the owner, 2026-10-22: a Reload button beside words nobody reads was
 * pressed as if it updated).
 */

export const UPDATE_ALARM = "panki-update";
/** How often Panki is asked, in minutes. */
export const CHECK_EVERY_MINUTES = 60;

/**
 * The badge on the toolbar button: "1" in the accent while an update is available, "!" in the flag's amber while one is
 * needed. The browser draws it and takes no token, so these are theme.css's `--accent` and `--flag`, with their inks.
 */
const BADGE = {
  available: { text: "1", color: "#3350b5", ink: "#ffffff" },
  needed: { text: "!", color: "#f2c230", ink: "#12131a" },
} as const;

/** Where the running build's account of itself is kept: the browser's session storage, which a reload or a restart empties. */
const RUNNING = "runningBuild";

/** The build in the extension's folder right now (`build.json`, beside its files), read from disk; null for one without it. */
async function inFolder(): Promise<ExtensionBuildFile | null> {
  try {
    const res = await fetch(chrome.runtime.getURL("build.json"), { cache: "no-store" });
    const read = ExtensionBuildFile.safeParse(await res.json());
    return read.success ? read.data : null;
  } catch {
    return null;
  }
}

/** The extension's code was just loaded (installed, reloaded, Chrome started): the build in the folder now is the one running from now on. */
export async function noteRunning(): Promise<void> {
  await chrome.storage.session.set({ [RUNNING]: await inFolder() });
}

/** The build running: as noted when the code was loaded, or the folder's when nothing was (the first waking). */
async function running(): Promise<ExtensionBuildFile | null> {
  const kept = ExtensionBuildFile.safeParse((await chrome.storage.session.get(RUNNING))[RUNNING]);
  if (kept.success) return kept.data;
  await noteRunning();
  const noted = ExtensionBuildFile.safeParse((await chrome.storage.session.get(RUNNING))[RUNNING]);
  return noted.success ? noted.data : null;
}

/** The build running, for what it makes to say which build made it (a card's capture, a recording); null when it can't be told. */
export async function runningBuild(): Promise<string | null> {
  return (await running())?.fingerprint ?? null;
}

/** How the running build stands against Panki's: needed when Panki speaks a newer protocol, else available when the files differ. */
function stateOf(mine: ExtensionBuildFile | null, latest: ExtensionBuild | null): UpdateState["state"] {
  if (!mine || !latest) return "unknown";
  if (latest.protocol > EXTENSION_PROTOCOL) return "needed";
  return latest.fingerprint === mine.fingerprint ? "current" : "available";
}

/**
 * Another build is in the folder already, waiting for a reload. Any other than the one running, not only the one Panki
 * carried when it was last asked: Panki deployed again since (an hour can pass between asks) and Update Panki brings
 * the newer one, which never matched and left Reload Panki off for good (the owner, 2026-10-24). The reload's own check
 * says whether it's Panki's latest.
 */
function readyOf(mine: ExtensionBuildFile | null, folder: ExtensionBuildFile | null): boolean {
  return folder !== null && folder.fingerprint !== mine?.fingerprint;
}

async function badge(update: UpdateState) {
  const shown = update.state === "available" || update.state === "needed" ? BADGE[update.state] : null;
  await chrome.action.setBadgeText({ text: shown?.text ?? "" });
  if (!shown) return;
  await chrome.action.setBadgeBackgroundColor({ color: shown.color });
  // Chrome 110 and Firefox both have it; an older browser keeps its own white.
  if ("setBadgeTextColor" in chrome.action) await chrome.action.setBadgeTextColor({ color: shown.ink });
}

/** How it stands, from Panki's build as last asked (or just now), worked out against what's running and what's in the folder. */
async function standing(latest: ExtensionBuild | null, checkedAt: number | null): Promise<UpdateState> {
  const [mine, folder] = await Promise.all([running(), inFolder()]);
  return { state: stateOf(mine, latest), own: mine, latest, checkedAt, ready: readyOf(mine, folder) };
}

/** How this extension stands, from Panki's build as last asked: cheap (no call to Panki), so a notice asks it every few seconds while it's open. */
export async function readUpdate(): Promise<UpdateState> {
  const kept = (await readStore()).update;
  return kept ? standing(kept.latest, kept.checkedAt) : { ...NO_UPDATE, own: await running() };
}

/** Panki asked afresh: the build it carries, against this one. */
export async function checkForUpdate(): Promise<UpdateState> {
  const { address } = await readStore();
  let update: UpdateState;
  if (!address) update = { ...NO_UPDATE, own: await running() };
  else {
    try {
      update = await standing(await panki.extensionBuild(address), Date.now());
    } catch {
      // Offline, or Panki restarting: the last answer stands.
      update = await readUpdate();
      await badge(update);
      return update;
    }
  }
  await writeStore({ update });
  await badge(update);
  return update;
}

/** Panki's build downloaded as a zip, into the browser's downloads; false with no Panki set. */
export async function downloadUpdate(): Promise<boolean> {
  const { address } = await readStore();
  if (!address) return false;
  await chrome.downloads.download({ url: `${address}/api/extension/chrome.zip` });
  return true;
}

/** Chrome's own page for this extension, which says which folder it's loaded from. */
export async function showFolder(): Promise<void> {
  await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}
