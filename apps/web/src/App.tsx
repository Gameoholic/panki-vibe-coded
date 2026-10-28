import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  copySrsType,
  emptySrsType,
  exampleFieldsOf,
  type CalledCard,
  type Card,
  type CardAnswer,
  type CardExampleUpdate,
  type CardLayout,
  type StageTag,
  type CardType,
  type CardUpdate,
  type Deck,
  type DeckUpdate,
  type NewCard,
  type NewCardExample,
  type NewCardType,
  type NewDeck,
  type Settings,
  type SettingsUpdate,
  type Space,
  type SrsType,
  type SrsTypeUpdate,
  type Stats,
} from "@panki/contracts";
import { ApiError, api, type Me } from "./api";
import { Button } from "./components/Button";
import { Icon } from "./components/Icon";
import { Modal } from "./components/Modal";
import { Board } from "./components/Board";
import { Segmented } from "./components/Segmented";
import { Bone, Skeleton, type SkeletonShape } from "./components/Skeleton";
import { rememberShape, shapeOf } from "./skeletonMemory";
import { SpaceNotice } from "./components/SpaceNotice";
import { todayWords } from "./components/TodayBar";
import { count } from "./words";
import { ledger } from "./ledger";
import { applyTheme, readTheme } from "./themes";
import { SAVE_WORDS, type UnsavedGuard } from "./unsaved";
import { parsePath, routePath, type DeckTab, type Route, type TypeTab } from "./routes";
import { AddView } from "./views/AddView";
import { CardsView } from "./views/CardsView";
import { DeckSettingsView } from "./views/DeckSettingsView";
import { DecksView } from "./views/DecksView";
import { HomeView, type HomeTool } from "./views/HomeView";
import { LayoutView } from "./views/LayoutView";
import { LoginView } from "./views/LoginView";
import { ReviewPickView } from "./views/ReviewPickView";
import { ReviewView, type ReviewBegin } from "./views/ReviewView";
import { DEVICE_ZONE, SettingsView } from "./views/SettingsView";
import { SrsNewView } from "./views/SrsNewView";
import { SrsTypeView, type SaveStatus } from "./views/SrsTypeView";
import { SrsTypesView } from "./views/SrsTypesView";
import { StatsView } from "./views/StatsView";
import { TypesView } from "./views/TypesView";
import { TypeView } from "./views/TypeView";

/** Inside a deck: its cards, or its settings. */
const DECK_TABS: readonly { id: DeckTab; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "settings", label: "Settings" },
];
/** Inside a card type: its fields, or how its cards look. */
const TYPE_TABS: readonly { id: TypeTab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "layout", label: "Layout" },
];

/** Where you are. Home is the hub; everything but Settings and Stats is reached through it. */
type Screen =
  | { kind: "home" }
  | { kind: "decks" }
  /** `card`: the card open in the list, to change or delete; its address says so. */
  | { kind: "deck"; deck: Deck; tab: DeckTab; card?: string | undefined }
  | { kind: "pick" }
  /** `begin`: opened from the deck picker's Start or Show cards (not kept in the address). */
  | { kind: "review"; deck: Deck; from: "deck" | "pick"; begin?: ReviewBegin | undefined }
  | { kind: "add" }
  | { kind: "types" }
  | { kind: "type"; type: CardType | null; tab: TypeTab }
  | { kind: "srs" }
  | { kind: "srsNew" }
  | { kind: "srsEdit"; type: SrsType; isNew: boolean }
  | { kind: "settings" }
  | { kind: "stats" };

const HOME: Screen = { kind: "home" };

/** What each screen looks like while what it needs is loading (`Skeleton`): its own shape, never "Loading…" in words. */
const SKELETON_OF: Record<Screen["kind"], SkeletonShape> = {
  home: "board",
  decks: "rows",
  deck: "cards",
  pick: "picks",
  review: "review",
  add: "form",
  types: "rows",
  type: "editor",
  srs: "rows",
  srsNew: "rows",
  srsEdit: "editor",
  settings: "panels",
  stats: "board",
};
/** The most rows or tiles any skeleton draws: a screenful, not every card of a big deck. */
const SKELETON_ROWS_MAX = 12;

/** A screen's address: the same screen, by ids alone. */
function routeOf(screen: Screen): Route {
  switch (screen.kind) {
    case "deck":
      return { kind: "deck", id: screen.deck.id, tab: screen.tab, card: screen.card };
    case "review":
      return { kind: "review", id: screen.deck.id, from: screen.from };
    case "type":
      return { kind: "type", id: screen.type?.id ?? null, tab: screen.tab };
    case "srsEdit":
      return { kind: "srsEdit", id: screen.type.id };
    default:
      return screen;
  }
}
/** The lists a route's ids are looked up in; null while they load. */
type Lists = { decks: Deck[] | null; types: CardType[] | null; srsTypes: SrsType[] | null };
/**
 * The screen an address names, once what it names is loaded (null until then). A deck or a type that's gone lands on
 * the list it was in.
 */
function screenOf(route: Route, { decks, types, srsTypes }: Lists): Screen | null {
  switch (route.kind) {
    case "deck":
    case "review": {
      if (!decks) return null;
      const deck = decks.find((d) => d.id === route.id);
      if (!deck) return { kind: route.kind === "deck" || route.from === "deck" ? "decks" : "pick" };
      return route.kind === "deck" ? { kind: "deck", deck, tab: route.tab, card: route.card } : { kind: "review", deck, from: route.from };
    }
    case "type": {
      if (route.id === null) return { kind: "type", type: null, tab: "fields" };
      if (!types) return null;
      const type = types.find((t) => t.id === route.id);
      return type ? { kind: "type", type, tab: route.tab } : { kind: "types" };
    }
    case "srsEdit": {
      if (!srsTypes) return null;
      const type = srsTypes.find((t) => t.id === route.id);
      // One never saved has nothing behind its address: a reload or a way back to it lands on the list.
      return type ? { kind: "srsEdit", type, isNew: false } : { kind: "srs" };
    }
    default:
      return route;
  }
}

