import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CHUNK_LENGTH_MAX,
  DICTIONARY_MAX_BYTES,
  ENGINES,
  ENGINE_IDS,
  EngineKeyUpdate,
  OVER_LIMIT_IDS,
  type TranscribePaused,
  OVER_LIMIT_WORDS,
  PAUSE_WAIT_MAX,
  TRANSCRIBE_LANGUAGES,
  TRANSCRIBE_LANGUAGE_IDS,
  TRANSCRIBE_SPEEDS,
  WORD_AUDIO_SOURCES,
  WORD_AUDIO_SOURCE_IDS,
  WordAudioKeyUpdate,
  sizeWords,
  type EngineAccount,
  type ExtensionBuild,
  type FilesOfKind,
  type ServerDictionary,
  type StorageReport,
  type Settings,
  type SettingsUpdate,
  type TranscribeMode,
  type Transcription,
  type TranscriptionStatus,
  type WatchHistory,
  type WordAudio,
  type WordAudioStatus,
  type WatchingSettings,
} from "@panki/contracts";
import { ApiError, api, type Me } from "../api";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Form } from "../components/Form";
import { Icon } from "../components/Icon";
import { ModeChip } from "../components/ModeChip";
import { ModeCompare } from "../components/ModeCompare";
import { NumberField } from "../components/NumberField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { Skeleton } from "../components/Skeleton";
import { SubtitleStyleFields } from "../components/SubtitleStyleFields";
import { KeysPanels } from "./KeysSettings";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useSavedSoon } from "../hooks/useSavedSoon";
import { ledger } from "../ledger";
import { THEMES, applyTheme, readTheme, shownTheme, writeTheme, type ThemeId } from "../themes";
import { VIDEO_TRACKING_WHY, count, dateWords, dollarWords, durationWords } from "../words";

type Props = {
  settings: Settings;
  onChange: (patch: SettingsUpdate) => Promise<Settings>;
  /** Who is signed in, and on which devices. */
  me: Me;
  /** Signs one device out; this one, and the sign-in screen follows. */
  onSignOut: (sessionId: string) => Promise<void>;
  onSignOutAll: () => Promise<void>;
};

/** An hour of the day as the clock shows it: "4:00", "23:00". */
const clock = (hour: number) => `${hour}:00`;

/**
 * The page's tabs, as the extension's own page has them (the owner, 2026-10-17: "more organized, similar to the
 * extension settings page"): the look and what every deck shares, the dictionaries kept on Panki, what an admin alone
 * changes, and the account. The tab is in the address, so a reload stays on it; every tab is drawn and the others
 * hidden, so a key half typed on one survives a look at another.
 */
type SettingsTab = "general" | "keys" | "extension" | "admin" | "account";
const TABS: readonly { id: SettingsTab; label: string; admin?: true }[] = [
  { id: "general", label: "General" },
  { id: "keys", label: "Keybinds" },
  { id: "extension", label: "Extension" },
  { id: "admin", label: "Admin", admin: true },
  { id: "account", label: "Account" },
];
const tabOfAddress = (): SettingsTab | null => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? null;

/** Whose key a service has: the one typed here, the server's own, or none. */
type KeyStatus = WordAudioStatus["key"];
/** What a key panel says of the key there is. */
const KEY_SAID: Record<"none" | NonNullable<KeyStatus>, string> = {
  none: "No key yet.",
  settings: "A key is saved.",
  server: "The server's own key is used until one is saved here.",
};
/** The contracts' schema for a key typed in Settings (`WordAudioKeyUpdate`, `EngineKeyUpdate`), as far as the panel reads it. */
type KeySchema = { safeParse: (value: unknown) => { success: true; data: { key: string | null } } | { success: false } };
const said = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");
/** Said before a file too big for Panki is sent at all. */
const DICTIONARY_TOO_BIG = `That file is over ${sizeWords(DICTIONARY_MAX_BYTES)}.`;

/** The kinds of file on cards, in the order they weigh: clips first. The words are the app's own (`fieldKinds.ts` names a field's kind, not a file's). */
const KIND_WORDS: Record<FilesOfKind["kind"], string> = { video: "Video", audio: "Audio", image: "Images" };
const KIND_ORDER: readonly FilesOfKind["kind"][] = ["video", "audio", "image"];
const SPEED_OPTIONS = TRANSCRIBE_SPEEDS.map((speed) => ({ id: speed, label: `${speed}×` }));
const OVER_LIMIT_OPTIONS = OVER_LIMIT_IDS.map((id) => ({ id, label: OVER_LIMIT_WORDS[id] }));
// The words the extension's options page had for it, when it was each viewer's (until 2026-10-27).
const PAUSED_OPTIONS = [
  { id: "keep", label: "Keeps its lead" },
  { id: "stop", label: "Stops at once" },
] as const satisfies readonly { id: TranscribePaused; label: string }[];
const ENGINE_OPTIONS = ENGINE_IDS.map((id) => ({ id, label: ENGINES[id].name }));
const LANGUAGE_OPTIONS = TRANSCRIBE_LANGUAGE_IDS.map((id) => ({ id, label: TRANSCRIBE_LANGUAGES[id] }));
const SOURCE_OPTIONS = WORD_AUDIO_SOURCE_IDS.map((id) => ({ id, label: WORD_AUDIO_SOURCES[id].name }));

/** The zone this device is in, by its name in the time zone database: what an account's zone starts as (`App.tsx` writes it the first time the account opens Panki). */
export const DEVICE_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The account's time zone as a choice: every zone the browser knows, written with spaces for underscores, this
 * device's noted. Each account's own, nothing Panki-wide (2026-10-21). A zone saved that the browser doesn't list (an
 * old alias) is listed all the same, so the choice never shows as nothing.
 */
