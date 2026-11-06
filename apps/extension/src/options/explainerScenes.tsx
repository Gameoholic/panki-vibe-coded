import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { VideoCard } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { ExplainedTitle, Stage, type Site, type Spot, type Tools } from "@web/components/Explainer";
import { Icon } from "@web/components/Icon";
import { TextField } from "@web/components/TextField";
import { IN_DECKS } from "@web/explainers/examples";
import { SiteTop, WATCH, WATCHED, WatchPage, videoAt } from "@web/explainers/site";
import newsPicture from "@web/explainers/thumbs/news-picture.png";
import { hourWords } from "@web/words";
import { tintOf, type KnownMoment } from "../capture/known";
import { HOVER_KEEP } from "../capture/look";
import { keyWordOf, type LookKey } from "../lookSettings";
import { spanOver, tokensOf, type Span, type Token } from "../capture/words";
import type { DictionaryRecord } from "../dictionary/format";
import type { Found } from "../dictionary/found";
import { lookUp } from "../dictionary/lookup";
import { listDictionaries } from "../dictionary/store";
import { barShows, barSide, isPankiBar, resumeTo, type BarControl, type BarLayout } from "../modules";
import { popupLayoutOf, withMeanings } from "../popupLayout";
import { paintCss } from "../seekLook";
import { barOf, type Stored } from "../storage";
import { Line } from "../ui/Line";
import { LookupBody } from "../ui/Lookup";
import { PankiPill, SAMPLE_NUMBERS } from "../ui/PankiPill";
import { SeekMark, type ClipMark, type Pinned } from "../ui/SeekMark";
import { SpeedControl } from "../ui/SpeedControl";
import { BarControls, YOUTUBE_OWN } from "./BarControls";
import { EXAMPLE_CARDS } from "./examples";

/**
 * What each explainer plays (the web's `components/Explainer.tsx`): one entry per panel, the feature being used on a
 * page as it really is. The video site is the web's (`explainers/site.tsx`), which Settings → Panki AI's plays on too.
 * Panki's own parts are its real components (the pop-up dictionary is `LookupBody` with this browser's dictionaries and
 * pop-up layout; the Panki panel's line is `Line`; the header bar's pill is `PankiPill`; the speed button is
 * `SpeedControl`), so a change to them shows here too. What only exists inside a page's script (the strip's frame, the
 * capture drawer, YouTube home's shelves) is drawn in the same classes. The pages around them are made up: a news
 * site, a video site, in their own colours (`theme.css` → `--page`, `--site-dark`).
 */

const nothing = () => undefined;

const NEWS: Site = { tab: "駅前に新しい喫茶店がオープン｜日曜ニュース", url: "www.nichiyo-news.jp/articles/20261027/kurashi-cafe", icon: "news" };
const HOME: Site = { tab: "YouTube", url: "www.youtube.com", icon: "video" };

/** The words of the news article that are pointed at, and what stands in for each when no dictionary is there to look them up in. */
const WORDS = { kissa: "喫茶店", mitsuke: "見つけました", oishi: "美味しかった", hon: "本" } as const;
type WordId = keyof typeof WORDS;
const WORD_IDS = Object.keys(WORDS) as WordId[];
const example = (source: string, term: string, reading: string, meaning: string): Found => ({
  source,
  term,
  reading,
  steps: [],
  tags: [],
  wordTypes: [],
  senses: [{ dict: "Example", dictId: "example", tags: [], glossary: [meaning] }],
  frequencies: [],
  pitches: [],
});
const STAND_INS: Record<WordId, Found[]> = {
  kissa: [example("喫茶店", "喫茶店", "きっさてん", "coffee shop; café")],
  mitsuke: [example("見つけました", "見つける", "みつける", "to find; to discover")],
  oishi: [example("美味しかった", "美味しい", "おいしい", "delicious; tasty")],
  hon: [example("本", "本", "ほん", "book")],
};

