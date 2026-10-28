import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Icon } from "@web/components/Icon";
import { TextField } from "@web/components/TextField";
import { hourWords } from "@web/words";
import { tintOf } from "../capture/known";
import { spanOver, tokensOf, type Span, type Token } from "../capture/words";
import type { DictionaryRecord } from "../dictionary/format";
import type { Found } from "../dictionary/found";
import { lookUp } from "../dictionary/lookup";
import { listDictionaries } from "../dictionary/store";
import { popupLayoutOf, withMeanings } from "../popupLayout";
import { paintCss } from "../seekLook";
import type { Stored } from "../storage";
import { Line } from "../ui/Line";
import { LookupBody } from "../ui/Lookup";
import { PankiPill, SAMPLE_NUMBERS } from "../ui/PankiPill";
import { SpeedControl } from "../ui/SpeedControl";
import { EXAMPLE_CARDS, IN_DECKS } from "./examples";
import { Explainer, Stage, type Site, type Spot, type Tools } from "./Explainer";
import thumbMinecraft113 from "./thumbs/o7Kj73TQ3CU.jpg";
import thumbMinecraft111 from "./thumbs/1V029k8jaGY.jpg";
import thumbGuardman from "./thumbs/ssm_RZv9PDc.jpg";
import thumbJarujaru from "./thumbs/XrLtQqseSv8.jpg";
import thumbHikakinClip from "./thumbs/78IdbiNak-M.jpg";
import thumbViolinSamurai from "./thumbs/EjlG-dMzm3s.jpg";
import thumbHiroyuki from "./thumbs/I6mScxP5UMA.jpg";
import thumbOnePiece from "./thumbs/06PeLyzcnJk.jpg";
import thumbHajime from "./thumbs/gzESogpdOfg.jpg";
import thumbSplatoon from "./thumbs/pq5CscA1Anc.jpg";
import faceHikakinGames from "./thumbs/channel-hikakingames.jpg";
import faceGuardman from "./thumbs/channel-guardman.jpg";
import faceJarujaru from "./thumbs/channel-jarujaru.jpg";
import faceHikakinClip from "./thumbs/channel-hikakinclip.jpg";
import faceViolinSamurai from "./thumbs/channel-violinsamurai.jpg";
import faceHiroyuki from "./thumbs/channel-hiroyuki.jpg";
import faceOnePiece from "./thumbs/channel-onepiece.jpg";
import faceHajime from "./thumbs/channel-hajime.jpg";
import newsPicture from "./thumbs/news-picture.png";

/**
 * What each explainer plays (`Explainer.tsx`): one entry per panel, the feature being used on a page as it really is.
 * Panki's own parts are its real components (the pop-up dictionary is `LookupBody` with this browser's dictionaries and
 * pop-up layout; the Panki panel's line is `Line`; the header bar's pill is `PankiPill`; the speed button is
 * `SpeedControl`), so a change to them shows here too. What only exists inside a page's script (the strip's frame, the
 * capture drawer, YouTube home's shelves) is drawn in the same classes. The pages around them are made up: a news
 * site, a video site, in their own colours (`theme.css` → `--page`, `--site-dark`).
 */

const nothing = () => undefined;

const NEWS: Site = { tab: "駅前に新しい喫茶店がオープン｜日曜ニュース", url: "www.nichiyo-news.jp/articles/20261027/kurashi-cafe", icon: "news" };
const WATCH: Site = { tab: "【マインクラフト】未来のマイクラ!?やってみた！ - YouTube", url: "www.youtube.com/watch?v=o7Kj73TQ3CU", icon: "video" };
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