/** The fixed places in the bar. A new one is a row here, nowhere else. */
type TabId = "home" | "settings" | "stats";
const TABS: readonly { id: TabId; label: string; to: Screen }[] = [
  { id: "home", label: "Home", to: HOME },
  { id: "settings", label: "Settings", to: { kind: "settings" } },
  { id: "stats", label: "All Stats", to: { kind: "stats" } },
];
/** The tab a screen lights: its own for the fixed places, Home for everything behind the hub. */
function tabOf(screen: Screen): TabId {
  return screen.kind === "settings" || screen.kind === "stats" ? screen.kind : "home";
}

/** The screen's own header: where back goes, what it's called, what you can do here. The home has no title: only its action, when it has one. */
type Head = {
  back?: { label: string; to: Screen };
  title?: string;
  action?: ReactNode;
};

/** What the header says about the SRS type being edited. */

function messageOf(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}
/** A lost sign-in is handled once, by the sign-in screen; it is never a load error as well. */
const isSignedOut = (e: unknown) => e instanceof ApiError && e.status === 401;
/**
 * Panki not answering as the app opens (the server restarting after a deploy, the network gone) isn't being signed
 * out: it's said, and asked again this often until it answers. Until 2026-10-20 any failure showed the sign-in screen,
 * and a deploy looked like a lost sign-in (the owner: "why is it asking me to sign in again on prod?").
 */
const UNREACHED_RETRY_MS = 3000;
const UNREACHED = "Can't reach Panki right now. Trying again…";

