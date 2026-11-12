import "../setup";
import "@web/theme.css";
import "@web/app.css";
import "../ui/extension.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { APP_LANGUAGES, Login, type AppLanguage, type CardType, type Deck } from "@panki/contracts";
import { Skeleton } from "@web/components/Skeleton";
import { Mark } from "@web/brand/Mark";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { KeyField } from "@web/components/KeyField";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { NumberField } from "@web/components/NumberField";
import { Segmented } from "@web/components/Segmented";
import { Ask } from "@web/components/Ask";
import { VIDEO_TRACKING_WHY } from "@web/words";
import { Setting } from "@web/components/Setting";
import { Swatches } from "@web/components/Swatches";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { useSavedSoon } from "@web/hooks/useSavedSoon";
import { hostPattern, originOf } from "../address";
import { AFTER_ADD, AFTER_ADD_IDS, SKIP_SECONDS_MAX, SKIP_SECONDS_MIN, type AfterAdd, type SkipKey } from "../modules";
import { PankiError, panki, type Door } from "../panki";
import { MARK_SWATCHES, paintOf } from "../seekLook";
import { ROLES, ROLE_IDS, SOURCE_WORDS, cleanMap, mappingOn, roleOf, withRole, type FieldMap, type RoleId } from "../roles";
import { PROFILE_NAME_MAX, activeProfile, forgetProfile, forgetSignIn, profileWords, readStore, renameProfile, sameProfile, useProfile, writeStore, type Profile, type Stored } from "../storage";
import { Rename } from "../ui/Rename";
import { deviceTheme } from "../ui/mount";
import { setVideoTracking, videoTrackingOn } from "../watch/tracking";
import { Dictionaries, KnownWords, Looking } from "./Dictionary";
import { SceneTitle } from "./explainerScenes";
import { exampleTint } from "./examples";
import { PopupLayoutPanel } from "./PopupLayout";
import { HeaderBarPanel } from "./PillPanel";
import { StreakReminderPanel } from "./StreakReminder";
import { useAccountSettings } from "./useAccountSettings";
import { PlayerBarPanel } from "./PlayerBar";
import { SeekBarPanel } from "./SeekBar";
import { UpdateBanner, VersionPanel, useUpdate } from "./Updates";

/**
 * The extension's own page, in tabs: the dictionary (how looking a word up works, the dictionaries, how the popup is
 * laid out), the decks (the one the drawer opens on, what fills each field of a deck's cards), YouTube (how a clip is
 * cut), and the account (where Panki is and the sign-in to it). Built of the app's own pieces and styles, so it reads
 * as a screen of Panki.
 */

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  address: "Type the address you open Panki at.",
  name: "Type your name.",
  password: "Type your password.",
  refused: "The browser has to allow Panki at that address before it can sign in. Try again and allow it.",
};
const WRONG = "Something went wrong.";
const said = (e: unknown) => (e instanceof PankiError ? e.message : WRONG);
/** The choice that is no choice: no deck, nothing to fill a field with. */
const NONE = "";
const NONE_WORD = "None";
/** Where a field filled with nothing gets its value, said beside None as each piece says its source. */
const TYPED_WORD = "Typed by you";