function zoneOptions(saved: string): { id: string; label: string; note?: string }[] {
  const zones = [...new Set([...Intl.supportedValuesOf("timeZone"), DEVICE_ZONE, ...(saved === "" ? [] : [saved])])].sort();
  return zones.map((zone) => ({ id: zone, label: zone.replaceAll("_", " "), ...(zone === DEVICE_ZONE ? { note: "This device" } : {}) }));
}

/**
 * Whether the account's videos are being recorded, said and not changed: Video tracking is the extension's to switch,
 * the extension being what records (the owner, 2026-10-28: "it's not changeable and it's synced to the extension
 * setting and it just displays the status"), where it's switched said under it. Then all that's kept of the videos
 * watched, in one line, and a way to forget it, asked in place with words to type (a Watch history panel of its own,
 * on the Account tab, until the owner had it in here, 2026-10-28). The rows are hidden on Panki with the time they
 * went, never destroyed; the watch time and Continue watching start over.
 */
function DataTrackingPanel({ on }: { on: boolean }) {
  const [history, setHistory] = useState<WatchHistory | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.watchHistory().then(
      (now) => {
        if (alive) setHistory(now);
      },
      (e: unknown) => {
        if (alive) setFailure(said(e));
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  async function forget() {
    setBusy(true);
    setFailure(null);
    try {
      setHistory(await api.forgetWatchHistory());
      setAsking(false);
    } catch (e) {
      setFailure(said(e));
    } finally {
      setBusy(false);
    }
  }

  const kept = history !== null && history.videos > 0;
  return (
    <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby="data-tracking-title">
      <h2 id="data-tracking-title" className="panel-title">
        Data tracking
      </h2>
      <Setting
        id="videoTracking"
        label="Video tracking"
        control={<Toggle id="setting-video-tracking" icon="link" says={{ on: "On · Linked to the extension", off: "Off · Linked to the extension" }} on={on} disabled onChange={() => undefined} />}
        why={VIDEO_TRACKING_WHY}
      />
      {history ? (
        <p className="session-who">
          {kept ? `${count(history.videos, "video", "videos")} · ${durationWords(history.ms / 1000)}${history.since === null ? "" : ` since ${dateWords(history.since)}`}` : "Nothing kept."}
        </p>
      ) : failure ? null : (
        <Skeleton shape="lines" count={1} />
      )}
      {asking ? (
        <Ask
          idPrefix="watch-forget"
          question="Forget your watch history? Your watch time and Continue watching start again from nothing."
          typed="I understand"
          go={{ words: "Forget history", busy: "Forgetting…" }}
          busy={busy}
          failure={failure}
          onKeep={() => setAsking(false)}
          onGo={() => void forget()}
        />
      ) : (
        <div className="add-actions add-actions-start">
          {failure ? (
            <span className="form-failure" role="alert">
              {failure}
            </span>
          ) : null}
          <Button id="watch-forget" className="is-danger" disabled={!kept} onClick={() => setAsking(true)}>
            <Icon name="trash" />
            Forget my watch history…
          </Button>
        </div>
      )}
    </section>
  );
}

type KeyPanelProps = {
  /** Names the panel's controls for the checks that drive the real UI. */
  id: string;
  /** The service the key is for. */
  title: string;
  /** Who gave the key, for the field's own words when what's typed isn't one: "Forvo", "ElevenLabs". */
  from: string;
  /** The field's label. */
  label: string;
  /** Whose key there is now; undefined until Panki has said. */
  status: KeyStatus | undefined;
  /** The key saved here, as it is, for an admin to see again under a spoiler; none while there isn't one. */
  saved?: string | undefined;
  /** What a key typed here must be: the contracts' schema for it. */
  schema: KeySchema;
  /** Keeps the key, or forgets it (null); whoever holds the status refreshes it from Panki's answer. */
  onSave: (key: string | null) => Promise<void>;
  /** Under the status line: what the service has been used for so far. */
  children?: ReactNode;
};

/**
 * A service's key: typed in plain sight, saved, and then kept under a spoiler like a card's, pressed to see it and
 * pressed again to cover it (the owner, 2026-10-17: "you don't have to hide it… otherwise it's a spoiler like the
 * spoiler words in the card types"; it was typed as a password and never shown again). Saving another replaces it;
 * Forget takes it off, asking first. Forvo's and a transcribing engine's are both this, inside the Admin panel.
 */
function KeyPanel({ id, title, from, label, status, saved, schema, onSave, children }: KeyPanelProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  /** What copying the key came to, said beside it for a moment. */
  const [copied, setCopied] = useState<string | null>(null);
  /**
   * The saved key to the clipboard (the owner, 2026-10-17: "make it so I can copy the key by clicking on it"). With a
   * mouse the key shows on hover already, so the first press copies; on a touch screen the first press shows it and
   * the next copies.
   */
  async function copy() {
    if (saved === undefined) return;
    try {
      await navigator.clipboard.writeText(saved);
      setCopied("Copied");
    } catch {
      setCopied("Couldn't copy");
    }
    setTimeout(() => setCopied(null), 1500);
  }
  const [busy, setBusy] = useState(false);
  /** The saved key uncovered; covered again whenever another is saved. */
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [saved]);
  /** Forget key asking first. */
  const [forgetting, setForgetting] = useState(false);

  async function keep(next: string | null) {
    setBusy(true);
    setFailure(null);
    try {
      await onSave(next);
      setKey("");
      setForgetting(false);
    } catch (e) {
      setFailure(said(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const parsed = schema.safeParse({ key });
    if (!parsed.success || parsed.data.key === null) {
      setError(`Paste the key ${from} gave you.`);
      return;
    }
    void keep(parsed.data.key);
  }

  return (
    <section className="panel-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="panel-subtitle">
        {title}
      </h3>
      <Form onSubmit={save} className="add-form">
        <TextField
          id={`${id}-key`}
          label={label}
          autoComplete="off"
          value={key}
          onChange={(typed) => {
            setKey(typed);
            setError(undefined);
          }}
          error={error}
        />
        <div className="add-actions add-actions-start">
          {failure ? (
            <span className="form-failure" role="alert">
              {failure}
            </span>
          ) : null}
          <Button id={`${id}-save`} type="submit" variant="primary" disabled={busy || key.trim() === ""}>
            <Icon name="save" />
            Save key
          </Button>
          {status === "settings" ? (
            <Button id={`${id}-forget`} className="is-danger" aria-pressed={forgetting} disabled={busy} onClick={() => setForgetting((was) => !was)}>
              <Icon name="trash" />
              Forget key
            </Button>
          ) : null}
        </div>
      </Form>
      {forgetting && status === "settings" ? (
        <div className="ask-box">
          <Ask
            idPrefix={`${id}-forget`}
            question="Forget this key?"
            go={{ words: "Forget key", busy: "Forgetting…" }}
            busy={busy}
            failure={null}
            onKeep={() => setForgetting(false)}
            onGo={() => void keep(null)}
          />
        </div>
      ) : null}
      {status !== undefined ? (
        <p className="setting-why">
          {KEY_SAID[status ?? "none"]}
          {status === "settings" && saved !== undefined ? (
            <>
              <Button
                variant="spoiler"
                className="key-spoiler"
                aria-pressed={shown}
                aria-label={shown ? "Copy the key" : "The key, covered: press to see it"}
                onClick={() => {
                  const seen = shown || window.matchMedia("(hover: hover)").matches;
                  setShown(true);
                  if (seen) void copy();
                }}
              >
                <span className="key-text">{saved}</span>
              </Button>
              {copied ? (
                <span className="key-copied" role="status">
                  {copied}
                </span>
              ) : null}
              {shown ? (
                <Button variant="ghost" className="key-hide" onClick={() => setShown(false)}>
                  <Icon name="eyeOff" />
                  Hide
                </Button>
              ) : null}
            </>
          ) : null}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** The tally under the engine's key: how much sound has gone to engines, and what that came to at this engine's rate. */
function transcribedWords(seconds: number, centsPerHour: number): string {
  if (seconds === 0) return "Nothing transcribed yet.";
  // Whole cents, rounded once; only the display splits them into dollars.
  const cents = Math.round((seconds * centsPerHour) / 3600);
  return `${durationWords(seconds)} transcribed · about ${dollarWords(cents)}`;
}

/** An account's standing as the engine says it, in the app's words; as it came when it's a word the app doesn't know. */
const STATUS_WORDS: Record<string, string> = { active: "Active", free: "Free", trialing: "Trial", past_due: "Payment due", incomplete: "Incomplete", free_disabled: "Free, disabled" };
const planWords = (plan: string) => plan.charAt(0).toUpperCase() + plan.slice(1);

/**
 * The engine's account behind the key, read from the engine each time the panel opens or the key changes (the owner,
 * 2026-10-17: "how many credits I have left, how much top up, my plan"): the plan and its standing, the credits used
 * of the period's limit, as a share too, and when they reset. (What pay-as-you-go use had come to was a line here
 * until the owner had it taken off, the same day; the API still reads it.)
 */
function EngineAccountLines({ keyed, turn }: { keyed: boolean; turn: number }) {
  const [account, setAccount] = useState<EngineAccount | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setAccount(null);
    setFailure(null);
    if (!keyed) return;
    let alive = true;
    api.engineAccount().then(
      (now) => {
        if (alive) setAccount(now);
      },
      (e: unknown) => {
        if (alive) setFailure(said(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [keyed, turn]);
  if (!keyed) return null;
  if (failure) {
    return (
      <p className="setting-why" role="alert">
        {failure}
      </p>
    );
  }
  if (!account) return <Skeleton shape="lines" count={2} />;
  return (
    <>
      <p className="setting-why">
        {planWords(account.plan)} · {STATUS_WORDS[account.status] ?? account.status}
      </p>
      <p className="setting-why">
        {account.used.toLocaleString("en")} of {account.limit.toLocaleString("en")} credits used{account.limit > 0 ? ` (${Math.round((account.used / account.limit) * 100)}%)` : ""}
        {account.resetsAt !== null ? ` · resets ${dateWords(account.resetsAt)}` : ""}
      </p>
    </>
  );
}

type TranscribingProps = {
  status: TranscriptionStatus;
  /** Every answer from Panki carries the key's state and the tally with it; the panel keeps the latest. */
  onStatus: (status: TranscriptionStatus) => void;
};

/**
 * How transcribing runs, for everyone, each change saved a moment after it's made: the engine (the language is each account's own); the
 * transcription modes compared, which one everyone starts on and which are switched off, and the download limit; how
 * the chunks are cut; then the engine's key and its tally. (What's the viewer's own, whether it starts by itself, what
 * it does while paused, whether the transcript replaces the site's captions, and which mode they use, is on the
 * extension's page or the strip's menu: only what costs is set here.)
 */
function Transcribing({ status, onStatus }: TranscribingProps) {
  const [current, patch, failure] = useSavedSoon<Transcription>(status.settings, async (change) => {
    const next = await api.updateTranscription(change);
    onStatus(next);
    return next.settings;
  });
  const engine = ENGINES[current.engine];
  /** A mode switched on or off; the default stays on (its switch can't be pressed). */
  const setModeOn = (mode: TranscribeMode, on: boolean) => patch({ modesOff: on ? current.modesOff.filter((m) => m !== mode) : [...current.modesOff.filter((m) => m !== mode), mode] });

  return (
    <>
      <section className="panel" aria-labelledby="transcribing-title">
        <h2 id="transcribing-title" className="panel-title">
          Transcribing
        </h2>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        <Setting id="engine" label="Engine" control={<Dropdown id="transcribe-engine" label="Engine" options={ENGINE_OPTIONS} value={current.engine} disabled={ENGINE_IDS.length < 2} onChange={(engine) => patch({ engine })} />} />
        {/* The language every video was transcribed in stood here from 2026-10-18 until the owner made it each account's own, 2026-10-21 (General → Watching). */}
        <KeyPanel id="engine" title={engine.name} from={engine.vendor} label="API key" status={status.key} saved={status.saved} schema={EngineKeyUpdate} onSave={async (key) => onStatus(await api.setEngineKey(current.engine, key))}>
          <p className="setting-why">{transcribedWords(status.seconds, engine.centsPerHour)}</p>
          {/* Read again whenever the key changes: the saved key's text is the sign of that. */}
          <EngineAccountLines keyed={status.key !== null} turn={(status.saved ?? "").length} />
        </KeyPanel>
      </section>
      <section className="panel" aria-labelledby="modes-title">
        <h2 id="modes-title" className="panel-title">
          Transcription modes
        </h2>
        <ModeCompare mode={current.mode} modesOff={current.modesOff} estimate={status.estimate} onDefault={(mode) => patch({ mode })} onOn={setModeOn} />
        {/* How much of a video is watched before the entire video is transcribed by itself (the owner, 2026-10-21). */}
        <Setting
          id="wholeAfter"
          label="Minimum watch time before activating full transcription"
          control={<NumberField id="transcribe-whole-after" label="Minimum watch time before activating full transcription, in seconds" value={current.wholeAfter} min={0} max={600} suffix="s" onChange={(wholeAfter) => patch({ wholeAfter })} />}
          why={
            <>
              For <ModeChip mode="full" /> and <ModeChip mode="hybrid" /> only.
            </>
          }
        />
        {/* The length limit (the setting's key is still `downloadLimit`): "download" isn't said on screen, the engine downloading and transcribing a video at once (the owner, 2026-10-20). */}
        <Setting
          id="downloadLimit"
          label="Length limit"
          control={<NumberField id="transcribe-download-limit" label="Length limit in minutes" value={current.downloadLimit} min={1} max={600} suffix="min" onChange={(downloadLimit) => patch({ downloadLimit })} />}
          why={
            <>
              For <ModeChip mode="full" /> and <ModeChip mode="hybrid" /> only.
            </>
          }
        />
        <Setting
          id="overLimit"
          label="Videos over the length limit"
          control={<Segmented idPrefix="transcribe-over-limit" label="Videos over the length limit" options={OVER_LIMIT_OPTIONS} value={current.overLimit} onChange={(overLimit) => patch({ overLimit })} />}
        />
      </section>
      <section className="panel" aria-labelledby="chunks-title">
        <h2 id="chunks-title" className="panel-title">
          Chunks
        </h2>
        {/* How a chunk is cut, at the owner's ask (2026-10-20: "a short description under chunks explaining how it works"). */}
        <p className="setting-why">The background player records a chunk until it reaches its length, then stops at the first pause in the speech. If there's no pause, it's forcefully cut after the wait, and the next chunk starts 1.5 s earlier so the word that was cut is heard in its entirety.</p>
        <Setting
          id="speed"
          label="Speed"
          control={<Dropdown id="transcribe-speed" label="Speed" options={SPEED_OPTIONS} value={current.speed} onChange={(speed) => patch({ speed })} />}
          why="How fast the chunk background player plays."
        />
        <Setting
          id="lead"
          label="Lead"
          control={<NumberField id="transcribe-lead" label="Minutes ahead" value={current.lead} min={1} max={180} suffix="min" onChange={(lead) => patch({ lead })} />}
          why="How far ahead of you it keeps transcribed."
        />
        <Setting
          id="paused"
          label="While paused"
          control={<Segmented idPrefix="transcribe-paused" label="While paused" options={PAUSED_OPTIONS} value={current.paused} onChange={(paused) => patch({ paused })} />}
        />
        <Setting
          id="firstChunk"
          label="First chunk"
          control={<NumberField id="transcribe-first-chunk" label="First chunk in seconds" value={current.firstChunk} min={1} max={CHUNK_LENGTH_MAX} suffix="s" onChange={(firstChunk) => patch({ firstChunk })} />}
          why="On a new video or after a jump."
        />
        <Setting
          id="chunkGrowth"
          label="Each next chunk"
          control={<NumberField id="transcribe-chunk-growth" label="Times as long as the last" value={current.chunkGrowth} min={1} max={4} step={0.1} suffix="× longer" onChange={(chunkGrowth) => patch({ chunkGrowth })} />}
          why="Up to the chunk length."
        />
        <Setting
          id="chunkLength"
          label="Chunk length"
          control={<NumberField id="transcribe-chunk-length" label="Chunk length in seconds" value={current.chunkLength} min={5} max={CHUNK_LENGTH_MAX} suffix="s" onChange={(chunkLength) => patch({ chunkLength })} />}
          why="Chunks grow up to this, then each one ends at the next pause."
        />
        <Setting
          id="pauseWait"
          label="Wait for a pause up to"
          control={<NumberField id="transcribe-pause-wait" label="Seconds to wait for a pause" value={current.pauseWait} min={1} max={PAUSE_WAIT_MAX} suffix="s" onChange={(pauseWait) => patch({ pauseWait })} />}
          why="If there's no pause by then, the chunk gets cut anyway, even mid-sentence."
        />
        <Setting
          id="skipSilence"
          label="Skip silence"
          control={<Toggle id="transcribe-skip-silence" says={{ on: "On", off: "Off" }} on={current.skipSilence} onChange={(skipSilence) => patch({ skipSilence })} />}
          why="Long stretches with no speech aren't transcribed. Try turning it off if subtitles are missing in quiet parts."
        />
      </section>
      <section className="panel" aria-labelledby="fixing-title">
        <h2 id="fixing-title" className="panel-title">
          Editing
        </h2>
        <Setting
          id="fixes"
          label="Editing Panki subtitles"
          control={<Toggle id="transcribe-fixes" says={{ on: "On", off: "Off" }} on={current.fixes} onChange={(fixes) => patch({ fixes })} />}
          why={
            current.fixes
              ? "Anyone using Panki can edit a word or a line of Panki subtitles on a video's page. Everyone sees the same Panki subtitles for a video, so an edit changes them for everyone."
              : "Nobody can edit Panki subtitles."
          }
        />
      </section>
    </>
  );
}

type WordAudioProps = {
  status: WordAudioStatus;
  /** Every answer from Panki carries the key's state and the day's count with it; the panel keeps the latest. */
  onStatus: (status: WordAudioStatus) => void;
};

/**
 * Where word audio comes from, for everyone (the owner, 2026-10-17: "like engine and key; even though there's only one
 * engine for audio pronunciation, we might have others in the future"): the source, saved a moment after it's changed,
 * then its key and how many of the day's requests Panki has made to it.
 */
/**
 * How watching is told, for everyone (the owner, 2026-10-25: "make that number configurable"): how close to its end a
 * video played is finished, a flag kept on it, so it leaves Continue watching and isn't offered to continue.
 */
function WatchingSection({ settings }: { settings: WatchingSettings }) {
  const [current, patch, failure] = useSavedSoon<WatchingSettings>(settings, (change) => api.updateWatchingSettings(change));
  return (
    <section className="panel" aria-labelledby="watching-admin-title">
      <h2 id="watching-admin-title" className="panel-title">
        Watching
      </h2>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      <Setting
        id="finishedWithinSec"
        label="Video counts as finished in its last"
        control={<NumberField id="finished-within" label="Video counts as finished in its last" value={current.finishedWithinSec} min={0} max={600} suffix="s" onChange={(finishedWithinSec) => patch({ finishedWithinSec })} />}
      />
    </section>
  );
}

function WordAudioSection({ status, onStatus }: WordAudioProps) {
  const [current, patch, failure] = useSavedSoon<WordAudio>(status.settings, async (change) => {
    const next = await api.updateWordAudio(change);
    onStatus(next);
    return next.settings;
  });
  const source = WORD_AUDIO_SOURCES[current.source];
  return (
    <section className="panel" aria-labelledby="word-audio-title">
      <h2 id="word-audio-title" className="panel-title">
        Word audio
      </h2>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      <Setting id="wordAudioSource" label="Source" control={<Dropdown id="word-audio-source" label="Source" options={SOURCE_OPTIONS} value={current.source} disabled={WORD_AUDIO_SOURCE_IDS.length < 2} onChange={(next) => patch({ source: next })} />} />
      <KeyPanel id="word-audio" title={source.name} from={source.vendor} label="API key" status={status.key} saved={status.saved} schema={WordAudioKeyUpdate} onSave={async (key) => onStatus(await api.setWordAudioKey(current.source, key))}>
        {/* Forvo tells nothing of its use, so Panki counts its own requests against the day's allowance (the owner, 2026-10-17). */}
        {status.calls !== undefined && source.dailyLimit !== null ? (
          <p className="setting-why">
            {status.calls.toLocaleString("en")} of {source.dailyLimit.toLocaleString("en")} requests today
          </p>
        ) : null}
      </KeyPanel>
    </section>
  );
}

/** The files of one kind, or of all of them, as a row's small print: "Video 1.2 GB · 12 files". */
const kindWords = (name: string, bytes: number, files: number) => `${name} ${sizeWords(bytes)} · ${count(files, "file", "files")}`;

/**
 * What Panki's data takes on the disk, for an admin to keep an eye on the clips and sounds (the owner, 2026-10-17:
 * "the current storage plus storage allocated, so I know once the videos and audios take too much space"; read-only,
 * nothing to clean up here yet, by their word). Each account with its files by kind, what everyone shares, the backups,
 * the whole of Panki, and the disk it's on. Read once as the panel opens: it walks every file.
 */
function StorageSection() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.storageReport().then(
      (now) => {
        if (alive) setReport(now);
      },
      (e: unknown) => {
        if (alive) setFailure(said(e));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const used = report ? report.disk.totalBytes - report.disk.freeBytes : 0;
  return (
    <section className="panel" aria-labelledby="storage-title">
      <h2 id="storage-title" className="panel-title">
        Storage
      </h2>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {report ? (
        <div className="kept-rows">
          {report.accounts.map((account) => (
            <div key={account.name} className="kept-row">
              <span className="kept-name">
                {account.name}
                <span className="row-sub">
                  {[
                    ...(account.kinds ? KIND_ORDER.flatMap((kind) => account.kinds?.filter((of) => of.kind === kind && of.files > 0).map((of) => kindWords(KIND_WORDS[kind], of.bytes, of.files)) ?? []) : account.mediaBytes > 0 ? [`Files ${sizeWords(account.mediaBytes)}`] : []),
                    `Cards and history ${sizeWords(account.bytes - account.mediaBytes)}`,
                  ].join(" · ")}
                </span>
              </span>
              <span className="kept-size">{sizeWords(account.bytes)}</span>
            </div>
          ))}
          <div className="kept-row">
            <span className="kept-name">
              Shared
              <span className="row-sub">
                {[
                  report.shared.dictionaries.files > 0 ? kindWords("Dictionaries", report.shared.dictionaries.bytes, report.shared.dictionaries.files) : "No dictionaries",
                  // About: worked out from the transcripts' rows, the store can't say exactly (the owner, 2026-10-22).
                  ...(report.shared.transcripts && report.shared.transcripts.videos > 0
                    ? [`Transcripts about ${sizeWords(report.shared.transcripts.bytes)} (${count(report.shared.transcripts.videos, "video", "videos")}, ${count(report.shared.transcripts.words, "word", "words")})`]
                    : []),
                ].join(" · ")}
              </span>
            </span>
            <span className="kept-size">{sizeWords(report.shared.bytes)}</span>
          </div>
          <div className="kept-row">
            <span className="kept-name">
              Backups
              <span className="row-sub">
                {[
                  report.backups.latestAt === null ? "None yet" : `Latest ${dateWords(report.backups.latestAt)}`,
                  `${report.backups.snapshots} of ${report.backups.keep} slots`,
                  ...(report.backups.filesBytes > 0 ? [`Files ${sizeWords(report.backups.filesBytes)}`] : []),
                ].join(" · ")}
              </span>
            </span>
            <span className="kept-size">{sizeWords(report.backups.bytes)}</span>
          </div>
          <div className="kept-row">
            <span className="kept-name">All of Panki</span>
            <span className="kept-size">{sizeWords(report.allBytes)}</span>
          </div>
          <div className={`kept-row ${report.disk.low ? "is-low" : ""}`.trim()}>
            <span className="kept-name">
              Disk
              <span className="row-sub">
                {sizeWords(used)} used of {sizeWords(report.disk.totalBytes)}
              </span>
            </span>
            <span className="kept-size">{sizeWords(report.disk.freeBytes)} left</span>
          </div>
        </div>
      ) : failure ? null : (
        <Skeleton shape="kept" count={6} />
      )}
    </section>
  );
}

/** The day a build of the extension's files last changed ("2026-10-22"), in words. Noon, so no zone turns it into the day before. */
const buildDay = (changedAt: string) => dateWords(Date.parse(`${changedAt}T12:00:00`));

/**
 * The Chrome extension, as this Panki carries it (the owner, 2026-10-22: no store): the build to download, and how it's
 * set up on a computer. Keeping it up to date afterwards is the extension's own to say (Update Panki, in its folder).
 */
function ExtensionPanel() {
  const [build, setBuild] = useState<ExtensionBuild | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.extensionBuild().then(
      (now) => {
        if (alive) setBuild(now);
      },
      (e: unknown) => {
        if (alive) setFailure(said(e));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <section className="panel" aria-labelledby="extension-title">
        <h2 id="extension-title" className="panel-title">
          Chrome extension
        </h2>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        {build ? (
          <div className="kept-rows">
            <div className="kept-row">
              <span className="kept-name">
                Latest version
                <span className="row-sub">
                  {buildDay(build.changedAt)} · {build.fingerprint}
                </span>
              </span>
              {/* The zip comes as a download: the page stays where it is. */}
              <Button variant="primary" onClick={() => window.location.assign(api.extensionZip)}>
                <Icon name="download" />
                Download
              </Button>
            </div>
          </div>
        ) : failure ? null : (
          <Skeleton shape="kept" count={1} />
        )}
      </section>
      <section className="panel" aria-labelledby="extension-setup-title">
        <h2 id="extension-setup-title" className="panel-title">
          Set up on a computer
        </h2>
        <ol className="setup-steps">
          <li>
            Download it above and extract it to a folder you'll keep, such as <code>C:\Panki</code>.
          </li>
          <li>
            In Chrome, open <code>chrome://extensions</code> and switch on Developer mode.
          </li>
          <li>Press Load unpacked and choose that folder.</li>
          <li>Sign in on the page that opens.</li>
          <li>To update it later, open Update Panki in that folder, then press Reload Panki.</li>
        </ol>
      </section>
    </>
  );
}

/** What everyone shares and an admin alone changes, a panel each: how transcribing runs, the engine's key, the Forvo key for word audio, watching; and, to read, what it all takes on the disk. */
function AdminPanel() {
  const [transcription, setTranscription] = useState<TranscriptionStatus | null>(null);
  const [wordAudio, setWordAudio] = useState<WordAudioStatus | null>(null);
  const [watching, setWatching] = useState<WatchingSettings | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const failed = (e: unknown) => {
      if (alive) setFailure(said(e));
    };
    api.watchingSettings().then((now) => {
      if (alive) setWatching(now);
    }, failed);
    api.getTranscription().then((now) => {
      if (alive) setTranscription(now);
    }, failed);
    api.getWordAudio().then((now) => {
      if (alive) setWordAudio(now);
    }, failed);
    return () => {
      alive = false;
    };
  }, []);

  // Panels of their own, as every other tab has (the owner, 2026-10-27: "all the settings are under Admin… organize it
  // better, similar to other tabs"); each stands with its title while what's in it loads.
  return (
    <>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {transcription ? (
        <Transcribing status={transcription} onStatus={setTranscription} />
      ) : failure ? null : (
        <>
          {/* Rows as many as fill each panel's real height on a computer, measured on a scratch Panki (2026-10-27); the modes' chart is far taller on a phone. */}
          <LoadingPanel id="transcribing" title="Transcribing" rows={5} />
          <LoadingPanel id="modes" title="Transcription modes" rows={19} />
          <LoadingPanel id="chunks" title="Chunks" rows={15} />
          <LoadingPanel id="fixing" title="Editing" rows={2} />
        </>
      )}
      {wordAudio ? <WordAudioSection status={wordAudio} onStatus={setWordAudio} /> : failure ? null : <LoadingPanel id="word-audio" title="Word audio" rows={5} />}
      {watching ? <WatchingSection settings={watching} /> : failure ? null : <LoadingPanel id="watching-admin" title="Watching" rows={1} />}
      <StorageSection />
    </>
  );
}

/** An admin's panel while what's in it loads: its title, already known, over the shape of its rows. */
function LoadingPanel({ id, title, rows }: { id: string; title: string; rows: number }) {
  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">
        {title}
      </h2>
      <Skeleton shape="settings" count={rows} />
    </section>
  );
}

/**
 * Dictionaries kept on Panki (the owner, 2026-10-16: "put all these zips in the server … and I can choose available
 * ones from there to download"): uploaded here as the zips they come in, each listed by what its own index.json says it
 * is, and added to the extension from its options page. An admin's alone (the owner, 2026-10-17: "only admin can add
 * it"); everyone else meets the dictionaries on the extension's own page. Removing one asks first, with what it costs.
 */
function DictionariesPanel() {
  const [list, setList] = useState<ServerDictionary[] | null>(null);
  /** The file being sent now, while an upload runs. */
  const [uploading, setUploading] = useState<string | null>(null);
  /** What went wrong, one line each: every file that didn't go up says why. */
  const [failures, setFailures] = useState<readonly string[]>([]);
  /** The dictionary whose Delete was pressed: the question stands in its row. */
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    api.listDictionaries().then(
      (kept) => {
        if (alive) setList(kept);
      },
      (e: unknown) => {
        if (alive) setFailures([said(e)]);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  async function uploadAll(files: readonly File[]) {
    setFailures([]);
    for (const file of files) {
      if (file.size > DICTIONARY_MAX_BYTES) {
        setFailures((was) => [...was, `${file.name}: ${DICTIONARY_TOO_BIG}`]);
        continue;
      }
      setUploading(file.name);
      try {
        const kept = await api.uploadDictionary(crypto.randomUUID(), file);
        setList((was) => [...(was ?? []), kept]);
      } catch (e) {
        setFailures((was) => [...was, `${file.name}: ${said(e)}`]);
      }
    }
    setUploading(null);
  }

  async function remove(id: string) {
    setRemoving(true);
    setFailures([]);
    try {
      await api.removeDictionary(id);
      setList((was) => (was ?? []).filter((d) => d.id !== id));
      setAsking(null);
    } catch (e) {
      setFailures([said(e)]);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="dictionaries-title">
      <h2 id="dictionaries-title" className="panel-title">
        Dictionaries
      </h2>
      {list === null && failures.length === 0 ? <Skeleton shape="kept" count={2} /> : null}
      {list && list.length === 0 && !uploading ? <p className="empty">No dictionaries on Panki yet.</p> : null}
      {list && list.length > 0 ? (
        <div className="kept-rows">
          {list.map((dictionary) => (
            <div key={dictionary.id} className={`kept-row ${asking === dictionary.id ? "is-asking" : ""}`.trim()}>
              <span className="kept-name">
                {dictionary.title}
                <span className="row-sub">{[dictionary.revision, sizeWords(dictionary.bytes), `uploaded ${dateWords(dictionary.uploadedAt)}`].filter((part) => part !== "").join(" · ")}</span>
              </span>
              {asking === dictionary.id ? (
                <Ask
                  idPrefix={`dictionary-delete-${dictionary.id}`}
                  question={`Delete “${dictionary.title}”?`}
                  detail="Its file is deleted here; where it's been added to the extension, it stays."
                  go={{ words: "Delete dictionary", busy: "Deleting…" }}
                  busy={removing}
                  failure={null}
                  onKeep={() => setAsking(null)}
                  onGo={() => void remove(dictionary.id)}
                />
              ) : (
                <Button className="is-danger" disabled={uploading !== null || removing} onClick={() => setAsking(dictionary.id)}>
                  <Icon name="trash" />
                  Delete…
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {uploading ? (
        <p className="setting-why" role="status">
          Uploading {uploading}…
        </p>
      ) : null}
      {failures.length > 0 ? (
        <div className="form-failure" role="alert">
          {failures.map((line) => (
            <p key={line} className="failure-line">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <Button className="media-drop" disabled={uploading !== null} onClick={() => input.current?.click()}>
        <Icon name="upload" />
        Upload a dictionary
      </Button>
      {/* The system's own file chooser is opened by the button above; this input is never seen. */}
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        multiple
        accept=".zip,application/zip"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void uploadAll(files);
        }}
      />
    </section>
  );
}

/**
 * The theme first, kept on this device; then General: when the day turns over and in which
 * time zone, and the language videos are transcribed in. How a review runs is in each deck's own settings. Then
 * Immersion: whether watching is kept. Each change is saved a moment after
 * it's made. Then for an admin alone, the Admin tab with what every account shares (how transcribing runs, the keys, the
 * dictionaries kept on Panki). Last, the devices signed in and the watch history.
 */
export function SettingsView({ settings, onChange, me, onSignOut, onSignOutAll }: Props) {
  const [current, patch, failure] = useSavedSoon<Settings>(settings, onChange);
  const zones = useMemo(() => zoneOptions(current.timeZone), [current.timeZone]);
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [askingAll, setAskingAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutFailure, setSignOutFailure] = useState<string | null>(null);
  const tabs = TABS.filter((t) => !t.admin || me.user.admin);
  const [tab, setTab] = useState<SettingsTab>(() => tabOfAddress() ?? "general");
  // An address naming a tab this account doesn't have (Admin) lands on the first.
  const shown = tabs.some((t) => t.id === tab) ? tab : "general";
  function choose(next: SettingsTab) {
    setTab(next);
    window.history.replaceState(window.history.state, "", `#${next}`);
  }

  function chooseTheme(id: ThemeId) {
    applyTheme(id);
    writeTheme(id);
    setTheme(id);
    ledger.record("theme", { data: { theme: id } });
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setSignOutFailure(null);
    try {
      await work();
    } catch (e) {
      setSignOutFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Segmented idPrefix="settings-tab" label="Settings" options={tabs} value={shown} onChange={choose} />
      <div className="settings-tab" hidden={shown !== "general"}>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        <section className="panel" aria-labelledby="look-title">
          <h2 id="look-title" className="panel-title">
            Look
          </h2>
          <Setting
            id="theme"
            label="Theme"
            control={
              <div className="chips theme-chips" role="group" aria-label="Theme">
                {THEMES.map((t) => {
                  // "Match the device" shows the two colours it comes to on this device right now.
                  const [surface, accent] = shownTheme(t.id).swatch;
                  return (
                    <Button key={t.id} id={`theme-${t.id}`} variant="chip" aria-pressed={theme === t.id} onClick={() => chooseTheme(t.id)}>
                      <span className="theme-swatch" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${surface} 50%, ${accent} 50%)` }} />
                      {t.name}
                    </Button>
                  );
                })}
              </div>
            }
          />
        </section>

        <section className="panel" aria-labelledby="settings-title">
          <h2 id="settings-title" className="panel-title">
            General
          </h2>
          <Setting
            id="dayStartHour"
            label="The day starts at"
            control={<NumberField id="setting-day-start" label="Hour the day starts" value={current.dayStartHour} min={0} max={23} suffix=":00" onChange={(dayStartHour) => patch({ dayStartHour })} />}
            why={`A review before ${clock(current.dayStartHour)} counts for the day before. Each deck's new cards and review limit reset at ${clock(current.dayStartHour)}.`}
          />
          {/* Never empty once the account has opened Panki (App writes the device's zone); shown as this device's until that write lands. */}
          <Setting
            id="timeZone"
            label="Time zone"
            control={<Dropdown id="setting-time-zone" label="Time zone" options={zones} value={current.timeZone || DEVICE_ZONE} onChange={(timeZone) => patch({ timeZone })} />}
          />
          {/* The account's own, told to the engine for every video it transcribes (moved here from Watching at the owner's word, 2026-10-21). */}
          <Setting
            id="language"
            label="Transcription language"
            control={<Dropdown id="setting-language" label="Transcription language" options={LANGUAGE_OPTIONS} value={current.language} onChange={(language) => patch({ language })} />}
          />
        </section>

        {/* Immersion (Watching until 2026-10-21) stood here with Video tracking's switch until the owner had it changed in
            the extension alone and shown on the Extension tab, 2026-10-28 (`DataTrackingPanel`). */}

        {/* How a card's clip's subtitles look (a part's Subtitles in a card type's Layout): the app's own, apart from the extension's over YouTube. */}
        <section className="panel" aria-labelledby="card-subtitles-title">
          <h2 id="card-subtitles-title" className="panel-title">
            Subtitles on cards
          </h2>
          <SubtitleStyleFields idPrefix="card-subtitle" style={current.subtitleStyle} onChange={(subtitleStyle) => patch({ subtitleStyle })} />
        </section>
      </div>

      {/* The review's keys, this device's own (the owner, 2026-10-21: "can you make it so I can customize keybinds"). */}
      <div className="settings-tab" hidden={shown !== "keys"}>
        <KeysPanels />
      </div>

      {/* The Chrome extension, downloaded from here and kept up to date without a store (the owner, 2026-10-22). */}
      <div className="settings-tab" hidden={shown !== "extension"}>
        <ExtensionPanel />
        <DataTrackingPanel on={current.videoTracking} />
      </div>

      {me.user.admin ? (
        <div className="settings-tab is-admin" hidden={shown !== "admin"}>
          <AdminPanel />
          <DictionariesPanel />
        </div>
      ) : null}

      <div className="settings-tab" hidden={shown !== "account"}>
        <section className={`panel ${askingAll ? "panel-alarm" : ""}`.trim()} aria-labelledby="signed-in-title">
          <h2 id="signed-in-title" className="panel-title">
            Signed in
          </h2>
          <p className="session-who">
            Signed in as {me.user.name}
            {me.user.admin ? " · Admin" : ""}
          </p>
          <div className="kept-rows">
            {me.sessions.map((session) => (
              <div key={session.id} className="kept-row" data-session={session.id}>
                <span className="kept-name">
                  {session.device}
                  <span className="row-sub">{session.current ? "This device" : `since ${dateWords(session.createdAt)}`}</span>
                </span>
                <Button className="is-danger" disabled={busy} onClick={() => run(() => onSignOut(session.id))}>
                  <Icon name="signOut" />
                  Sign out
                </Button>
              </div>
            ))}
          </div>
          {askingAll ? (
            <Ask
              idPrefix="sign-out-all"
              question="Sign out of every device? Each one, this one too, will ask for the password again."
              go={{ words: "Sign out everywhere", busy: "Signing out…", icon: "signOut" }}
              busy={busy}
              failure={signOutFailure}
              onKeep={() => setAskingAll(false)}
              onGo={() => run(onSignOutAll)}
            />
          ) : (
            <div className="add-actions add-actions-start">
              {signOutFailure ? (
                <span className="form-failure" role="alert">
                  {signOutFailure}
                </span>
              ) : null}
              <Button id="sign-out-all" className="is-danger" disabled={busy} onClick={() => setAskingAll(true)}>
                <Icon name="signOut" />
                Sign out everywhere…
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
