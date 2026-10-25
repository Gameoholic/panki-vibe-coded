import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DATA_KIND_IDS, sizeWords, type DataKind, type Provides, type ServerDictionary } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Icon } from "@web/components/Icon";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { useDragOrder } from "@web/hooks/useDragOrder";
import { count } from "@web/words";
import { DATA_KINDS, providedBy } from "../dataKinds";
import { shownName, type DictionaryRecord } from "../dictionary/format";
import {
  DictionaryError,
  countProvides,
  finishRemovals,
  importDictionary,
  listDictionaries,
  orderDictionaries,
  DICTIONARY_NAME_MAX,
  removeDictionary,
  setDictionaryName,
  setDictionaryOn,
  setProvides,
  type Progress,
} from "../dictionary/store";
import { hostOf, permissionsFor, type LookKey, type LookWhere } from "../lookSettings";
import { PankiError, panki, type Door } from "../panki";
import { writeStore, type Stored } from "../storage";
import { Pitch } from "../ui/Lookup";
import { Rename } from "../ui/Rename";
import { aboutOf, type About } from "./about";
import { KindChips } from "./DataKinds";

/** What these say when something's wrong. One home. */
const MESSAGES = {
  unread: "The dictionaries couldn't be read.",
  failed: (name: string) => `${name} couldn't be imported.`,
  site: (typed: string) => `“${typed}” isn't a site.`,
  refused: "The browser didn't allow it, so it works on YouTube only.",
  uncounted: "What it provides couldn't be counted. Remove it and import it again to count it.",
  onPanki: "The dictionaries on Panki couldn't be read.",
};

/** How much of what a dictionary says about itself is shown. */
const DESCRIPTION_MAX = 240;
/** How long before the dictionaries on Panki are read again while it's still counting what one provides. */
const COUNTING_AGAIN_MS = 5000;

/**
 * Where a dictionary comes from, in its own words from its index.json: who made it, its address, what it says it is.
 * An address is written out, never a link. What it doesn't say isn't shown. (The file's own name stood here too for a
 * renamed dictionary, until the owner had it taken off, 2026-10-17: Reset to default name is enough.)
 */
function Origin({ dictionary }: { dictionary: DictionaryRecord }) {
  const { author, url } = dictionary;
  const description = dictionary.description?.trim() ?? "";
  const made = [author ? `Made by ${author}` : "", url].filter((part) => part !== "").join(" · ");
  if (!made && !description) return null;
  return (
    <div className="dict-origin">
      {made ? <span>{made}</span> : null}
      {description ? <span>{description.length > DESCRIPTION_MAX ? `${description.slice(0, DESCRIPTION_MAX).trimEnd()}…` : description}</span> : null}
    </div>
  );
}

/**
 * A dictionary's name on its row, and renaming it there: the owner's own name, shown wherever it's named, the file
 * and everything Panki tells it apart by left as they are (the owner, 2026-10-16). Going back to the file's own name
 * is one press, Reset to default name (the owner's words, 2026-10-17); saving it empty does the same.
 */
function DictionaryName({ dictionary, onRenamed }: { dictionary: DictionaryRecord; onRenamed: () => void }) {
  const shown = shownName(dictionary);
  return (
    <Rename
      id={`dict-${dictionary.id}`}
      className="dict-name"
      shown={shown}
      after={dictionary.revision ? <span className="dict-revision">{dictionary.revision}</span> : null}
      canReset={shown !== dictionary.title}
      max={DICTIONARY_NAME_MAX}
      onKeep={async (name) => {
        await setDictionaryName(dictionary.id, name);
        onRenamed();
      }}
    />
  );
}

const ja = (text: string) => <span lang="ja">{text}</span>;