/** The sign-in form. Signing in makes that account the one in use; one in use already is kept as a profile. `onCancel` is there when it was opened beside the profiles. */
function SignIn({ known, onDone, onCancel }: { known: string; onDone: () => void; onCancel?: () => void }) {
  const [address, setAddress] = useState(known);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  /** What to call this sign-in here ("Prod", "Dev"); empty, it's called by the account's name. */
  const [profileName, setProfileName] = useState("");
  const [errors, setErrors] = useState<{ address?: string; name?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const origin = originOf(address);
    const parsed = Login.safeParse({ name, password });
    const wrong = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0]));
    if (!origin || !parsed.success) {
      setErrors({ ...(origin ? {} : { address: MESSAGES.address }), ...(wrong.has("name") ? { name: MESSAGES.name } : {}), ...(wrong.has("password") ? { password: MESSAGES.password } : {}) });
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      // The browser asks, the first time, whether Panki may talk to that address. It will only ask straight from a
      // press, so this comes before anything else is waited for.
      const allowed = await chrome.permissions.request({ origins: [hostPattern(origin)] });
      if (!allowed) {
        setFailure(MESSAGES.refused);
        return;
      }
      const me = await panki.signIn(origin, parsed.data.name, parsed.data.password);
      await useProfile({ address: origin, token: me.token, userName: me.user.name, name: profileName.trim() });
      onDone();
    } catch (e) {
      setFailure(said(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="signin-title">
      <h2 id="signin-title" className="panel-title">
        Sign in to Panki
      </h2>
      <Form onSubmit={() => void submit()} className="add-form">
        <TextField id="panki-address" label="Where your Panki is" autoComplete="off" autoFocus={known === ""} value={address} onChange={setAddress} error={errors.address} />
        <TextField id="panki-name" label="Name" autoComplete="username" autoFocus={known !== ""} value={name} onChange={setName} error={errors.name} />
        <TextField id="panki-password" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        <TextField id="panki-profile-name" label="Profile name (optional)" autoComplete="off" value={profileName} onChange={(typed) => setProfileName(typed.slice(0, PROFILE_NAME_MAX))} />
        <div className="add-actions">
          {failure ? (
            <span className="form-failure" role="alert">
              {failure}
            </span>
          ) : null}
          {onCancel ? (
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy}>
            <Icon name="signIn" />
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </Form>
    </section>
  );
}

/**
 * Every sign-in this browser keeps, a row each: the one in use, and the others to switch to (a real Panki and one for
 * trying things, say, switched between on the extension alone). Switching is instant, the
 * sessions all stay open on their Pankis; Sign out ends that one's session and drops it here.
 */
function Profiles({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  /** The profile whose Sign out is asking first (it's forgotten in this browser, its name with it), by its key. */
  const [asking, setAsking] = useState<string | null>(null);
  const signOutAt = useRef<HTMLButtonElement>(null);
  const keyOf = (profile: Profile) => `${profile.address} ${profile.userName}`;
  const active = activeProfile(store);
  const rows = [...(active ? [active] : []), ...store.profiles];
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function signOut(profile: Profile) {
    // Told to Panki so the device leaves its list; forgotten here whether or not Panki could be reached.
    await panki.signOut(profile).catch(() => undefined);
    if (active && sameProfile(profile, active)) await forgetSignIn();
    else await forgetProfile(profile);
  }
  return (
    <section className="panel" aria-labelledby="profiles-title">
      <h2 id="profiles-title" className="panel-title">
        Profiles
      </h2>
      <div className="kept-rows">
        {rows.map((profile) => {
          const inUse = active !== null && sameProfile(profile, active);
          const key = keyOf(profile);
          return (
            // The one in use stands out in the accent, its words saying so; Switch on the others is a quiet button, never the primary look, which would read as the one selected.
            <div key={key} className={`kept-row ${inUse ? "is-current" : ""} ${asking === key ? "is-asking" : ""}`.replace(/\s+/g, " ").trim()}>
              <Rename
                id={`profile-${profile.address}-${profile.userName}`}
                className="kept-name"
                shown={profileWords(profile)}
                below={
                  <span className="row-sub">
                    {[profile.name ? profile.userName : "", profile.address].filter((part) => part !== "").join(" · ")}
                    {inUse ? <span className="kept-in-use"> · In use</span> : null}
                  </span>
                }
                // No Reset to default name on a profile; saving it empty still goes back to the account's name.
                canReset={false}
                max={PROFILE_NAME_MAX}
                onKeep={async (name) => {
                  await renameProfile(profile, name);
                  onChanged();
                }}
              />
              <span className="add-actions">
                {inUse ? null : (
                  <Button disabled={busy} onClick={() => void run(() => useProfile(profile))}>
                    <Icon name="swap" />
                    Switch
                  </Button>
                )}
                <Button
                  ref={asking === key ? signOutAt : undefined}
                  className="is-danger"
                  aria-pressed={asking === key}
                  aria-expanded={asking === key}
                  disabled={busy}
                  onClick={() => setAsking(asking === key ? null : key)}
                >
                  <Icon name="signOut" />
                  Sign out
                </Button>
              </span>
              {asking === key ? (
                <Ask
                  idPrefix={`profile-${profile.address}-${profile.userName}-sign-out`}
                  anchor={signOutAt}
                  question={`Sign out of “${profileWords(profile)}”?`}
                  detail="It's forgotten in this browser; signing in again brings it back."
                  go={{ words: "Sign out", busy: "Signing out…", icon: "signOut" }}
                  busy={busy}
                  failure={null}
                  onKeep={() => setAsking(null)}
                  onGo={() =>
                    void run(async () => {
                      await signOut(profile);
                      setAsking(null);
                    })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The Account panel, under Profiles: the settings of the profile in use's account that are for
 * all of Panki, set in Panki and shown here. Signed out, there's no account, and no panel.
 */
function AccountPanel({ door }: { door: Door }) {
  return (
    <section className="panel" aria-labelledby="account-title">
      <h2 id="account-title" className="panel-title">
        Account
      </h2>
      <LinkedLanguage door={door} />
    </section>
  );
}

/**
 * The account's Language, the one Panki speaks to it in (Panki's Settings → General → Display), greyed with the link
 * sign: set in Panki alone, as Video tracking is set here alone and shown in Panki.
 */
function LinkedLanguage({ door }: { door: Door }) {
  /** As Panki says it; null while it's asked; or why it couldn't be. */
  const [language, setLanguage] = useState<AppLanguage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { address, token } = door;
  useEffect(() => {
    let alive = true;
    setFailure(null);
    panki
      .settings({ address, token })
      .then((settings) => alive && setLanguage(settings.appLanguage))
      .catch((e: unknown) => alive && setFailure(e instanceof Error ? e.message : "Couldn't reach Panki."));
    return () => {
      alive = false;
    };
  }, [address, token]);
  if (failure) {
    return (
      <p className="load-error" role="alert">
        {failure}
      </p>
    );
  }
  if (language === null) return <Skeleton shape="settings" count={1} />;
  const option = { id: language, label: `${APP_LANGUAGES[language]} · Set in Panki`, icon: "link" as const };
  return <Setting id="account-language" label="Language" control={<Dropdown id="account-language-in" label="Language" options={[option]} value={language} disabled onChange={() => undefined} />} />;
}

/** The Account tab: the profiles kept, and the sign-in form, by itself while there's none, or opened under them to add another. */
function AccountTab({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const any = activeProfile(store) !== null || store.profiles.length > 0;
  const done = () => {
    setAdding(false);
    onChanged();
  };
  if (!any) return <SignIn known={store.address ?? ""} onDone={done} />;
  return (
    <>
      <Profiles store={store} onChanged={onChanged} />
      {adding ? (
        <SignIn known={store.address ?? ""} onDone={done} onCancel={() => setAdding(false)} />
      ) : (
        <div className="add-actions add-actions-start">
          <Button onClick={() => setAdding(true)}>
            <Icon name="userAdd" />
            Add another profile
          </Button>
        </div>
      )}
      {store.address && store.token ? <AccountPanel door={{ address: store.address, token: store.token }} /> : null}
    </>
  );
}

/** The deck the drawer opens on. Kept the moment it's chosen, in force the next time the drawer is opened. */
function DefaultDeck({ decks, store, onChanged }: { decks: Deck[]; store: Stored; onChanged: () => void }) {
  // A default deck that has since been deleted in Panki is no deck: the drawer asks again.
  const chosen = decks.find((deck) => deck.id === store.defaultDeckId)?.id ?? NONE;
  return (
    <section className="panel" aria-labelledby="decks-title">
      <h2 id="decks-title" className="panel-title">
        Decks
      </h2>
      <Setting
        id="default-deck"
        label="Default deck"
        why="Where cards you add from a video or a page go to by default."
        control={
          <Dropdown
            id="default-deck-choice"
            label="Default deck"
            options={[{ id: NONE, label: NONE_WORD }, ...decks.map((deck) => ({ id: deck.id, label: deck.name }))]}
            value={chosen}
            onChange={(deckId) => void writeStore({ defaultDeckId: deckId === NONE ? null : deckId }).then(onChanged)}
          />
        }
      />
    </section>
  );
}

// Whether transcribing starts by itself is switched in the strip's menu alone (Auto transcribe); what it does while
// paused is an admin's, in Panki's Settings → Admin.
const AFTER_ADD_OPTIONS = AFTER_ADD_IDS.map((id) => ({ id, label: AFTER_ADD[id] }));
// What the choice made does, under it: the choice alone doesn't say.
const AFTER_ADD_WHY: Record<AfterAdd, string> = {
  before: "Once a card from a video is added, the video plays again if it was playing when you started the card.",
  pause: "Once a card from a video is added, the video stays paused.",
  play: "Once a card from a video is added, the video plays.",
};
/**
 * How transcribing behaves for this viewer: what's client-side is theirs, what it costs stays an admin's, in Panki's
 * Settings. Kept the moment it's changed; a video page reads it again with the transcript as it gets the focus. The
 * Panki panel's switch heads it; off, nothing is transcribed, so the rest is greyed.
 */
function Transcribing({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const off = !store.modulePanel;
  return (
    <section className="panel" aria-labelledby="transcribing-title">
      <SceneTitle id="panel" titleId="transcribing-title" store={store} />
      <Setting id="module-panel" label="Panki panel" control={<Toggle id="module-panel-on" says={{ on: "On", off: "Off" }} on={store.modulePanel} onChange={(modulePanel) => void writeStore({ modulePanel }).then(onChanged)} />} />
      {/* The view itself is picked on the panel (`PanelView`). In the site's own full screen the panel stands at the
          right; its key toggles it (the handle at its edge does the same), named as an action as the app's keybinds are. */}
      <Setting
        id="panel-key"
        label="Toggle panel keybind"
        control={<KeyField id="panel-key-choice" label="Toggle panel keybind" value={store.panelKey} disabled={off} onChange={(panelKey) => void writeStore({ panelKey }).then(onChanged)} />}
        why="Shows or hides the Panki panel in full screen."
      />
      {/* The subtitles off, or back to the pick last shown, as the bar's Subtitles button does; C to begin with, taking the site's own captions key. */}
      <Setting
        id="subtitles-key"
        label="Toggle subtitles keybind"
        control={<KeyField id="subtitles-key-choice" label="Toggle subtitles keybind" value={store.subtitlesKey} disabled={off} onChange={(subtitlesKey) => void writeStore({ subtitlesKey }).then(onChanged)} />}
        why="Turns the subtitles off, or back to the ones last shown."
      />
      {/* The button in the screen's top-right corner that brings the folded panel back (`ui/PanelButton.tsx`); the key works whatever this says. */}
      <Setting
        id="panel-button"
        label="Panel button over the video"
        control={<Toggle id="panel-button-on" says={{ on: "Shown", off: "Hidden" }} on={store.panelButton} disabled={off} onChange={(panelButton) => void writeStore({ panelButton }).then(onChanged)} />}
      />
      <Setting
        id="transcribe-over-video"
        label="Replace YouTube subtitles"
        control={<Toggle id="transcribe-over-video-on" says={{ on: "On", off: "Off" }} on={store.transcribeOverVideo} disabled={off} onChange={(transcribeOverVideo) => void writeStore({ transcribeOverVideo }).then(onChanged)} />}
        why="The subtitles picked in the Panki panel replace YouTube's subtitles on the video."
      />
      {/* The word pressed in the subtitles, under the player and over the video: a colour of its own, so it's told from the words in the decks. */}
      <Setting
        id="pick-colour"
        label="Picked word colour"
        control={
          <Swatches
            id="pick-colour"
            swatches={MARK_SWATCHES}
            value={store.pickColour}
            disabled={off}
            onChange={(value) => {
              const pickColour = paintOf(value);
              if (pickColour) void writeStore({ pickColour }).then(onChanged);
            }}
          />
        }
      />
      <Setting
        id="after-add"
        label="After adding a card"
        control={<Segmented idPrefix="after-add" label="After adding a card" options={AFTER_ADD_OPTIONS} value={store.afterAdd} disabled={off} onChange={(afterAdd) => void writeStore({ afterAdd }).then(onChanged)} />}
        why={AFTER_ADD_WHY[store.afterAdd]}
      />
    </section>
  );
}

/**
 * Video tracking, set here since the extension is what tracks: this browser's own (`watch/tracking.ts`), so some
 * devices can send while others don't. Turning it off asks first, saying what stops and what stays.
 */
function VideoTracking({ store, onChanged, door }: { store: Stored; onChanged: () => void; door: Door | null }) {
  const [asking, setAsking] = useState(false);
  const offAt = useRef<HTMLButtonElement>(null);
  const on = store.videoTracking;
  /** How close to its end a video counts as finished, as Panki has it (the account's own); null until it's said, or signed out. */
  const [finished, setFinished] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Not settled yet (the worker couldn't reach Panki as it started): settled now, as the worker would.
  useEffect(() => {
    if (on === null) void videoTrackingOn().then(onChanged);
  }, [on, onChanged]);
  const address = door?.address ?? null;
  const token = door?.token ?? null;
  useEffect(() => {
    setFinished(null);
    setFailure(null);
    if (address === null || token === null) return;
    let alive = true;
    panki
      .settings({ address, token })
      .then((settings) => alive && setFinished(settings.finishedWithinSec))
      .catch((e: unknown) => alive && setFailure(e instanceof Error ? e.message : "Couldn't reach Panki."));
    return () => {
      alive = false;
    };
  }, [address, token]);
  async function change(next: boolean) {
    await setVideoTracking(next);
    setAsking(false);
    onChanged();
  }
  return (
    <section className="panel" aria-labelledby="data-tracking-title">
      <h2 id="data-tracking-title" className="panel-title">
        Data tracking
      </h2>
      <Setting
        id="video-tracking"
        label="Video tracking"
        control={
          <Toggle
            ref={offAt}
            id="video-tracking-on"
            says={{ on: "On", off: "Off" }}
            on={on === true}
            disabled={on === null}
            // Turning it on just does it; turning it off asks first, the question hanging from the switch.
            onChange={(next) => (next ? void change(true) : setAsking(!asking))}
          />
        }
        why={VIDEO_TRACKING_WHY}
      />
      {door && finished !== null ? <FinishedWithin door={door} saved={finished} off={on !== true} /> : null}
      {/* After the rows, never between them: the question hangs from the switch wherever it stands in the panel, and
          between two rows it would part them, taking their dividing line with it. */}
      {asking ? (
        <Ask
          idPrefix="video-tracking-off"
          anchor={offAt}
          question="Turn off video tracking?"
          detail={
            <>
              <div>
                <h3>From now on</h3>
                <ul>
                  <li>The videos you watch in this browser aren&apos;t recorded. Other browsers go on as each is set.</li>
                  <li>What you watch here stops adding to your watch time, Continue watching and Recently watched.</li>
                  <li>Where you stopped in a video isn&apos;t kept, so you can&apos;t continue from it next time.</li>
                </ul>
              </div>
              <div>
                <h3>What stays</h3>
                <ul>
                  <li>Everything already recorded is kept. To forget it, use Forget my watch history in Panki&apos;s Settings → Extension.</li>
                  <li>Turning it on again carries on from there.</li>
                </ul>
              </div>
            </>
          }
          go={{ words: "Turn off", busy: "Turning off…", icon: "power" }}
          busy={false}
          failure={null}
          onKeep={() => setAsking(false)}
          onGo={() => void change(false)}
        />
      ) : null}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}

/**
 * How close to its end a video played counts as finished: the account's own, kept on Panki
 * (`Settings.finishedWithinSec`), saved a moment after it's changed. Greyed while Video tracking is off, when nothing is marked finished.
 */
function FinishedWithin({ door, saved, off }: { door: Door; saved: number; off: boolean }) {
  const [current, patch, failure] = useSavedSoon<{ finishedWithinSec: number }>({ finishedWithinSec: saved }, async (change) => ({
    finishedWithinSec: (await panki.updateSettings(door, change)).finishedWithinSec,
  }));
  return (
    <Setting
      id="finished-within"
      label="Video counts as finished in its last"
      control={
        <NumberField
          id="finished-within-sec"
          label="Video counts as finished in its last, in seconds"
          value={current.finishedWithinSec}
          min={0}
          max={600}
          suffix="s"
          disabled={off}
          onChange={(finishedWithinSec) => patch({ finishedWithinSec })}
        />
      }
    >
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </Setting>
  );
}

// How the transcript looks over the video is set on the video page itself (the panel's menu, `ui/PanelMenu.tsx`), where it's seen.

/**
 * Whether the word being said carries its mark: on the line under the player, and on the subtitles over the video,
 * each shown or hidden on its own. The second is only a choice while the transcript replaces the site's subtitles. Kept the moment it's changed.
 */
function CurrentWord({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  return (
    <section className="panel" aria-labelledby="current-word-title">
      {/* The two places, named as everywhere else: the Panki panel under the player, and Panki subtitles on the video. */}
      <SceneTitle id="underline" titleId="current-word-title" store={store} />
      <Setting id="mark-under" label="Panki panel" control={<Toggle id="mark-under-on" says={{ on: "Shown", off: "Hidden" }} on={store.markUnder} onChange={(markUnder) => void writeStore({ markUnder }).then(onChanged)} />} />
      <Setting
        id="mark-over"
        label="On the video"
        control={<Toggle id="mark-over-on" says={{ on: "Shown", off: "Hidden" }} on={store.markOver} disabled={!store.transcribeOverVideo} onChange={(markOver) => void writeStore({ markOver }).then(onChanged)} />}
      />
    </section>
  );
}

// Each of Panki's parts is switched at the head of the panel of what it's about: the Panki panel's, the seek bar marks',
// the header bar's, YouTube home add-ons', the Word pop-up's.

/**
 * YouTube's home, part by part: the master switch first, then each its own under it, greyed while the master is off.
 * The header bar is on every page of the site, so it's a panel of its own before this one (`HeaderBarPanel`), as is
 * the streak reminder, shown in both (`StreakReminderPanel`).
 */
function HomePanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const off = !store.moduleHome;
  const row = (id: string, label: string, on: boolean, says: { on: string; off: string }, write: (on: boolean) => Partial<Stored>) => (
    <Setting id={id} label={label} control={<Toggle id={`${id}-on`} says={says} on={on} disabled={off} onChange={(next) => void writeStore(write(next)).then(onChanged)} />} />
  );
  return (
    <section className="panel" aria-labelledby="home-title">
      <SceneTitle id="home" titleId="home-title" store={store} />
      <Setting id="module-home" label="YouTube home add-ons" control={<Toggle id="module-home-on" says={{ on: "On", off: "Off" }} on={store.moduleHome} onChange={(moduleHome) => void writeStore({ moduleHome }).then(onChanged)} />} />
      {row("home-shelf", "Continue watching", store.homeShelf, { on: "Shown", off: "Hidden" }, (homeShelf) => ({ homeShelf }))}
      {/* How many it shows is always 5 (`modules.ts` → `SHELF_MAX`). */}
      {row("home-saved", "Saved for later", store.homeSaved, { on: "Shown", off: "Hidden" }, (homeSaved) => ({ homeSaved }))}
      {row("home-recent", "Recently watched", store.homeRecent, { on: "Shown", off: "Hidden" }, (homeRecent) => ({ homeRecent }))}
      {/* Named for what it saves the video for, so it's plain what's being saved. */}
      {row("thumb-save", "Save for later button on thumbnails", store.thumbSave, { on: "Shown", off: "Hidden" }, (thumbSave) => ({ thumbSave }))}
    </section>
  );
}

/**
 * What makes YouTube nicer whether or not Panki is in use: nothing here reads Panki's master switch. Hide Shorts is the first; the next is one row here. The player's
 * control bar, laid out, is a panel of its own after this one (`PlayerBarPanel`).
 */
function UtilitiesPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  return (
    <section className="panel" aria-labelledby="utilities-title">
      <SceneTitle id="utilities" titleId="utilities-title" store={store} />
      {/* Shown or hidden as its neighbours say it, Shown to begin with. */}
      <Setting id="shorts" label="Shorts" control={<Toggle id="shorts-on" says={{ on: "Shown", off: "Hidden" }} on={store.moduleShorts} onChange={(moduleShorts) => void writeStore({ moduleShorts }).then(onChanged)} />} />
      {/* The speed button and the video's end time are rows of the player bar, a panel of its own after this one. */}
      {/* One group, its switch and the two rows it greys, so they don't read as three settings apart. */}
      <div className="seek-group">
        <h3 className="seek-group-title">Short skip with the arrow keys</h3>
        <Setting
          id="short-skip"
          label="Short skip"
          control={<Toggle id="short-skip-on" says={{ on: "On", off: "Off" }} on={store.shortSkip} onChange={(shortSkip) => void writeStore({ shortSkip }).then(onChanged)} />}
        />
        <Setting
          id="short-skip-key"
          label="Key to hold"
          control={
            <Segmented idPrefix="short-skip-key" label="Key to hold" options={SKIP_KEY_OPTIONS} value={store.shortSkipKey} disabled={!store.shortSkip} onChange={(shortSkipKey) => void writeStore({ shortSkipKey }).then(onChanged)} />
          }
        />
        <Setting
          id="short-skip-seconds"
          label="Skip by"
          control={
            <NumberField
              id="short-skip-seconds-field"
              label="Skip by"
              value={store.shortSkipSeconds}
              min={SKIP_SECONDS_MIN}
              max={SKIP_SECONDS_MAX}
              step={0.1}
              suffix=" s"
              disabled={!store.shortSkip}
              onChange={(shortSkipSeconds) => void writeStore({ shortSkipSeconds }).then(onChanged)}
            />
          }
        />
      </div>
    </section>
  );
}
/** The keys a short skip can be held with, as the options page names them. */
const SKIP_KEY_OPTIONS: readonly { id: SkipKey; label: string }[] = [
  { id: "shift", label: "Shift" },
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
];

// Where you stopped last is a group of the Seek bar panel (`SeekBar.tsx`).

/**
 * The page's tabs, so the settings stand together by what they're about: everything of the dictionary
 * together (looking words up, the dictionaries, the popup's layout), the decks and what fills their fields, how a
 * video's clip is cut, and the sign-in. The tab is in the address, so a reload stays on it.
 */
// The site's own tab, as each video site Panki works on will have one.
type Tab = "dictionary" | "decks" | "youtube" | "account";
const TABS: readonly { id: Tab; label: string }[] = [
  // Named as its first panel; its id stays `dictionary`, the address.
  { id: "dictionary", label: "Word pop-up" },
  { id: "decks", label: "Decks" },
  { id: "youtube", label: "YouTube" },
  // About: the profiles and the extension's version; its id stays `account` (the address, the drawer's way to the sign-in).
  { id: "account", label: "About" },
];
const tabOfAddress = (): Tab | null => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? null;

/** One deck's fields, each with what the extension fills it with. Kept as it's chosen; only shown, not chosen, while the deck's mapping is switched off. */
function FieldsOf({ type, saved, off, onSave }: { type: CardType; saved: FieldMap | undefined; off: boolean; onSave: (map: FieldMap) => void }) {
  const map = cleanMap(saved ?? {}, type);
  return (
    <>
      {type.fields.map((field) => (
        <Setting
          key={field.id}
          id={`field-${field.id}`}
          label={field.name}
          control={
            // Every field is offered everything there is, so the whole list is always in sight; what can't go in a
            // field of this kind is there but can't be chosen.
            <Dropdown<RoleId | typeof NONE>
              id={`field-${field.id}-source`}
              label={field.name}
              options={[
                { id: NONE, label: NONE_WORD, note: TYPED_WORD },
                ...ROLE_IDS.map((role) => ({ id: role, label: ROLES[role].name, note: SOURCE_WORDS[ROLES[role].from], disabled: !ROLES[role].takes(field) })),
              ]}
              value={roleOf(map, field.id) ?? NONE}
              // The word at each choice's right is where it comes from, so it never has to be remembered.
              columns={{ choice: "Fill with", note: "Source" }}
              disabled={off}
              onChange={(role) => onSave(withRole(map, field.id, role === NONE ? null : role))}
            />
          }
        />
      ))}
    </>
  );
}

function Mapping({ decks, types, store, onSaved }: { decks: Deck[]; types: CardType[]; store: Stored; onSaved: () => void }) {
  const [deckId, setDeckId] = useState<string | null>(null);
  // It opens on the deck cards go to, which is the one most likely being set up.
  const deck = decks.find((d) => d.id === deckId) ?? decks.find((d) => d.id === store.defaultDeckId) ?? decks[0] ?? null;
  const type = deck ? (types.find((t) => t.id === deck.typeId) ?? null) : null;
  const on = deck ? mappingOn(store.mappingOn, store.maps, deck.id) : false;
  return (
    <section className="panel" aria-labelledby="mapping-title">
      <h2 id="mapping-title" className="panel-title">
        Field mapping
      </h2>
      {deck && type ? (
        <>
          <p className="empty">Choose what fills each field. A field on {NONE_WORD} will be entered manually.</p>
          <Setting id="mapping-deck" label="Deck" control={<Dropdown id="mapping-deck-choice" label="Deck" options={decks.map((d) => ({ id: d.id, label: d.name }))} value={deck.id} onChange={setDeckId} />} />
          {/* Off for every deck until it's switched on: the extension adds nothing to a deck nobody set up for it. */}
          <Setting
            id="mapping-on"
            label="Field mapping"
            control={<Toggle id="mapping-on-switch" says={{ on: "Enabled", off: "Disabled" }} on={on} onChange={(next) => void writeStore({ mappingOn: { ...store.mappingOn, [deck.id]: next } }).then(onSaved)} />}
          />
          {/* A field's name and a piece's can be the same word (Reading, Meaning): this says which side is which. */}
          <div className="map-head">
            <span>Field in {deck.name}</span>
            <span>Filled with</span>
          </div>
          <FieldsOf key={deck.id} type={type} saved={store.maps[deck.id]} off={!on} onSave={(map) => void writeStore({ maps: { ...store.maps, [deck.id]: map } }).then(onSaved)} />
        </>
      ) : (
        <p className="empty">No decks yet.</p>
      )}
    </section>
  );
}

function Options() {
  const [store, setStore] = useState<Stored | null>(null);
  const [lists, setLists] = useState<{ decks: Deck[]; types: CardType[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Counts the changes to the dictionaries made here, so the popup's layout reads them again. */
  const [dictionariesChanged, setDictionariesChanged] = useState(0);
  const dictionariesChange = useCallback(() => setDictionariesChanged((n) => n + 1), []);
  const refresh = useCallback(() => void readStore().then(setStore), []);
  useEffect(refresh, [refresh]);
  // A setting changed anywhere else (the panel's menu on a video, another tab of this page): read again at once.
  useEffect(() => {
    const changed = (_: unknown, area: string) => {
      if (area === "local") refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [refresh]);

  const address = store?.address ?? null;
  const token = store?.token ?? null;
  useEffect(() => {
    if (!address || !token) {
      setLists(null);
      return;
    }
    let alive = true;
    const load = () =>
      void Promise.all([panki.decks({ address, token }), panki.types({ address, token })]).then(
        ([decks, types]) => {
          if (!alive) return;
          setLists({ decks, types });
          setFailure(null);
        },
        (e: unknown) => {
          if (!alive) return;
          // Signed out from Panki's own Settings: forgotten here too, and the sign-in shows again.
          if (e instanceof PankiError && e.status === 401) void forgetSignIn().then(refresh);
          else setFailure(said(e));
        },
      );
    load();
    // Back from Panki with a new deck or a changed card type, or from a page where another deck was chosen: all of it
    // is read afresh.
    const again = () => {
      load();
      refresh();
    };
    window.addEventListener("focus", again);
    return () => {
      alive = false;
      window.removeEventListener("focus", again);
    };
  }, [address, token, refresh]);

  const [tab, setTab] = useState<Tab>(() => tabOfAddress() ?? "dictionary");
  function choose(next: Tab) {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  }
  const door = address && token ? { address, token } : null;
  /** The account's settings the YouTube tab sets some of (the header bar's streak, the streak reminder), read once a sign-in. */
  const account = useAccountSettings(door);
  /** An update for the extension, as the worker last found it. */
  const updates = useUpdate();
  // Sent here by the drawer to sign in or to switch a deck's field mapping on: turned to that tab, once.
  const asked = store?.optionsTab ?? null;
  useEffect(() => {
    if (!asked) return;
    choose(asked);
    void writeStore({ optionsTab: null });
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps -- `choose` is the same each time; only a new ask turns the page

  return (
    // Wide, as the app's editors are, for the popup's layout; every other panel keeps the column (`.options-main`).
    <div className="app is-bare is-wide">
      <header className="brand">
        <Mark size={22} />
        Panki
        {/* Panki altogether, on or off in this browser, the same switch the strip's head has; here too, since the strip is the only other place and a page may not be open. */}
        {store ? (
          <span className="brand-switch">
            <Toggle id="panki-on" icon="power" says={{ on: "On", off: "Off" }} on={store.pankiOn} onChange={(pankiOn) => void writeStore({ pankiOn }).then(refresh)} />
          </span>
        ) : null}
      </header>
      {store === null ? null : (
        <main className="main options-main">
          <Segmented idPrefix="options-tab" label="Settings" options={TABS} value={tab} onChange={choose} />
          {/* A newer build on Panki: over every tab, until it's in place. */}
          <UpdateBanner update={updates.update} />
          {failure ? (
            <p className="load-error" role="alert">
              {failure}
            </p>
          ) : null}
          {/* Every tab stays drawn, the ones not chosen hidden: nothing laid out and unsaved is lost by looking at another. */}
          <div className="options-tab" hidden={tab !== "dictionary"}>
            {/* Word pop-up, the pop-up's layout (which shows the words in the decks marked, as set on the Decks tab), then the dictionaries it reads. */}
            <Looking store={store} onChanged={refresh} />
            <PopupLayoutPanel kept={store.popupLayout} lookKey={store.lookKey} lookDelay={store.lookDelayMs} dictionariesChanged={dictionariesChanged} known={{ on: store.knownPages, tint: exampleTint({ byStage: store.knownByStage, colour: store.knownColour }) }} onSaved={refresh} />
            {/* The dictionaries are this browser's own: they work signed in or not (those kept on Panki only signed in). */}
            <Dictionaries onChanged={dictionariesChange} door={door} />
          </div>
          <div className="options-tab" hidden={tab !== "decks"}>
            {door ? (
              lists ? (
                <>
                  {/* The words in the decks marked wherever they're met: every site, and Panki's subtitles over the video and in the panel. */}
                  <KnownWords store={store} onChanged={refresh} />
                  <DefaultDeck decks={lists.decks} store={store} onChanged={refresh} />
                  <Mapping decks={lists.decks} types={lists.types} store={store} onSaved={refresh} />
                </>
              ) : null
            ) : (
              <section className="panel">
                <p className="empty">Not signed in.</p>
                <div className="add-actions add-actions-start">
                  <Button variant="primary" onClick={() => choose("account")}>
                    <Icon name="signIn" />
                    Sign in
                  </Button>
                </div>
              </section>
            )}
          </div>
          <div className="options-tab" hidden={tab !== "youtube"}>
            {/* Data tracking first: what's recorded of the videos watched. */}
            <VideoTracking store={store} onChanged={refresh} door={door} />
            <Transcribing store={store} onChanged={refresh} />
            <CurrentWord store={store} onChanged={refresh} />
            <SeekBarPanel store={store} onChanged={refresh} />
            {/* The header bar is on every page of the site, so it comes before the home's add-ons, and the reminder shown in both after it. */}
            <HeaderBarPanel store={store} door={door} account={account} onChanged={refresh} />
            {door ? <StreakReminderPanel store={store} door={door} account={account} /> : null}
            <HomePanel store={store} onChanged={refresh} />
            <UtilitiesPanel store={store} onChanged={refresh} />
            <PlayerBarPanel store={store} onChanged={refresh} />
          </div>
          <div className="options-tab" hidden={tab !== "account"}>
            <AccountTab store={store} onChanged={refresh} />
            <VersionPanel update={updates.update} check={updates.check} checking={updates.checking} />
          </div>
        </main>
      )}
    </div>
  );
}

const applyTheme = () => {
  document.documentElement.dataset.theme = deviceTheme();
};
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

const root = document.getElementById("root");
if (root) createRoot(root).render(<Options />);