export function App() {
  const [screen, setScreen] = useState<Screen>(HOME);
  /** Who is signed in; null before the answer and while signed out. `authKnown` says which. */
  const [me, setMe] = useState<Me | null>(null);
  const [authKnown, setAuthKnown] = useState(false);
  /** Panki didn't answer when asked who's signed in: it's being asked again. */
  const [unreached, setUnreached] = useState(false);
  /** The stats for every deck, for the home's tiles. */
  const [stats, setStats] = useState<Stats | null>(null);
  /** What's left on the disk Panki's data is on; the home says so while it's little. */
  const [space, setSpace] = useState<Space | null>(null);
  /** An address the browser landed on (a reload, back, forward) that hasn't been turned into its screen yet. */
  const [arriving, setArriving] = useState<Route | null>(() => {
    const route = parsePath(window.location.pathname);
    return route.kind === "home" ? null : route;
  });
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [types, setTypes] = useState<CardType[] | null>(null);
  const [srsTypes, setSrsTypes] = useState<SrsType[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // How many rows each list really drew, remembered so its skeleton fits exactly next time (`skeletonMemory.ts`).
  useEffect(() => {
    if (decks !== null) rememberShape("rows:decks", decks.length);
  }, [decks]);
  useEffect(() => {
    if (types !== null) rememberShape("rows:types", types.length);
  }, [types]);
  useEffect(() => {
    if (srsTypes !== null) rememberShape("rows:srs", srsTypes.length);
  }, [srsTypes]);
  // And each deck's: its cards, and what a review of it opens on — read back while an address is still arriving, when
  // only the deck's id is known.
  useEffect(() => {
    if (screen.kind !== "deck" && screen.kind !== "review") return;
    if (cards !== null) rememberShape(`cards:${screen.deck.id}`, cards.length);
    rememberShape(`due:${screen.deck.id}`, screen.deck.dueCount);
    rememberShape(`new:${screen.deck.id}`, screen.deck.newCount);
  }, [screen, cards]);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDeckId, setAddDeckId] = useState<string | null>(null);
  /** What the editor on screen says of itself (the SRS editor, a card type's layout): its name, and whether it's saved. */
  const [editStatus, setEditStatus] = useState<SaveStatus | null>(null);
  /** What the home's header offers right now (Done, Edit, the sections' ≡), when its board has something to end or open. */
  const [homeTool, setHomeTool] = useState<HomeTool | null>(null);
  /** The screen's unsaved work, when it has some: leaving asks before it's lost. */
  const guard = useRef<UnsavedGuard | null>(null);
  const setGuard = useCallback((next: UnsavedGuard | null) => {
    guard.current = next;
  }, []);
  /** Where the owner was going when unsaved work stopped them; the question is on screen while it's set. */
  const [leaving, setLeaving] = useState<Screen | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveFailure, setLeaveFailure] = useState<string | null>(null);
  const stay = useCallback(() => setLeaving(null), []);
  const fail = useCallback((e: unknown, fallback: string) => {
    if (!isSignedOut(e)) setLoadError(messageOf(e, fallback));
  }, []);

  /**
   * Signed out, by a sign-out here or by any call finding the sign-in gone: everything loaded is dropped, nothing
   * more is recorded, and the address stays as it is, so signing in again lands where the owner was going.
   */
  const signedOut = useCallback(() => {
    ledger.stop();
    setMe(null);
    setDecks(null);
    setTypes(null);
    setSrsTypes(null);
    setSettings(null);
    setCards(null);
    setStats(null);
    setSpace(null);
    setLoadError(null);
    setLeaving(null);
    guard.current = null;
    setArriving(parsePath(window.location.pathname));
  }, []);
  // Who is signed in, before anything else; a 401 here or anywhere later shows the sign-in screen. No answer at all is
  // said as such and asked again until there is one (`UNREACHED_RETRY_MS`).
  useEffect(() => {
    api.onSignedOut(signedOut);
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const ask = () => {
      api.me().then(
        (who) => {
          if (!alive) return;
          setUnreached(false);
          setMe(who);
          setAuthKnown(true);
        },
        (e: unknown) => {
          if (!alive) return;
          if (isSignedOut(e)) {
            setUnreached(false);
            setAuthKnown(true);
            return;
          }
          setUnreached(true);
          retry = setTimeout(ask, UNREACHED_RETRY_MS);
        },
      );
    };
    ask();
    return () => {
      alive = false;
      if (retry !== null) clearTimeout(retry);
      api.onSignedOut(null);
    };
  }, [signedOut]);
  // The ledger listens for the page being hidden or left for as long as the app is up.
  useEffect(() => ledger.install(), []);
  // The theme is already on the page from index.html; applying it again here is what keeps "Match the device"
  // following the device while the app is up.
  useEffect(() => applyTheme(readTheme()), []);
  // Sign-in confirmed: from here on what happens is recorded, starting with the app opening. The screen it opened on
  // is recorded here only when it's already settled; an address still arriving is recorded when `show` reaches it.
  const userId = me?.user.id ?? null;
  const pending = useRef(arriving);
  pending.current = arriving;
  useEffect(() => {
    if (userId === null) return;
    ledger.start();
    ledger.record("app-open");
    if (pending.current === null) ledger.record("screen", { path: window.location.pathname });
  }, [userId]);

  // Counts are derived on the server, so decks and types are fetched again whenever the screen changes.
  const loadLists = useCallback(() => {
    api
      .listDecks()
      .then(setDecks)
      .catch((e: unknown) => fail(e, "Couldn't load your decks."));
    api
      .listTypes()
      .then(setTypes)
      .catch((e: unknown) => fail(e, "Couldn't load your card types."));
    api
      .listSrs()
      .then(setSrsTypes)
      .catch((e: unknown) => fail(e, "Couldn't load your SRS types."));
    api
      .getSettings()
      // An account's zone is its own, the device's to begin with (the owner, 2026-10-21): the first time it's opened
      // with none, this device's is written, so its days turn over on its own clock from then on.
      .then((answer) => (answer.settings.timeZone === "" ? api.updateSettings({ timeZone: DEVICE_ZONE }) : answer))
      .then((answer) => setSettings(answer.settings))
      .catch((e: unknown) => fail(e, "Couldn't load your settings."));
  }, [fail]);

  useEffect(() => {
    if (userId === null) return;
    loadLists();
  }, [userId, screen.kind, loadLists]);

  /** Asks for the home's stats again without leaving it: a tile changed something they're made of (a video put away). */
  const [statsTurn, setStatsTurn] = useState(0);
  const refreshStats = useCallback(() => setStatsTurn((n) => n + 1), []);
  // The home's tiles: the stats for every deck, fetched again each time the home is shown; the last ones stay while they load.
  useEffect(() => {
    if (userId === null || screen.kind !== "home") return;
    let cancelled = false;
    api
      .stats(null)
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch((e: unknown) => fail(e, "Couldn't load your stats."));
    // Asked along with them. It's only ever a warning, so when it can't be had nothing is said: the home isn't
    // taken down for it.
    api
      .space()
      .then((next) => {
        if (!cancelled) setSpace(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, screen.kind, fail, statsTurn]);

  // The open deck's cards. Going from a deck to its review keeps them; any other deck starts from nothing.
  const deckId = screen.kind === "deck" || screen.kind === "review" ? screen.deck.id : null;
  useEffect(() => {
    setCards(null);
    if (!deckId || userId === null) return;
    let cancelled = false;
    api
      .listCards(deckId)
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) fail(e, "Couldn't load this deck.");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, userId, fail]);

  /** Shows a screen, closing whatever the last one had open. Its address is settled by then, and recorded. */
  function show(next: Screen) {
    setCreating(false);
    setAdding(false);
    setEditStatus(null);
    setScreen(next);
    ledger.record("screen", { path: window.location.pathname });
  }
  /**
   * Goes to a screen: a new entry in the browser's history, so back comes back here. A screen with unsaved work is
   * asked about first (`leaving`), unless the work is already dealt with (`sure`).
   */
  function go(next: Screen, sure = false) {
    if (guard.current && !sure) {
      setLeaveFailure(null);
      setLeaving(next);
      return;
    }
    guard.current = null;
    setLeaving(null);
    const path = routePath(routeOf(next));
    if (path !== window.location.pathname) window.history.pushState(null, "", path);
    setArriving(null);
    show(next);
  }
  /** Save and leave: only goes once the save has gone through. */
  async function saveAndLeave(next: Screen) {
    setLeaveBusy(true);
    const saved = (await guard.current?.save()) ?? true;
    setLeaveBusy(false);
    if (saved) go(next, true);
    else setLeaveFailure("It can't be saved as it stands. Stay and fix what's marked, or discard the changes.");
  }

  // Back and forward (the browser's buttons, a mouse's side buttons, a phone's back) change the address; the screen
  // follows. With unsaved work on screen the address is put back and the question asked instead.
  const here = useRef({ screen, lists: { decks, types, srsTypes } });
  here.current = { screen, lists: { decks, types, srsTypes } };
  useEffect(() => {
    const onPop = () => {
      const route = parsePath(window.location.pathname);
      if (!guard.current) {
        setArriving(route);
        return;
      }
      const next = screenOf(route, here.current.lists);
      window.history.pushState(null, "", routePath(routeOf(here.current.screen)));
      setLeaveFailure(null);
      setLeaving(next ?? HOME);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Before the browser paints, so a screen whose lists are already loaded never flashes "Loading…" on the way back to it.
  useLayoutEffect(() => {
    if (!arriving) return;
    const next = screenOf(arriving, { decks, types, srsTypes });
    if (!next) return;
    // What the address named is gone: the address becomes the screen shown instead.
    const path = routePath(routeOf(next));
    if (path !== window.location.pathname) window.history.replaceState(null, "", path);
    setArriving(null);
    show(next);
  }, [arriving, decks, types, srsTypes]);

  function openDeck(deck: Deck, tab: DeckTab = "cards") {
    go({ kind: "deck", deck, tab });
  }
  /**
   * A card of the deck on screen opened in its list, or closed (null). The address follows in place: back still leaves
   * the deck. The screen is read as it is now, not as it was when a save began: the deck may have been left meanwhile.
   */
  function setOpenCard(cardId: string | null) {
    const at = here.current.screen;
    if (at.kind !== "deck") return;
    const next: Screen = { ...at, card: cardId ?? undefined };
    window.history.replaceState(null, "", routePath(routeOf(next)));
    setScreen(next);
  }
  /** That card closed, when it's still the one open: saved, cancelled or deleted. */
  function closeCard(cardId: string) {
    const at = here.current.screen;
    if (at.kind === "deck" && at.card === cardId) setOpenCard(null);
  }
  /** A card called the same as one being added, opened where it is: in its deck's list, this deck's own when it's here. */
  function openCalled(card: CalledCard) {
    if (screen.kind === "deck" && screen.deck.id === card.deckId) {
      setOpenCard(card.cardId);
      return;
    }
    const deck = decks?.find((d) => d.id === card.deckId);
    if (deck) go({ kind: "deck", deck, tab: "cards", card: card.cardId });
  }

  /** From a screen that needs a deck when there is none: straight to the Decks screen with the form open. */
  function startDeck() {
    go({ kind: "decks" });
    setCreating(true);
  }

  /** The deck as the list has it now: its counts move with every answer. */
  function freshDeck(deck: Deck): Deck {
    return decks?.find((d) => d.id === deck.id) ?? deck;
  }
  function typeOf(deck: Deck): CardType | null {
    return types?.find((t) => t.id === deck.typeId) ?? null;
  }
  function srsOf(deck: Deck): SrsType | null {
    return srsTypes?.find((t) => t.id === deck.srsTypeId) ?? null;
  }

  async function addDeck(deck: NewDeck) {
    const saved = await api.addDeck(deck);
    setDecks((prev) => [...(prev ?? []), saved]);
    openDeck(saved);
  }

  async function updateDeck(deck: Deck, update: DeckUpdate): Promise<Deck> {
    const saved = await api.updateDeck(deck.id, update);
    setDecks((prev) => prev?.map((d) => (d.id === saved.id ? saved : d)) ?? null);
    setScreen({ kind: "deck", deck: saved, tab: "settings" });
    return saved;
  }

  async function removeDeck(deck: Deck) {
    await api.removeDeck(deck.id);
    setDecks((prev) => prev?.filter((d) => d.id !== deck.id) ?? null);
    go({ kind: "decks" });
  }

  /**
   * A card type's name and fields, saved, and the type stays open: the layout goes along as it is. A new one is made by
   * its first Save and becomes the type itself, at its own address, with its Layout tab.
   */
  const saveType = useCallback(async (data: NewCardType, isNew: boolean) => {
    if (!isNew) {
      // The layout and the stage tag are the Layout tab's to send; the main field is the Fields tab's.
      const saved = await api.updateType(data.id, { name: data.name, fields: data.fields, mainField: data.mainField ?? null });
      setTypes((prev) => prev?.map((t) => (t.id === saved.id ? saved : t)) ?? null);
      setScreen((s) => (s.kind === "type" && s.type?.id === saved.id ? { ...s, type: saved } : s));
      return saved;
    }
    const saved = await api.addType(data);
    setTypes((prev) => [...(prev ?? []).filter((t) => t.id !== saved.id), saved]);
    setScreen((s) => (s.kind === "type" && s.type === null ? { kind: "type", type: saved, tab: "fields" } : s));
    window.history.replaceState(null, "", routePath({ kind: "type", id: saved.id, tab: "fields" }));
    return saved;
  }, []);

  /** A card type's layout and stage tag, saved: the fields go along as they are, so only the layout (and the sides it gives them) and the tag change. */
  const saveLayout = useCallback(async (type: CardType, layout: CardLayout, tag: StageTag) => {
    const saved = await api.updateType(type.id, { name: type.name, fields: type.fields, layout, tag });
    setTypes((prev) => prev?.map((t) => (t.id === saved.id ? saved : t)) ?? null);
    setScreen((s) => (s.kind === "type" && s.type?.id === saved.id ? { ...s, type: saved } : s));
    return saved;
  }, []);

  async function removeType(type: CardType) {
    await api.removeType(type.id);
    // Deleted on purpose: what was changed in it but not saved goes with it, unasked.
    go({ kind: "types" }, true);
  }

  /** A new SRS type starts as a copy of another, or empty, on the screen only: nothing is sent until its first Save. */
  function startSrs(base: SrsType | null) {
    const mint = () => crypto.randomUUID();
    const type: SrsType = { ...(base ? copySrsType(base, mint) : emptySrsType(mint)), createdAt: Date.now(), deckCount: 0, cardCounts: {}, builtin: false };
    go({ kind: "srsEdit", type, isNew: true });
  }
  const saveSrs = useCallback(async (typeId: string, update: SrsTypeUpdate, isNew: boolean) => {
    if (!isNew) {
      const saved = await api.updateSrs(typeId, update);
      setSrsTypes((prev) => prev?.map((t) => (t.id === saved.id ? saved : t)) ?? null);
      return saved;
    }
    // The first Save makes it: a new type has no cards to move, so the moves stay behind.
    const { moves: _moves, ...made } = update;
    const saved = await api.addSrs({ id: typeId, ...made });
    setSrsTypes((prev) => [...(prev ?? []).filter((t) => t.id !== saved.id), saved]);
    setScreen((s) => (s.kind === "srsEdit" && s.type.id === saved.id ? { kind: "srsEdit", type: saved, isNew: false } : s));
    return saved;
  }, []);
  async function removeSrs(type: SrsType) {
    await api.removeSrs(type.id);
    setSrsTypes((prev) => prev?.filter((t) => t.id !== type.id) ?? null);
    go({ kind: "srs" }, true);
  }

  const updateSettings = useCallback(async (patch: SettingsUpdate) => {
    const answer = await api.updateSettings(patch);
    setSettings(answer.settings);
    return answer.settings;
  }, []);

  async function addCard(card: NewCard) {
    if (screen.kind !== "deck") return;
    const saved = await api.addCard(screen.deck.id, card);
    setCards((prev) => [saved, ...(prev ?? [])]);
    // The deck's counts (what a review would show) are the server's; a new card changes them.
    loadLists();
  }

  function addCardTo(toDeckId: string, card: NewCard) {
    return api.addCard(toDeckId, card);
  }

  async function saveCard(cardId: string, update: CardUpdate) {
    if (screen.kind !== "deck") return;
    const saved = await api.updateCard(screen.deck.id, cardId, update);
    setCards((prev) => prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null);
  }

  async function removeCard(cardId: string) {
    if (screen.kind !== "deck") return;
    await api.removeCard(screen.deck.id, cardId);
    setCards((prev) => prev?.filter((c) => c.id !== cardId) ?? null);
    closeCard(cardId);
    // The deck's counts are the server's; a card gone changes them.
    loadLists();
  }

  /** Another example for a card that's already there, in whichever deck it's in; this deck's list shows it at once when it's here. */
  async function addExample(to: CalledCard, example: NewCardExample) {
    const saved = await api.addExample(to.deckId, to.cardId, example);
    setCards((prev) => prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null);
    return saved;
  }

  async function saveExample(cardId: string, exampleId: string, update: CardExampleUpdate) {
    if (screen.kind !== "deck") return;
    const saved = await api.updateExample(screen.deck.id, cardId, exampleId, update);
    setCards((prev) => prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null);
  }

  async function removeExample(cardId: string, exampleId: string) {
    if (screen.kind !== "deck") return;
    await api.removeExample(screen.deck.id, cardId, exampleId);
    setCards((prev) => prev?.map((c) => (c.id === cardId ? { ...c, examples: c.examples.filter((e) => e.id !== exampleId) } : c)) ?? null);
  }

  async function liftHold(cardId: string) {
    if (screen.kind !== "deck") return;
    const saved = await api.liftHold(screen.deck.id, cardId);
    setCards((prev) => prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null);
    // A card back in reviews changes what a review would show.
    loadLists();
  }

  async function answerCard(deck: Deck, cardId: string, answer: CardAnswer) {
    const saved = await api.answerCard(deck.id, cardId, answer);
    setCards((prev) => prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null);
    return saved;
  }
  async function undoAnswer(deck: Deck, cardId: string, givenId: string) {
    const restored = await api.undoAnswer(deck.id, cardId, givenId);
    setCards((prev) => prev?.map((c) => (c.id === restored.id ? restored : c)) ?? null);
    return restored;
  }

  /** Into a review from outside a deck: straight into the one deck when there is only one, else the picker. */
  function reviewAny() {
    if (decks?.length === 1 && decks[0]) go({ kind: "review", deck: decks[0], from: "pick" });
    else go({ kind: "pick" });
  }
  function reviewFromStats(forDeckId: string | null) {
    const deck = forDeckId === null ? undefined : decks?.find((d) => d.id === forDeckId);
    if (deck) go({ kind: "review", deck, from: "pick" });
    else reviewAny();
  }

  function signIn(next: Me) {
    setMe(next);
    setLoadError(null);
  }
  /** One device signed out: this one shows the sign-in screen; another just leaves the list. */
  async function signOut(sessionId: string) {
    const session = me?.sessions.find((s) => s.id === sessionId);
    if (session?.current) {
      await api.logout();
      signedOut();
      return;
    }
    await api.removeSession(sessionId);
    setMe((prev) => (prev ? { ...prev, sessions: prev.sessions.filter((s) => s.id !== sessionId) } : prev));
  }
  async function signOutAll() {
    await api.removeAllSessions();
    signedOut();
  }
  /** The header's words on whether the editor on screen is saved, and its Save, which saves through its guard. */
  function saveAction(idPrefix: string) {
    const state = editStatus?.state ?? "saved";
    return (
      <>
        <span id={`${idPrefix}-saved`} className={`saved is-${state}`} data-state={state} role="status">
          <Icon name="check" />
          {SAVE_WORDS[state]}
        </span>
        <Button id={`${idPrefix}-save`} variant="primary" disabled={!editStatus?.canSave} onClick={() => void guard.current?.save()}>
          Save
        </Button>
      </>
    );
  }
  function headFor(at: Screen): Head | null {
    switch (at.kind) {
      case "home":
        return homeTool
          ? {
              action: (
                <Button id={homeTool.id} variant="primary" onClick={homeTool.onPress}>
                  {homeTool.label}
                </Button>
              ),
            }
          : null;
      case "decks":
        return {
          back: { label: "Home", to: HOME },
          title: "Decks",
          action: (
            <Button id="new-deck" variant="primary" onClick={() => setCreating(true)}>
              <Icon name="add" />
              New deck
            </Button>
          ),
        };
      case "deck":
        return { back: { label: "Decks", to: { kind: "decks" } }, title: at.deck.name };
      case "pick":
        return { back: { label: "Home", to: HOME }, title: "Review" };
      case "review":
        return {
          // From the home's Review door: back to the picker, or to the home when the one deck made the picker unnecessary.
          back: at.from === "deck" ? { label: "Cards", to: { kind: "deck", deck: at.deck, tab: "cards" } } : decks?.length === 1 ? { label: "Home", to: HOME } : { label: "Decks", to: { kind: "pick" } },
          title: at.deck.name,
        };
      case "add":
        return { back: { label: "Home", to: HOME }, title: "Add a card" };
      case "types":
        return {
          back: { label: "Home", to: HOME },
          title: "Card types",
          action: (
            <Button id="new-type" variant="primary" onClick={() => go({ kind: "type", type: null, tab: "fields" })}>
              <Icon name="add" />
              New type
            </Button>
          ),
        };
      case "type":
        return {
          back: { label: "Card types", to: { kind: "types" } },
          title: at.type ? at.type.name : "New card type",
          // Both tabs are saved on purpose, from up here, as the SRS editor is.
          action: at.type && at.tab === "layout" ? saveAction("layout") : saveAction("type"),
        };
      case "srs":
        return {
          back: { label: "Home", to: HOME },
          title: "SRS types",
          action: (
            <Button id="new-srs" variant="primary" onClick={() => go({ kind: "srsNew" })}>
              <Icon name="add" />
              New type
            </Button>
          ),
        };
      case "srsNew":
        return { back: { label: "SRS types", to: { kind: "srs" } }, title: "New SRS type" };
      case "srsEdit":
        return {
          back: { label: "SRS types", to: { kind: "srs" } },
          title: editStatus?.name ?? at.type.name,
          // One that comes with the app is only shown: there's nothing to save.
          action: at.type.builtin ? undefined : saveAction("srs"),
        };
      case "settings":
        return { title: "Settings" };
      case "stats":
        return { title: "All Stats" };
    }
  }

  /**
   * The screen as its shape while what it needs loads, fitting exactly what will stand there (the owner, 2026-10-26):
   * a list with as many rows as it really drew last time on this device (`skeletonMemory.ts`), a deck's cards as many
   * as it holds, a review what it opens on as its deck says (today's cards, as many as are due and new; the review
   * itself; or, with nothing to do, its end). While an address is still arriving only the route is known, so a deck's
   * shapes come from what this device remembers of it; a count nothing has said yet is a guess.
   */
  const rowsOf = (name: string, guess: number) => Math.min(shapeOf(name, guess), SKELETON_ROWS_MAX);
  function deckLoading(deckId: string, deck: Deck | null, tab: DeckTab): ReactNode {
    const body = tab === "settings" ? <Skeleton shape="panels" /> : <Skeleton shape="cards" count={Math.min(Math.max(deck ? deck.cardCount : shapeOf(`cards:${deckId}`, 5), 1), SKELETON_ROWS_MAX)} />;
    if (deck) return body;
    // Still arriving: the deck's own tabs and buttons aren't up yet, so their room is held too.
    return (
      <>
        <Bone h="44px" />
        <div className="deck-actions">
          <Bone h="46px" />
          <Bone h="46px" />
        </div>
        {body}
      </>
    );
  }
  function reviewLoading(deckId: string, deck: Deck | null, begin?: ReviewBegin): ReactNode {
    const due = deck ? deck.dueCount : shapeOf(`due:${deckId}`, 4);
    const fresh = deck ? deck.newCount : shapeOf(`new:${deckId}`, 3);
    // An arriving deck's settings aren't known yet: today first is how every deck begins.
    const todayFirst = begin === "cards" || (begin !== "start" && (deck ? deck.settings.todayFirst : true));
    // Nothing to review: its end, extra study's bar there as it was last time on this device.
    if (due + fresh === 0) {
      return <Skeleton shape="done" count={shapeOf(`extra:${deckId}`, 0)} available={shapeOf(`extra-all:${deckId}`, 0)} words={deck && deck.cardCount === 0 ? "Add a card" : "Home"} />;
    }
    // Today's cards open folded to their counts, but for Show cards on the deck picker, which opens them shown.
    const parts = begin === "cards" ? [due, fresh].filter((n) => n > 0).map((n) => Math.min(n, SKELETON_ROWS_MAX)) : [];
    if (todayFirst) return <Skeleton shape="today" parts={parts} firstReviews={due > 0} words={todayWords(due, fresh) ?? ""} start={`Start ${count(due + fresh, "card", "cards")}`} />;
    return <Skeleton shape="review" />;
  }
  function plainLoading(kind: Screen["kind"]): ReactNode {
    switch (kind) {
      case "decks":
        return <Skeleton shape="rows" count={rowsOf("rows:decks", 4)} />;
      case "pick":
        return <Skeleton shape="picks" count={rowsOf("rows:decks", 3)} />;
      case "types":
        return <Skeleton shape="rows" count={rowsOf("rows:types", 2)} />;
      case "srs":
      case "srsNew":
        return <Skeleton shape="rows" count={rowsOf("rows:srs", 4)} />;
      case "stats":
        // The real board's own shells: every widget's frame and title, each at the height this device remembers of it.
        return <Board stats={null} ctx={null} />;
      case "settings":
        return <Skeleton shape="panels" tabs />;
      default:
        return <Skeleton shape={SKELETON_OF[kind]} />;
    }
  }
  const loading =
    arriving !== null
      ? arriving.kind === "deck"
        ? deckLoading(arriving.id, null, arriving.tab)
        : arriving.kind === "review"
          ? reviewLoading(arriving.id, null)
          : plainLoading(arriving.kind)
      : screen.kind === "deck"
        ? deckLoading(screen.deck.id, screen.deck, screen.tab)
        : screen.kind === "review"
          ? reviewLoading(screen.deck.id, screen.deck, screen.begin)
          : plainLoading(screen.kind);
  let body: ReactNode;
  if (loadError) {
    body = (
      <p className="load-error" role="alert">
        {loadError}
      </p>
    );
  } else if (arriving) {
    body = loading;
  } else {
    switch (screen.kind) {
      case "home":
        body = (
          <>
            {space ? <SpaceNotice space={space} /> : null}
            <HomeView
              decks={decks}
              types={types}
              srsTypes={srsTypes}
              stats={stats}
              settings={settings}
              onReview={reviewAny}
              onStale={refreshStats}
              onDecks={() => go({ kind: "decks" })}
              onAdd={() => go({ kind: "add" })}
              onTypes={() => go({ kind: "types" })}
              onSrs={() => go({ kind: "srs" })}
              onTool={setHomeTool}
            />
          </>
        );
        break;
      case "decks":
        body =
          decks === null || types === null || srsTypes === null ? (
            loading
          ) : (
            <DecksView
              decks={decks}
              types={types}
              srsTypes={srsTypes}
              creating={creating}
              onOpen={openDeck}
              onSettings={(deck) => openDeck(deck, "settings")}
              onAdd={addDeck}
              onCancel={() => setCreating(false)}
            />
          );
        break;
      case "deck": {
        const deck = freshDeck(screen.deck);
        const type = typeOf(deck);
        const srsType = srsOf(deck);
        body = (
          <>
            <Segmented idPrefix="deck-tab" label="Deck" options={DECK_TABS} value={screen.tab} onChange={(tab) => go({ kind: "deck", deck, tab })} />
            {screen.tab === "cards" ? (
              <>
                <div className="deck-actions">
                  <Button id="add-card" onClick={() => setAdding(true)}>
                    <Icon name="add" />
                    Add card
                  </Button>
                  {/* The accent one only while there's something to do in this deck. */}
                  <Button id="nav-review" variant={deck.dueCount + deck.newCount > 0 ? "primary" : "ghost"} onClick={() => go({ kind: "review", deck, from: "deck" })}>
                    Review · {deck.dueCount + deck.newCount}
                  </Button>
                </div>
                {cards === null || types === null || srsTypes === null ? (
                  loading
                ) : type === null ? (
                  <p className="load-error" role="alert">
                    This deck's card type is missing.
                  </p>
                ) : (
                  <CardsView
                    key={deck.id}
                    deckId={deck.id}
                    cards={cards}
                    type={type}
                    srsType={srsType ?? undefined}
                    adding={adding}
                    openId={screen.card ?? null}
                    onOpen={setOpenCard}
                    onClose={closeCard}
                    onOpenCalled={openCalled}
                    onAdd={addCard}
                    onCancelAdd={() => setAdding(false)}
                    onSave={saveCard}
                    onRemove={removeCard}
                    onLift={liftHold}
                    onAddExample={addExample}
                    onSaveExample={saveExample}
                    onRemoveExample={removeExample}
                  />
                )}
              </>
            ) : srsTypes === null || types === null ? (
              loading
            ) : (
              <DeckSettingsView
                deck={deck}
                cardCount={cards?.length ?? deck.cardCount}
                cardTypeName={type?.name ?? "Missing"}
                takesExamples={type ? exampleFieldsOf(type).length > 0 : false}
                srsTypeName={srsType?.name ?? "Missing"}
                onOpenCardType={type ? () => go({ kind: "type", type, tab: "fields" }) : undefined}
                onOpenSrsType={srsType ? () => go({ kind: "srsEdit", type: srsType, isNew: false }) : undefined}
                key={deck.id}
                onRename={async (name) => void (await updateDeck(deck, { name }))}
                onChangeSettings={async (settings) => (await updateDeck(deck, { settings })).settings}
                onRemove={() => removeDeck(deck)}
              />
            )}
          </>
        );
        break;
      }
      case "pick":
        body = decks === null ? loading : <ReviewPickView decks={decks} onPick={(deck, begin) => go({ kind: "review", deck, from: "pick", begin })} onMakeDeck={startDeck} />;
        break;
      case "review": {
        const deck = freshDeck(screen.deck);
        const type = typeOf(deck);
        const srsType = srsOf(deck);
        body =
          cards === null || types === null || srsTypes === null || settings === null ? (
            loading
          ) : type === null ? (
            <p className="load-error" role="alert">
              This deck's card type is missing.
            </p>
          ) : srsType === null ? (
            <p className="load-error" role="alert">
              This deck's SRS type is missing.
            </p>
          ) : (
            <ReviewView
              key={deck.id}
              deck={deck}
              cards={cards}
              type={type}
              srsType={srsType}
              subtitleStyle={settings.subtitleStyle}
              begin={screen.begin}
              onAnswer={(cardId, answer) => answerCard(deck, cardId, answer)}
              onUndo={(cardId, givenId) => undoAnswer(deck, cardId, givenId)}
              onGoAdd={() => openDeck(deck)}
              onHome={() => go(HOME)}
            />
          );
        break;
      }
      case "add":
        body =
          decks === null || types === null ? (
            loading
          ) : (
            <AddView decks={decks} types={types} deckId={addDeckId ?? decks[0]?.id ?? null} onPick={setAddDeckId} onAdd={addCardTo} onOpenCalled={openCalled} onAddExample={addExample} onMakeDeck={startDeck} />
          );
        break;
      case "types":
        body = types === null ? loading : <TypesView types={types} onOpen={(type) => go({ kind: "type", type, tab: "fields" })} />;
        break;
      case "type": {
        const type = screen.type;
        // A type not made yet has only its fields: there's nothing to lay out until it exists.
        body = type ? (
          <>
            <Segmented idPrefix="type-tab" label="Card type" options={TYPE_TABS} value={screen.tab} onChange={(tab) => go({ kind: "type", type, tab })} />
            {screen.tab === "layout" ? (
              decks === null || srsTypes === null || settings === null ? (
                loading
              ) : (
                <LayoutView
                  key={type.id}
                  type={type}
                  decks={decks}
                  srsTypes={srsTypes}
                  onSave={(layout, tag) => saveLayout(type, layout, tag)}
                  onStatus={setEditStatus}
                  onGuard={setGuard}
                  subtitleStyle={settings.subtitleStyle}
                />
              )
            ) : (
              <TypeView key={type.id} type={type} onSave={saveType} onRemove={() => removeType(type)} onStatus={setEditStatus} onGuard={setGuard} />
            )}
          </>
        ) : (
          <TypeView key="new" type={null} onSave={saveType} onRemove={() => Promise.resolve()} onStatus={setEditStatus} onGuard={setGuard} />
        );
        break;
      }
      case "srs":
        body = srsTypes === null ? loading : <SrsTypesView types={srsTypes} onOpen={(type) => go({ kind: "srsEdit", type, isNew: false })} />;
        break;
      case "srsNew":
        body = srsTypes === null ? loading : <SrsNewView types={srsTypes} onPick={startSrs} />;
        break;
      case "srsEdit": {
        const type = screen.type;
        body = <SrsTypeView key={type.id} type={type} isNew={screen.isNew} onSave={saveSrs} onRemove={() => removeSrs(type)} onCopy={() => startSrs(type)} onStatus={setEditStatus} onGuard={setGuard} />;
        break;
      }
      case "settings":
        body =
          settings === null || me === null ? (
            loading
          ) : (
            <SettingsView settings={settings} onChange={updateSettings} me={me} onSignOut={signOut} onSignOutAll={signOutAll} />
          );
        break;
      case "stats":
        body = decks === null || srsTypes === null || settings === null ? loading : <StatsView decks={decks} srsTypes={srsTypes} settings={settings} onReview={reviewFromStats} />;
        break;
    }
  }

  const head = headFor(screen);
  const back = head?.back;
  const tab = tabOf(screen);
  // The SRS editor needs more room than a column (the preview sits beside it on a wide screen), and so does a card
  // type's layout (the card with its choices beside it); the home and Stats too, for a board three tiles across.
  // While an address is still arriving the frame already takes its screen's width, so nothing moves as it resolves.
  const kindNow = arriving?.kind ?? screen.kind;
  const layoutTab = arriving !== null ? (arriving.kind === "type" ? arriving.tab : null) : screen.kind === "type" ? screen.tab : null;
  const wide = kindNow === "srsEdit" || (kindNow === "type" && layoutTab === "layout") || kindNow === "home" || kindNow === "stats";
  // Before the sign-in is known, and while signed out, the bar is the brand alone: no tabs, no screen header. While
  // it's only not known yet, the tabs' room is held as their shape, so the bar doesn't grow the moment it is.
  const bare = me === null;
  const checking = bare && !authKnown && !unreached;
  // Only once it's known nobody is signed in does the frame narrow to the brand alone (`.is-bare` has no room for tabs).
  const bareLook = bare && !checking;

  return (
    <div className={`app ${kindNow === "home" ? "is-home" : ""} ${kindNow === "review" ? "is-review" : ""} ${wide ? "is-wide" : ""} ${bareLook ? "is-bare" : ""}`.replace(/\s+/g, " ").trim()}>
      <header className="brand">Panki</header>
      {bare && !checking ? null : (
        <nav className="tabs" aria-label="Sections">
          {checking
            ? TABS.map((t) => <Bone key={t.id} w="5.5em" h="2.4em" />)
            : TABS.map((t) => (
                <Button key={t.id} id={`tab-${t.id}`} variant="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.to)}>
                  <Icon name={t.id} />
                  <span>{t.label}</span>
                </Button>
              ))}
        </nav>
      )}
      {bare ? (
        <main className="main">
          {authKnown ? (
            <LoginView onSignedIn={signIn} />
          ) : unreached ? (
            <p className="load-error" role="alert">
              {UNREACHED}
            </p>
          ) : arriving !== null && arriving.kind !== "home" ? (
            // Who is signed in isn't known yet, but the address says where this is going: its shape already.
            loading
          ) : (
            <Skeleton shape="lines" />
          )}
        </main>
      ) : null}
      {head && !bare ? (
        <div className={`subhead ${head.title === undefined ? "is-action-only" : ""}`.trim()}>
          {back ? (
            <Button id="nav-back" className="btn-back" aria-label={back.label} onClick={() => go(back.to)}>
              <Icon name="back" />
              <span className="btn-back-label">{back.label}</span>
            </Button>
          ) : null}
          {head.title !== undefined ? (
            <h1 id="screen-title" className="subhead-title">
              {head.title}
            </h1>
          ) : null}
          {head.action}
        </div>
      ) : null}
      {/* An address still arriving: its screen's header isn't known yet, so its room is held as its shape. */}
      {!head && (checking || !bare) && arriving !== null && arriving.kind !== "home" ? (
        <div className="subhead">
          <Bone w="5.75em" h="42px" />
          <Bone w="8em" h="1.3em" />
        </div>
      ) : null}
      {bare ? null : <main className="main">{body}</main>}
      {leaving && !bare ? (
        <Modal labelledBy="leave-question" onClose={stay}>
          <p id="leave-question" className="question">
            Leave “{guard.current?.name || "this"}”? Its changes aren't saved.
          </p>
          {leaveFailure ? (
            <p className="load-error" role="alert">
              {leaveFailure}
            </p>
          ) : null}
          <div className="add-actions">
            <Button id="leave-stay" disabled={leaveBusy} onClick={stay}>
              Stay
            </Button>
            <Button id="leave-discard" variant="danger" disabled={leaveBusy} onClick={() => go(leaving, true)}>
              Discard changes
            </Button>
            <Button id="leave-save" variant="primary" disabled={leaveBusy} onClick={() => void saveAndLeave(leaving)}>
              {leaveBusy ? "Saving…" : "Save and leave"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