/** The Pop-up dictionary: Shift held over a word of a Japanese page, along the line, let go, closed. */
function PopupScene({ store }: { store: Stored }) {
  const { dictionaries, found } = useLookups();
  const p = usePointing();
  const script = async (t: Tools) => {
    p.close();
    t.frame(p.article());
    await t.move([34, 44], 400);
    await t.move(p.el("kissa"));
    t.hold("Shift");
    await t.wait(200);
    await p.point(t, "kissa");
    await t.wait(1300);
    await t.move(p.el("mitsuke"), 450);
    await p.point(t, "mitsuke");
    await t.wait(1300);
    t.letGo("Shift");
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
    t.hold("Shift");
    await t.wait(200);
    await p.point(t, "kissa");
    await t.wait(1600);
    t.letGo("Shift");
    p.close();
    t.frame(p.article());
    await t.wait(250);
    await t.move(p.el("mitsuke"));
    t.hold("Shift");
    await t.wait(200);
    await p.point(t, "mitsuke");
    await t.wait(1300);
    t.letGo("Shift");
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

/**
 * Real videos for the video site, picked by the owner (2026-10-28): their thumbnails bundled with the extension, so
 * nothing is fetched from the options page; their titles, channels and channels' icons as YouTube gives them. The
 * first is the one being watched.
 */
type Video = { picture: string; title: string; channel: string; face: string; length: string };
const VIDEOS: readonly Video[] = [
  { picture: thumbMinecraft113, title: "【マインクラフト】未来のマイクラ!?やってみた！エイプリルフールアプデ！【ヒカキンのマイクラ実況 Part113】【ヒカクラ】", channel: "HikakinGames", face: faceHikakinGames, length: "18:40" },
  { picture: thumbMinecraft111, title: "【マインクラフト】めっちゃ遠出してみたらついにあれを発見!?!?【ヒカキンのマイクラ実況 Part111】【ヒカクラ】", channel: "HikakinGames", face: faceHikakinGames, length: "21:07" },
  { picture: thumbGuardman, title: "旅行中にがーどまんを雪山で下ろして置き去りにしてみたドッキリ【復讐の１週間】", channel: "Guardmanチャンネルがーどまん", face: faceGuardman, length: "15:32" },
  { picture: thumbJarujaru, title: "第一声で不採用確定させる就活生の奴", channel: "ジャルジャルアイランド JARUJARU ISLAND", face: faceJarujaru, length: "3:58" },
  { picture: thumbHikakinClip, title: "やぎゅう先輩によってTikTokアカBANされるヒカキン【イナイレ・柳生先輩】", channel: "HikakinClipTV", face: faceHikakinClip, length: "9:14" },
  { picture: thumbViolinSamurai, title: "アメリカの警察にポケモンバトル仕掛けたら逮捕になるのか！？【バイオリニスト】", channel: "ViolinSamuraiバイオリン侍とポケモンマスターしずく社長", face: faceViolinSamurai, length: "12:26" },
  { picture: thumbHiroyuki, title: "【ひろゆき】240円のスパチャした質問者にガチ説教するひろゆき。240円をバカにする人は成功しません【切り抜き/論破】", channel: "ひろゆきの部屋【ひろゆき, hiroyuki】切り抜き", face: faceHiroyuki, length: "8:03" },
  { picture: thumbOnePiece, title: "『ワンピース・オン・アイス』ナミ役 本田望結", channel: "ONE PIECE公式YouTubeチャンネル", face: faceOnePiece, length: "1:12" },
  { picture: thumbHajime, title: "［戦慄］激辛ペヤングにデスソースをかけるドッキリ", channel: "はじめしゃちょー（hajime）", face: faceHajime, length: "10:48" },
  { picture: thumbSplatoon, title: "8年前のおしり実況してみた【スプラトゥーン1】", channel: "HikakinGames", face: faceHikakinGames, length: "16:55" },
];
const videoAt = (i: number): Video => VIDEOS[i % VIDEOS.length] ?? (VIDEOS[0] as Video);
const WATCHED = videoAt(0);

/** The site's header bar: its menu, its mark, its search, and what's at its right (Panki's pill, on the home). */
function SiteTop({ right }: { right?: ReactNode }) {
  return (
    <header className="ex-yt-top">
      <span className="ex-yt-menu" />
      <span className="ex-yt-mark" />
      <span className="ex-yt-search" />
      {right}
      <span className="ex-yt-avatar" />
    </header>
  );
}

/** A video's own page: the video, what's under it, its title and channel, and what's beside it. */
function WatchPage({ video, under, side, paused = false, children }: { video?: ReactNode; under?: ReactNode; side?: ReactNode; paused?: boolean; children?: ReactNode }) {
  return (
    <div className="ex-yt">
      <SiteTop />
      <div className="ex-yt-left">
        <div className={`ex-video ${paused ? "is-paused" : ""}`.trim()}>
          <img className="ex-frame" src={WATCHED.picture} alt="" />
          {video}
        </div>
        {under}
        <h1 className="ex-yt-title" lang="ja">
          {WATCHED.title}
        </h1>
        <div className="ex-yt-channel">
          <img className="ex-yt-face" src={WATCHED.face} alt="" />
          <span className="ex-yt-name" lang="ja">
            {WATCHED.channel}
          </span>
          <span className="ex-yt-sub">Subscribe</span>
        </div>
      </div>
      <div className="ex-yt-side">
        {side ??
          [1, 2, 3, 4, 5].map(videoAt).map((v) => (
            <div key={v.title} className="ex-rec">
              <span className="ex-rec-pic">
                <img className="ex-thumb" src={v.picture} alt="" />
                <span className="yc-time">{v.length}</span>
              </span>
              <span className="ex-rec-words">
                <b lang="ja">{v.title}</b>
                <small lang="ja">{v.channel}</small>
              </span>
            </div>
          ))}
      </div>
      {children}
    </div>
  );
}

/** The Panki panel under the player, as the video page draws it: its head and its line of words. */
function Strip({ tokens, now, picked, shown = true, line }: { tokens: readonly Token[]; now: Span | null; picked: Span | null; shown?: boolean; line?: (el: HTMLDivElement | null) => void }) {
  const id = useId();
  return (
    <div className={`strip ex-strip ${shown ? "" : "is-away"}`.trim()}>
      <div className="strip-head">
        <span className="strip-name">Panki</span>
        <span className="strip-pick">
          <Dropdown id={`${id}-source`} label="Subtitles" options={[{ id: "panki", label: "Panki subtitles" }]} value="panki" onChange={nothing} />
        </span>
        <div className="strip-tools">
          <Button className="capture-tool btn-icon" aria-label="Open Panki">
            <Icon name="out" />
          </Button>
          <Button className="capture-tool btn-icon" aria-label="Panki settings">
            <Icon name="settings" />
          </Button>
        </div>
      </div>
      <div ref={line} className="strip-rows">
        <Line tokens={tokens} picked={picked} now={now} onPick={nothing} />
      </div>
    </div>
  );
}

/** The word tokens of a line, in order: where the word being said moves along. */
const wordsOf = (tokens: readonly Token[]) => tokens.flatMap((token, i) => (token.word ? [i] : []));

/** The Panki panel: the line following the video, a word clicked, the card made in the drawer, added. */
function PanelScene() {
  const id = useId();
  const tokens = useMemo(() => tokensOf(SENTENCE), []);
  const target = spanOver(tokens, PICKED.from, PICKED.to);
  const [shown, setShown] = useState(false);
  const [now, setNow] = useState<Span | null>(null);
  const [picked, setPicked] = useState<Span | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [added, setAdded] = useState(false);
  const line = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const script = async (t: Tools) => {
    setShown(false);
    setNow(null);
    setPicked(null);
    setDrawer(false);
    setAdded(false);
    await t.wait(200);
    setShown(true);
    t.frame(line.current?.closest(".strip") ?? null);
    await t.wait(450);
    for (const i of wordsOf(tokens).slice(0, 4)) {
      setNow([i, i]);
      await t.wait(320);
    }
    setNow(null);
    await t.move(target ? line.current?.querySelector(`[data-at="${target[0]}"]`) ?? null : null);
    await t.click();
    setPicked(target);
    setDrawer(true);
    t.frame(card.current);
    await t.wait(1100);
    await t.move(card.current?.querySelector(".capture-add") ?? null);
    await t.click();
    setAdded(true);
    await t.wait(900);
    setDrawer(false);
    setPicked(null);
    t.frame();
    await t.wait(800);
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        paused={drawer && !added}
        under={
          <Strip
            tokens={tokens}
            now={now}
            picked={picked}
            shown={shown}
            line={(el) => {
              line.current = el;
            }}
          />
        }
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
                  <div className="field capture-deck">
                    <span className="field-label">Deck</span>
                    <Dropdown id={`${id}-deck`} label="Deck" options={[{ id: "example", label: IN_DECKS.deck }]} value="example" onChange={nothing} />
                  </div>
                  <TextField id={`${id}-word`} label="Word" lang="ja" value={IN_DECKS.words} onChange={nothing} />
                  <div className="capture-sentence">
                    <TextField id={`${id}-sentence`} label="Sentence" lang="ja" multiline value={SENTENCE} mark={PICKED} onChange={nothing} />
                  </div>
                  <div className="capture-live capture-ends">
                    <Button size="lg">Discard</Button>
                    <Button variant="primary" size="lg" className="capture-add">
                      Add to {IN_DECKS.deck}
                    </Button>
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
function UnderlineScene() {
  const tokens = useMemo(() => tokensOf(SENTENCE), []);
  const [now, setNow] = useState<Span | null>(null);
  const over = useRef<HTMLDivElement | null>(null);
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
            <div className="sub-band over-line" lang="ja">
              <Line tokens={tokens} picked={null} now={now} onPick={nothing} />
            </div>
          </div>
        }
        under={<Strip tokens={tokens} now={now} picked={null} />}
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
    setPill(true);
    const pillEl = feed.current?.closest(".ex-yt")?.querySelector(".ym-pill") ?? null;
    t.frame(pillEl);
    await t.move(pillEl, 550);
    await t.wait(700);
    await t.move([36, 34], 450);
    setShelves(1);
    // Framed once the shelves have opened to their height.
    await t.wait(650);
    t.frame(feed.current?.querySelector(".ex-shelves") ?? null);
    await t.wait(450);
    setShelves(2);
    await t.wait(900);
    const card = feed.current?.querySelector(".ex-grid > :nth-child(2)") ?? null;
    t.frame(card);
    await t.move(card, 450);
    setHover(true);
    await t.wait(250);
    await t.move(card?.querySelector(".yt-save") ?? null, 350);
    await t.click();
    setSaved(true);
    await t.wait(800);
    t.frame();
    await t.wait(500);
  };
  const grid = [1, 2, 3, 4, 5, 6].map(videoAt);
  const lead = videoAt(2);
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
              <section className={`yh-shelf ex-shelf ${shelves > 0 ? "is-on" : ""}`.trim()} aria-label="Continue watching">
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
              <section className={`yh-shelf ex-shelf ${shelves > 1 ? "is-on" : ""}`.trim()} aria-label="Saved for later">
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
                      <Icon name={saved ? "check" : "add"} />
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

/** YouTube utilities: the speed button, when the video will end, a one-second skip, Shorts gone. */
function UtilitiesScene() {
  // The speed button is the real one, and plays on a video of its own: one that's never shown and never played.
  const video = useMemo(() => document.createElement("video"), []);
  const [rate, setRate] = useState(1);
  const [ends, setEnds] = useState(false);
  const [skip, setSkip] = useState<string | null>(null);
  const [at, setAt] = useState(17.1);
  const [shorts, setShorts] = useState(true);
  const player = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const read = () => setRate(video.playbackRate);
    video.addEventListener("ratechange", read);
    return () => video.removeEventListener("ratechange", read);
  }, [video]);
  const LENGTH = 18 * 60 + 40;
  const script = async (t: Tools) => {
    video.playbackRate = 1;
    setEnds(false);
    setSkip(null);
    setAt(17.1);
    setShorts(true);
    const speedButton = () => player.current?.querySelector<HTMLButtonElement>(".yt-speed-button") ?? null;
    t.frame(player.current);
    await t.move(speedButton());
    await t.click();
    speedButton()?.click();
    await t.wait(350);
    const chip = [...(player.current?.querySelectorAll<HTMLButtonElement>(".yt-speed-chip") ?? [])].find((b) => b.textContent === "1.5×") ?? null;
    await t.move(chip, 350);
    await t.click();
    chip?.click();
    await t.wait(600);
    await t.move(player.current?.querySelector(".ex-time") ?? null, 400);
    setEnds(true);
    await t.wait(1000);
    await t.move([30, 30], 400);
    t.hold("Shift");
    await t.wait(250);
    t.hold("←");
    setAt((a) => a - 0.09);
    setSkip("−1 s");
    await t.wait(500);
    t.letGo("←");
    setSkip(null);
    await t.wait(200);
    t.hold("→");
    setAt((a) => a + 0.09);
    setSkip("+1 s");
    await t.wait(500);
    t.letGo("→");
    t.letGo("Shift");
    setSkip(null);
    await t.wait(350);
    const side = player.current?.closest(".ex-yt")?.querySelector(".ex-shorts") ?? null;
    t.frame(side);
    await t.move(side, 450);
    setShorts(false);
    await t.wait(950);
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
              <SpeedControl video={video} />
              <Icon name="settings" />
            </span>
          </div>
        }
        side={
          <div className={`ex-shorts ${shorts ? "" : "is-gone"}`.trim()}>
            <b>Shorts</b>
            <div>
              {[3, 7, 5, 9, 6, 4].map(videoAt).map((v) => (
                <img key={v.title} className="ex-thumb" src={v.picture} alt="" />
              ))}
            </div>
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
  home: "YouTube home add-ons",
  utilities: "YouTube utilities",
} as const;
export type ExplainerId = keyof typeof EXPLAINER_NAMES;

/** A panel's title, with its (?) beside it. */
export function ExplainedTitle({ id, titleId, store }: { id: ExplainerId; titleId: string; store: Stored }) {
  return (
    <div className="explain-head">
      <h2 id={titleId} className="panel-title">
        {EXPLAINER_NAMES[id]}
      </h2>
      <Explainer name={EXPLAINER_NAMES[id]}>
        <ExplainerScene id={id} store={store} />
      </Explainer>
    </div>
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
      return <PanelScene />;
    case "underline":
      return <UnderlineScene />;
    case "home":
      return <HomeScene store={store} />;
    case "utilities":
      return <UtilitiesScene />;
  }
}
