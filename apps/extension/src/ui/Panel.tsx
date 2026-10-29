import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { CaptureFacts, NEW_PLACE, NewCard, NewCardExample, VALUE_MAX, apartOf, cardProblems, comparedOf, exampleFieldsOf, isTyped, pitchValue, wordsFieldOf, type CardField, type ForvoVoice, type MediaCues } from "@panki/contracts";
import { AlreadyIn, EXAMPLE_WORDS, exampleTargetOf, useAddAnyway } from "@web/components/AlreadyIn";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import type { VideoPictures } from "@web/components/LinkView";
import { MediaView } from "@web/components/MediaView";
import { ReviewCard, type StandIn } from "@web/components/ReviewCard";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { FIELD_KINDS } from "@web/fieldKinds";
import { useCalled } from "@web/hooks/useCalled";
import { count, langOf } from "@web/words";
import { CLIP_MAX_SECONDS, RecordError, RecordTouched, base64Of } from "../capture/record";
import { pick, spanOver, textOf } from "../capture/words";
import { CLIENT } from "../client";
import { wordKey, type Found, type Tag } from "../dictionary/found";
import { wordsNow } from "../dictionary/useWords";
import { askAdd, askAddExample, askCalled, askDeck, askLookup, askOpenPanki, askOptions, askPictures, askState, askUpload, askVoice, askVoices, type RecordingAsk, type State } from "../messages";
import { bandOf } from "../popupKinds";
import { DICTIONARY_ROLES, ROLES, ROLE_IDS, cleanMap, roleOf, valuesFor, type Cut, type DictionaryRoleId, type RoleId } from "../roles";
import { uuid } from "../uuid";
import { ClipPlayer } from "./ClipPlayer";
import { Fold } from "./Fold";
import { glossaryText } from "./Glossary";
import { Stamp } from "./Stamp";
import { Trim, type ClipEnd, type MoveBy } from "./Trim";

/** What the panel says when something's wrong. One home. */
const MESSAGES = {
  missing: (field: string) => `Fill in the ${field}.`,
  long: (field: string) => `Keep the ${field} under ${VALUE_MAX} characters.`,
  unfilled: (field: string, deck: string) => `${field} must be filled on ${deck}'s cards, and nothing here fills it.`,
  noClip: "It couldn't be recorded.",
  /** A recording for a field that must be filled didn't make it: no card without it. */
  notMade: (what: string, why: string) => `${capitalised(what)} didn't make it. ${why}`,
  /** Said under the word, and it doesn't stop the card being added: a word is often written in another form than it was said in. */
  stray: "Not in the sentence.",
  notFound: "Not in your dictionaries.",
  noVoice: "No one has said it on Forvo yet.",
};

/** Some characters of the sentence: where the picked word is. */
export type Chars = { from: number; to: number };

/** How long the word must stay as it's typed before it's looked up. */
const LOOKUP_SETTLE_MS = 200;

const isDictRole = (role: RoleId | null): role is DictionaryRoleId => role !== null && ROLES[role].dictionary !== undefined;

/** Names once each, in the order first met, joined. */
const listed = (names: readonly string[]) => [...new Set(names)].join(", ");

/** A tag as a card says it: what the dictionary says it means, or its code when it says nothing. */
const tagWords = (tag: Tag) => tag.notes || tag.name;

/** How common the word is, as a card says it: the band from the best rank, then each list's number. */
function frequencyText(found: Found): string {
  const ranks = found.frequencies.flatMap((f) => (f.rank === null ? [] : [f.rank]));
  const lists = found.frequencies.map((f) => `${f.dict} ${f.display}`).join(", ");
  return [ranks.length > 0 ? bandOf(Math.min(...ranks)) : "", lists].filter((part) => part !== "").join(" · ");
}

/** The meanings that go on a card, as one value: one line each in a box of several lines, numbered when there's more than one; or one after another on a single line. */
function meaningOf(texts: readonly string[], lines: boolean): string {
  if (!lines) return texts.join("; ");
  return texts.length === 1 ? (texts[0] ?? "") : texts.map((text, i) => `${i + 1}. ${text}`).join("\n");
}

/** What the meanings' dropdown says: how many of the word's meanings are ticked. */
const meaningsSaid = (ticked: number, of: number) => `${ticked} of ${of} meanings`;

