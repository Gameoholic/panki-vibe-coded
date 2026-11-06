import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import {
  APP_LANGUAGES,
  CaptureFacts,
  NEW_PLACE,
  NewCard,
  NewCardExample,
  OWNER,
  PIECE_MAX,
  TOUCH_UP_KEYS,
  TRANSCRIBE_LANGUAGES,
  VALUE_MAX,
  aiSourceNow,
  answeredCall,
  apartOf,
  bareOf,
  cardPiece,
  cardProblems,
  comparedOf,
  customOf,
  defaultTemplateOf,
  exampleFieldsOf,
  failedCall,
  isTyped,
  meaningsPiece,
  fieldVerdictOf,
  isError,
  LOOK_OF,
  meaningTicked,
  meaningVerdictOf,
  meaningWithout,
  readMeaning,
  startCall,
  tidyMeaning,
  templateById,
  templatesOf,
  wordsFieldOf,
  type AiCall,
  type AiValueSource,
  type AiRunWhy,
  type AiTemplate,
  type AiVerdict,
  type CardField,
  type ExplainMessage,
  type ForvoVoice,
  type MediaCues,
  type FieldKey,
  type PromptGaps,
  type PromptPieces,
  type TouchUpAnswer,
  type TouchUpKey,
  type TouchUpNow,
  type ValueSource,
  type ValueSources,
} from "@panki/contracts";
import { FollowUp, RUN_WORDS, RunAsk, TemplateMenu, ceilingOf, questionProblem, useAskFirst } from "@web/components/AiRun";
import { AiSpark, AiWaiting } from "@web/components/AiWaiting";
import { AlreadyIn, EXAMPLE_WORDS, exampleTargetOf, useAddAnyway } from "@web/components/AlreadyIn";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Fold } from "@web/components/Fold";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import type { VideoPictures } from "@web/components/LinkView";
import { MediaView } from "@web/components/MediaView";
import { ReviewCard, type StandIn } from "@web/components/ReviewCard";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import {
  FollowTurns,
  UnmarkAi,
  TOUCH_UP_WORDS,
  Tied,
  TouchUpBar,
  TouchUpButton,
  TouchUpCost,
  fieldMarks,
  fieldShown,
  meaningShown,
  proposes,
  touchUpReason,
  touchUpVerdicts,
  type FollowTurn,
  type Shown,
} from "@web/components/TouchUp";
import { FIELD_KINDS } from "@web/fieldKinds";
import { useCalled } from "@web/hooks/useCalled";
import { count, langOf, wordFor } from "@web/words";
import { CLIP_MAX_SECONDS, RecordError, RecordTouched, base64Of } from "../capture/record";
import { pick, spanOver, stamp, textOf } from "../capture/words";
import { CLIENT } from "../client";
import { wordKey, type Found } from "../dictionary/found";
import { NO_PIECES, dictionaryPieces } from "../dictionary/pieces";
import { wordsNow } from "../dictionary/useWords";
import { askAdd, askAddExample, askAiState, askCalled, askDeck, askLookup, askOpenPanki, askOptions, askPictures, askState, askTouchUp, askUpload, askVoice, askVoices, type AiShown, type RecordingAsk, type State } from "../messages";
import { DICTIONARY_ROLES, ROLES, ROLE_IDS, cleanMap, roleOf, roleOfKey, valuesFor, type Cut, type DictionaryRoleId, type RoleId } from "../roles";
import { uuid } from "../uuid";
import { ClipPlayer } from "./ClipPlayer";
import { gapsOf, type PieceLimits } from "./Explain";
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

/** What the meanings' dropdown says: how many of the word's meanings are ticked. */
const meaningsSaid = (ticked: number, of: number) => `${ticked} of ${of} ${wordFor(of, "meaning", "meanings")}`;
/** The Meaning list's choice for the meaning Touch up proposed, past every dictionary meaning's place. */
const PROPOSED = -1;
/** The Meaning list's first custom meaning, the field's own words; the next are counted down from it. */
const CUSTOM = -2;

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
  /** What the page adds to Touch up's prompt, read as it's pressed: on a video, its metadata, the subtitles around the moment and its description. */
  more?: (limits: PieceLimits) => PromptPieces;
};

/** What a Touch up run sent: its pieces (`{Card}` among them), why each empty one is empty, every meaning in `{Meaning}`'s order, and the card as it stood. */
type TouchRead = { pieces: PromptPieces; gaps: PromptGaps; meanings: string[]; now: TouchUpNow };

/**
 * Touch up as the drawer holds it: its calls, whether one is on its way, how the last run came out, its answer as its
 * follow-ups have changed it, which of its proposals have been decided; and since AI step 5 its conversation, one per
 * run: the template it runs, what the run sent (its follow-ups send the same first prompt), everything said as it was
 * sent, and the follow-ups with their replies.
 */
type Touch = {
  calls: readonly AiCall[];
  /** A call on its way: a run (every field it can change dimmed while it works), or a follow-up. */
  busy: false | "run" | "follow";
  /** Why the run gave no answer; a follow-up's failure is its own turn's. */
  failure: { message: string; retry: boolean } | null;
  /** Each key's part as it stands: the run's, a follow-up's change in place of it. */
  answer: TouchUpAnswer | null;
  /** The meanings the run was sent, in `{Meaning}`'s order: what a number in its answer is. */
  meanings: readonly string[];
  /** Proposals accepted or dismissed: gone from under their fields, until a follow-up changes them again. */
  decided: Partial<Record<TouchUpKey, true>>;
  /**
   * The card each part is drawn against (`fieldVerdictOf`, `meaningVerdictOf`): as the run sent it, and for a part a
   * follow-up changed, as the card stood when it was asked.
   */
  now: TouchUpNow;
  /** Notes put away by Accept all or Dismiss all, the positive ones and the error's too, until something new comes for them. */
  hidden: Partial<Record<TouchUpKey, true>>;
  /** How many runs it has made: Touch up's own spark blinks once for each. */
  runs: number;
  template: AiTemplate | null;
  first: TouchRead | null;
  said: readonly ExplainMessage[];
  turns: readonly FollowTurn[];
  /**
   * On a video, where Accept puts the clip for the Sentence proposed (`words`), worked out as the answer landed, so its
   * note says the times Accept will use: null ends when the words aren't in the subtitles kept. Null with no Sentence
   * proposal, or off a video.
   */
  clipTo: { words: string; ends: ClipEnds | null } | null;
};
const NO_TOUCH: Touch = {
  calls: [],
  busy: false,
  failure: null,
  answer: null,
  meanings: [],
  decided: {},
  hidden: {},
  now: { values: {}, ticked: [] },
  runs: 0,
  template: null,
  first: null,
  said: [],
  turns: [],
  clipTo: null,
};
/** Where a follow-up is asked under the head, beside the fields' own (by their ids). */
const BAR = "bar";
/** Where Touch up's own run asks first: under the button row. */
const RUN = "run";
/** Where a follow-up is asked from a field's note. */
const whereOf = (fieldId: string) => `field:${fieldId}`;
/**
 * A value Panki AI wrote into a field, once accepted: the words, its source, and what holds it in the drawer (the
 * sentence typed, a dictionary field typed over, a field typed in). It stays the AI's when it's changed by hand
 * (`aiSourceNow`: `edited`), until the owner unmarks it or what holds it lets it go (its words taken out of the Meaning
 * by its list or Accept, the sentence unlocked, another word or entry). For the Meaning, `value` is the AI's own words,
 * which may stand beside others in it.
 */
