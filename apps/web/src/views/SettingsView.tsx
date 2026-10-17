import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DICTIONARY_MAX_BYTES,
  ENGINES,
  ENGINE_IDS,
  EngineKeyUpdate,
  TRANSCRIBE_SPEEDS,
  WORD_AUDIO_SOURCES,
  WORD_AUDIO_SOURCE_IDS,
  WordAudioKeyUpdate,
  sizeWords,
  type EngineAccount,
  type FilesOfKind,
  type ServerDictionary,
  type StorageReport,
  type Settings,
  type SettingsUpdate,
  type Transcription,
  type TranscriptionStatus,
  type WordAudio,
  type WordAudioStatus,
} from "@panki/contracts";
import { ApiError, api, type Me } from "../api";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Form } from "../components/Form";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useSavedSoon } from "../hooks/useSavedSoon";
import { ledger } from "../ledger";
import { THEMES, applyTheme, readTheme, shownTheme, writeTheme, type ThemeId } from "../themes";
import { count, dateWords, dollarWords, durationWords, moneyWords } from "../words";

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
type SettingsTab = "general" | "admin" | "account";
const TABS: readonly { id: SettingsTab; label: string; admin?: true }[] = [
  { id: "general", label: "General" },
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
const ENGINE_OPTIONS = ENGINE_IDS.map((id) => ({ id, label: ENGINES[id].name }));
const SOURCE_OPTIONS = WORD_AUDIO_SOURCE_IDS.map((id) => ({ id, label: WORD_AUDIO_SOURCES[id].name }));

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
 * Forget takes it off. Forvo's and a transcribing engine's are both this, inside the Admin panel.
 */
function KeyPanel({ id, title, from, label, status, saved, schema, onSave, children }: KeyPanelProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The saved key uncovered; covered again whenever another is saved. */
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [saved]);

  async function keep(next: string | null) {
    setBusy(true);
    setFailure(null);
    try {
      await onSave(next);
      setKey("");
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
            Save key
          </Button>
          {status === "settings" ? (
            <Button id={`${id}-forget`} disabled={busy} onClick={() => void keep(null)}>
              Forget key
            </Button>
          ) : null}
        </div>
      </Form>
      {status !== undefined ? (
        <p className="setting-why">
          {KEY_SAID[status ?? "none"]}
          {status === "settings" && saved !== undefined ? (
            <Button variant="spoiler" className="key-spoiler" aria-pressed={shown} aria-label={shown ? "Cover the key" : "The key, covered: press to see it"} onClick={() => setShown((was) => !was)}>
              <span className="key-text">{saved}</span>
            </Button>
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
 * of the period's limit and when they reset, and what pay-as-you-go use has come to so far.
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
  if (!account) return null;
  return (
    <>
      <p className="setting-why">
        {planWords(account.plan)} · {STATUS_WORDS[account.status] ?? account.status}
      </p>
      <p className="setting-why">
        {account.used.toLocaleString("en")} of {account.limit.toLocaleString("en")} credits used
        {account.resetsAt !== null ? ` · resets ${dateWords(account.resetsAt)}` : ""}
      </p>
      {account.overage ? <p className="setting-why">{moneyWords(account.overage.amount, account.overage.currency)} pay as you go so far</p> : null}
    </>
  );
}

type TranscribingProps = {
  status: TranscriptionStatus;
  /** Every answer from Panki carries the key's state and the tally with it; the panel keeps the latest. */
  onStatus: (status: TranscriptionStatus) => void;
};

/** How transcribing runs, for everyone, each change saved a moment after it's made; then the engine's key and its tally. */
function Transcribing({ status, onStatus }: TranscribingProps) {
  const [current, patch, failure] = useSavedSoon<Transcription>(status.settings, async (change) => {
    const next = await api.updateTranscription(change);
    onStatus(next);
    return next.settings;
  });
  const engine = ENGINES[current.engine];

  return (
    <>
      <section className="panel-section" aria-labelledby="transcribing-title">
        <h3 id="transcribing-title" className="panel-subtitle">
          Transcribing
        </h3>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        <Setting id="speed" label="Speed" control={<Dropdown id="transcribe-speed" label="Speed" options={SPEED_OPTIONS} value={current.speed} onChange={(speed) => patch({ speed })} />} />
        <Setting id="lead" label="Lead" control={<NumberField id="transcribe-lead" label="Minutes ahead" value={current.lead} min={1} max={180} suffix="min" onChange={(lead) => patch({ lead })} />} />
        {/* What's the viewer's own (whether it starts by itself, what it does while paused, whether the transcript replaces the site's captions) is on the extension's page since 2026-10-17, by the owner's word: only what costs is set here. */}
        <Setting id="engine" label="Engine" control={<Dropdown id="transcribe-engine" label="Engine" options={ENGINE_OPTIONS} value={current.engine} disabled={ENGINE_IDS.length < 2} onChange={(engine) => patch({ engine })} />} />
      </section>
      <KeyPanel id="engine" title={engine.name} from={engine.vendor} label="API key" status={status.key} saved={status.saved} schema={EngineKeyUpdate} onSave={async (key) => onStatus(await api.setEngineKey(current.engine, key))}>
        <p className="setting-why">{transcribedWords(status.seconds, engine.centsPerHour)}</p>
        {/* Read again whenever the key changes: the saved key's text is the sign of that. */}
        <EngineAccountLines keyed={status.key !== null} turn={(status.saved ?? "").length} />
      </KeyPanel>
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
function WordAudioSection({ status, onStatus }: WordAudioProps) {
  const [current, patch, failure] = useSavedSoon<WordAudio>(status.settings, async (change) => {
    const next = await api.updateWordAudio(change);
    onStatus(next);
    return next.settings;
  });
  const source = WORD_AUDIO_SOURCES[current.source];
  return (
    <>
      <section className="panel-section" aria-labelledby="word-audio-title">
        <h3 id="word-audio-title" className="panel-subtitle">
          Word audio
        </h3>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        <Setting id="wordAudioSource" label="Source" control={<Dropdown id="word-audio-source" label="Source" options={SOURCE_OPTIONS} value={current.source} disabled={WORD_AUDIO_SOURCE_IDS.length < 2} onChange={(next) => patch({ source: next })} />} />
      </section>
      <KeyPanel id="word-audio" title={source.name} from={source.vendor} label="API key" status={status.key} saved={status.saved} schema={WordAudioKeyUpdate} onSave={async (key) => onStatus(await api.setWordAudioKey(current.source, key))}>
        {/* Forvo tells nothing of its use, so Panki counts its own requests against the day's allowance (the owner, 2026-10-17). */}
        {status.calls !== undefined && source.dailyLimit !== null ? (
          <p className="setting-why">
            {status.calls.toLocaleString("en")} of {source.dailyLimit.toLocaleString("en")} requests today
          </p>
        ) : null}
      </KeyPanel>
    </>
  );
}

/** The files of one kind, or of all of them, as a row's small print: "Video 1.2 GB · 12 files". */
const kindWords = (name: string, bytes: number, files: number) => `${name} ${sizeWords(bytes)} · ${count(files, "file", "files")}`;

/**
 * What Panki's data takes on the disk, for an admin to keep an eye on the clips and sounds (the owner, 2026-10-17:
 * "the current storage plus storage allocated, so I know once the videos and audios take too much space"; read-only,
 * nothing to clean up here yet, by their word). Each account with its files by kind, what everyone shares, the whole
 * of Panki, and the disk it's on. Read once as the panel opens: it walks every file.
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
    <section className="panel-section" aria-labelledby="storage-title">
      <h3 id="storage-title" className="panel-subtitle">
        Storage
      </h3>
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
              <span className="row-sub">{report.shared.dictionaries.files > 0 ? kindWords("Dictionaries", report.shared.dictionaries.bytes, report.shared.dictionaries.files) : "No dictionaries"}</span>
            </span>
            <span className="kept-size">{sizeWords(report.shared.bytes)}</span>
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
      ) : null}
    </section>
  );
}

/** What everyone shares and an admin alone changes: how transcribing runs, the engine's key, the Forvo key for word audio; and, to read, what it all takes on the disk. */
function AdminPanel() {
  const [transcription, setTranscription] = useState<TranscriptionStatus | null>(null);
  const [wordAudio, setWordAudio] = useState<WordAudioStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const failed = (e: unknown) => {
      if (alive) setFailure(said(e));
    };
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

  return (
    <section className="panel" aria-labelledby="admin-title">
      <h2 id="admin-title" className="panel-title">
        Admin
      </h2>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {transcription ? <Transcribing status={transcription} onStatus={setTranscription} /> : null}
      {wordAudio ? <WordAudioSection status={wordAudio} onStatus={setWordAudio} /> : null}
      <StorageSection />
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
  /** The dictionary whose Remove was pressed: the question stands in its row. */
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
      {list && list.length === 0 && !uploading ? <p className="empty">None on Panki yet. Upload them here, then add them to the extension from its options page.</p> : null}
      {list && list.length > 0 ? (
        <div className="kept-rows">
          {list.map((dictionary) => (
            <div key={dictionary.id} className={`kept-row ${asking === dictionary.id ? "is-asking" : ""}`.trim()}>
              <span className="kept-name">
                {dictionary.title}
                <span className="row-sub">{[dictionary.revision, sizeWords(dictionary.bytes), `uploaded ${dateWords(dictionary.uploadedAt)}`].filter((part) => part !== "").join(" · ")}</span>
              </span>
              {asking === dictionary.id ? (
                <div className="add-actions">
                  <span className="question">Remove it from Panki? Its file is deleted here; where it&apos;s been added to the extension, it stays.</span>
                  <Button disabled={removing} onClick={() => setAsking(null)}>
                    Keep
                  </Button>
                  <Button variant="danger" disabled={removing} onClick={() => void remove(dictionary.id)}>
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ) : (
                <Button className="is-danger" disabled={uploading !== null || removing} onClick={() => setAsking(dictionary.id)}>
                  Remove…
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
        <Icon name="add" />
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
 * The theme first, kept on this device; then the two settings every deck shares: whether waits are spread, and when the
 * day turns over. How a review runs is in each deck's own settings. Each change is saved a moment after it's made. Then
 * for an admin alone, the Admin tab with what every account shares (how transcribing runs, the keys, the dictionaries
 * kept on Panki). Last, the devices signed in.
 */
export function SettingsView({ settings, onChange, me, onSignOut, onSignOutAll }: Props) {
  const [current, patch, failure] = useSavedSoon<Settings>(settings, onChange);
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
            Every deck
          </h2>
          <Setting
            id="fuzz"
            label="Spread the waits a little"
            control={<Toggle id="setting-fuzz" says={{ on: "±10 %", off: "Exact" }} on={current.fuzz} onChange={(fuzz) => patch({ fuzz })} />}
            why={current.fuzz ? "Each wait comes out up to 10% shorter or longer, so cards learned together don't all come back at the same time." : "Every wait is exactly as long as its stage says."}
          />
          <Setting
            id="dayStartHour"
            label="The day starts at"
            control={<NumberField id="setting-day-start" label="Hour the day starts" value={current.dayStartHour} min={0} max={23} suffix=":00" onChange={(dayStartHour) => patch({ dayStartHour })} />}
            why={`A review before ${clock(current.dayStartHour)} counts for the day before. Each deck's new cards and review limit start over at ${clock(current.dayStartHour)}.`}
          />
        </section>
      </div>

      {me.user.admin ? (
        <div className="settings-tab" hidden={shown !== "admin"}>
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
                  Sign out
                </Button>
              </div>
            ))}
          </div>
          {askingAll ? (
            <>
              <p id="sign-out-all-question" className="question">
                Sign out of every device? Each one, this one too, will ask for the password again.
              </p>
              <div className="add-actions">
                {signOutFailure ? (
                  <span className="form-failure" role="alert">
                    {signOutFailure}
                  </span>
                ) : null}
                <Button id="sign-out-all-keep" disabled={busy} onClick={() => setAskingAll(false)}>
                  Keep
                </Button>
                <Button id="sign-out-all-go" variant="danger" disabled={busy} onClick={() => run(onSignOutAll)}>
                  {busy ? "Signing out…" : "Sign out everywhere"}
                </Button>
              </div>
            </>
          ) : (
            <div className="add-actions add-actions-start">
              {signOutFailure ? (
                <span className="form-failure" role="alert">
                  {signOutFailure}
                </span>
              ) : null}
              <Button id="sign-out-all" className="is-danger" disabled={busy} onClick={() => setAskingAll(true)}>
                Sign out everywhere…
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