/** A file that came through a message, as a file again. */
function blobOf(base64: string, mime: string): Blob {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Who said a word on Forvo, as its list in the drawer names them. */
const voiceWords = (voice: ForvoVoice) => (voice.country ? `${voice.by}, ${voice.country}` : voice.by);

/** What was captured: the sentence, and where it came from. The words picked in it are the caller's to hold. */
export type Capture = {
  /** The words taken, as the page or the video had them: the sentence the word is in. */
  sentence: string;
  /** Counts the times the capture went to other words (another sentence was picked): a sentence typed over the old ones is let go. */
  moved: number;
  /** Kept beside the card as it was (the contracts' `CardSource`, less what the drawer adds); none when the page has no web address (a file opened from disk). On a video's page, whose it is too. */
  source: { url: string; title: string; startMs?: number; endMs?: number; channel?: { name: string; url: string } } | null;
  /** A link that opens the video at the moment the clip begins, for the field that takes one; empty where there's no video to open. */
  sourceLink: string;
  /** The video it's from, for the pictures Panki keeps of it: its id, and where its page shows the channel's picture (null where it doesn't). */
  video: { id: string; avatar: string | null } | null;
  /** What the page knows of how it was taken (the contracts' `CaptureFacts`), kept with the card for a backfill; the drawer adds what it knows. */
  facts?: CaptureFacts;
};

/** A cut as recorded: the file, and how it was made off the video (null where that can't be said). */
export type Made = { file: Blob; recording: RecordingAsk | null };

/**
 * A cut of the page's video the panel can shape, hear and ask for: a stretch of it, in the video's own seconds.
 * Whoever offers it holds where its ends are; the panel draws it and says what was asked of it. A capture off a video
 * offers two: the sentence's clip, and the picked word's own sound.
 */
export type ClipOffer = {
  video: HTMLVideoElement;
  start: number;
  /** Null while its last words are still being said. */
  end: number | null;
  /** The whole of the video. */
  limit: { from: number; to: number };
  /** The stretch its bar shows from edge to edge and its ends keep inside (the word's: its sentence's clip); null for a bar that shows the cut with room around it. */
  within: { from: number; to: number } | null;
  /** When each word that was heard begins. */
  ticks: readonly number[];
  /** Whether any of it is being played right now: round and round, or once after an end was moved. */
  playing: boolean;
  /** Changes when the cut went somewhere else by itself (another sentence, another word): its bar goes there with it. */
  anchor: number;
  move: (which: ClipEnd, to: number, by: MoveBy) => void;
  /** An end has been let go where it is. */
  settle: (which: ClipEnd) => void;
  /** Plays it from a moment inside it: a press on its bar. */
  hear: (at: number) => void;
  /** Plays it round and round; or stops it, while any of it is playing. */
  toggle: () => void;
  record: (soundOnly: boolean, onProgress: (seconds: number, of: number | null) => void) => Promise<Made>;
  /** What's said in it as it stands now, from its start (`captions.ts` → `cuesOf`): kept with the recording, so a card plays a clip with its subtitles. */
  cues: () => MediaCues;
};

/** What's said while a stretch is being recorded. */
const RECORDING: Record<Cut, string> = { clip: "Recording the clip…", word: "Recording the word…" };
/** What a recording is called once the card has it: "its clip", "the word's audio". */
function madeWords(of: Cut, soundOnly: boolean): string {
  return `${of === "word" ? "the word's" : "its"} ${soundOnly ? "audio" : "clip"}`;
}
const capitalised = (words: string) => words.slice(0, 1).toUpperCase() + words.slice(1);

type FrameProps = {
  /** Whether it's there to be seen: it unfolds as this turns true, and folds away as it turns false. */
  open: boolean;
  /** Whether it unfolds when it's there from the start; off when it takes the place of a drawer that was open. */
  arrives: boolean;
  /** Something is under way that mustn't be walked out on: × is off, and Escape does nothing. */
  locked?: boolean;
  /** × takes the keys as the frame arrives: for a frame with nothing in it to type in. */
  focusClose?: boolean;
  /** Asked to go, by × or Escape. */
  onLeave: () => void;
  /** It has folded away. */
  onGone: () => void;
  frame?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/**
 * The drawer's frame: its title and ×, around whatever it holds. It unfolds as it arrives and folds away before it's
 * gone, so the page around it is moved aside and let back smoothly rather than jumping a drawer's height.
 */
function Frame({ open, arrives, locked = false, focusClose = false, onLeave, onGone, frame, children }: FrameProps) {
  return (
    <Fold open={open} arrives={arrives} onGone={onGone} className="capture-fold">
      <section
        ref={frame}
        className="panel capture"
        aria-label="Add to Panki"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !locked) onLeave();
        }}
      >
        <div className="capture-head">
          <h2 className="panel-title">Add to Panki</h2>
          <Button className="btn-icon" aria-label="Close" autoFocus={focusClose} disabled={locked} onClick={onLeave}>
            <Icon name="close" />
          </Button>
        </div>
        {children}
      </section>
    </Fold>
  );
}

/** The drawer's frame with only something to say in it: nothing was there to take. */
export function Notice({ children, arrives, onClose }: { children: ReactNode; arrives: boolean; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Frame open={!leaving} arrives={arrives} focusClose onLeave={() => setLeaving(true)} onGone={onClose}>
      <p className="empty">{children}</p>
    </Frame>
  );
}

/**
 * What Panki last said about the decks and their cards. A drawer opened again starts from it, so it's there whole at
 * once instead of a line of waiting and then everything; what's really so is asked afresh each time all the same.
 */
let lastKnown: State | null = null;
/** How long a drawer waits for Panki's first answer before it shows itself anyway, saying it's waiting. */
const SLOW_MS = 500;
/** How long "Added" stands before the drawer takes itself away. */
const ADDED_MS = 1100;

type Phase =
  | { at: "idle" }
  | { at: "adding" }
  | { at: "recording"; what: Cut; seconds: number; of: number | null }
  | { at: "sending"; what: Cut }
  | { at: "done"; deck: string; note: string | null };

type Props = {
  capture: Capture;
  /** The words picked where the capture was made (the line under a player, a page's selection), as characters of `capture.sentence`. */
  picked: Chars | null;
  onPick: (chars: Chars) => void;
  /** The dictionary's word to start from, when the word was added from the popup: the one pressed there, of those found. */
  prefer?: { term: string; reading: string } | null;
  /** On a video with something taken: the sentence's clip. Null anywhere else. */
  clip: ClipOffer | null;
  /** On a video with a word picked: that word's own stretch. Null anywhere else. */
  wordClip: ClipOffer | null;
  /** Whether the drawer unfolds as it comes; off when it takes the place of one that was open. */
  arrives: boolean;
  onClose: () => void;
  /** A card was added from it: a video's page marks where in the video it was taken from. */
  onAdded?: () => void;
};

const nothing = () => undefined;

/** Where some words stand in a text: the place nearest to `near` when they're there more than once; null when they aren't there. */
function whereIs(text: string, words: string, near: number): { from: number; to: number } | null {
  let best = -1;
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + 1)) {
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best < 0 ? null : { from: best, to: best + words.length };
}

/**
 * The capture drawer. From the top: the clip with its two ends, the deck, the card's fields in the card's own order
 * (what the extension fills is filled, the rest is typed; the sentence is one of them), the card as a review will show
 * it (the app's own card, turned by a press), Add. A clip and a word's audio, when the deck takes them, are recorded
 * first and kept on Panki as files; then the card is made, naming them, so a field that must be filled is filled as
 * the card is made. (The card came first and the recordings followed it until 2026-10-17, when a Required clip field
 * couldn't be satisfied at all: the owner, with a clip right there, "Clip is Required, and a recording can only follow
 * its card".)
 *
 * **No deck is chosen for you.** Until one has been chosen on purpose (here, or on the options page) the drawer shows
 * the decks and nothing else; the one chosen is then the one every drawer opens on. What fills which of its fields is
 * the deck's own setting, made on the options page, and it's made before anything is added: a deck whose field
 * mapping isn't switched on says so and sends there. Once it is, a field nothing fills is typed into here.
 *
 * **The word is what's in its field, and the sentence shows where that is.** Picking a word (in the line under a
 * player, by a double-click in the sentence) writes it in the field; typing in the field moves the lit stretch of the
 * sentence to wherever those words are. A word that isn't in the sentence is said so under its field.
 *
 * **What the dictionaries know fills itself in.** A field mapped to the Dictionary form, the Reading or the Meaning is
 * filled from the word as it stands in its field, looked up a moment after it stops changing (the dictionaries' words
 * written exactly so, endings undone). Which of their words it is (when there's more than one) and, if the meanings
 * are picked by hand, which meanings, are chosen just above the first such field; anything filled can be typed over.
 */