type AiWrote = { value: string; source: AiValueSource; holder: "sentence" | "dict" | "typed" };
/** The AI's words let go of the fields chosen: what fills them now is something else, or the owner marked them as theirs. */
const aiLetGo = (was: Record<string, AiWrote>, gone: (fieldId: string, wrote: AiWrote) => boolean): Record<string, AiWrote> =>
  Object.fromEntries(Object.entries(was).filter(([fieldId, wrote]) => !gone(fieldId, wrote)));

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
  /** Where it paused, in the video's seconds, while that's inside it: Play goes on from there, and its bar stands there. Null otherwise. */
  pausedAt: number | null;
  /** Changes when the cut went somewhere else by itself (another sentence, another word): its bar goes there with it. */
  anchor: number;
  move: (which: ClipEnd, to: number, by: MoveBy) => void;
  /** An end has been let go where it is. */
  settle: (which: ClipEnd) => void;
  /** Plays it from a moment inside it: a press on its bar. */
  hear: (at: number) => void;
  /** Plays it round and round, from where it paused if it did; or pauses it, while any of it is playing. */
  toggle: () => void;
  record: (soundOnly: boolean, onProgress: (seconds: number, of: number | null) => void) => Promise<Made>;
  /** What's said in it as it stands now, from its start (`captions.ts` → `cuesOf`): kept with the recording, so a card plays a clip with its subtitles. */
  cues: () => MediaCues;
  /**
   * The sentence's clip following words of the subtitles kept (an accepted Touch up Sentence): where its ends would go
   * for them, worked out as a sentence's clip as it was said is, or null when they aren't there; and putting them there.
   * The sentence's clip alone has it.
   */
  follow?: { endsFor: (words: string) => ClipEnds | null; moveTo: (ends: ClipEnds) => void };
};
/** A clip's two ends, both known, in the video's seconds. */
type ClipEnds = { start: number; end: number };

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
  /** Panki AI is working on the card, or no longer: a video's page holds the clip's ends and the picked words still meanwhile. */
  onTouching?: (on: boolean) => void;
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
 * The capture drawer. From the top: Touch up and Add, then the clip with its two ends, the deck, the card's
 * fields in the card's own order (what the extension fills is filled, the rest is typed; the sentence is one of them),
 * the card as a review will show it (the app's own card, turned by a press). A clip and a word's audio, when the deck takes them, are recorded
 * first and kept on Panki as files; then the card is made, naming them, so a field that must be filled is filled as
 * the card is made. (Were the card made first and the recordings after it, a Required clip field could never be
 * satisfied.)
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
export function Panel({ capture, picked, onPick, prefer = null, clip, wordClip, arrives, onClose, onAdded, onTouching }: Props) {
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
  /** The word has been typed into by hand since it was last picked: what a pick wrote isn't anything typed. */
  const [wordTyped, setWordTyped] = useState(false);
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
  /**
   * The Meaning as it stands, the one truth of it: typed, written by its list of meanings or by Touch up. Null while
   * it's the dictionary's first meaning, as a word found starts. The meanings ticked in the list are read off it.
   */
  const [meaningText, setMeaningText] = useState<string | null>(null);
  /** What's typed over what the dictionary filled in, by field id (all but the Meaning, which is `meaningText`). */
  const [dictTyped, setDictTyped] = useState<Record<string, string>>({});
  /** The word's recordings on Forvo, or why there are none to show; null while they're asked for, or when the deck takes none. */
  const [voices, setVoices] = useState<{ word: string; list: readonly ForvoVoice[] } | { word: string; problem: string } | null>(null);
  /** Which of them goes on the card: the best liked, unless another is chosen. */
  const [voiceId, setVoiceId] = useState<number | null>(null);
  /** That one, kept by Panki as a file: its id goes in the card's field, and it's heard here from its bytes. */
  const [heard, setHeard] = useState<{ mediaId: string; url: string } | { problem: string } | null>(null);
  /** The video's pictures as Panki keeps them, shown on the card's video metadata from their bytes. */
  const [pictures, setPictures] = useState<{ videoId: string; shown: VideoPictures } | null>(null);
  /** Panki AI as the worker keeps it: unknown until it answers; null signed out; or why it couldn't be told. */
  const [ai, setAi] = useState<{ known: boolean; ai: AiShown | null; failure: string | null }>({ known: false, ai: null, failure: null });
  const [touch, setTouch] = useState<Touch>(NO_TOUCH);
  /** The Touch up template picked from its menu in this drawer, by its id: the button's from then on, the account's default untouched. */
  const [touchChosen, setTouchChosen] = useState<string | null>(null);
  /** The follow-up questions being typed, by where they're asked (`BAR`, or a field's `whereOf`), and why one can't be asked. */
  const [follows, setFollows] = useState<Record<string, { text: string; error?: string }>>({});
  /** Ask before a run over: Touch up's run and its follow-ups, each asked where its answer would go. */
  const touchGate = useAskFirst();
  /** How many runs each template has had in this drawer: its calls named "Touch up", then "Touch up 2". */
  const touchRuns = useRef(new Map<string, number>());
  /** What Panki AI wrote into each field, by field id, once accepted. */
  const [aiWrote, setAiWrote] = useState<Record<string, AiWrote>>({});
  const frame = useRef<HTMLElement>(null);

  /** Panki AI as it stands, what Touch up's button says it can cost or why it can't run; asked as the drawer opens and after each call. */
  const readAi = (fresh = false) =>
    void askAiState(fresh).then((answer) => setAi(answer.ok ? { known: true, ai: answer.ai, failure: null } : { known: true, ai: null, failure: answer.message }));
  useEffect(() => {
    let alive = true;
    const load = () =>
      void askState().then((answer) => {
        lastKnown = answer.ok ? answer : null;
        if (alive) setState(answer);
      });
    load();
    readAi();
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
    if (pickedText === "") return;
    setWord(pickedText);
    setWordTyped(false);
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
        setMeaningText(null);
        setDictTyped({});
        setAiWrote((was) => aiLetGo(was, (_, wrote) => wrote.holder === "dict"));
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
    setAiWrote((was) => aiLetGo(was, (_, wrote) => wrote.holder === "sentence"));
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
  /** Panki AI is working on the card: a Touch up run, its Try again, a follow-up. */
  const touching = touch.busy !== false;
  /**
   * Nothing on the card can be changed: it's on its way, or Panki AI is working on it, so no field is edited while
   * it works and an answer is never drawn against a card that moved
   * under it. Playing a clip changes nothing and stays; Accept, Dismiss and × are Touch up's and the drawer's own.
   */
  const still = busy || touching;
  // The page holds what it hands the drawer (the clip's ends, the words picked under the player) still meanwhile too.
  useEffect(() => {
    onTouching?.(touching);
    return () => onTouching?.(false);
  }, [touching, onTouching]);
  /** There's something to show: Panki's answer, or, when that's slow in coming, the wait for it. */
  const shown = state !== null || slow;

  /**
   * The drawer asked to go, by × or Escape, the one way to discard it: it goes at once, whatever was typed. Nothing
   * is asked first, the owner's call: the words are had again by taking the same lines, and a question on every
   * close of a card half-made got in the way.
   */
  function leave() {
    setLeaving(true);
  }

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
  /** The word's meanings, each as the field writes it (its glosses joined by "; "), in the dictionary's order: `{Meaning}`'s. */
  const dictMeanings = chosen ? chosen.senses.map((sense) => glossaryText(sense.glossary)) : [];
  /** The Meaning as it stands: what's been made of it, else the dictionary's first meaning. */
  const meaningNow = meaningText ?? dictMeanings[0] ?? "";
  /** The meanings the Meaning holds whole, and its own runs of glosses: what the list ticks, read off the field every time. */
  const meaningRead = readMeaning(meaningNow, dictMeanings);
  /** The senses the Meaning holds, in the dictionary's order: their tags and their dictionaries go with the card. */
  const tickedSenses = chosen ? meaningRead.ticked.flatMap((n) => chosen.senses[n - 1] ?? []) : [];
  /** What the dictionary fills each of its pieces with, before anything is typed over it: every kind of its data (the Meaning is `meaningNow`). */
  const fromDictionary: Record<DictionaryRoleId, string> = chosen ? dictionaryPieces(chosen, tickedSenses, false) : NO_PIECES;
  /** The first of the card's fields the dictionary fills: what it found stands above it. */
  const firstDictField = type?.fields.find((f) => isDictRole(roleOf(map, f.id))) ?? null;
  /** A dictionary's piece as it stands in its field: the Meaning as it stands, the rest typed over or as the dictionary has it. */
  const dictValue = (role: DictionaryRoleId) => {
    if (role === "dictMeaning") return meaningNow;
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
  // What's here can go onto that card as another example instead: one of this deck's card type,
  // when the type has a field that goes with an example. Only those fields are sent, and only their recordings made.
  const target = type && exampleFieldsOf(type).length > 0 ? exampleTargetOf(called, type.id, mine, compared) : null;
  const [toExample, setToExample] = useState(false);
  const asExample = toExample && target !== null;
  const anyway = useAddAnyway(called, mine, compared);
  /** One already there is the same, and nothing has resolved it yet: Add waits. */
  const unresolved = anyway.duplicate && !asExample && !anyway.on;

  // Touch up (AI step 3): what it can propose is what the deck has a field for, by the field mapping.
  const keyField = (key: TouchUpKey): CardField | null => {
    const role = roleOfKey(key);
    const field = role ? fieldOf(role) : null;
    return field && isTyped(field.kind) ? field : null;
  };
  const touchKeys = TOUCH_UP_KEYS.filter((key) => keyField(key) !== null);
  const keyOfField = (fieldId: string): TouchUpKey | null => touchKeys.find((key) => keyField(key)?.id === fieldId) ?? null;
  const aiSettings = ai.ai?.settings ?? null;
  /**
   * Whether a field is Panki AI's right now: it wrote what the field holds, changed by hand since or not, and nothing
   * has let it go nor has the owner marked it as theirs. The spark beside it, and its source the AI's.
   */
  const aiHolds = (fieldId: string) => aiWrote[fieldId] !== undefined && (values[fieldId] ?? "").trim() !== "";
  // What was proposed was for this word in this dictionary entry: another word, or another of its entries, and it's let go.
  const touchFor = `${looked}\u0000${chosen ? wordKey(chosen) : ""}`;
  useEffect(() => {
    setTouch(NO_TOUCH);
    setFollows({});
    touchGate.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchFor]);

  /**
   * What Touch up sends: the word, every kind of the dictionary's data (every meaning, as the one meanings list), the sentence as it stands, what the page adds on a video, the account's two languages, and the card as it
   * stands (`{Card}`), each of its fields with the key a proposal for it comes under.
   */
  function touchPieces(limits: PieceLimits): { pieces: PromptPieces; gaps: PromptGaps; meanings: string[]; now: TouchUpNow } {
    const meanings = dictMeanings;
    const video = capture.more?.(limits) ?? {};
    // The card as it stands, what the answer is held against: each key's field (the Meaning tidied), and the rows of
    // `{Meaning}` the Meaning holds, the dictionary's by number and its own custom ones after them, so the model judges
    // it by number.
    const sentValue = (field: CardField) => (field.id === meaningField?.id ? tidyMeaning(values[field.id] ?? "") : (values[field.id] ?? ""));
    const sent: TouchUpNow["values"] = Object.fromEntries(
      touchKeys.flatMap((key) => {
        const field = keyField(key);
        return field ? [[key, sentValue(field)]] : [];
      }),
    );
    // Read as the server reads it (`customOf`), off the Meaning as sent.
    const meaning = readMeaning(sent.meaning ?? "", meanings);
    const ticked = [...meaning.ticked, ...meaning.custom.map((_, i) => meanings.length + i + 1)];
    const now: TouchUpNow = { values: sent, ticked };
    const card = type
      ? cardPiece(
          type.fields
            .filter((f) => isTyped(f.kind))
            .map((f) => ({ name: f.name, key: keyOfField(f.id), value: sentValue(f), ...(f.id === meaningField?.id ? { ticked } : {}) })),
        )
      : "";
    const languages = ai.ai ? { learningLanguage: TRANSCRIBE_LANGUAGES[ai.ai.learningLanguage], language: APP_LANGUAGES[ai.ai.language] } : {};
    const all: PromptPieces = {
      word: word.trim(),
      ...(chosen ? dictionaryPieces(chosen, chosen.senses, true) : {}),
      // The one meanings list, the Meaning's custom ones after the dictionary's (the server makes it the same way).
      dictMeaning: meaningsPiece(meanings, meaning.custom),
      sentence,
      ...video,
      ...languages,
      card,
    };
    const pieces: PromptPieces = Object.fromEntries(Object.entries(all).flatMap(([id, text]) => (text?.trim() ? [[id, text.slice(0, PIECE_MAX)]] : [])));
    return { pieces, gaps: gapsOf(pieces, video.source !== undefined), meanings, now };
  }
  const canTouch = aiSettings !== null && aiSettings.aiOn && ai.ai?.key !== null && touchKeys.length > 0;
  const ownTemplates = ai.ai?.templates ?? [];
  /** The account's default Touch up template: what the drawer opens on. */
  const touchDefault = defaultTemplateOf("touchUp", ai.ai?.defaults ?? {}, ownTemplates);
  /** What Touch up's button runs, and says: the one picked from its menu in this drawer, else the default; never kept anywhere. */
  const touchPicked = touchChosen ? templateById(touchChosen, ownTemplates) : null;
  const touchPreferred = touchPicked && touchPicked.action === "touchUp" ? touchPicked : touchDefault;
  /** From what a run's cost is said: the account's Show the cost when a run is over. */
  const showCostOver = ai.ai ? ai.ai.showCostOverMicros : 0;
  /** The card as it stands right now, as a run or a follow-up would send it. */
  const touchNow = canTouch && aiSettings ? touchPieces(aiSettings) : null;
  /** The most a run of a template can cost on the card as it stands, at the model's listed prices. */
  const runCeiling = (using: AiTemplate) => (aiSettings && touchNow ? ceilingOf(aiSettings, using, touchNow.pieces, [], {}, aiSettings.aiMaxTouchUpTokens) : 0);
  /** What stands beside the button: why it can't run, or the most it can cost. */
  const touchBeside = touchUpReason(ai.known, ai.ai, ai.failure) ?? (touchNow ? RUN_WORDS.upTo(runCeiling(touchPreferred), showCostOver) : null);

  /**
   * Touch up answered: a video's sentence is locked as it stands, so the clip's ends pulled after
   * can't rewrite what Panki AI just judged or proposed against. Unlocking it by hand is still a press.
   */
  const lockSentence = () => {
    if (clip !== null && sentenceField !== null) setWritten((was) => was ?? capture.sentence);
  };
  /**
   * Where Accept would put the clip for an answer's Sentence proposal (`held` what the field held as it was asked), so
   * its note can say the times: the proposed words looked for in the subtitles the page keeps. None with no proposal, or
   * off a video.
   */
  function clipToOf(answer: TouchUpAnswer, held: string): Touch["clipTo"] {
    const part = answer.sentence;
    const follow = clip?.follow;
    if (!part || !follow) return null;
    const verdict = fieldVerdictOf(part, held);
    return "proposed" in verdict ? { words: verdict.proposed, ends: follow.endsFor(verdict.proposed) } : null;
  }

  /**
   * Touch up, asked: one call on the card as it stands (what was accepted before is the card's now), its answer's
   * proposals under their fields in place of whatever the last run left standing, each waiting on a press. Every run is
   * a call of its own in Details, named by its template ("Touch up", the next "Touch up 2" and on), and a conversation
   * of its own: what the last one said is let go.
   */
  async function runTouchUp(using: AiTemplate, why: AiRunWhy) {
    if (!aiSettings || !canTouch || touch.busy) return;
    const read = touchPieces(aiSettings);
    const times = (touchRuns.current.get(using.id) ?? 0) + 1;
    touchRuns.current.set(using.id, times);
    const call = startCall({
      label: times === 1 ? using.name : `${using.name} ${times}`,
      why,
      settings: aiSettings,
      template: using,
      pieces: read.pieces,
      gaps: read.gaps,
      said: [],
      now: Date.now(),
      maxAnswerTokens: aiSettings.aiMaxTouchUpTokens,
    });
    setTouch((was) => ({
      ...was,
      calls: [...was.calls, call],
      busy: "run",
      failure: null,
      answer: null,
      meanings: read.meanings,
      decided: {},
      hidden: {},
      now: read.now,
      runs: was.runs + 1,
      template: using,
      first: read,
      said: [],
      turns: [],
      clipTo: null,
    }));
    setFollows({});
    const answer = await askTouchUp({ templateId: using.id, pieces: read.pieces, meanings: read.meanings, keys: touchKeys, now: read.now, said: [] });
    const now = Date.now();
    const finished = answer.ok
      ? answeredCall(call, { ...answer.touchUp, cut: false }, now, touchUpVerdicts(answer.touchUp.answer, read.now, read.meanings))
      : failedCall(call, answer.message, now, answer.unread);
    setTouch((was) => ({
      ...was,
      calls: was.calls.map((each) => (each === call ? finished : each)),
      busy: false,
      answer: answer.ok ? answer.touchUp.answer : null,
      failure: answer.ok ? null : { message: answer.message, retry: answer.problem === "provider" },
      // The model reads its own turn back as it wrote it, its JSON.
      said: answer.ok ? [{ role: "assistant", text: answer.touchUp.raw || JSON.stringify(answer.touchUp.answer) }] : [],
      clipTo: answer.ok ? clipToOf(answer.touchUp.answer, read.now.values.sentence ?? "") : null,
    }));
    if (answer.ok) lockSentence();
    // The worker keeps Panki AI as this answer said it stands: what's said beside the button follows any change.
    readAi();
  }

  /**
   * A follow-up's own pieces: the question, the field it was asked from by its name on the card, and the card as it
   * stands now, the entire card, whatever was accepted or typed since the run.
   */
  function askingOf(fieldId: string | null, question: string, now: TouchRead): PromptPieces {
    const field = fieldId ? type?.fields.find((f) => f.id === fieldId) : undefined;
    return { question, ...(field ? { field: field.name } : {}), ...(now.pieces.card ? { card: now.pieces.card } : {}) };
  }
  /** The follow-ups answered so far: one that failed is let go as the next is asked. */
  const followsKept = touch.turns.filter((turn) => turn.reply !== null);
  /** Whether a follow-up can be asked now: the run answered, nothing on its way, and Max follow-ups not reached. */
  const canFollow = canTouch && touch.answer !== null && touch.template !== null && touch.busy === false && aiSettings !== null && followsKept.length < aiSettings.aiMaxFollowUps;
  /** The most a follow-up can cost: the run's prompt, the conversation so far, and this one's Follow-up prompt. */
  const followCeiling = (fieldId: string | null, question: string) =>
    aiSettings && touchNow && touch.template && touch.first
      ? ceilingOf(aiSettings, touch.template, touch.first.pieces, touch.said, askingOf(fieldId, question, touchNow), aiSettings.aiMaxTouchUpTokens)
      : 0;

  /**
   * A follow-up, asked under the head or from a field's note: the run's conversation sent whole, with the card as it
   * stands now. Its reply stands where it was asked; what it changes replaces that key's part (a proposal still waiting
   * replaced, a decided one shown again as the new proposal), drawn against what the field holds now; the rest stays.
   */
  async function followUp(fieldId: string | null, question: string, why: AiRunWhy) {
    if (!aiSettings || !canTouch || touch.busy || !touch.template || !touch.first) return;
    const using = touch.template;
    const first = touch.first;
    const current = touchPieces(aiSettings);
    const asking = askingOf(fieldId, question, current);
    const said = [...touch.said];
    const call = startCall({
      label: `Follow-up ${followsKept.length + 1}`,
      why,
      settings: aiSettings,
      template: using,
      pieces: first.pieces,
      gaps: first.gaps,
      said,
      asking,
      now: Date.now(),
      maxAnswerTokens: aiSettings.aiMaxTouchUpTokens,
    });
    const pending: FollowTurn = { field: fieldId, question, reply: null, failure: null };
    setTouch((was) => ({ ...was, calls: [...was.calls, call], busy: "follow", turns: [...followsKept, pending] }));
    const answer = await askTouchUp({ templateId: using.id, pieces: first.pieces, meanings: first.meanings, keys: touchKeys, now: current.now, said, asking });
    const now = Date.now();
    if (!answer.ok) {
      const failed = failedCall(call, answer.message, now, answer.unread);
      setTouch((was) => ({
        ...was,
        calls: was.calls.map((each) => (each === call ? failed : each)),
        busy: false,
        turns: [...followsKept, { ...pending, failure: { message: answer.message, retry: answer.problem === "provider" } }],
      }));
      readAi();
      return;
    }
    const followed = answer.touchUp;
    const reply: AiVerdict = { name: "Answer", tag: null, value: followed.reply, reason: "" };
    const finished = answeredCall(call, { ...followed, cut: false }, now, [reply, ...touchUpVerdicts(followed.answer, current.now, first.meanings)]);
    const changed = TOUCH_UP_KEYS.filter((key) => followed.answer[key] !== undefined);
    const without = (keys: Partial<Record<TouchUpKey, true>>) => Object.fromEntries(Object.entries(keys).filter(([key]) => !changed.some((each) => each === key)));
    setTouch((was) => ({
      ...was,
      calls: was.calls.map((each) => (each === call ? finished : each)),
      busy: false,
      answer: { ...was.answer, ...followed.answer },
      // A change is drawn against the field as it stood when it was asked; the rest as they were.
      now: {
        values: { ...was.now.values, ...Object.fromEntries(changed.map((key) => [key, current.now.values[key] ?? ""])) },
        ticked: followed.answer.meaning ? current.now.ticked : was.now.ticked,
      },
      decided: without(was.decided),
      hidden: without(was.hidden),
      said: [...said, { role: "user", text: followed.asked || question }, { role: "assistant", text: followed.raw || followed.reply }],
      turns: [...followsKept, { ...pending, reply: followed.reply }],
      // A follow-up that changes the Sentence brings its own clip; one that doesn't leaves the last proposal's.
      clipTo: followed.answer.sentence ? clipToOf(followed.answer, current.now.values.sentence ?? "") : was.clipTo,
    }));
    lockSentence();
    readAi();
  }

  /** Touch up pressed (its button, a template from its arrow, Try again): run at once, or ask first over the account's Ask before a run over. */
  function pressTouchUp(using: AiTemplate, why: AiRunWhy) {
    if (!ai.ai || !canTouch) return;
    const micros = runCeiling(using);
    touchGate.press(ai.ai.askOverMicros, RUN, micros, RUN_WORDS.runFor(using.name, micros), () => void runTouchUp(using, why));
  }
  /** A follow-up asked, here or again after a failure: the same, its question asked where its reply would go. `then` once it goes. */
  function pressFollowUp(fieldId: string | null, question: string, why: AiRunWhy, then?: () => void) {
    if (!ai.ai || !canTouch) return;
    const micros = followCeiling(fieldId, question);
    touchGate.press(ai.ai.askOverMicros, fieldId === null ? BAR : whereOf(fieldId), micros, RUN_WORDS.askFor(micros), () => {
      then?.();
      void followUp(fieldId, question, why);
    });
  }
  /** The question typed where it's asked, checked, then asked; it stays in its box until it really goes. */
  function askFollow(fieldId: string | null) {
    const where = fieldId === null ? BAR : whereOf(fieldId);
    const text = (follows[where]?.text ?? "").trim();
    const problem = aiSettings ? questionProblem(text, aiSettings.aiMaxQuestionChars) : null;
    if (problem !== null) {
      setFollows((was) => ({ ...was, [where]: { text: was[where]?.text ?? "", error: problem } }));
      return;
    }
    const field = fieldId ? type?.fields.find((f) => f.id === fieldId) : undefined;
    pressFollowUp(fieldId, text, field ? { kind: "followUp", field: field.name } : { kind: "followUp" }, () => setFollows((was) => ({ ...was, [where]: { text: "" } })));
  }
  /**
   * Touch up's button, running the template chosen in this drawer (the account's default until another is picked) and
   * saying its name; with an arrow joined to it once the account has two or more Touch up templates, every one of them
   * under it with what it can cost here.
   */
  function touchButton(): ReactNode {
    const off = still;
    const button = (
      <TouchUpButton
        name={touchPreferred.name}
        canRun={canTouch}
        busy={off}
        thinking={touch.busy === "run"}
        burst={touch.runs}
        onRun={() => pressTouchUp(touchPreferred, { kind: "pressed", action: touchPreferred.name })}
      />
    );
    const templates = templatesOf("touchUp", ownTemplates);
    if (templates.length < 2) return button;
    return (
      <TemplateMenu
        id="panki-touch-up"
        rows={templates.map((each) => ({ template: each, cost: touchNow ? RUN_WORDS.upTo(runCeiling(each), showCostOver) : null }))}
        defaultId={touchDefault.id}
        chosenId={touchPreferred.id}
        disabled={!canTouch || off}
        onPick={(picked) => {
          setTouchChosen(picked.id);
          pressTouchUp(picked, { kind: "pressed", action: picked.name });
        }}
        onOpen={() => readAi(true)}
      >
        {button}
      </TemplateMenu>
    );
  }

  /**
   * What stands where follow-ups are asked, under the head or under a field's note: those asked there with their
   * replies, the question before one over Ask before a run over, and the box to ask the next.
   */
  function followBlock(fieldId: string | null): ReactNode {
    if (touch.answer === null || touch.template === null) return null;
    const where = fieldId === null ? BAR : whereOf(fieldId);
    const here = touch.turns.filter((turn) => turn.field === fieldId);
    const typed = follows[where] ?? { text: "" };
    return (
      <>
        <FollowTurns
          turns={here}
          canRun={canTouch && touch.busy === false}
          onRetry={(turn) => pressFollowUp(turn.field, turn.question, { kind: "retry" })}
        />
        <RunAsk id={`panki-${where.replace(":", "-")}`} asked={touchGate.at(where)} onCancel={touchGate.cancel} />
        {canFollow ? (
          <FollowUp
            id={`panki-follow-${where.replace(":", "-")}`}
            nested
            small={fieldId !== null}
            value={typed.text}
            error={typed.error}
            disabled={busy}
            beside={RUN_WORDS.upTo(followCeiling(fieldId, typed.text.trim()), showCostOver)}
            onChange={(text) => setFollows((was) => ({ ...was, [where]: { text } }))}
            onAsk={() => askFollow(fieldId)}
          />
        ) : null}
      </>
    );
  }

  const lastCall = touch.calls[touch.calls.length - 1];
  /** Where a value the AI wrote came from: Touch up, on the model the call ran on. */
  const aiSourceOf = (): AiValueSource | null => (lastCall ? { by: "ai", action: "touchUp", provider: lastCall.provider, model: lastCall.model } : null);
  /** What Panki makes of a text field's answer, against what it held as it was sent (`fieldVerdictOf`); none when it wasn't answered. */
  const fieldVerdict = (key: FieldKey) => {
    const part = touch.answer?.[key];
    return part ? fieldVerdictOf(part, touch.now.values[key] ?? "") : null;
  };
  /** What Panki makes of the Meaning's answer, its rows against what the Meaning held as it was sent (`meaningVerdictOf`). */
  const meaningVerdict = () => (touch.answer?.meaning ? meaningVerdictOf(touch.answer.meaning, touch.now, touch.meanings) : null);
  /**
   * The Meaning has changed since it was judged (typed, a meaning ticked or unticked, a proposal accepted): what was said
   * of it is about words no longer there, so its note is put away until it's judged again.
   */
  const meaningMoved = meaningField !== null && touch.answer?.meaning !== undefined && tidyMeaning(values[meaningField.id] ?? "") !== (touch.now.values.meaning ?? "");
  /** Whether a key's proposal still waits under its field: only a proposal does (never Nothing to change, nor the error), until it's decided. */
  function waiting(key: TouchUpKey): boolean {
    if (touch.decided[key] || keyField(key) === null || (key === "meaning" && meaningMoved)) return false;
    const verdict = key === "meaning" ? meaningVerdict() : fieldVerdict(key);
    return verdict !== null && proposes(verdict);
  }
  const decide = (key: TouchUpKey) => setTouch((was) => ({ ...was, decided: { ...was.decided, [key]: true } }));
  /**
   * A value of the AI's written into its field, as typing there would, and remembered as the AI's (a fresh entry, so an
   * offer to mark it as the owner's that was put away comes back). `aiWords` are the AI's own among `text`, when they're
   * written beside what the field held (a proposed meaning ticked in the Meaning's list).
   */
  function writeAi(field: CardField, text: string, aiWords?: string) {
    const role = roleOf(map, field.id);
    const ai = aiSourceOf();
    // A field only Touch up fills is its own; any other it corrected (so only the first's name is sparked).
    const source = ai && (role === null || ROLES[role].from !== "ai") ? { ...ai, corrected: true } : ai;
    const holder = role === "sentence" ? "sentence" : isDictRole(role) ? "dict" : "typed";
    if (holder === "sentence") setWritten(text);
    else if (field.id === meaningField?.id) setMeaningText(text);
    else if (holder === "dict") setDictTyped((was) => ({ ...was, [field.id]: text }));
    else setTyped((was) => ({ ...was, [field.id]: text }));
    if (source) setAiWrote((was) => ({ ...was, [field.id]: { value: (aiWords ?? text).trim(), source, holder } }));
  }
  /** Whether a Meaning still holds the words Panki AI wrote into it, whole and side by side, whatever else stands around them. */
  function meaningHoldsAi(text: string): boolean {
    const wrote = meaningField ? aiWrote[meaningField.id] : undefined;
    return wrote !== undefined && readMeaning(text, [...dictMeanings, wrote.value]).ticked.includes(dictMeanings.length + 1);
  }
  /**
   * The Meaning rewritten by its list or by Accept: the field takes it, and the AI's mark goes with the AI's words once
   * they're no longer in it. Typing in it is the field's own and keeps the mark (`aiSourceNow`: edited).
   */
  function setMeaning(text: string) {
    setMeaningText(text);
    const fieldId = meaningField?.id;
    if (fieldId && !meaningHoldsAi(text)) setAiWrote((was) => aiLetGo(was, (id) => id === fieldId));
  }
  /**
   * A proposal accepted: other meanings of the list to tick are the Meaning rewritten to the runs that fit, as the field
   * has them, then the dictionary's that fit (no spark of its own: the AI's mark stays only on its own words still
   * there); a proposed meaning and any other field's value is the AI's words, sparked.
   */
  function accept(key: TouchUpKey) {
    const field = keyField(key);
    if (!field) return;
    if (key === "meaning") {
      const verdict = meaningVerdict();
      if (verdict?.kind === "change") {
        setMeaning(verdict.accepted);
      } else if (verdict?.kind === "propose" && verdict.proposed) {
        writeAi(field, verdict.proposed);
      }
    } else {
      const verdict = fieldVerdict(key);
      if (verdict && "proposed" in verdict) {
        writeAi(field, verdict.proposed);
        // On a video the clip goes to the accepted words, where its note said; the sentence stays locked as written.
        const to = key === "sentence" ? clipToFor(verdict.proposed) : null;
        if (to?.ends) clip?.follow?.moveTo(to.ends);
      }
    }
    decide(key);
  }
  /** Where the clip goes for the Sentence proposed, as worked out when it landed; null off a video or for other words. */
  const clipToFor = (proposed: string) => (touch.clipTo && touch.clipTo.words === proposed ? touch.clipTo : null);
  /** The Sentence proposal's line about the clip: the times Accept moves it to, that it stays, or nothing off a video. */
  function clipNote(key: TouchUpKey): string | null {
    const verdict = key === "sentence" ? fieldVerdict(key) : null;
    const to = verdict && "proposed" in verdict ? clipToFor(verdict.proposed) : null;
    if (!to) return null;
    return to.ends ? TOUCH_UP_WORDS.clipMoves(stamp(to.ends.start), stamp(to.ends.end)) : TOUCH_UP_WORDS.clipStays;
  }
  const pendingKeys = touchKeys.filter(waiting);
  // Accept all and Dismiss all close every note under the fields, "Nothing to change." and the error's among them (a
  // note left standing would look as if nothing happened); the head stays, and the next run, or a
  // follow-up's change to a field, brings its note back.
  const allHidden = () => Object.fromEntries(touchKeys.map((key) => [key, true]));
  const acceptAll = () => {
    for (const key of pendingKeys) accept(key);
    setTouch((was) => ({ ...was, hidden: allHidden() }));
  };
  const dismissAll = () => setTouch((was) => ({ ...was, hidden: allHidden(), decided: { ...was.decided, ...Object.fromEntries(pendingKeys.map((key) => [key, true])) } }));

  /**
   * What Touch up says under a field it has something for, as Panki draws it (`fieldShown`, `meaningShown`), and under
   * the note, once the run has answered, the field's own follow-ups (AI step 5: the same follow-up, asked from here).
   */
  function touchShown(field: CardField): Shown | null {
    const key = keyOfField(field.id);
    if (!key || !touch.answer || touch.hidden[key]) return null;
    const ways = { waiting: waiting(key), onAccept: () => accept(key), onDismiss: () => decide(key), also: clipNote(key) };
    if (key === "meaning" && meaningMoved) return null;
    const meaning = key === "meaning" ? meaningVerdict() : null;
    const verdict = key === "meaning" ? null : fieldVerdict(key);
    const shown = meaning ? meaningShown(meaning, ways) : verdict ? fieldShown(verdict, touch.now.values[key] ?? "", ways) : null;
    if (!shown) return null;
    return {
      ...shown,
      note: (
        <>
          {shown.note}
          {followBlock(field.id)}
        </>
      ),
    };
  }
  /**
   * A field and what Touch up says about it as one shape, so a proposal is plainly its field's,
   * in its verdict's colour, the field's box the diff while a proposal waits (`Tied`). Every field the same way.
   */
  function tied(field: CardField | null, box: ReactNode): ReactNode {
    const shown = field ? touchShown(field) : null;
    if (shown) return <Tied shown={shown}>{box}</Tied>;
    // The Meaning changed since it was judged: its note goes, and the follow-ups asked there stay, to ask of it as it stands.
    if (field && meaningMoved && keyOfField(field.id) === "meaning" && !touch.hidden.meaning) {
      return (
        <>
          {box}
          {followBlock(field.id)}
        </>
      );
    }
    return box;
  }
  /** A field Touch up's run is reworking: its words where they stand, dimmed under the sweep. A follow-up's head is its wait. */
  const reworked = (fieldId: string | null, inside: ReactNode): ReactNode =>
    touch.busy === "run" && fieldId !== null && keyOfField(fieldId) !== null ? <AiWaiting label="Panki AI is touching up">{inside}</AiWaiting> : inside;
  /** The mark after a field's name: the spark while the AI's words stand in it. */
  const marksOf = (field: CardField) => fieldMarks(aiHolds(field.id));
  /**
   * Under a field that's Panki AI's and holds other words than it wrote: the offer to take the AI's mark off it
   * (`UnmarkAi`). Not while its proposal waits (the diff is the field then), nor while Touch up is at work.
   */
  function unmarkOffer(field: CardField | null): ReactNode {
    const wrote = field ? aiWrote[field.id] : undefined;
    if (!field || !wrote || !aiHolds(field.id) || touch.busy !== false) return null;
    if (aiSourceNow(wrote.source, wrote.value, values[field.id] ?? "").edited !== true) return null;
    const key = keyOfField(field.id);
    if (key && waiting(key)) return null;
    const id = field.id;
    return <UnmarkAi disabled={still} onUnmark={() => setAiWrote((was) => aiLetGo(was, (fieldId) => fieldId === id))} />;
  }

  /**
   * Where each value came from, as it's sent with the card: the AI's while a field is (`edited` once it holds other
   * words than Touch up wrote, `aiSourceNow`); else by the role that filled it, `OWNER` once typed over, and `OWNER`
   * for what nothing fills.
   */
  function sourcesOf(fieldIds: readonly string[], filled: Readonly<Record<string, string>>): ValueSources {
    const dictionaries = [...new Set(tickedSenses.map((sense) => sense.dict.slice(0, 200)))].slice(0, 50);
    const subtitles = capture.facts?.subtitles;
    const sourceOf = (fieldId: string): ValueSource => {
      const wrote = aiWrote[fieldId];
      if (wrote) return aiSourceNow(wrote.source, wrote.value, filled[fieldId] ?? "");
      const role = roleOf(map, fieldId);
      if (role === null || ROLES[role].from === "ai") return OWNER;
      if (role === "word") return wordTyped ? OWNER : { by: "text", ...(subtitles ? { subtitles } : {}) };
      if (role === "sentence") return written !== null && written !== capture.sentence ? OWNER : { by: "text", ...(subtitles ? { subtitles } : {}) };
      // The Meaning is the dictionary's while it holds nothing but its meanings, whole; a gloss of its own makes it the owner's.
      if (role === "dictMeaning") return readMeaning(filled[fieldId] ?? "", dictMeanings).custom.length > 0 ? OWNER : { by: "dictionary", dictionaries };
      if (isDictRole(role)) return dictTyped[fieldId] !== undefined ? OWNER : { by: "dictionary", dictionaries };
      if (role === "forvoAudio") return { by: "forvo" };
      return { by: "video" };
    };
    return Object.fromEntries(fieldIds.filter((id) => (filled[id] ?? "") !== "").map((id) => [id, sourceOf(id)]));
  }

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
    if (!deck || !type || still || unresolved) return;
    // An example is only the fields that go with one, and the recordings for them; the card's own are as they are on it.
    const fields = asExample ? exampleFieldsOf(type) : type.fields;
    // The Meaning goes tidied, its glosses joined by "; ", however it was typed.
    const tidied = meaningField && values[meaningField.id] !== undefined ? { ...values, [meaningField.id]: tidyMeaning(values[meaningField.id] ?? "") } : values;
    const toSend: Record<string, string> = asExample ? Object.fromEntries(fields.map((f) => [f.id, tidied[f.id] ?? ""])) : tidied;
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
    // Where each value came from goes with it: the spark follows every value Panki AI wrote (AI step 3).
    const sources = sourcesOf(
      fields.map((f) => f.id),
      filled,
    );
    if (asExample && target) {
      const example = NewCardExample.safeParse({ id: cardId, values: filled, sources, ...source });
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
    const card = NewCard.safeParse({ id: cardId, values: filled, sources, ...source });
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
    if (still || !(box instanceof HTMLTextAreaElement)) return;
    const all = wordsNow(sentence);
    const at = all.findIndex((token) => token.word && box.selectionStart >= token.start && box.selectionStart < token.end);
    if (at < 0) return;
    const span = pick(lit ? spanOver(all, lit.from, lit.to) : null, at);
    const from = all[span[0]]?.start ?? 0;
    setWord(textOf(all, span));
    setWordTyped(false);
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
      setMeaningText(null);
      setDictTyped({});
      setAiWrote((was) => aiLetGo(was, (_, wrote) => wrote.holder === "dict"));
    };
    return (
      <div className="field capture-dict">
        <div className="chips" role="group" aria-label="Which word">
          {found.map((f) => (
            <Button key={wordKey(f)} variant="chip" lang="ja" aria-pressed={chosen !== null && wordKey(f) === wordKey(chosen)} disabled={still} onClick={() => choose(wordKey(f))}>
              {f.reading && f.reading !== f.term ? `${f.term} · ${f.reading}` : f.term}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  /**
   * The word's meanings, when it has more than one, the Meaning holds words of its own, or Touch up proposed one: a
   * dropdown under the field they go in, worked out from the field every time and acting on nothing but it. A meaning
   * is ticked while its glosses all stand in the field, whole (`readMeaning`); ticking one adds its glosses at the end,
   * unticking it takes out exactly that run (`meaningTicked`, `meaningWithout`). Once Touch up has judged them, exactly
   * the pop-up's way: each a `JudgedRow` (lit in its judgement's look, good green, meh orange, bad red, its why under a
   * chevron, closed to begin with; unmarked when the Meaning came back as the error); then the meaning Panki AI proposed
   * as one more choice, numbered after the dictionary's, the spark where a meaning's dictionary is, green, ticking it
   * adding its words, the AI's, unticking taking them out; then each of the field's own runs of glosses as Custom
   * meaning 1 and on, ticked and not to be unticked here (they're the field's words), lit as Touch up judged them while
   * they're the words it was sent. How the verdict is seen; acting on it is the proposal under the field, as ever.
   */
  function meaningsBlock() {
    const part = touch.answer?.meaning;
    const judged = part && !isError(part) ? part : null;
    const judgedRows = judged?.meanings ?? [];
    const proposed = judged?.proposed ? { meaning: tidyMeaning(judged.proposed), reason: judged.why } : null;
    if (!meaningField || !chosen) return null;
    // The proposal is read as one more meaning of the list, so the field holding it ticks it rather than making it custom.
    const listed = proposed ? [...dictMeanings, proposed.meaning] : dictMeanings;
    const read = readMeaning(meaningNow, listed);
    if (dictMeanings.length < 2 && !proposed && read.custom.length === 0) return null;
    const field = meaningField;
    const rowOf = (n: number) => judgedRows.find((row) => row.meaning === n);
    const judgedOf = (n: number) => {
      const row = rowOf(n);
      return row ? { judged: { accuracy: LOOK_OF[row.judgement], reason: row.why } } : {};
    };
    // A custom meaning's judgement is the one Touch up gave the same words, by their place among those it was sent.
    const sentCustom = touch.answer ? customOf(touch.now, touch.meanings) : [];
    const judgedCustom = (words: string) => {
      const at = sentCustom.findIndex((sent) => bareOf(sent).bare === bareOf(words).bare);
      return at >= 0 ? judgedOf(touch.meanings.length + at + 1) : {};
    };
    const proposedId = dictMeanings.length;
    const proposedOn = proposed !== null && read.ticked.includes(proposedId + 1);
    const customIds = read.custom.map((_, i) => CUSTOM - i);
    const options = [
      // Each says which dictionary it's from, so it's plain where a card's meaning came from.
      ...chosen.senses.map((sense, i) => ({ id: i, label: `${i + 1}. ${dictMeanings[i] ?? ""}`, note: sense.dict, ...judgedOf(i + 1) })),
      ...(proposed
        ? [{ id: PROPOSED, label: `${proposedId + 1}. ${proposed.meaning}`, note: <AiSpark className="touch-up-mark" />, judged: { accuracy: "fits" as const, reason: proposed.reason } }]
        : []),
      ...read.custom.map((words, i) => ({ id: CUSTOM - i, label: `${TOUCH_UP_WORDS.customMeaning(i + 1)} · ${words}`, fixed: true, ...judgedCustom(words) })),
    ];
    const dictTicked = read.ticked.filter((n) => n <= dictMeanings.length);
    const summary = [
      ...(dictTicked.length > 0 || (!proposedOn && read.custom.length === 0) ? [meaningsSaid(dictTicked.length, dictMeanings.length)] : []),
      ...(proposedOn ? [TOUCH_UP_WORDS.meaningProposed] : []),
      ...(read.custom.length > 0 ? [count(read.custom.length, "custom meaning", "custom meanings")] : []),
    ].join(" · ");
    return (
      <Dropdown
        id="panki-meanings"
        label={field.name}
        wide
        disabled={still}
        options={options}
        values={[...dictTicked.map((n) => n - 1), ...(proposedOn ? [PROPOSED] : []), ...customIds]}
        summary={summary}
        onToggle={(i) => {
          if (i === PROPOSED) {
            if (proposedOn) setMeaning(meaningWithout(meaningNow, listed, (run) => run.kind === "dictionary" && run.number === proposedId + 1));
            else if (proposed) {
              writeAi(field, meaningTicked(meaningNow, listed, proposedId + 1), proposed.meaning);
              decide("meaning");
            }
            return;
          }
          if (i < 0) return;
          const number = i + 1;
          setMeaning(read.ticked.includes(number) ? meaningWithout(meaningNow, listed, (run) => run.kind === "dictionary" && run.number === number) : meaningTicked(meaningNow, listed, number));
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
        {tied(
          sentenceField,
          reworked(
            sentenceField?.id ?? null,
            <TextField
              id="panki-sentence"
              label={sentenceField ? (sentenceField.required ? sentenceField.name : `${sentenceField.name} · optional`) : "The line"}
              lead={sentenceField ? marksOf(sentenceField) : null}
              multiline
              readOnly={!sentenceField || still}
              lang={langOf(sentence)}
              autoComplete="off"
              value={sentence}
              // Typing in it locks it: what's typed stays, however the clip's ends are pulled.
              onChange={setWritten}
              mark={lit}
            />,
          ),
        )}
        {unmarkOffer(sentenceField)}
        {lockable ? (
          <div className="capture-tools">
            <Toggle
              id="panki-sentence-lock"
              className="capture-tool strip-switch"
              icon="lock"
              says={{ on: "Locked", off: "Unlocked" }}
              on={written !== null}
              disabled={still}
              onChange={(on) => {
                setWritten(on ? capture.sentence : null);
                // Unlocked, the clip's words are the sentence again, and what Panki AI wrote there is let go with what was typed.
                if (!on) setAiWrote((was) => aiLetGo(was, (_, wrote) => wrote.holder === "sentence"));
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /** A cut of the video: its bar with the two ends, playing it, and where it begins and ends, each to be typed over. */
  function cutBlock(what: Cut, offer: ClipOffer, name: string) {
    const off = busy || offer.end === null;
    /** The ends held as they are: Panki AI working on the card holds them too, though the cut can still be played. */
    const held = still || offer.end === null;
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
          disabled={held}
          anchor={offer.anchor}
          within={offer.within}
          onMove={offer.move}
          onSettle={offer.settle}
          onHear={offer.hear}
        />
        <div className="capture-times">
          <Button className="capture-play" disabled={off} onClick={offer.toggle}>
            <Icon name={offer.playing ? "pause" : "play"} />
            {offer.playing ? "Pause" : "Play"}
          </Button>
          {offer.end === null ? (
            // The video was let run (started, even, if it stood still) so the sentence is heard out: said, so it isn't taken for a fault.
            <span className="capture-waiting" role="status">
              <i className="live-dot" aria-hidden="true" />
              Letting the sentence finish. The video stops at its end.
            </span>
          ) : (
            <span className="capture-stamp">
              <Stamp id={`panki-${what}-start`} name="Where it starts" at={offer.start} disabled={still} onSet={set("start")} />
              to
              <Stamp id={`panki-${what}-end`} name="Where it ends" at={offer.end} disabled={still} onSet={set("end")} />
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
              disabled={still}
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
   * What stands in the drawer once the card is added: "Added to Mining", nothing more, and a recording that didn't make it, when one didn't.
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
              <Button onClick={() => setLeaving(true)}>
                <Icon name="close" />
                Close
              </Button>
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
                <Icon name="signIn" />
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
        <Dropdown id="panki-deck" label="Deck" options={state.decks.map((d) => ({ id: d.id, label: d.name }))} value={deck?.id ?? ""} placeholder="Choose a deck" disabled={still} onChange={choose} />
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
              <Icon name="settings" />
              Field mapping
            </Button>
          </div>
        </>
      );
    }
    const clipNames = namesOf("clip");
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
          disabled={still}
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
          {tied(
            field,
            reworked(
              field.id,
              <TextField
                id={`panki-field-${field.id}`}
                label={field.required ? field.name : `${field.name} · optional`}
                lead={marksOf(field)}
                multiline={FIELD_KINDS[field.kind].multiline}
                lang={langOf(value)}
                autoComplete="off"
                readOnly={still}
                value={value}
                onChange={(text) => {
                  if (isWord) {
                    setWord(text);
                    setWordTyped(true);
                  } else if (fromDict === "dictMeaning") setMeaningText(text);
                  else if (fromDict) setDictTyped((t) => ({ ...t, [field.id]: text }));
                  else setTyped((t) => ({ ...t, [field.id]: text }));
                  if (errors[field.id]) setErrors((e) => ({ ...e, [field.id]: "" }));
                }}
                error={errors[field.id] || (isWord && stray ? MESSAGES.stray : undefined)}
              />,
            ),
          )}
          {unmarkOffer(field)}
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
          pausedAt={cut.offer.pausedAt}
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
        {top(deck.name)}
        {/* The clip comes first of the card: it's what stands level with the video it's cut from. */}
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
            <span className="field-label">Card preview</span>
            <div className="capture-card-ground">
              <ReviewCard
                type={type}
                values={values}
                sources={sourcesOf(
                  type.fields.map((f) => f.id),
                  values,
                )}
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
      </Form>
    );
  }

  /**
   * The drawer's top, right under its head, never a long drawer's scroll away at its foot: Touch up with what it can cost under it, and Add; then
   * what's under way, what went wrong, leaving asking first, and Touch up's head once it has run, each opening under the
   * buttons and moving the card down rather than knocking it.
   */
  function top(deckName: string): ReactNode {
    const sending = phase.at === "recording" || phase.at === "sending";
    const share = phase.at === "recording" ? Math.min(1, phase.seconds / (phase.of ?? CLIP_MAX_SECONDS)) : phase.at === "sending" ? 1 : 0;
    return (
      <>
        <div className="capture-live capture-ends">
          {/* Touch up, for a deck with a field it can propose for, always in its place so the row keeps one shape:
              greyed once it has run, Touch up's head under the row taking over; before that, what it
              can cost or why it can't run right under it. */}
          {touchKeys.length > 0 ? (
            <div className="capture-touch">
              {/* Pressable again whenever it isn't thinking, to run Touch up again: a new call on the card as it stands now. */}
              {touchButton()}
              {touch.busy ? null : <TouchUpCost beside={touchBeside} />}
            </div>
          ) : null}
          <Button type="submit" variant="primary" className="capture-add" disabled={still || unresolved}>
            {phase.at === "done" ? <Icon name="check" /> : busy ? null : <Icon name="add" />}
            {phase.at === "done" ? "Added" : busy ? "Adding…" : asExample ? EXAMPLE_WORDS.go : `Add to ${deckName}`}
          </Button>
        </div>
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
        {/* Over the account's Ask before a run over, a run waits on its question here, where its head will be. */}
        <RunAsk id="panki-touch-up" asked={touchGate.at(RUN)} onCancel={touchGate.cancel} />
        {/* Touch up once it has run, under the buttons: its head, Accept all and Dismiss all (AI step 3), then its follow-ups (step 5). */}
        {touchKeys.length > 0 ? (
          <TouchUpBar
            calls={touch.calls}
            busy={still}
            canRun={canTouch}
            pending={pendingKeys.length}
            failure={touch.failure}
            burst={touch.calls.length - touch.runs}
            onRun={() => pressTouchUp(touch.template ?? touchPreferred, { kind: "retry" })}
            onAcceptAll={acceptAll}
            onDismissAll={dismissAll}
          >
            {followBlock(null)}
          </TouchUpBar>
        ) : null}
      </>
    );
  }

  const over = phase.at === "done";
  return (
    <Frame open={shown && !leaving} arrives={arrives} locked={working} onLeave={leave} onGone={onClose} frame={frame}>
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