/** The words looked up in this browser's dictionaries, as the pop-up would find them on a page; the stand-ins where none answers. */
function useLookups(): { dictionaries: DictionaryRecord[]; found: Record<WordId, Found[]> } {
  const [dictionaries, setDictionaries] = useState<DictionaryRecord[]>([]);
  const [found, setFound] = useState(STAND_INS);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await listDictionaries().catch((): DictionaryRecord[] => []);
      const next = { ...STAND_INS };
      for (const id of WORD_IDS) {
        const words = await lookUp(WORDS[id]).catch((): Found[] => []);
        if (words.length > 0) next[id] = words;
      }
      if (alive) {
        setDictionaries(list);
        setFound(next);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { dictionaries, found };
}

/** The tint a word in the decks gets on a page, in this browser's colour for it (`capture/known.ts`). */
const knownTint = (store: Stored) => tintOf(paintCss(store.knownColour));

// ---------- A news site

function NewsPage({ words, tinted, tint, children }: { words: (id: WordId) => (el: HTMLSpanElement | null) => void; tinted: ReadonlySet<WordId>; tint: string; children?: ReactNode }) {
  const word = (id: WordId) => (
    <span ref={words(id)} className="ex-word" style={tinted.has(id) ? { background: tint } : undefined}>
      {WORDS[id]}
    </span>
  );
  return (
    <div className="ex-news">
      <header className="ex-news-top">
        <span className="ex-news-logo" lang="ja">
          日曜<b>ニュース</b>
        </span>
        <nav className="ex-news-nav" lang="ja">
          <span>トップ</span>
          <span>社会</span>
          <span className="is-on">暮らし</span>
          <span>経済</span>
          <span>文化</span>
          <span>スポーツ</span>
        </nav>
        <span className="ex-news-search" />
      </header>
      <div className="ex-news-main">
        <article>
          <div className="ex-news-kicker" lang="ja">
            暮らし
          </div>
          <h1 className="ex-news-h" lang="ja">
            駅前に新しい喫茶店がオープン
          </h1>
          <div className="ex-news-by">2026年10月27日 12:30</div>
          <p className="ex-news-p" lang="ja">
            昨日、駅の近くで新しい{word("kissa")}を{word("mitsuke")}。
          </p>
          <p className="ex-news-p" lang="ja">
            友達と一緒に入ってみたら、ケーキがとても{word("oishi")}です。店内は静かで、{word("hon")}を読む人も多くいました。
          </p>
        </article>
        <figure className="ex-news-fig">
          <img className="ex-news-pic" src={newsPicture} alt="" />
          <figcaption lang="ja">やさしいことばニュース</figcaption>
        </figure>
      </div>
      {children}
    </div>
  );
}

/** The word pointed at lit, and the real pop-up under it, as the pop-up dictionary draws them on a page. */
function PopupOn({ at, found, store, dictionaries, box }: { at: Spot; found: Found[]; store: Stored; dictionaries: DictionaryRecord[]; box: (el: HTMLDivElement | null) => void }) {
  const layout = popupLayoutOf(store.popupLayout, withMeanings(dictionaries));
  const lit: CSSProperties = { left: `calc(${at.left}% - 2px)`, top: `calc(${at.top}% - 1px)`, width: `calc(${at.right - at.left}% + 4px)`, height: `calc(${at.bottom - at.top}% + 2px)` };
  return (
    <>
      <span className="look-lit" style={lit} />
      {/* Under the word, and no taller than the page leaves room for, as the real one is kept inside the window. */}
      <div ref={box} className="look" style={{ left: `${Math.min(at.left, 58)}%`, top: `calc(${at.bottom}% + 6px)`, width: 420, maxHeight: `calc(${100 - at.bottom}% - 18px)` }}>
        <LookupBody found={found} layout={layout} onAdd={nothing} cards={EXAMPLE_CARDS} />
      </div>
    </>
  );
}

/** Pointing at words on a page: the article, its words to point at, and what's pointed at, for the two scenes on it. */
function usePointing() {
  const els = useRef<Partial<Record<WordId, HTMLSpanElement | null>>>({});
  const popup = useRef<HTMLDivElement | null>(null);
  const [pointing, setPointing] = useState<{ id: WordId; at: Spot } | null>(null);
  return {
    pointing,
    words: (id: WordId) => (el: HTMLSpanElement | null) => {
      els.current[id] = el;
    },
    el: (id: WordId) => els.current[id] ?? null,
    box: (el: HTMLDivElement | null) => {
      popup.current = el;
    },
    popup: () => popup.current,
    /** The article the words are in: what the camera frames while no pop-up is open. */
    article: () => els.current.kissa?.closest("article") ?? null,
    /** The pop-up opened on a word, and the camera onto the word and the pop-up together, once it's drawn. */
    point: async (t: Tools, id: WordId) => {
      const word = els.current[id] ?? null;
      const at = t.spot(word);
      if (!at) return;
      setPointing({ id, at });
      await t.wait(60);
      t.frame(word, popup.current);
    },
    close: () => setPointing(null),
  };
}

/**
 * The key to hold as this browser has it, held down (nothing, for On hover, where pointing is enough); the key's name,
 * or null. The explainers play with the settings as they are.
 */
function holdKey(t: Tools, key: LookKey): string | null {
  if (key === "hover") return null;
  const name = keyWordOf(key);
  t.hold(name);
  return name;
}
/** The pop-up kept open as this browser keeps it: the key let go on the word, or, opened by hover, Shift pressed. */
async function keepOpen(t: Tools, held: string | null) {
  if (held) {
    t.letGo(held);
    return;
  }
  t.hold(HOVER_KEEP);
  await t.wait(250);
  t.letGo(HOVER_KEEP);
}

/** The Pop-up dictionary: the key held over a word of a Japanese page, along the line, let go, closed. */
function PopupScene({ store }: { store: Stored }) {
  const { dictionaries, found } = useLookups();
  const p = usePointing();
  const script = async (t: Tools) => {
    p.close();
    t.frame(p.article());
    await t.move([34, 44], 400);
    await t.move(p.el("kissa"));
    const key = holdKey(t, store.lookKey);
    await t.wait(200);
    await p.point(t, "kissa");
    await t.wait(1300);
    await t.move(p.el("mitsuke"), 450);
    await p.point(t, "mitsuke");
    await t.wait(1300);
    await keepOpen(t, key);
    await t.wait(300);
    await t.move(p.popup(), 550);
    await t.wait(900);
    await t.move([22, 88]);
    await t.click();
    p.close();
    t.frame(p.article());
    await t.wait(600);
  };
  return (
    <Stage site={NEWS} script={script}>
      <NewsPage words={p.words} tinted={new Set()} tint="">
        {p.pointing ? <PopupOn key={p.pointing.id} at={p.pointing.at} found={found[p.pointing.id]} store={store} dictionaries={dictionaries} box={p.box} /> : null}
      </NewsPage>
    </Stage>
  );
}

/** Highlight words that are in your decks: the page's known words tinted, and the pop-up over one saying so. */
function KnownScene({ store }: { store: Stored }) {
  const { dictionaries, found } = useLookups();
  const p = usePointing();
  const [tinted, setTinted] = useState<ReadonlySet<WordId>>(new Set());
  const known: WordId[] = ["kissa", "oishi", "hon"];
  const script = async (t: Tools) => {
    p.close();
    setTinted(new Set());
    t.frame(p.article());
    await t.wait(200);
    for (let i = 1; i <= known.length; i++) {
      setTinted(new Set(known.slice(0, i)));
      await t.wait(220);
    }
    await t.wait(700);
    await t.move(p.el("kissa"));
    const key = holdKey(t, store.lookKey);
    await t.wait(200);
    await p.point(t, "kissa");
    await t.wait(1600);
    if (key) t.letGo(key);
    p.close();
    t.frame(p.article());
    await t.wait(250);
    await t.move(p.el("mitsuke"));
    holdKey(t, store.lookKey);
    await t.wait(200);
    await p.point(t, "mitsuke");
    await t.wait(1300);
    if (key) t.letGo(key);
    p.close();
    t.frame(p.article());
    await t.wait(400);
  };
  return (
    <Stage site={NEWS} script={script}>
      <NewsPage words={p.words} tinted={tinted} tint={knownTint(store)}>
        {p.pointing ? <PopupOn key={p.pointing.id} at={p.pointing.at} found={found[p.pointing.id]} store={store} dictionaries={dictionaries} box={p.box} /> : null}
      </NewsPage>
    </Stage>
  );
}

// ---------- A video site

const SENTENCE = "新しい喫茶店を見つけました";
const PICKED = { from: SENTENCE.indexOf(IN_DECKS.words), to: SENTENCE.indexOf(IN_DECKS.words) + IN_DECKS.words.length };

/** The Panki panel's head, as the video page draws it: the name, the status, and the panel's menu at its end. */
function StripHead() {
  return (
    <div className="strip-head">
      <span className="strip-name">Panki</span>
      <span className="strip-status">
        <Button className="capture-tool strip-menu-button is-ready" aria-label="Transcription: Transcribed">
          <i className="strip-menu-dot" aria-hidden="true" />
          Transcribed
          <Icon name="down" />
        </Button>
      </span>
      <div className="strip-tools">
        <Button className="capture-tool btn-icon" aria-label="Panel settings">
          <Icon name="menu" />
        </Button>
      </div>
    </div>
  );
}

/** The Panki panel under the player, as the video page draws it: its head and its line of words. */
function Strip({ tokens, now, picked, shown = true, line }: { tokens: readonly Token[]; now: Span | null; picked: Span | null; shown?: boolean; line?: (el: HTMLDivElement | null) => void }) {
  return (
    <div className={`strip ex-strip ${shown ? "" : "is-away"}`.trim()}>
      <StripHead />
      <div ref={line} className="strip-rows">
        <Line tokens={tokens} picked={picked} now={now} onPick={nothing} />
      </div>
    </div>
  );
}

/** A made-up video's transcript, its lines as the panel beside the video lists them: when each begins, and what's said. */
const LINES: readonly { start: string; text: string }[] = [
  { start: "0:04", text: "今日は駅の近くを散歩しました" },
  { start: "0:09", text: SENTENCE },
  { start: "0:13", text: "ケーキがとても美味しかったです" },
  { start: "0:18", text: "店内は静かで本を読む人も多くいました" },
  { start: "0:24", text: "また行きたいと思います" },
];
/** The line the scene picks its word in. */
const PICK_LINE = LINES.findIndex((line) => line.text === SENTENCE);

/**
 * The Panki panel beside the video, as the video page draws it in the watch page's right column: its head, then every
 * line with its time, the line being said lit; as tall as the player, as the page has it.
 */
function BesideStrip({ lit, now, picked, shown, list }: { lit: number | null; now: Span | null; picked: Span | null; shown: boolean; list: (el: HTMLDivElement | null) => void }) {
  const tokens = useMemo(() => LINES.map((line) => tokensOf(line.text)), []);
  return (
    <div className={`strip ex-strip is-beside ${shown ? "" : "is-away"}`.trim()} style={{ "--panki-beside-h": "382px" } as CSSProperties}>
      <StripHead />
      <div className="strip-list-box">
        <div ref={list} className="strip-list">
          {LINES.map((line, i) => (
            <div key={line.start} className={`strip-list-line ${lit === i ? "is-now" : ""}`.trim()} data-line={i}>
              <Button className="strip-list-time" aria-label={`Go to ${line.start}`}>
                {line.start}
              </Button>
              <Line tokens={tokens[i] ?? []} picked={i === PICK_LINE ? picked : null} now={i === lit ? now : null} onPick={nothing} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The word tokens of a line, in order: where the word being said moves along. */
const wordsOf = (tokens: readonly Token[]) => tokens.flatMap((token, i) => (token.word ? [i] : []));

/**
 * The Panki panel: the line following the video, a word clicked, the card made in the drawer, added. As this browser
 * has the panel: beside the video, every line listed and the drawer opening over it in the same column; or under the
 * player, its line of words.
 */
function PanelScene({ store }: { store: Stored }) {
  const id = useId();
  const beside = store.panelView === "beside";
  const tokens = useMemo(() => tokensOf(SENTENCE), []);
  const target = spanOver(tokens, PICKED.from, PICKED.to);
  const [shown, setShown] = useState(false);
  const [now, setNow] = useState<Span | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [picked, setPicked] = useState<Span | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [added, setAdded] = useState(false);
  const [paused, setPaused] = useState(false);
  const line = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  /** The line the word is picked in: the only one under the player, the picked line's row beside the video. */
  const pickRow = () => (beside ? (line.current?.querySelector(`[data-line="${PICK_LINE}"]`) ?? null) : line.current);
  const script = async (t: Tools) => {
    setShown(false);
    setNow(null);
    setLit(null);
    setPicked(null);
    setDrawer(false);
    setAdded(false);
    setPaused(false);
    await t.wait(200);
    setShown(true);
    t.frame(line.current?.closest(".strip") ?? null);
    if (beside) {
      // The lines before it said one by one, lit as they're said.
      for (let i = 0; i < PICK_LINE; i++) {
        setLit(i);
        await t.wait(700);
      }
      setLit(PICK_LINE);
    }
    await t.wait(450);
    for (const i of store.markUnder ? wordsOf(tokens).slice(0, 4) : []) {
      setNow([i, i]);
      await t.wait(320);
    }
    if (!store.markUnder) await t.wait(1280);
    setNow(null);
    await t.move(target ? (pickRow()?.querySelector(`[data-at="${target[0]}"]`) ?? null) : null);
    await t.click();
    setPicked(target);
    setDrawer(true);
    setPaused(true);
    t.frame(card.current);
    await t.wait(1100);
    await t.move(card.current?.querySelector(".capture-add") ?? null);
    await t.click();
    setAdded(true);
    // The video was playing before the word was clicked, so "As before" plays it too.
    setPaused(store.afterAdd === "pause");
    await t.wait(900);
    setDrawer(false);
    setPicked(null);
    t.frame();
    await t.wait(800);
  };
  const keep = (el: HTMLDivElement | null) => {
    line.current = el;
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        paused={paused}
        under={beside ? undefined : <Strip tokens={tokens} now={now} picked={picked} shown={shown} line={keep} />}
        side={beside ? <BesideStrip lit={lit} now={now} picked={picked} shown={shown} list={keep} /> : undefined}
      >
        <div ref={card} className={`ex-drawer ${drawer ? "is-open" : ""}`.trim()}>
          <section className="panel capture" aria-label="Add to Panki">
            <div className="capture-head">
              <h2 className="panel-title">Add to Panki</h2>
              <Button className="btn-icon" aria-label="Close">
                <Icon name="close" />
              </Button>
            </div>
            <div className="capture-body">
              {added ? (
                <div className="capture-added">
                  <p className="capture-done" role="status">
                    <span className="capture-done-mark">
                      <Icon name="check" />
                    </span>
                    <span className="capture-done-words">Added to {IN_DECKS.deck}</span>
                  </p>
                </div>
              ) : (
                <div className="add-form">
                  {/* Add right under the head, as the drawer has it; the × closes it. */}
                  <div className="capture-live capture-ends">
                    <Button variant="primary" className="capture-add">
                      <Icon name="add" />
                      Add to {IN_DECKS.deck}
                    </Button>
                  </div>
                  <div className="field capture-deck">
                    <span className="field-label">Deck</span>
                    <Dropdown id={`${id}-deck`} label="Deck" options={[{ id: "example", label: IN_DECKS.deck }]} value="example" onChange={nothing} />
                  </div>
                  <TextField id={`${id}-word`} label="Word" lang="ja" value={IN_DECKS.words} onChange={nothing} />
                  <div className="capture-sentence">
                    <TextField id={`${id}-sentence`} label="Sentence" lang="ja" multiline value={SENTENCE} mark={PICKED} onChange={nothing} />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </WatchPage>
    </Stage>
  );
}

/** Spoken word underline: the word being said underlined in the Panki panel and in the subtitles on the video. */
function UnderlineScene({ store }: { store: Stored }) {
  const tokens = useMemo(() => tokensOf(SENTENCE), []);
  const [now, setNow] = useState<Span | null>(null);
  const over = useRef<HTMLDivElement | null>(null);
  // Where the mark is drawn, as set: the video's line only while the transcript is over the video.
  const underNow = store.markUnder ? now : null;
  const overNow = store.markOver ? now : null;
  const script = async (t: Tools) => {
    setNow(null);
    const video = over.current?.closest(".ex-video") ?? null;
    t.frame(video, video?.parentElement?.querySelector(".strip") ?? null);
    await t.move([92, 92], 350);
    for (let round = 0; round < 2; round++) {
      for (const i of wordsOf(tokens)) {
        setNow([i, i]);
        await t.wait(340);
      }
      setNow(null);
      await t.wait(450);
    }
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        video={
          <div ref={over} className="ex-over">
            {store.transcribeOverVideo ? (
              <div className="sub-band over-line" lang="ja">
                <Line tokens={tokens} picked={null} now={overNow} onPick={nothing} />
              </div>
            ) : null}
          </div>
        }
        under={<Strip tokens={tokens} now={underNow} picked={null} />}
      />
    </Stage>
  );
}

/** YouTube's home made Panki's: the pill in the header bar, the shelves over the feed, a video saved from its thumbnail. */
function HomeScene({ store }: { store: Stored }) {
  const [pill, setPill] = useState(false);
  const [shelves, setShelves] = useState(0);
  const [hover, setHover] = useState(false);
  const [saved, setSaved] = useState(false);
  const feed = useRef<HTMLDivElement | null>(null);
  const script = async (t: Tools) => {
    setPill(false);
    setShelves(0);
    setHover(false);
    setSaved(false);
    t.frame();
    await t.wait(200);
    // The whole home stays in view, no zoom needed, but for the + pressed.
    if (store.homePill) {
      setPill(true);
      await t.move(feed.current?.closest(".ex-yt")?.querySelector(".ym-pill") ?? null, 550);
      await t.wait(700);
    }
    if (store.homeShelf || store.homeSaved) {
      await t.move([36, 34], 450);
      setShelves(1);
      await t.wait(900);
      setShelves(2);
      await t.wait(900);
    }
    if (!store.thumbSave) return;
    const card = feed.current?.querySelector(".ex-grid > :nth-child(2)") ?? null;
    await t.move(card, 450);
    setHover(true);
    await t.wait(250);
    const plus = card?.querySelector(".yt-save") ?? null;
    t.frame(card);
    await t.move(plus, 500);
    await t.click();
    setSaved(true);
    await t.wait(900);
    t.frame();
    await t.wait(600);
  };
  const grid = [1, 2, 3, 4, 5, 6].map(videoAt);
  const lead = videoAt(7);
  const kept = videoAt(8);
  const savedNow = grid[1] ?? lead;
  return (
    <Stage site={HOME} script={script}>
      <div className="ex-yt is-home">
        <SiteTop
          right={
            <span className={`ym-pill-wrap ex-pill ${pill ? "is-on" : ""}`.trim()}>
              <PankiPill layout={store.pill} numbers={SAMPLE_NUMBERS} profile={store.profileName || store.userName} power={{ on: true, onChange: nothing }} onClick={nothing} />
            </span>
          }
        />
        <div className="ex-rail">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div ref={feed} className="ex-feed">
          <div className="ex-chips" lang="ja">
            <span className="is-on">すべて</span>
            <span>音楽</span>
            <span>料理</span>
            <span>旅行</span>
            <span>ゲーム</span>
            <span>ニュース</span>
          </div>
          <div className={`yt-home ex-shelves ${shelves > 0 ? "is-on" : ""}`.trim()}>
            <div className="yh-shelves">
              <section className={`yh-shelf ex-shelf ${shelves > 0 ? "is-on" : ""}`.trim()} aria-label="Continue watching" hidden={!store.homeShelf}>
                <h2 className="yh-h">
                  Continue watching <span className="yh-h-n">3</span>
                </h2>
                <div className="yh-lead">
                  <div className="yc yh-lead-pic-wrap">
                    <span className="yh-lead-pic">
                      <img className="ex-thumb" src={lead.picture} alt="" />
                      <span className="yc-bar">
                        <i style={{ width: "62%" }} />
                      </span>
                    </span>
                  </div>
                  <div className="yh-lead-info">
                    <span className="yh-lead-title" lang="ja">
                      {lead.title}
                    </span>
                    <span className="yc-sub">
                      <span lang="ja">{lead.channel}</span> · Stopped at 9:38 · Yesterday
                    </span>
                    <span className="yh-lead-left">6 min left · 62%</span>
                    <span className="yh-resume">
                      <Icon name="play" />
                      Resume
                    </span>
                  </div>
                </div>
              </section>
              <section className={`yh-shelf ex-shelf ${shelves > (store.homeShelf ? 1 : 0) ? "is-on" : ""}`.trim()} aria-label="Saved for later" hidden={!store.homeSaved}>
                <h2 className="yh-h">
                  Saved for later <span className="yh-h-n">{saved ? 2 : 1}</span>
                </h2>
                <div className="yh-cards">
                  {(saved ? [kept, savedNow] : [kept]).map((v) => (
                    <div key={v.title} className={`yc ${v === savedNow ? "ex-new" : ""}`.trim()}>
                      <span className="yc-link">
                        <span className="yc-thumb">
                          <img className="ex-thumb" src={v.picture} alt="" />
                          <span className="yc-time">{v.length}</span>
                        </span>
                        <span className="yc-title" lang="ja">
                          {v.title}
                        </span>
                        <span className="yc-sub" lang="ja">
                          {v.channel}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
          <div className="ex-grid">
            {grid.map(({ picture, title, channel, face, length }, i) => (
              <div key={title} className="ex-card">
                <span className="ex-card-pic">
                  <img className="ex-thumb" src={picture} alt="" />
                  <span className="yc-time">{length}</span>
                  {i === 1 && (hover || saved) ? (
                    <Button className={`btn-icon yt-save is-on-card ${saved ? "is-saved" : ""}`.trim()} aria-label="Save for later" aria-pressed={saved}>
                      <Icon name="bookmark" />
                    </Button>
                  ) : null}
                </span>
                <span className="ex-card-info">
                  <img className="ex-card-face" src={face} alt="" />
                  <span className="ex-card-words">
                    <b lang="ja">{title}</b>
                    <small lang="ja">
                      {channel} · {(i + 2) * 70}K views
                    </small>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Stage>
  );
}

/** YouTube utilities, each as it's set: the speed button, when the video will end, a short skip, Shorts shown or gone. */
function UtilitiesScene({ store }: { store: Stored }) {
  // The speed button is the real one, and plays on a video of its own: one that's never shown and never played.
  const video = useMemo(() => document.createElement("video"), []);
  const [rate, setRate] = useState(1);
  const [ends, setEnds] = useState(false);
  const [skip, setSkip] = useState<string | null>(null);
  const [at, setAt] = useState(17.1);
  const player = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const read = () => setRate(video.playbackRate);
    video.addEventListener("ratechange", read);
    return () => video.removeEventListener("ratechange", read);
  }, [video]);
  const LENGTH = 18 * 60 + 40;
  // The speed button and the end time as the player bar lays them out (`modules.ts` → `barShows`).
  const bar = barOf(store);
  const speedShown = barShows(store.playerBar, bar, "speed");
  const endShown = barShows(store.playerBar, bar, "endTime");
  const script = async (t: Tools) => {
    video.playbackRate = 1;
    setEnds(false);
    setSkip(null);
    setAt(17.1);
    t.frame(player.current);
    if (speedShown) {
      const speedButton = () => player.current?.querySelector<HTMLButtonElement>(".yt-speed-button") ?? null;
      await t.move(speedButton());
      await t.click();
      speedButton()?.click();
      await t.wait(350);
      const chip = [...(player.current?.querySelectorAll<HTMLButtonElement>(".yt-speed-chip") ?? [])].find((b) => b.textContent === "1.5") ?? null;
      await t.move(chip, 350);
      await t.click();
      chip?.click();
      await t.wait(600);
      // A common speed pressed leaves the panel open, as the slider does; the speed pressed again closes it.
      await t.move(speedButton(), 350);
      await t.click();
      speedButton()?.click();
      await t.wait(300);
    }
    if (endShown) {
      await t.move(player.current?.querySelector(".ex-time") ?? null, 400);
      setEnds(true);
      await t.wait(1000);
    }
    if (store.shortSkip) {
      const key = keyWordOf(store.shortSkipKey);
      const by = store.shortSkipSeconds;
      const step = (by / LENGTH) * 100;
      const words = `${by} s`;
      await t.move([30, 30], 400);
      t.hold(key);
      await t.wait(250);
      t.hold("←");
      setAt((a) => a - step);
      setSkip(`−${words}`);
      await t.wait(500);
      t.letGo("←");
      setSkip(null);
      await t.wait(200);
      t.hold("→");
      setAt((a) => a + step);
      setSkip(`+${words}`);
      await t.wait(500);
      t.letGo("→");
      t.letGo(key);
      setSkip(null);
      await t.wait(350);
    }
    t.frame();
    await t.wait(400);
  };
  const played = (LENGTH * at) / 100;
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        video={
          <div ref={player} className="ex-player">
            {skip ? <span className="ex-skip">{skip}</span> : null}
            <span className="ex-progress">
              <i style={{ width: `${at}%` }} />
              <b style={{ left: `${at}%` }} />
            </span>
            <span className="ex-controls">
              <Icon name="pause" />
              <span className="ex-time">
                {Math.floor(played / 60)}:{String(Math.floor(played % 60)).padStart(2, "0")} / 18:40
              </span>
              {ends ? <span className="yt-end">Ends {hourWords(Date.now() + ((LENGTH - played) / rate) * 1000)}</span> : null}
              <span className="ex-grow" />
              {speedShown ? <SpeedControl video={video} /> : null}
              <Icon name="settings" />
            </span>
          </div>
        }
        side={
          // Shorts as set: shown beside the video, or gone and the recommendations in their place.
          store.moduleShorts ? (
            <div className="ex-shorts">
              <b>Shorts</b>
              <div>
                {[3, 7, 5, 9, 6, 4].map(videoAt).map((v) => (
                  <img key={v.title} className="ex-thumb" src={v.picture} alt="" />
                ))}
              </div>
            </div>
          ) : undefined
        }
      />
    </Stage>
  );
}

/** How long the video being watched is, in seconds (`WATCHED.length`, 18:40): what the seek bar's marks are laid along. */
const SEEK_LENGTH = 18 * 60 + 40;
/** The cards taken from the video: one of them the example deck's own word, one suspended. */
const SEEK_CARDS: readonly VideoCard[] = [
  { cardId: "explain-1", startMs: 95_000, endMs: 99_000, words: "言葉", suspended: false },
  { cardId: "explain-2", startMs: 262_000, endMs: 267_000, words: IN_DECKS.words, suspended: false },
  { cardId: "explain-3", startMs: 541_000, endMs: 545_000, words: "敢えて", suspended: true },
  { cardId: "explain-4", startMs: 803_000, endMs: 808_000, words: "大丈夫", suspended: false },
];
/** Where it says words that are in the decks. */
const SEEK_IN_DECKS: readonly KnownMoment[] = (
  [
    [150, "今日"],
    [330, "友達"],
    [470, "景色"],
    [690, "電車"],
    [910, "勉強"],
  ] as const
).map(([at, words]) => ({ startMs: at * 1000, endMs: at * 1000 + 600, words, lineMs: (at - 2) * 1000, suspended: false }));
/** Where it was stopped the time before, in seconds. */
const SEEK_STOP = 640;

/**
 * Seek bar marks, each as it's set (the real `SeekMark` on the video's bar): the transcript reaching further along it,
 * the cards' words rising as the pointer comes onto the bar and one pressed, the video going to its sentence; where it
 * was stopped pressed; then a clip opened on the bar and its end pulled. Off, the bar is the site's alone.
 */
function SeekScene({ store }: { store: Stored }) {
  const look = store.seekLook;
  const on = store.moduleSeek;
  const [reach, setReach] = useState(0.3);
  const [hover, setHover] = useState(false);
  const [at, setAt] = useState(70);
  const [clip, setClip] = useState<{ start: number; end: number } | null>(null);
  const player = useRef<HTMLDivElement | null>(null);
  const find = (selector: string) => player.current?.querySelector(selector) ?? null;
  const goTo = (pinned: Pinned) => setAt((pinned.of === "known" ? (look.known.click === "word" ? pinned.said.startMs : pinned.said.lineMs) : pinned.card.startMs) / 1000);
  const script = async (t: Tools) => {
    setReach(0.3);
    setHover(false);
    setAt(70);
    setClip(null);
    t.frame(player.current);
    await t.wait(450);
    if (on && look.transcript.shown) {
      for (let step = 1; step <= 8; step++) {
        setReach(0.3 + step * 0.05);
        await t.wait(170);
      }
    }
    await t.move(find(".ex-progress"), 450);
    setHover(true);
    await t.wait(800);
    // The example deck's word pressed: the video goes to its sentence.
    const pin = [...(player.current?.querySelectorAll(".seek-pins.is-cards .seek-pin") ?? [])].find((el) => el.textContent === IN_DECKS.words) ?? null;
    if (on && pin && look.cards.click !== "none") {
      await t.move(pin, 450);
      await t.click();
      setAt(262);
      await t.wait(700);
    }
    await t.move([50, 38], 400);
    setHover(false);
    await t.wait(450);
    if (on && store.markStop) {
      await t.move(find(".seek-stop"), 450);
      await t.click();
      setAt(resumeTo(SEEK_STOP, store.resumeBack));
      await t.wait(700);
    }
    if (on && look.clip.shown) {
      setClip({ start: 860, end: 872 });
      await t.wait(500);
      await t.move(find(".seek-end.is-end"), 400);
      for (let step = 1; step <= 6; step++) {
        setClip({ start: 860, end: 872 + step * 4 });
        await t.wait(40);
        await t.move(find(".seek-end.is-end"), 110);
      }
      await t.wait(600);
      setClip(null);
    }
    t.frame();
    await t.wait(500);
  };
  const share = (seconds: number) => `${(seconds / SEEK_LENGTH) * 100}%`;
  const mark: ClipMark | null = clip ? { ...clip, onMove: nothing, onSettle: nothing } : null;
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        video={
          <div ref={player} className="ex-player">
            <span className="ex-progress">
              <i style={{ width: share(at) }} />
              <b style={{ left: share(at) }} />
              {on ? (
                <SeekMark
                  length={SEEK_LENGTH}
                  covered={[{ startMs: 0, endMs: Math.round(SEEK_LENGTH * reach * 1000) }]}
                  working={reach < 0.7 ? { startMs: Math.round(SEEK_LENGTH * reach * 1000), endMs: Math.round(SEEK_LENGTH * (reach + 0.025) * 1000) } : null}
                  cards={SEEK_CARDS}
                  clip={mark}
                  inDecks={SEEK_IN_DECKS}
                  look={look}
                  hover={hover}
                  stop={store.markStop ? resumeTo(SEEK_STOP, store.resumeBack) : null}
                  onStop={() => setAt(resumeTo(SEEK_STOP, store.resumeBack))}
                  onGo={goTo}
                />
              ) : null}
            </span>
            <span className="ex-controls">
              <Icon name="pause" />
              <span className="ex-time">
                {Math.floor(at / 60)}:{String(Math.floor(at % 60)).padStart(2, "0")} / {WATCHED.length}
              </span>
              <span className="ex-grow" />
              <Icon name="settings" />
            </span>
          </div>
        }
      />
    </Stage>
  );
}

/** A control shown on the bar, or not. */
const withShown = (layout: BarLayout, id: BarControl, shown: boolean): BarLayout => layout.map((control) => (control.id === id ? { ...control, shown } : control));
/** A control moved to stand right after another of its side. */
const movedAfter = (layout: BarLayout, id: BarControl, after: BarControl): BarLayout => {
  const moving = layout.find((control) => control.id === id);
  const rest = layout.filter((control) => control.id !== id);
  const at = rest.findIndex((control) => control.id === after);
  return moving && at >= 0 ? [...rest.slice(0, at + 1), moving, ...rest.slice(at + 1)] : layout;
};

/**
 * The player bar, as it's laid out (the real `BarControls`, the options page's preview): the bar framed, then Panki's
 * own controls coming onto it one by one where their rows put them, the speed button moved to after the settings, and
 * one of YouTube's own hidden and brought back (its theatre mode, or the last of the right's shown). Off, the bar is
 * YouTube's own and nothing changes on it.
 */
function PlayerBarScene({ store }: { store: Stored }) {
  const on = store.playerBar;
  const layout = on ? barOf(store) : YOUTUBE_OWN;
  const video = useMemo(() => document.createElement("video"), []);
  const pankiShown = layout.filter((control) => control.shown && isPankiBar(control.id)).map((control) => control.id);
  const start = pankiShown.reduce((bar, id) => withShown(bar, id, false), layout);
  const [drawn, setDrawn] = useState(start);
  const [coming, setComing] = useState<BarControl | null>(null);
  const [going, setGoing] = useState<BarControl | null>(null);
  const player = useRef<HTMLDivElement | null>(null);
  const find = (id: BarControl) => player.current?.querySelector(`[data-control="${id}"]`) ?? null;
  const rightYouTube = barSide(layout, "right").filter((control) => control.shown && !isPankiBar(control.id));
  const hiding = rightYouTube.find((control) => control.id === "theater")?.id ?? rightYouTube[rightYouTube.length - 1]?.id ?? null;
  const settingsShown = layout.some((control) => control.id === "settings" && control.shown);
  const script = async (t: Tools) => {
    let bar = start;
    const show = (next: BarLayout, id: BarControl | null) => {
      bar = next;
      setDrawn(next);
      setComing(id);
    };
    show(start, null);
    setGoing(null);
    t.frame(player.current?.querySelector(".ytb-fit") ?? null);
    await t.wait(700);
    if (!on) {
      await t.wait(1200);
      t.frame();
      await t.wait(400);
      return;
    }
    for (const id of pankiShown) {
      show(withShown(bar, id, true), id);
      await t.wait(60);
      await t.move(find(id), 450);
      await t.wait(450);
    }
    if (pankiShown.includes("speed") && settingsShown) {
      await t.move(find("speed"), 400);
      show(movedAfter(bar, "speed", "settings"), "speed");
      await t.wait(60);
      await t.move(find("speed"), 450);
      await t.wait(500);
    }
    if (hiding) {
      setComing(null);
      await t.move(find(hiding), 450);
      await t.click();
      setGoing(hiding);
      await t.wait(320);
      show(withShown(bar, hiding, false), null);
      setGoing(null);
      await t.wait(700);
      show(withShown(bar, hiding, true), hiding);
      await t.wait(700);
    }
    t.frame();
    await t.wait(500);
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        video={
          <div ref={player} className="ex-player">
            <BarControls layout={drawn} video={video} classOf={(id) => (id === going ? "is-going" : id === coming ? "is-coming" : "")} />
          </div>
        }
      />
    </Stage>
  );
}

/** The panels with a (?), each by what the panel is called. A new one is an entry here and a case in `ExplainerScene`. */
export const EXPLAINER_NAMES = {
  popup: "Pop-up dictionary",
  known: "Highlight words that are in your decks",
  panel: "Panki panel",
  underline: "Spoken word underline",
  seek: "Seek bar marks",
  home: "YouTube home add-ons",
  utilities: "YouTube utilities",
  playerBar: "Player bar",
} as const;
export type ExplainerId = keyof typeof EXPLAINER_NAMES;

/** A panel's title, with its (?) beside it playing the panel's scene, as this browser has its settings. */
export function SceneTitle({ id, titleId, store }: { id: ExplainerId; titleId: string; store: Stored }) {
  return (
    <ExplainedTitle name={EXPLAINER_NAMES[id]} titleId={titleId}>
      <ExplainerScene id={id} store={store} />
    </ExplainedTitle>
  );
}

/** What a panel's window plays. */
function ExplainerScene({ id, store }: { id: ExplainerId; store: Stored }) {
  switch (id) {
    case "popup":
      return <PopupScene store={store} />;
    case "known":
      return <KnownScene store={store} />;
    case "panel":
      return <PanelScene store={store} />;
    case "underline":
      return <UnderlineScene store={store} />;
    case "seek":
      return <SeekScene store={store} />;
    case "home":
      return <HomeScene store={store} />;
    case "utilities":
      return <UtilitiesScene store={store} />;
    case "playerBar":
      return <PlayerBarScene store={store} />;
  }
}