export function Panel({ capture, picked, onPick, prefer = null, clip, wordClip, arrives, onClose, onAdded }: Props) {
  // Minted once for the panel, so pressing Add again after a lost connection is the same card, not a second one.
  const [cardId] = useState(uuid);
  const [state, setState] = useState<State | null>(lastKnown);
  /** Panki hasn't answered in a while: the drawer shows itself anyway, and says so. */
  const [slow, setSlow] = useState(false);
  /** Asked to go: it folds away first. */
  const [leaving, setLeaving] = useState(false);
  /** The deck chosen in this drawer; null while it's the one drawers open on, or none at all. */
  const [deckId, setDeckId] = useState<string | null>(null);
  /** The word: picked, then typed over. It's kept apart from the fields because it's the word whichever deck is chosen. */
  const [word, setWord] = useState("");
  /** What's typed into the fields nothing fills, by field id. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  /** The sentence locked, as it was then or as typed over since: the clip's ends pulled leave it as it is. Null while it follows the clip. */
  const [written, setWritten] = useState<string | null>(null);
  /** About where in the sentence the word was picked, for a sentence that has it twice. */
  const [near, setNear] = useState(0);
  /** What's wrong with what's typed, by field id. */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [turned, setTurned] = useState(false);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [failure, setFailure] = useState<string | null>(null);
  /** What the dictionaries say the word is: every word they have that's written that way (or was, before its endings). Null while it's being looked up. */
  const [found, setFound] = useState<Found[] | null>(null);
  /** Which of those it is (`wordKey`); null for the first. */
  const [entry, setEntry] = useState<string | null>(null);
  /** The meanings ticked, by their place in the word's list. */
  const [ticked, setTicked] = useState<readonly number[]>([0]);
  /** What's typed over what the dictionary filled in, by field id. */
  const [dictTyped, setDictTyped] = useState<Record<string, string>>({});
  /** The word's recordings on Forvo, or why there are none to show; null while they're asked for, or when the deck takes none. */
  const [voices, setVoices] = useState<{ word: string; list: readonly ForvoVoice[] } | { word: string; problem: string } | null>(null);
  /** Which of them goes on the card: the best liked, unless another is chosen. */
  const [voiceId, setVoiceId] = useState<number | null>(null);
  /** That one, kept by Panki as a file: its id goes in the card's field, and it's heard here from its bytes. */
  const [heard, setHeard] = useState<{ mediaId: string; url: string } | { problem: string } | null>(null);
  /** The video's pictures as Panki keeps them, shown on the card's video metadata from their bytes. */
  const [pictures, setPictures] = useState<{ videoId: string; shown: VideoPictures } | null>(null);
  const frame = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void askState().then((answer) => {
        lastKnown = answer.ok ? answer : null;
        if (alive) setState(answer);
      });
    load();
    const waited = setTimeout(() => setSlow(true), SLOW_MS);
    // Back from the options page (signed in, a deck set up): what the panel knows is asked for afresh.
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearTimeout(waited);
      window.removeEventListener("focus", load);
    };
  }, []);

  // A word picked where the capture was made is the word, over whatever was there. A pick that the clip's ends were
  // pulled away from (so it's no longer in the sentence) leaves it as it is.
  const pickedText = picked ? capture.sentence.slice(picked.from, picked.to) : "";
  useEffect(() => {
    if (pickedText !== "") setWord(pickedText);
  }, [pickedText]);
  // Where it was picked is kept up by itself: the sentence gains and loses words at its front as the clip's start is
  // pulled, and that must not write the picked word over one that was typed since.
  const pickedAt = picked?.from ?? null;
  useEffect(() => {
    if (pickedAt !== null) setNear(pickedAt);
  }, [pickedAt]);

  // The word is looked up once it stays as it is for a moment: what's found is the dictionary's words that are
  // written exactly so (or were, before their endings), not the ones that only start that way.
  const looked = word.trim();
  const preferKey = prefer ? wordKey(prefer) : null;
  useEffect(() => {
    // What was found for the word before stays until what's found for this one is in, so nothing jumps as it's typed.
    if (looked === "") {
      setFound(null);
      return;
    }
    let alive = true;
    const soon = setTimeout(() => {
      void askLookup(looked).then((answer) => {
        if (!alive) return;
        const whole = answer.ok ? answer.found.filter((f) => f.source === looked) : [];
        setFound(whole);
        setEntry(whole.some((f) => wordKey(f) === preferKey) ? preferKey : null);
        setTicked([0]);
        setDictTyped({});
      });
    }, LOOKUP_SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(soon);
    };
  }, [looked, preferKey]);

  // Other words were taken: a sentence typed over or locked on the old ones would be the wrong sentence now.
  useEffect(() => {
    setWritten(null);
  }, [capture.moved]);

  // Added with nothing left to say: after a moment the drawer takes itself away.
  const finished = phase.at === "done" && phase.note === null;
  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => setLeaving(true), ADDED_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  /** The card is on its way: nothing in the form is changed any more, and it stays that way once it's added. */
  const busy = phase.at !== "idle";
  /** Something is still under way that closing would cut short. */
  const working = busy && phase.at !== "done";
  /** There's something to show: Panki's answer, or, when that's slow in coming, the wait for it. */
  const shown = state !== null || slow;

  const loaded = state?.ok ? state : null;
  // Never the first deck there is: one chosen here, or the one chosen before, or none.
  const deck = loaded ? (loaded.decks.find((d) => d.id === deckId) ?? loaded.decks.find((d) => d.id === loaded.defaultDeckId) ?? null) : null;
  const type = loaded && deck ? (loaded.types.find((t) => t.id === deck.typeId) ?? null) : null;
  const srsType = loaded && deck ? (loaded.srsTypes.find((s) => s.id === deck.srsTypeId) ?? null) : null;
  const map = loaded && deck && type ? cleanMap(loaded.maps[deck.id] ?? {}, type) : {};
  const fieldOf = (role: RoleId) => type?.fields.find((f) => f.id === map[role]) ?? null;
  const wordField = fieldOf("word");
  const sentenceField = fieldOf("sentence");
  const sentence = written ?? capture.sentence;
  /** The dictionary's word this is: the one chosen, or the first found. */
  const chosen = found?.find((f) => wordKey(f) === entry) ?? found?.[0] ?? null;
  const meaningField = fieldOf("dictMeaning");
  // The meanings ticked, in the dictionary's order whatever order they were ticked in.
  const tickedSenses = chosen ? [...ticked].sort((a, b) => a - b).flatMap((i) => chosen.senses[i] ?? []) : [];
  const meaningTexts = tickedSenses.map((sense) => glossaryText(sense.glossary));
  const reading = chosen ? chosen.reading || chosen.term : "";
  /** What the dictionary fills each of its pieces with, before anything is typed over it: every kind of its data. */
  const fromDictionary: Record<DictionaryRoleId, string> = {
    dictForm: chosen?.term ?? "",
    dictReading: reading,
    dictMeaning: meaningOf(meaningTexts, meaningField !== null && FIELD_KINDS[meaningField.kind].multiline),
    // The word's own tags, then those of the meanings ticked.
    dictTags: chosen ? listed([...chosen.tags, ...tickedSenses.flatMap((sense) => sense.tags)].map(tagWords)) : "",
    dictWordType: chosen ? listed(chosen.wordTypes.map(tagWords)) : "",
    dictFrequency: chosen ? frequencyText(chosen) : "",
    // As a Pitch accent field keeps it ("たべる 2"), which the card draws as the line over the reading.
    dictPitch: chosen ? pitchValue(chosen.pitches.flatMap((pitch) => pitch.positions.map((position) => ({ reading, position })))) : "",
  };
  /** The first of the card's fields the dictionary fills: what it found stands above it. */
  const firstDictField = type?.fields.find((f) => isDictRole(roleOf(map, f.id))) ?? null;
  /** A dictionary's piece as it stands in its field: typed over, or as the dictionary has it. */
  const dictValue = (role: DictionaryRoleId) => {
    const field = fieldOf(role);
    return (field ? dictTyped[field.id] : undefined) ?? fromDictionary[role];
  };
  /** The word said on Forvo, once Panki has kept it as a file: its id is the card's value in that field. */
  const voice = heard && "url" in heard ? heard : null;
  const taken: Partial<Record<RoleId, string>> = { word, sentence, source: capture.sourceLink, forvoAudio: voice?.mediaId ?? "" };
  for (const role of DICTIONARY_ROLES) taken[role] = dictValue(role);
  const values = type ? valuesFor(type, map, taken, typed) : {};

  // A card already called what this one would be (by its own words field; for one the word or the dictionary fills,
  // by the dictionary's form of the word too, so a card for 探す is found from 探していた) is said under that field.
  const leadField = type ? wordsFieldOf(type) : null;
  const leadRole = leadField ? roleOf(map, leadField.id) : null;
  const byForm = leadRole === "word" || isDictRole(leadRole) ? [chosen?.term ?? ""] : [];
  const called = useCalled(leadField ? [values[leadField.id] ?? "", ...byForm] : [], askCalled);
  /** What this card holds in the fields its type compares, and their names: how each card called so stands to it. */
  const mine = type ? apartOf(type, values) : [];
  const compared = type ? comparedOf(type) : [];
  // What's here can go onto that card as another example instead (the owner, 2026-10-25): one of this deck's card type,
  // when the type has a field that goes with an example. Only those fields are sent, and only their recordings made.
  const target = type && exampleFieldsOf(type).length > 0 ? exampleTargetOf(called, type.id, mine, compared) : null;
  const [toExample, setToExample] = useState(false);
  const asExample = toExample && target !== null;
  const anyway = useAddAnyway(called, mine, compared);
  /** One already there is the same, and nothing has resolved it yet: Add waits. */
  const unresolved = anyway.duplicate && !asExample && !anyway.on;

  // The word said on Forvo, when the deck takes it: asked for once the dictionaries have answered, as the dictionary
  // has it (探す, not 探していた, which no one records), or as it's typed when they don't know it. Panki's server asks
  // Forvo, with the key in its Settings, and keeps the recording chosen as one of the account's files.
  const voiceField = fieldOf("forvoAudio");
  const spoken = voiceField && found !== null ? (chosen?.term ?? looked) : "";
  useEffect(() => {
    if (spoken === "") {
      setVoices(null);
      return;
    }
    let alive = true;
    setVoices(null);
    void askVoices(spoken).then((answer) => {
      if (!alive) return;
      setVoices(answer.ok ? { word: spoken, list: answer.voices } : { word: spoken, problem: answer.message });
      setVoiceId(answer.ok ? (answer.voices[0]?.id ?? null) : null);
    });
    return () => {
      alive = false;
    };
  }, [spoken]);
  const voicesOf = voices && "list" in voices ? voices.word : null;
  useEffect(() => {
    if (voicesOf === null || voiceId === null) {
      setHeard(null);
      return;
    }
    let alive = true;
    setHeard(null);
    void askVoice(voicesOf, voiceId).then((answer) => {
      if (!alive) return;
      setHeard(answer.ok ? { mediaId: answer.mediaId, url: URL.createObjectURL(blobOf(answer.base64, answer.mime)) } : { problem: answer.message });
    });
    return () => {
      alive = false;
    };
  }, [voicesOf, voiceId]);
  // A recording heard here is let go of once another takes its place, or the drawer goes.
  useEffect(
    () => () => {
      if (heard && "url" in heard) URL.revokeObjectURL(heard.url);
    },
    [heard],
  );
  // The video's pictures, when the deck keeps its metadata: Panki keeps them for everyone as the card is made (so
  // they're there once the video is gone), and the card here shows them from their bytes.
  const pictured = fieldOf("source") && capture.video ? capture.video : null;
  const picturedId = pictured?.id ?? null;
  const picturedAvatar = pictured?.avatar ?? null;
  useEffect(() => {
    if (picturedId === null) {
      setPictures(null);
      return;
    }
    let alive = true;
    const made: string[] = [];
    void askPictures(picturedId, picturedAvatar).then((answer) => {
      if (!alive || !answer.ok) return;
      const urlOf = (picture: { mime: string; base64: string } | null) => {
        if (!picture) return null;
        const url = URL.createObjectURL(blobOf(picture.base64, picture.mime));
        made.push(url);
        return url;
      };
      setPictures({ videoId: picturedId, shown: { thumbnail: urlOf(answer.thumbnail), avatar: urlOf(answer.avatar) } });
    });
    return () => {
      alive = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [picturedId, picturedAvatar]);
  const said = word.trim();
  /** Where the word is in the sentence: the stretch that's lit. */
  const lit = said === "" ? null : whereIs(sentence, said, near);
  /** Everything this deck takes that's recorded off a video: which stretch, with its picture or as sound alone, and the field it goes in. */
  const recorded = ROLE_IDS.flatMap((role) => {
    const cut = ROLES[role].cut;
    const field = fieldOf(role);
    return cut && field ? [{ ...cut, field }] : [];
  });
  /** What a stretch's bar is called: the fields it goes into, by their own names. */
  const namesOf = (of: Cut) =>
    recorded
      .filter((piece) => piece.of === of)
      .map((piece) => piece.field.name)
      .join(" · ");
  const offers: Record<Cut, ClipOffer | null> = { clip, word: wordClip };
  /** The recordings this card gets: what the deck takes and the page has to give. One stretch may be recorded twice, once each way. */
  const cuts = recorded.flatMap((piece) => {
    const offer = offers[piece.of];
    return offer ? [{ ...piece, offer }] : [];
  });

  // The first thing to type in takes the keys as soon as there is one, without the page being moved to it: on a video
  // the drawer stands beside something being watched.
  const ready = type !== null;
  useEffect(() => {
    if (!ready) return;
    // A frame later: a drawer that knows its decks from last time is drawn before it has been put on the page, and
    // nothing that isn't on the page can take the keys.
    const soon = requestAnimationFrame(() => frame.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(soon);
  }, [ready]);

  /** A deck is chosen, on purpose: for this card, and as the one drawers open on from now. */
  function choose(id: string) {
    setDeckId(id);
    setErrors({});
    setFailure(null);
    void askDeck(id);
    if (lastKnown?.ok) lastKnown = { ...lastKnown, defaultDeckId: id };
  }

  async function add() {
    if (!deck || !type || phase.at !== "idle" || unresolved) return;
    // An example is only the fields that go with one, and the recordings for them; the card's own are as they are on it.
    const fields = asExample ? exampleFieldsOf(type) : type.fields;
    const toSend: Record<string, string> = asExample ? Object.fromEntries(fields.map((f) => [f.id, values[f.id] ?? ""])) : values;
    const making = asExample ? cuts.filter((cut) => cut.field.perExample) : cuts;
    /** The fields a recording is about to fill: not missing, whatever the values say before it's made. */
    const toRecord = new Set(making.map((cut) => cut.field.id));
    const problems = cardProblems({ fields }, toSend).filter((problem) => !(problem.problem === "missing" && toRecord.has(problem.fieldId)));
    if (problems.length > 0) {
      const next: Record<string, string> = {};
      let other: string | null = null;
      for (const problem of problems) {
        const field = type.fields.find((f) => f.id === problem.fieldId);
        if (!field) continue;
        const role = roleOf(map, field.id);
        const wrong = problem.problem === "long" ? MESSAGES.long(field.name) : MESSAGES.missing(field.name);
        // A field with a box of its own says it there; anything else is said above Add.
        if (isTyped(field.kind) && role !== "sentence") next[field.id] ??= wrong;
        else other ??= problem.problem === "long" || role === "sentence" ? wrong : MESSAGES.unfilled(field.name, deck.name);
      }
      setErrors(next);
      setFailure(other);
      return;
    }
    setErrors({});
    setFailure(null);
    // The recordings first, one after the other (each is played once more on the page's video while it's recorded),
    // each kept on Panki as a file; then the card, naming them. A field that must be filled is filled as the card is
    // made, and one whose recording didn't make it stops the card when it must be filled, or is left empty otherwise.
    // A recording stopped because the player was touched stops the card whatever its field: it's to be tried again.
    const filled: Record<string, string> = { ...toSend };
    let note: string | null = null;
    for (const cut of making) {
      const what = cut.of;
      const words = madeWords(cut.of, cut.soundOnly);
      let why: string | null = null;
      let touched = false;
      try {
        const { file, recording } = await cut.offer.record(cut.soundOnly, (seconds, of) => setPhase({ at: "recording", what, seconds, of }));
        setPhase({ at: "sending", what });
        const mediaId = uuid();
        // It goes with what's said in it, as heard on the video (a card plays a clip with its subtitles; a sound keeps
        // its words too), and how it was recorded, so it can be recorded again later.
        const cues = cut.offer.cues();
        const sent = await askUpload({
          mediaKind: cut.soundOnly ? "audio" : "video",
          mediaId,
          mime: file.type,
          base64: await base64Of(file),
          ...(cues.length > 0 ? { cues } : {}),
          ...(recording ? { recording } : {}),
        });
        if (sent.ok) filled[cut.field.id] = mediaId;
        else why = sent.message;
      } catch (e) {
        why = e instanceof RecordError ? e.message : MESSAGES.noClip;
        touched = e instanceof RecordTouched;
      }
      if (why === null) continue;
      if (cut.field.required || touched) {
        setFailure(MESSAGES.notMade(words, why));
        setPhase({ at: "idle" });
        return;
      }
      note ??= MESSAGES.notMade(words, why);
    }
    // Everything known of how it was taken goes with it, for a backfill later: the page's, the dictionary's word it was
    // made with and the dictionaries its meanings came from, and what filled each field. It never stops the card: what
    // doesn't read as the contracts' `CaptureFacts` is left out.
    const dictionaries = [...new Set(tickedSenses.map((sense) => sense.dict.slice(0, 200)))].slice(0, 50);
    const facts = CaptureFacts.safeParse({
      ...capture.facts,
      ...(chosen ? { dictionary: { term: chosen.term.slice(0, 200), reading: chosen.reading.slice(0, 200), dictionaries } } : {}),
      fields: Object.fromEntries(
        fields.flatMap((field) => {
          const role = roleOf(map, field.id);
          return role ? [[field.id, role] as const] : [];
        }),
      ),
    });
    const source = capture.source ? { source: { ...capture.source, text: sentence, client: CLIENT, ...(facts.success ? { capture: facts.data } : {}) } } : {};
    if (asExample && target) {
      const example = NewCardExample.safeParse({ id: cardId, values: filled, ...source });
      if (!example.success) {
        setFailure("That can't be made into an example.");
        setPhase({ at: "idle" });
        return;
      }
      setPhase({ at: "adding" });
      const added = await askAddExample({ deckId: target.deckId, cardId: target.cardId, example: example.data });
      if (!added.ok) {
        setFailure(added.message);
        setPhase({ at: "idle" });
        return;
      }
      onAdded?.();
      setPhase({ at: "done", deck: target.deck, note });
      return;
    }
    const card = NewCard.safeParse({ id: cardId, values: filled, ...source });
    if (!card.success) {
      setFailure("That can't be made into a card.");
      setPhase({ at: "idle" });
      return;
    }
    setPhase({ at: "adding" });
    const added = await askAdd({ deckId: deck.id, card: card.data });
    if (!added.ok) {
      setFailure(added.message);
      setPhase({ at: "idle" });
      return;
    }
    onAdded?.();
    setPhase({ at: "done", deck: deck.name, note });
  }

  /**
   * A double-click on a word of the sentence makes it the word, and one on the word beside the word widens it to both:
   * the same as a press in the line under a player. (The browser picks the word out too, as it does on any
   * double-click; that's left alone.) While the sentence is still the words the clip has, where the capture was made
   * is told as well, so the line under the player lights the same word.
   */
  function pickInSentence(e: MouseEvent<HTMLDivElement>) {
    const box = e.target;
    if (busy || !(box instanceof HTMLTextAreaElement)) return;
    const all = wordsNow(sentence);
    const at = all.findIndex((token) => token.word && box.selectionStart >= token.start && box.selectionStart < token.end);
    if (at < 0) return;
    const span = pick(lit ? spanOver(all, lit.from, lit.to) : null, at);
    const from = all[span[0]]?.start ?? 0;
    setWord(textOf(all, span));
    setNear(from);
    if (sentence === capture.sentence) onPick({ from, to: all[span[1]]?.end ?? from });
  }

  /**
   * What the dictionary says of the word, where it's needed: which of its words this is, when it has more than one
   * written this way (今日 is きょう and こんにち), or that it has none. Stands above the first field the dictionary fills.
   */
  function dictionaryBlock() {
    if (looked === "" || found === null) return null;
    if (found.length === 0) return <p className="empty">{MESSAGES.notFound}</p>;
    if (found.length < 2) return null;
    const choose = (key: string) => {
      setEntry(key);
      setTicked([0]);
      setDictTyped({});
    };
    return (
      <div className="field capture-dict">
        <div className="chips" role="group" aria-label="Which word">
          {found.map((f) => (
            <Button key={wordKey(f)} variant="chip" lang="ja" aria-pressed={chosen !== null && wordKey(f) === wordKey(chosen)} disabled={busy} onClick={() => choose(wordKey(f))}>
              {f.reading && f.reading !== f.term ? `${f.term} · ${f.reading}` : f.term}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  /** The word's meanings, when it has more than one: each ticked on or off in a dropdown under the field they go in. */
  function meaningsBlock() {
    if (!meaningField || !chosen || chosen.senses.length < 2) return null;
    const { id } = meaningField;
    return (
      <Dropdown
        id="panki-meanings"
        label={meaningField.name}
        wide
        disabled={busy}
        // Each says which dictionary it's from, so it's plain where a card's meaning came from.
        options={chosen.senses.map((sense, i) => ({ id: i, label: `${i + 1}. ${glossaryText(sense.glossary)}`, note: sense.dict }))}
        values={ticked}
        summary={meaningsSaid(ticked.length, chosen.senses.length)}
        onToggle={(i) => {
          setTicked((was) => (was.includes(i) ? was.filter((n) => n !== i) : [...was, i]));
          // The meaning is the ticked ones again: what was typed over it is let go.
          setDictTyped((was) => {
            const rest = { ...was };
            delete rest[id];
            return rest;
          });
        }}
      />
    );
  }

  /**
   * The sentence: a box to type in, with the word lit in it. On a deck that keeps no sentence it's only for looking at
   * and picking from. On a video it's locked by hand or by typing in it: the clip's ends pulled after that leave the
   * sentence as it is. Unlocked, what was typed is let go and it's the clip's words again.
   */
  function sentenceBlock() {
    const lockable = clip !== null && sentenceField !== null;
    return (
      <div className="capture-sentence" onDoubleClick={pickInSentence}>
        <TextField
          id="panki-sentence"
          label={sentenceField ? (sentenceField.required ? sentenceField.name : `${sentenceField.name} · optional`) : "The line"}
          multiline
          readOnly={!sentenceField || busy}
          lang={langOf(sentence)}
          autoComplete="off"
          value={sentence}
          // Typing in it locks it: what's typed stays, however the clip's ends are pulled.
          onChange={setWritten}
          mark={lit}
        />
        {lockable ? (
          <div className="capture-tools">
            <Toggle
              id="panki-sentence-lock"
              className="capture-tool strip-switch"
              icon="lock"
              says={{ on: "Locked", off: "Unlocked" }}
              on={written !== null}
              disabled={busy}
              onChange={(on) => setWritten(on ? capture.sentence : null)}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /** A cut of the video: its bar with the two ends, playing it, and where it begins and ends, each to be typed over. */
  function cutBlock(what: Cut, offer: ClipOffer, name: string) {
    const off = busy || offer.end === null;
    const set = (which: ClipEnd) => (seconds: number) => {
      offer.move(which, seconds, "exact");
      offer.settle(which);
    };
    return (
      <div className="field capture-clip">
        {/* Whether it's kept with its picture or as sound alone is the mapping's to say, not a switch here. */}
        <span className="field-label">{name}</span>
        <Trim
          video={offer.video}
          start={offer.start}
          end={offer.end}
          limit={offer.limit}
          ticks={offer.ticks}
          disabled={off}
          anchor={offer.anchor}
          within={offer.within}
          onMove={offer.move}
          onSettle={offer.settle}
          onHear={offer.hear}
        />
        <div className="capture-times">
          <Button className="capture-play" disabled={off} onClick={offer.toggle}>
            <Icon name={offer.playing ? "pause" : "play"} />
            {offer.playing ? "Stop" : "Play"}
          </Button>
          {offer.end === null ? (
            // The video was let run (started, even, if it stood still) so the sentence is heard out: said, so it isn't taken for a fault.
            <span className="capture-waiting" role="status">
              <i className="live-dot" aria-hidden="true" />
              Letting the sentence finish. The video stops at its end.
            </span>
          ) : (
            <span className="capture-stamp">
              <Stamp id={`panki-${what}-start`} name="Where it starts" at={offer.start} disabled={busy} onSet={set("start")} />
              to
              <Stamp id={`panki-${what}-end`} name="Where it ends" at={offer.end} disabled={busy} onSet={set("end")} />
              <span className="capture-length">{(offer.end - offer.start).toFixed(2)} s</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  /** The word's own stretch, on a video, when the deck takes it: its bar once a word is picked, and before that what to do to get one. */
  function wordBlock() {
    const names = namesOf("word");
    if (!clip || names === "") return null;
    if (wordClip) return cutBlock("word", wordClip, names);
    return (
      <div className="field capture-clip">
        <span className="field-label">{names}</span>
        <p className="empty">No word picked.</p>
      </div>
    );
  }

  /** The word said by someone on Forvo, when the deck takes it: heard here, someone else's chosen instead, and who said it (Forvo asks to be named). */
  function voiceBlock(name: string) {
    let inside: ReactNode;
    if (said === "") inside = <p className="empty">No word picked.</p>;
    else if (voices === null) inside = <p className="empty">Asking Forvo…</p>;
    // No key yet is one of these: Panki says where to put it (its Settings).
    else if ("problem" in voices) inside = <p className="empty">{voices.problem}</p>;
    else if (voices.list[0] === undefined) inside = <p className="empty">{MESSAGES.noVoice}</p>;
    else {
      const first = voices.list[0];
      const now = voices.list.find((v) => v.id === voiceId) ?? first;
      inside = (
        <>
          {voice ? <MediaView kind="audio" src={voice.url} label={name} /> : <p className="empty">{heard && "problem" in heard ? heard.problem : "Fetching it…"}</p>}
          {voices.list.length > 1 ? (
            <Dropdown
              id="panki-voice"
              label="Who says it"
              wide
              disabled={busy}
              options={voices.list.map((v) => ({ id: v.id, label: voiceWords(v), note: count(v.votes, "vote", "votes") }))}
              value={now.id}
              onChange={setVoiceId}
            />
          ) : null}
          {/* Forvo's own words for crediting it. */}
          <p className="capture-credit">Pronunciations by Forvo. This one by {voiceWords(now)}.</p>
        </>
      );
    }
    return (
      <div className="field capture-voice">
        <span className="field-label">{name}</span>
        {inside}
      </div>
    );
  }

  /**
   * What stands in the drawer once the card is added: "Added to Mining", nothing more (the owner, 2026-10-25: which
   * clips came with it went), and a recording that didn't make it, when one didn't.
   */
  function added() {
    if (phase.at !== "done") return null;
    return (
      <div className="capture-added">
        <p className="capture-done" role="status">
          <span className="capture-done-mark">
            <Icon name="check" />
          </span>
          <span className="capture-done-words">Added to {phase.deck}</span>
        </p>
        {phase.note !== null ? (
          <>
            <p className="capture-note" role="alert">
              {phase.note}
            </p>
            <div className="add-actions">
              <Button onClick={() => setLeaving(true)}>Close</Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function body() {
    if (state === null) return <p className="empty">Asking Panki…</p>;
    if (!state.ok) {
      return (
        <>
          <p className="load-error" role="alert">
            {state.message}
          </p>
          {state.signedOut ? (
            <div className="add-actions">
              <Button variant="primary" onClick={() => void askOptions("account")}>
                Sign in
              </Button>
            </div>
          ) : null}
        </>
      );
    }
    if (state.decks.length === 0) return <p className="empty">No decks yet.</p>;
    const chooser = (
      <div className="field capture-deck">
        <span className="field-label">Deck</span>
        <Dropdown id="panki-deck" label="Deck" options={state.decks.map((d) => ({ id: d.id, label: d.name }))} value={deck?.id ?? ""} placeholder="Choose a deck" disabled={busy} onChange={choose} />
      </div>
    );
    if (!deck) {
      return (
        <>
          {chooser}
          <p className="empty">Choose a deck. Panki remembers it for next time.</p>
        </>
      );
    }
    if (!type) {
      return (
        <>
          {chooser}
          <p className="load-error" role="alert">
            {deck.name}'s card type is missing.
          </p>
        </>
      );
    }
    // A deck is set up before anything is added to it: its field mapping is switched on, on the options page, and
    // until it is the extension adds nothing to it.
    if (!state.decksOn.includes(deck.id)) {
      return (
        <>
          {chooser}
          <p className="empty">Field mapping is off for {deck.name}. Switch it on to add cards to it.</p>
          <div className="add-actions">
            <Button variant="primary" onClick={() => void askOptions("decks")}>
              Field mapping
            </Button>
          </div>
        </>
      );
    }
    const clipNames = namesOf("clip");
    const sending = phase.at === "recording" || phase.at === "sending";
    const share = phase.at === "recording" ? Math.min(1, phase.seconds / (phase.of ?? CLIP_MAX_SECONDS)) : phase.at === "sending" ? 1 : 0;
    // Only where the deck keeps the sentence: with none on the card there's nothing for the word to be missing from.
    const stray = lit === null && said !== "" && sentence.trim() !== "" && sentenceField !== null;
    /** A card already called what this one would be, said under the field it's called by, with a way to it in Panki. */
    const already = (field: CardField) =>
      field.id === leadField?.id ? (
        <AlreadyIn
          cards={called}
          mine={mine}
          compared={compared}
          openWords="Open in Panki"
          onOpen={(card) => void askOpenPanki({ deckId: card.deckId, cardId: card.cardId })}
          // The two ways past the warning are one or the other: pressing one lets the other go.
          example={
            target
              ? {
                  card: target,
                  on: asExample,
                  onToggle: () => {
                    setToExample((was) => !was);
                    anyway.set(false);
                  },
                }
              : null
          }
          anyway={{
            on: anyway.on,
            onToggle: () => {
              anyway.set(!anyway.on);
              setToExample(false);
            },
          }}
        />
      ) : null;
    /** One of the card's fields as the drawer shows it: the sentence, the word said on Forvo, or a box to type in; nothing for what's recorded or filled by itself. */
    const fieldBlock = (field: CardField): ReactNode => {
      const role = roleOf(map, field.id);
      if (role === "sentence") {
        return (
          <>
            {sentenceBlock()}
            {already(field)}
          </>
        );
      }
      if (role === "forvoAudio") return voiceBlock(field.name);
      // Every field that's typed has its box: words, a paragraph, a pitch accent (filled by the dictionary or typed, "たべる 2").
      if (!isTyped(field.kind)) return null;
      const isWord = role === "word";
      const fromDict = isDictRole(role) ? role : null;
      const value = isWord ? word : fromDict ? dictValue(fromDict) : (typed[field.id] ?? "");
      return (
        <>
          {field.id === firstDictField?.id ? dictionaryBlock() : null}
          <TextField
            id={`panki-field-${field.id}`}
            label={field.required ? field.name : `${field.name} · optional`}
            multiline={FIELD_KINDS[field.kind].multiline}
            lang={langOf(value)}
            autoComplete="off"
            readOnly={busy}
            value={value}
            onChange={(text) => {
              if (isWord) setWord(text);
              else if (fromDict) setDictTyped((t) => ({ ...t, [field.id]: text }));
              else setTyped((t) => ({ ...t, [field.id]: text }));
              if (errors[field.id]) setErrors((e) => ({ ...e, [field.id]: "" }));
            }}
            error={errors[field.id] || (isWord && stray ? MESSAGES.stray : undefined)}
          />
          {already(field)}
          {/* The word's sound stands under the word, and the meanings to tick under where they go. */}
          {isWord ? wordBlock() : null}
          {role === "dictMeaning" ? meaningsBlock() : null}
        </>
      );
    };
    const standIns: Record<string, ReactNode | StandIn> = {};
    /** The stretch being played on the page's video right now, if either is. */
    const playing: Cut | null = clip?.playing ? "clip" : wordClip?.playing ? "word" : null;
    if (voiceField && voice) standIns[voiceField.id] = <MediaView kind="audio" src={voice.url} label={voiceField.name} />;
    for (const cut of cuts) {
      standIns[cut.field.id] = (subtitles) => (
        <ClipPlayer
          video={cut.offer.video}
          start={cut.offer.start}
          end={cut.offer.end}
          soundOnly={cut.soundOnly}
          playing={cut.offer.playing}
          // The word's sound being played isn't the sentence's clip playing: that one's picture holds still meanwhile.
          held={playing !== null && playing !== cut.of}
          label={cut.field.name}
          onToggle={busy ? nothing : cut.offer.toggle}
          // What the clip will be kept with, at its ends as they stand: the card will play it with these.
          subtitles={cut.soundOnly ? undefined : (time) => subtitles(cut.offer.cues(), time)}
        />
      );
    }
    return (
      // While the card is on its way everything but what says so goes quiet, and nothing in it answers a press.
      <Form onSubmit={() => void add()} className={`add-form ${busy ? "is-working" : ""}`.trim()}>
        {/* The clip comes first: it's what stands level with the video it's cut from. */}
        {clip && clipNames !== "" ? cutBlock("clip", clip, clipNames) : null}
        {chooser}
        {/* With no field for the word, its sound still belongs up here with the rest that's cut from the video. */}
        {wordField ? null : wordBlock()}
        {/* The card's own fields, in the card's own order: what the extension fills, and what's typed. */}
        {/* Adding an example, the card's own fields stay as they are on it (but the one it's called by, which found it). */}
        {type.fields.map((field) =>
          asExample && !field.perExample && field.id !== leadField?.id ? (
            <div key={field.id} className="card-kept" inert>
              {fieldBlock(field)}
            </div>
          ) : (
            <Fragment key={field.id}>{fieldBlock(field)}</Fragment>
          ),
        )}
        {/* A deck that keeps no sentence still shows the line, to look at and to pick a word from. */}
        {sentenceField ? null : sentenceBlock()}
        {/* The card last, as everything above has made it: looked over, then added. */}
        {srsType ? (
          <div className="field capture-card">
            <span className="field-label">The card</span>
            <div className="capture-card-ground">
              <ReviewCard
                type={type}
                values={values}
                srsType={srsType}
                place={NEW_PLACE}
                revealed={turned}
                onPress={() => setTurned((on) => !on)}
                standIns={standIns}
                subtitleStyle={state.subtitleStyle}
                picturesOf={(id) => (pictures?.videoId === id ? pictures.shown : null)}
              />
            </div>
          </div>
        ) : null}
        {/* It opens above Add as the recording begins, and what's below is moved down, not knocked down. */}
        <Fold open={sending} className="capture-live capture-progress-fold">
          <div className="capture-progress" role="status">
            <span className="media-track" aria-hidden="true">
              <i style={{ width: `${share * 100}%` }} />
            </span>
            <span>{phase.at === "sending" ? "Sending…" : phase.at === "recording" ? RECORDING[phase.what] : ""}</span>
          </div>
        </Fold>
        {failure ? (
          <p className="capture-note" role="alert">
            {failure}
          </p>
        ) : null}
        {/* The way out is down here too, beside the way on: the × is a drawer's height up, and out of sight once the page has been scrolled. */}
        <div className="capture-live capture-ends">
          <Button size="lg" disabled={busy} onClick={() => setLeaving(true)}>
            Discard
          </Button>
          <Button type="submit" variant="primary" size="lg" className="capture-add" disabled={busy || unresolved}>
            {phase.at === "done" ? "Added" : busy ? "Adding…" : asExample ? EXAMPLE_WORDS.go : `Add to ${deck.name}`}
          </Button>
        </div>
      </Form>
    );
  }

  const over = phase.at === "done";
  return (
    <Frame open={shown && !leaving} arrives={arrives} locked={working} onLeave={() => setLeaving(true)} onGone={onClose} frame={frame}>
      {/* Added: the form folds away as the word that it's added unfolds, and the drawer is as tall as what's in it all the way. */}
      <div className="capture-body">
        <Fold open={!over} arrives={false}>
          {body()}
        </Fold>
        <Fold open={over}>{added()}</Fold>
      </div>
    </Frame>
  );
}