/** One word's data of a kind, as this dictionary gives it; null when the words read from it show none. */
function exampleOf(kind: DataKind, about: About | undefined, ranked: boolean): ReactNode {
  if (!about) return null;
  const { example, tag, wordType, frequency, pitch } = about;
  switch (kind) {
    case "form":
      return example ? <>For example, {ja(example.term)}.</> : null;
    case "reading":
      return example && example.reading !== "" ? (
        <>
          For example, {ja(example.term)} is read {ja(example.reading)}.
        </>
      ) : null;
    case "meaning":
      return example ? (
        <>
          For example, {ja(example.term)}: {example.text}
        </>
      ) : null;
    case "tags":
      return tag ? <>For example, {tag.notes ? `${tag.name}: ${tag.notes}.` : `${tag.name}, which it doesn't explain.`}</> : null;
    case "wordType":
      return wordType ? (
        <>
          For example, {ja(wordType.term)} is {wordType.notes ? `${wordType.name}: ${wordType.notes}.` : `${wordType.name}.`}
        </>
      ) : null;
    case "frequency":
      // How Panki reads the list's numbers: a rank unless its index.json says it counts how often words were seen.
      return frequency ? (
        <>
          For example, {ja(frequency.term)}: {frequency.display}. {ranked ? "Read as a rank: 1 is the most common." : "Read as how often a word was seen: more is more common."}
        </>
      ) : null;
    case "pitch":
      return pitch ? (
        <>
          For example, {ja(pitch.term)} <Pitch reading={pitch.reading} position={pitch.position} />
        </>
      ) : null;
  }
}

/**
 * What a dictionary provides as a line of chips, each with how many of its entries carry it (a dictionary in this
 * browser, or one kept on Panki, counted there the same way). `example` is one word's of a kind, where it's known.
 */
function Provided({ provides, ownName, example }: { provides: Provides; ownName: string; example?: (kind: DataKind) => ReactNode }) {
  return (
    <KindChips
      label="Provides"
      ownName={ownName}
      items={providedBy(provides).map((kind) => ({
        kind,
        count: provides[kind],
        // Every entry has its dictionary form: what the rest of its entries' kinds are a part of.
        ...(DATA_KINDS[kind].perEntry ? { of: provides.form } : {}),
        example: example?.(kind),
      }))}
    />
  );
}

/**
 * What a dictionary provides, in the kinds of data Panki reads from one, each with how many of its entries carry it
 * and what it is, one word's, and where it goes in the popup and on a card (the owner, 2026-10-16: a dictionary says
 * "we provide this data", rather than one list of what it fills and another of where it shows). Counted from its
 * rows, never guessed. Then one word as it gives it, so it's plain what an entry is.
 */
