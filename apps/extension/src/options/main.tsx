import "../setup";
import "@web/theme.css";
import "@web/app.css";
import "../ui/extension.css";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Login, type CardType, type Deck } from "@panki/contracts";
import { Mark } from "@web/brand/Mark";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Form } from "@web/components/Form";
import { NumberField } from "@web/components/NumberField";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { hostPattern, originOf } from "../address";
import { AFTER_ADD, AFTER_ADD_IDS, SKIP_SECONDS_MAX, SKIP_SECONDS_MIN, type AfterAdd, type SkipKey } from "../modules";
import { PankiError, panki, type Door } from "../panki";
import { ROLES, ROLE_IDS, SOURCE_WORDS, cleanMap, mappingOn, roleOf, withRole, type FieldMap, type RoleId } from "../roles";
import { PROFILE_NAME_MAX, activeProfile, forgetProfile, forgetSignIn, profileWords, readStore, renameProfile, sameProfile, useProfile, writeStore, type Profile, type Stored } from "../storage";
import { Rename } from "../ui/Rename";
import { deviceTheme } from "../ui/mount";
import { Dictionaries, KnownWords, Looking } from "./Dictionary";
import { PopupLayoutPanel } from "./PopupLayout";
import { PillParts } from "./PillPanel";
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
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </Form>
    </section>
  );
}

/**
 * Every sign-in this browser keeps, a row each: the one in use, and the others to switch to (the owner, 2026-10-17:
 * a real Panki and one for trying things, switched between on the extension alone). Switching is instant, the
 * sessions all stay open on their Pankis; Sign out ends that one's session and drops it here.
 */
