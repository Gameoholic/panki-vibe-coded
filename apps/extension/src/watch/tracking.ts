import { panki } from "../panki";
import { readStore, writeStore, type Stored } from "../storage";

/**
 * Video tracking, this browser's own since 2026-11-02 (the owner: "I can want some devices sending and others not";
 * it was the account's, one switch for every browser). Off for a browser new to Panki. A browser that was already
 * signed in when its switch came here starts from the account's old switch, read once (`Settings.videoTracking`, never
 * written since), so nothing that was sending stops by itself. Whichever it is, it's kept and never settled again.
 */
export async function videoTrackingOn(): Promise<boolean> {
  const store = await readStore();
  return store.videoTracking ?? settle(store);
}

/**
 * Settled as the worker starts: a browser with no sign-in yet is new to Panki (or was signed out), and is Off. One
 * signed in reads the account's old switch; when Panki can't be reached it stays unsettled, tried again on the next ask.
 */
export async function settleVideoTracking(): Promise<void> {
  const store = await readStore();
  if (store.videoTracking === null) await settle(store);
}

async function settle(store: Stored): Promise<boolean> {
  if (!store.address || !store.token) {
    await writeStore({ videoTracking: false });
    return false;
  }
  try {
    const { videoTracking } = await panki.settings({ address: store.address, token: store.token });
    await writeStore({ videoTracking });
    return videoTracking;
  } catch {
    return false;
  }
}

/** This browser's Video tracking switched on or off (the options page's Data tracking). */
export async function setVideoTracking(on: boolean): Promise<void> {
  await writeStore({ videoTracking: on });
}