function WhatsIn({ dictionary, about, uncountable }: { dictionary: DictionaryRecord; about: About | undefined; uncountable: boolean }) {
  const { provides } = dictionary;
  const example = about?.example;
  return (
    <>
      {provides ? (
        <Provided provides={provides} ownName={shownName(dictionary)} example={(kind) => exampleOf(kind, about, dictionary.ranked)} />
      ) : (
        <p className="dict-what">{uncountable ? MESSAGES.uncounted : "Counting what it provides…"}</p>
      )}
      {example || about?.frequency || about?.pitch ? (
        <p className="dict-sample">
          {example ? (
            <span>
              <span className="dict-sample-word" lang="ja">
                {example.term}
                {example.reading && example.reading !== example.term ? `【${example.reading}】` : ""}
              </span>{" "}
              {example.text}
            </span>
          ) : null}
          {about?.frequency ? (
            <span>
              <span className="dict-sample-word" lang="ja">
                {about.frequency.term}
              </span>{" "}
              {about.frequency.display}
            </span>
          ) : null}
          {about?.pitch ? (
            <span>
              <span className="dict-sample-word" lang="ja">
                {about.pitch.term}
              </span>{" "}
              <Pitch reading={about.pitch.reading} position={about.pitch.position} />
            </span>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

/**
 * The dictionaries in this browser: import one (a zip in the term-bank format), switch one off, put them in order (the
 * first is shown first wherever a word is looked up), remove one after asking. They live in this browser only.
 * `onChanged` hears of each change, for what else on the page is drawn from them (the popup's layout). Signed in
 * (`door`), the dictionaries kept on Panki that aren't here yet are listed too, each added with a press: fetched from
 * Panki whole and imported as a file picked here would be (the owner, 2026-10-16).
 */
export function Dictionaries({ onChanged, door }: { onChanged: () => void; door: Door | null }) {
  const [list, setList] = useState<DictionaryRecord[] | null>(null);
  /** What's coming in: a file being imported, or one of Panki's being fetched before it is. */
  const [importing, setImporting] = useState<{ name: string; phase: "fetch" | "import"; progress: Progress | null } | null>(null);
  /** What went wrong, one line each: every file of an import that didn't go in says why, not only the last. */
  const [failures, setFailures] = useState<readonly string[]>([]);
  /** The dictionary whose Remove was pressed: the question stands in its row. */
  const [asking, setAsking] = useState<string | null>(null);
  /** The dictionary being cleared away, gone from the list already. */
  const [clearing, setClearing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    listDictionaries().then(setList, () => setFailures([MESSAGES.unread]));
  }, []);
  useEffect(load, [load]);
  // A removal cut short last time (the page was closed) is finished, out of sight: it's on no list already.
  useEffect(() => {
    void finishRemovals().catch(() => undefined);
  }, []);

  /** What each dictionary has in it, read from it once the list is in. */
  const [abouts, setAbouts] = useState<Record<string, About>>({});
  const ids = list?.map((d) => d.id).join(" ") ?? "";
  useEffect(() => {
    if (!list) return;
    let alive = true;
    for (const dictionary of list) {
      if (abouts[dictionary.id]) continue;
      void aboutOf(dictionary).then(
        (about) => {
          if (alive) setAbouts((was) => ({ ...was, [dictionary.id]: about }));
        },
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
    // Read again only when the dictionaries themselves change, not when one is switched or moved.
  }, [ids]);

  // A dictionary imported before Panki counted what each provides is counted once, here, one at a time; one that
  // can't be counted isn't tried again until the page opens again.
  const tried = useRef(new Set<string>());
  const [uncountable, setUncountable] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const uncounted = (list ?? []).filter((d) => !d.provides && !tried.current.has(d.id));
    if (uncounted.length === 0) return;
    for (const dictionary of uncounted) tried.current.add(dictionary.id);
    void (async () => {
      for (const dictionary of uncounted) {
        try {
          await setProvides(dictionary.id, await countProvides(dictionary));
        } catch {
          setUncountable((was) => new Set([...was, dictionary.id]));
        }
      }
      load();
      onChanged();
    })();
  }, [list, load, onChanged]);

  const order = useDragOrder(list?.length ?? 0, (from, to) => {
    if (!list) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setList(next);
    void orderDictionaries(next.map((d) => d.id)).then(onChanged);
  });

  async function importAll(files: readonly File[]) {
    setFailures([]);
    for (const file of files) {
      setImporting({ name: file.name, phase: "import", progress: null });
      try {
        await importDictionary(file, (progress) => setImporting({ name: file.name, phase: "import", progress }));
      } catch (e) {
        const said = e instanceof DictionaryError ? `${file.name}: ${e.message}` : MESSAGES.failed(file.name);
        setFailures((was) => [...was, said]);
      }
    }
    setImporting(null);
    load();
    onChanged();
  }

  /** The dictionaries kept on Panki, read when the page opens signed in; null until they're in, or signed out. */
  const [onPanki, setOnPanki] = useState<ServerDictionary[] | null>(null);
  const address = door?.address ?? null;
  const token = door?.token ?? null;
  // Read again a while later while Panki is still counting what one provides, until every one is counted.
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!address || !token) {
      setOnPanki(null);
      return;
    }
    let alive = true;
    let again: ReturnType<typeof setTimeout> | undefined;
    panki.dictionaries({ address, token }).then(
      (kept) => {
        if (!alive) return;
        setOnPanki(kept);
        if (kept.some((d) => d.provides === null)) again = setTimeout(() => setAsked((n) => n + 1), COUNTING_AGAIN_MS);
      },
      (e: unknown) => {
        if (alive) setFailures([e instanceof PankiError ? `${MESSAGES.onPanki} ${e.message}` : MESSAGES.onPanki]);
      },
    );
    return () => {
      alive = false;
      clearTimeout(again);
    };
  }, [address, token, asked]);
  // Those not here yet, by the name each says it has: a dictionary imported from its own file counts as here.
  const available = onPanki && list ? onPanki.filter((kept) => !list.some((d) => d.title === kept.title)) : [];

  /** Fetches each from Panki and imports it, one after another; each that doesn't come in says why. */
  async function addFromPanki(dictionaries: readonly ServerDictionary[]) {
    if (!address || !token) return;
    setFailures([]);
    for (const kept of dictionaries) {
      setImporting({ name: kept.title, phase: "fetch", progress: null });
      try {
        const file = await panki.dictionaryFile({ address, token }, kept.id);
        setImporting({ name: kept.title, phase: "import", progress: null });
        await importDictionary(file, (progress) => setImporting({ name: kept.title, phase: "import", progress }));
      } catch (e) {
        const said = e instanceof DictionaryError || e instanceof PankiError ? `${kept.title}: ${e.message}` : MESSAGES.failed(kept.title);
        setFailures((was) => [...was, said]);
      }
      // Shown in the list as soon as it's in, before the next one starts.
      load();
    }
    setImporting(null);
    onChanged();
  }

  /** Gone from the list as soon as it's out of every look-up; its words are cleared after, with a line saying so. */
  async function remove(dictionary: DictionaryRecord) {
    setClearing(shownName(dictionary));
    try {
      await removeDictionary(dictionary.id, () => {
        setAsking(null);
        load();
        onChanged();
      });
    } catch {
      setFailures([MESSAGES.unread]);
    }
    setClearing(null);
    load();
  }

  const share = importing?.progress ? importing.progress.done / importing.progress.of : 0;
  return (
    <section className="panel" aria-labelledby="dictionaries-title">
      <h2 id="dictionaries-title" className="panel-title">
        Dictionaries
      </h2>
      {list ? (
        // Everything Panki reads from a dictionary, each with the ones that are on that provide it: what's faint, none does.
        <KindChips
          label="Panki reads"
          items={DATA_KIND_IDS.map((kind) => ({ kind, from: list.filter((d) => d.on && (d.provides?.[kind] ?? 0) > 0).map(shownName) }))}
        />
      ) : null}
      {list && list.length === 0 && !importing ? <p className="empty">No dictionaries yet.</p> : null}
      {list && list.length > 0 ? (
        <div className="dict-list">
          {list.map((dictionary, i) => (
            <div key={dictionary.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`dict-row ${dictionary.on ? "" : "is-off"}`.trim()}>
              <Button className="btn-icon field-grip" aria-label={`Move ${shownName(dictionary)}`} disabled={list.length === 1} {...order.handleProps(i)}>
                <Icon name="grip" />
              </Button>
              <div className="dict-body">
                <DictionaryName
                  dictionary={dictionary}
                  onRenamed={() => {
                    load();
                    onChanged();
                  }}
                />
                <Origin dictionary={dictionary} />
                <WhatsIn dictionary={dictionary} about={abouts[dictionary.id]} uncountable={uncountable.has(dictionary.id)} />
              </div>
              <div className="dict-tools">
                <Toggle
                  id={`dict-${dictionary.id}-on`}
                  says={{ on: "On", off: "Off" }}
                  on={dictionary.on}
                  onChange={(on) => {
                    setList(list.map((d) => (d.id === dictionary.id ? { ...d, on } : d)));
                    void setDictionaryOn(dictionary.id, on).then(onChanged);
                  }}
                />
                <Button className="is-danger" disabled={importing !== null || clearing !== null} onClick={() => setAsking(dictionary.id)}>
                  Remove…
                </Button>
              </div>
              {asking === dictionary.id ? (
                <div className="dict-ask">
                  <span className="question">Remove {shownName(dictionary)} from this browser?</span>
                  <Button disabled={clearing !== null} onClick={() => setAsking(null)}>
                    Keep
                  </Button>
                  <Button variant="danger" disabled={clearing !== null} onClick={() => void remove(dictionary)}>
                    {clearing !== null ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {importing ? (
        <div className="dict-importing" role="status">
          <span>
            {importing.phase === "fetch" ? `Getting ${importing.name} from Panki…` : `Importing ${importing.name}`}
            {importing.phase === "fetch" ? "" : importing.progress ? ` · ${count(importing.progress.terms, "word", "words")}` : "…"}
          </span>
          <span className="media-track" aria-hidden="true">
            <i style={{ width: `${share * 100}%` }} />
          </span>
        </div>
      ) : null}
      {clearing ? (
        <p className="dict-what" role="status">
          Clearing {clearing}&apos;s words from this browser…
        </p>
      ) : null}
      {failures.length > 0 ? (
        <div className="form-failure dict-failures" role="alert">
          {failures.map((said) => (
            <p key={said}>{said}</p>
          ))}
        </div>
      ) : null}
      {onPanki ? (
        <div className="dict-panki">
          <h3 className="dict-panki-title">On Panki</h3>
          {onPanki.length === 0 ? <p className="dict-what">None yet. Upload them in Panki&apos;s Settings to add them here from any browser.</p> : null}
          {onPanki.length > 0 && available.length === 0 ? <p className="dict-what">Every one is added here.</p> : null}
          {available.map((kept) => (
            <div key={kept.id} className="dict-row is-available">
              <div className="dict-body">
                <div className="dict-name">
                  {kept.title}
                  {kept.revision ? <span className="dict-revision">{kept.revision}</span> : null}
                </div>
                <div className="dict-origin">
                  <span>{sizeWords(kept.bytes)}</span>
                  {kept.description ? <span>{kept.description.length > DESCRIPTION_MAX ? `${kept.description.slice(0, DESCRIPTION_MAX).trimEnd()}…` : kept.description}</span> : null}
                </div>
                {kept.provides ? <Provided provides={kept.provides} ownName={kept.title} /> : <p className="dict-what">Counting what it provides…</p>}
              </div>
              <Button disabled={importing !== null} onClick={() => void addFromPanki([kept])}>
                <Icon name="add" />
                Add
              </Button>
            </div>
          ))}
          {available.length > 1 ? (
            <Button className="dict-add-all" disabled={importing !== null} onClick={() => void addFromPanki(available)}>
              Add all {available.length}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button className="media-drop" disabled={importing !== null} onClick={() => input.current?.click()}>
        <Icon name="add" />
        Import a dictionary
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
          if (files.length > 0) void importAll(files);
        }}
      />
    </section>
  );
}

const WHERE: { id: LookWhere; label: string }[] = [
  { id: "everywhere", label: "On every site" },
  { id: "only", label: "Only on these sites" },
  { id: "except", label: "On every site but these" },
  { id: "nowhere", label: "Nowhere" },
];
/** The keys that can be held to look a word up, and what each is called. */
export const LOOK_KEYS: readonly { id: LookKey; label: string }[] = [
  { id: "shift", label: "Shift" },
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
];
export const keyWordOf = (key: LookKey) => LOOK_KEYS.find((k) => k.id === key)?.label ?? "Shift";

/**
 * How looking a word up works: where on the web, and with which key held. Kept the moment
 * it's changed. Working on a site other than YouTube needs the browser's leave to read its pages, asked for here,
 * straight from the press that needs it (the browser only asks then).
 */
export function Looking({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const [sites, setSites] = useState(store.lookSites.join("\n"));
  const [sitesError, setSitesError] = useState<string | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const needed = permissionsFor(store.lookWhere, store.lookSites);
  const neededKey = needed.join(" ");

  useEffect(() => {
    const origins = neededKey === "" ? [] : neededKey.split(" ");
    if (origins.length === 0) {
      setAllowed(true);
      return;
    }
    let alive = true;
    void chrome.permissions.contains({ origins }).then((yes) => {
      if (alive) setAllowed(yes);
    });
    return () => {
      alive = false;
    };
  }, [neededKey]);

  /** Keeps a choice, asking the browser first for what it needs. The asking must come before anything is waited for. */
  function keep(where: LookWhere, hosts: readonly string[]) {
    setFailure(null);
    const origins = permissionsFor(where, hosts);
    const asked = origins.length === 0 ? Promise.resolve(true) : chrome.permissions.request({ origins });
    void asked.then((yes) => {
      if (!yes) setFailure(MESSAGES.refused);
      setAllowed(yes);
      return writeStore({ lookWhere: where, lookSites: [...hosts] }).then(onChanged);
    });
  }

  function saveSites() {
    const lines = sites
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const wrong = lines.find((line) => hostOf(line) === null);
    if (wrong) {
      setSitesError(MESSAGES.site(wrong));
      return;
    }
    setSitesError(undefined);
    const hosts = [...new Set(lines.flatMap((line) => hostOf(line) ?? []))];
    setSites(hosts.join("\n"));
    keep(store.lookWhere, hosts);
  }

  const listed = store.lookWhere === "only" || store.lookWhere === "except";
  return (
    <section className="panel" aria-labelledby="looking-title">
      <h2 id="looking-title" className="panel-title">
        Looking up words
      </h2>
      {/* The whole of it on or off, on every site: the row that heads the panel since the Modules tab went (the owner, 2026-10-21). */}
      <Setting id="module-lookup" label="Word lookup" control={<Toggle id="module-lookup-on" says={{ on: "On", off: "Off" }} on={store.moduleLookup} onChange={(moduleLookup) => void writeStore({ moduleLookup }).then(onChanged)} />} />
      <Setting
        id="look-where"
        label="Where"
        control={<Dropdown id="look-where-choice" label="Where" options={WHERE} value={store.lookWhere} onChange={(where) => keep(where, store.lookSites)} />}
        why={`Hold ${keyWordOf(store.lookKey)} and point at a word. Let go on the word to keep the popup open.`}
      />
      {listed ? (
        <div className="dict-sites">
          <TextField
            id="look-sites"
            label={store.lookWhere === "only" ? "Sites, one a line" : "Sites left out, one a line"}
            multiline
            autoComplete="off"
            value={sites}
            onChange={(text) => {
              setSites(text);
              setSitesError(undefined);
            }}
            error={sitesError}
          />
          <div className="add-actions add-actions-start">
            <Button variant="primary" disabled={sites.trim() === store.lookSites.join("\n").trim()} onClick={saveSites}>
              Save sites
            </Button>
          </div>
        </div>
      ) : null}
      {allowed === false && store.lookWhere !== "nowhere" ? (
        <div className="add-actions add-actions-start">
          <span className="empty">The browser hasn't allowed it on other sites yet. YouTube works already.</span>
          <Button variant="primary" onClick={() => keep(store.lookWhere, store.lookSites)}>
            Allow
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
      <Setting
        id="look-key"
        label="Key to hold"
        control={<Segmented idPrefix="look-key" label="Key to hold" options={LOOK_KEYS} value={store.lookKey} onChange={(lookKey) => void writeStore({ lookKey }).then(onChanged)} />}
      />
      {/* A video's subtitles (the line under the player, the one over the video, the site's captions) looked up with no key held: the owner, 2026-10-25. */}
      <Setting
        id="look-hover"
        label="Video subtitles"
        control={<Toggle id="look-hover-on" says={{ on: "On hover", off: `Hold ${keyWordOf(store.lookKey)}` }} on={store.lookHover} onChange={(lookHover) => void writeStore({ lookHover }).then(onChanged)} />}
      />
    </section>
  );
}