function Profiles({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
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
          return (
            <div key={`${profile.address} ${profile.userName}`} className="kept-row">
              <Rename
                id={`profile-${profile.address}-${profile.userName}`}
                className="kept-name"
                shown={profileWords(profile)}
                below={<span className="row-sub">{[profile.name ? profile.userName : "", profile.address, inUse ? "In use" : ""].filter((part) => part !== "").join(" · ")}</span>}
                canReset={profile.name !== ""}
                max={PROFILE_NAME_MAX}
                onKeep={async (name) => {
                  await renameProfile(profile, name);
                  onChanged();
                }}
              />
              <span className="add-actions">
                {inUse ? null : (
                  <Button variant="primary" disabled={busy} onClick={() => void run(() => useProfile(profile))}>
                    Switch
                  </Button>
                )}
                <Button className="is-danger" disabled={busy} onClick={() => void run(() => signOut(profile))}>
                  Sign out
                </Button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
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
          <Button onClick={() => setAdding(true)}>Add another profile</Button>
        </div>
      )}
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

/**
 * How transcribing behaves for this viewer (the owner, 2026-10-17: "this is fine to allow per user… any option that's
 * client side"; what it costs stays an admin's, in Panki's Settings). Kept the moment it's changed; a video page reads
 * it again with the transcript as it gets the focus. The words are the ones Panki's Settings had (the owner's own).
 */
// Whether it starts by itself is switched in the strip's menu alone (Auto transcribe); its row here went at the owner's word, 2026-10-17.
// While paused went to Panki's Settings → Admin the same way, 2026-10-27 ("should be an admin setting").
const AFTER_ADD_OPTIONS = AFTER_ADD_IDS.map((id) => ({ id, label: AFTER_ADD[id] }));
// What the choice made does, under it (the owner, 2026-10-27: "not clear what this does, add description").
const AFTER_ADD_WHY: Record<AfterAdd, string> = {
  before: "Once a card from a video is added, the video plays again if it was playing when you started the card.",
  pause: "Once a card from a video is added, the video stays paused.",
  play: "Once a card from a video is added, the video plays.",
};
// The Panki panel's switch heads it since the Modules tab went (the owner, 2026-10-21: "most of this can just live under the YouTube settings"); off, nothing is transcribed, so the rest is greyed.
function Transcribing({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const off = !store.modulePanel;
  return (
    <section className="panel" aria-labelledby="transcribing-title">
      <h2 id="transcribing-title" className="panel-title">
        Panki panel
      </h2>
      <Setting id="module-panel" label="Panki panel" control={<Toggle id="module-panel-on" says={{ on: "On", off: "Off" }} on={store.modulePanel} onChange={(modulePanel) => void writeStore({ modulePanel }).then(onChanged)} />} />
      <Setting
        id="transcribe-over-video"
        label="Replace YouTube subtitles"
        control={<Toggle id="transcribe-over-video-on" says={{ on: "On", off: "Off" }} on={store.transcribeOverVideo} disabled={off} onChange={(transcribeOverVideo) => void writeStore({ transcribeOverVideo }).then(onChanged)} />}
        why="While the Panki panel shows Panki subtitles, they're shown on the video too, in place of YouTube subtitles."
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
 * Video tracking, here too (the owner, 2026-10-21, the extension being what tracks: "shouldn't this be on the
 * extension too?"): not a second setting but the account's own, the one in Panki's Settings → Immersion, read from
 * Panki and changed there, so flipping it here or there is the same switch, for every browser signed in to the
 * account. Shown while signed in; a failure puts it back and says so.
 */
function VideoTracking({ door }: { door: Door }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { address, token } = door;
  useEffect(() => {
    let alive = true;
    setFailure(null);
    panki
      .settings({ address, token })
      .then((settings) => alive && setOn(settings.videoTracking))
      .catch((e: unknown) => alive && setFailure(e instanceof Error ? e.message : "Couldn't reach Panki."));
    return () => {
      alive = false;
    };
  }, [address, token]);
  async function change(next: boolean) {
    setFailure(null);
    setOn(next);
    try {
      setOn((await panki.updateSettings({ address, token }, { videoTracking: next })).videoTracking);
    } catch (e) {
      setOn(!next);
      setFailure(e instanceof Error ? e.message : "Couldn't reach Panki.");
    }
  }
  return (
    <section className="panel" aria-labelledby="immersion-title">
      <h2 id="immersion-title" className="panel-title">
        Immersion
      </h2>
      <Setting
        id="video-tracking"
        label="Video tracking"
        control={<Toggle id="video-tracking-on" says={{ on: "On", off: "Off" }} on={on === true} disabled={on === null} onChange={(next) => void change(next)} />}
        why="Keeps which videos you watch, for how long and where you stopped."
      />
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}

// How the transcript looks over the video is set on the video page itself (`ui/SubtitleMenu.tsx`), by the owner's word, 2026-10-17.

/**
 * Whether the word being said carries its mark: on the line under the player, and on the subtitles over the video,
 * each its own (the owner, 2026-10-18: "show/hide the blue thing… separate for the YouTube subtitles and the Panki
 * tab"). The second is only a choice while the transcript replaces the site's subtitles. Kept the moment it's changed.
 */
function CurrentWord({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  return (
    <section className="panel" aria-labelledby="current-word-title">
      {/* The two places, named as everywhere else (2026-10-28): the Panki panel under the player, and Panki subtitles on the video. */}
      <h2 id="current-word-title" className="panel-title">
        Spoken word underline
      </h2>
      <Setting id="mark-under" label="Panki panel" control={<Toggle id="mark-under-on" says={{ on: "Shown", off: "Hidden" }} on={store.markUnder} onChange={(markUnder) => void writeStore({ markUnder }).then(onChanged)} />} />
      <Setting
        id="mark-over"
        label="On the video"
        control={<Toggle id="mark-over-on" says={{ on: "Shown", off: "Hidden" }} on={store.markOver} disabled={!store.transcribeOverVideo} onChange={(markOver) => void writeStore({ markOver }).then(onChanged)} />}
      />
    </section>
  );
}

// Clips had a panel here, Clip handles (snap to words or move freely), until the owner had it taken out, 2026-10-19.

// Each of Panki's parts had a Modules tab of its own, first in the row (the owner, 2026-10-21: "the entire Panki panel
// toggleable… the seek bar marks, ON by default"), until the same day they had it folded into the tabs of what each is
// about ("most of this can just live under the YouTube settings"): the panel heads Video page, the marks head Seek bar,
// the home heads YouTube home, Pop-up dictionary heads Looking up words on the Dictionary tab. Video tracking is the
// account's, in Panki's Settings, beside what it keeps.

/**
 * YouTube's home, part by part (the owner, 2026-10-21, picking Shelves of seven mock-ups with the Continue watching
 * shelf alone: "make it customizable in settings"): the master switch first, then each its own under it, greyed while
 * the master is off. The header bar's pill is laid out under its switch (`PillParts`).
 */
function HomePanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const off = !store.moduleHome;
  const row = (id: string, label: string, on: boolean, says: { on: string; off: string }, write: (on: boolean) => Partial<Stored>) => (
    <Setting id={id} label={label} control={<Toggle id={`${id}-on`} says={says} on={on} disabled={off} onChange={(next) => void writeStore(write(next)).then(onChanged)} />} />
  );
  return (
    <section className="panel" aria-labelledby="home-title">
      <h2 id="home-title" className="panel-title">
        YouTube home
      </h2>
      <Setting id="module-home" label="YouTube home" control={<Toggle id="module-home-on" says={{ on: "On", off: "Off" }} on={store.moduleHome} onChange={(moduleHome) => void writeStore({ moduleHome }).then(onChanged)} />} />
      {row("home-pill", "Header bar", store.homePill, { on: "Shown", off: "Hidden" }, (homePill) => ({ homePill }))}
      <PillParts store={store} disabled={off || !store.homePill} onChanged={onChanged} />
      {row("home-line", "Today line", store.homeLine, { on: "Shown", off: "Hidden" }, (homeLine) => ({ homeLine }))}
      {row("home-shelf", "Continue watching", store.homeShelf, { on: "Shown", off: "Hidden" }, (homeShelf) => ({ homeShelf }))}
      {/* How many it shows was a choice here until the owner made it always 5, 2026-10-22 (`modules.ts` → `SHELF_MAX`). */}
      {row("home-saved", "Saved for later", store.homeSaved, { on: "Shown", off: "Hidden" }, (homeSaved) => ({ homeSaved }))}
      {row("home-recent", "Recently watched", store.homeRecent, { on: "Shown", off: "Hidden" }, (homeRecent) => ({ homeRecent }))}
      {/* Named for what they show (the owner, 2026-10-22: "Thumbnail marks: no clue what that is"; "Save button on thumbnails: what are we saving?"). */}
      {row("module-thumbs", "Progress, cards and subtitles on thumbnails", store.moduleThumbs, { on: "Shown", off: "Hidden" }, (moduleThumbs) => ({ moduleThumbs }))}
      {row("thumb-save", "Save for later button on thumbnails", store.thumbSave, { on: "Shown", off: "Hidden" }, (thumbSave) => ({ thumbSave }))}
    </section>
  );
}

/**
 * What makes YouTube nicer whether or not Panki is in use (the owner, 2026-10-21: "regardless of Panki, just nice to
 * have"): nothing here reads Panki's master switch. Hide Shorts is the first; the next is one row here.
 */
function UtilitiesPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  return (
    <section className="panel" aria-labelledby="utilities-title">
      <h2 id="utilities-title" className="panel-title">
        YouTube utilities
      </h2>
      {/* Shown or hidden as its neighbours say it (2026-10-28; "Hide Shorts", On / Off, until then), Shown to begin with. */}
      <Setting id="shorts" label="Shorts" control={<Toggle id="shorts-on" says={{ on: "Shown", off: "Hidden" }} on={store.moduleShorts} onChange={(moduleShorts) => void writeStore({ moduleShorts }).then(onChanged)} />} />
      <Setting
        id="speed-control"
        label="Speed button in the player"
        control={<Toggle id="speed-control-on" says={{ on: "Shown", off: "Hidden" }} on={store.speedControl} onChange={(speedControl) => void writeStore({ speedControl }).then(onChanged)} />}
      />
      <Setting
        id="end-time"
        label="Video end time in the player"
        control={<Toggle id="end-time-on" says={{ on: "Shown", off: "Hidden" }} on={store.endTime} onChange={(endTime) => void writeStore({ endTime }).then(onChanged)} />}
      />
      <Setting
        id="short-skip"
        label="Short skip with the arrow keys"
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
    </section>
  );
}
/** The keys a short skip can be held with, as the options page names them. */
const SKIP_KEY_OPTIONS: readonly { id: SkipKey; label: string }[] = [
  { id: "shift", label: "Shift" },
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
];

// Where you stopped last was a panel of its own here until the owner had it folded into Seek bar, 2026-10-21 (`SeekBar.tsx`).

/**
 * The page's tabs (the owner, 2026-10-16: the settings were "all over the place"): everything of the dictionary
 * together (looking words up, the dictionaries, the popup's layout), the decks and what fills their fields, how a
 * video's clip is cut, and the sign-in. The tab is in the address, so a reload stays on it.
 */
// The site's own tab, as each video site Panki works on will have one (the owner, 2026-10-16: "since we'll introduce Netflix soon").
// A Modules tab stood first for a few hours on 2026-10-21; each of its switches now heads the panel of what it's about.
type Tab = "dictionary" | "decks" | "youtube" | "account";
const TABS: readonly { id: Tab; label: string }[] = [
  // Named as its first panel since 2026-10-28 (Dictionary until then); its id stays `dictionary`, the address.
  { id: "dictionary", label: "Pop-up dictionary" },
  { id: "decks", label: "Decks" },
  { id: "youtube", label: "YouTube" },
  // Called About since 2026-10-22, at the owner's pick, once the extension's version joined the profiles here; its id stays `account` (the address, the drawer's way to the sign-in).
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
              // The word at each choice's right is where it comes from (the owner, 2026-10-16, kept forgetting).
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
        {/* Panki altogether, on or off in this browser, the same switch the strip's head has (the owner, 2026-10-21); here too, since the strip is the only other place and a page may not be open. */}
        {store ? (
          <span className="brand-switch">
            <Toggle id="panki-on" says={{ on: "On", off: "Off" }} on={store.pankiOn} onChange={(pankiOn) => void writeStore({ pankiOn }).then(refresh)} />
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
            {/* Pop-up dictionary and its layout side by side, then the dictionaries it reads, then the words in the decks marked (2026-10-28: what belongs together sits together). */}
            <Looking store={store} onChanged={refresh} />
            <PopupLayoutPanel kept={store.popupLayout} lookKey={store.lookKey} dictionariesChanged={dictionariesChanged} onSaved={refresh} />
            {/* The dictionaries are this browser's own: they work signed in or not (those kept on Panki only signed in). */}
            <Dictionaries onChanged={dictionariesChange} door={door} />
            <KnownWords store={store} onChanged={refresh} />
          </div>
          <div className="options-tab" hidden={tab !== "decks"}>
            {door ? (
              lists ? (
                <>
                  <DefaultDeck decks={lists.decks} store={store} onChanged={refresh} />
                  <Mapping decks={lists.decks} types={lists.types} store={store} onSaved={refresh} />
                </>
              ) : null
            ) : (
              <section className="panel">
                <p className="empty">Not signed in.</p>
                <div className="add-actions add-actions-start">
                  <Button variant="primary" onClick={() => choose("account")}>
                    Sign in
                  </Button>
                </div>
              </section>
            )}
          </div>
          <div className="options-tab" hidden={tab !== "youtube"}>
            <Transcribing store={store} onChanged={refresh} />
            {door ? <VideoTracking door={door} /> : null}
            <CurrentWord store={store} onChanged={refresh} />
            <SeekBarPanel store={store} onChanged={refresh} />
            <HomePanel store={store} onChanged={refresh} />
            <UtilitiesPanel store={store} onChanged={refresh} />
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
