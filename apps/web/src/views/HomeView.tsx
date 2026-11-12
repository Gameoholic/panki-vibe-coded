import { useEffect, useState } from "react";
import { countsLeft, timeLeftMs, type CardType, type Deck, type Settings, type SettingsUpdate, type SrsType, type Stats } from "@panki/contracts";
import { Board } from "../components/Board";
import type { DoorSpec } from "../components/Door";
import { timeWords } from "../components/TimeLeft";
import { fitStreaks, readLayout, writeLayout, type BoardLayout } from "../layout";
import { useHold } from "../hooks/useHold";
import { keysOf, pressedIn, useKeyBinds } from "../keys";
import type { WidgetContext } from "../widgets";
import { count } from "../words";

/** What the header offers while on the home: Done, while the board is being arranged. */
export type HomeTool = { id: string; label: string; onPress: () => void };

/**
 * Every deck's time, each from its counts at its pace as the deck list's Start works it out, added up; a deck whose
 * pace knows nothing yet adds nothing. Known only by the counts, each card is an average one of its deck's, so it can
 * be a minute off a deck's own Start, which knows its cards.
 */
function allDecksLeftMs(decks: readonly Deck[]): number | null {
  return decks.reduce<number | null>((sum, deck) => {
    const ms = timeLeftMs(countsLeft(deck.newCount, deck.dueCount), deck.pace);
    return ms === null ? sum : (sum ?? 0) + ms;
  }, null);
}

type Props = {
  /** `null` while still loading; the doors show without their details. */
  decks: Deck[] | null;
  types: CardType[] | null;
  srsTypes: SrsType[] | null;
  /** For every deck; `null` while loading, when the tiles show their shells. */
  stats: Stats | null;
  settings: Settings | null;
  onReview: () => void;
  /** The stats are asked for again: a tile changed what they're made of. */
  onStale: () => void;
  /** A change to the settings from a tile (a streak edited beside it), saved; the stats follow. */
  onSettings: (patch: SettingsUpdate) => Promise<Settings>;
  onDecks: () => void;
  onAdd: () => void;
  onTypes: () => void;
  onSrs: () => void;
  /** What the header should offer right now, or nothing. */
  onTool: (tool: HomeTool | null) => void;
};

/**
 * The hub: the doors (Review, Decks, Add a card, and Card types and SRS types in two rows) and the tiles this device was set up with, on one board, arranged by holding a tile.
 * Everything but Settings and Stats is behind a door. How today and the streaks stand is the Today tile's to say, nothing
 * over the board.
 */
export function HomeView({ decks, types, srsTypes, stats, settings, onReview, onStale, onSettings, onDecks, onAdd, onTypes, onSrs, onTool }: Props) {
  const none = decks !== null && decks.length === 0;
  const due = decks?.reduce((sum, deck) => sum + deck.dueCount, 0) ?? 0;
  const fresh = decks?.reduce((sum, deck) => sum + deck.newCount, 0) ?? 0;
  // Null while what a door says is loading: the door draws its shape there.
  // How long all of it takes, while there's something and Time left is shown (Settings → General → Reviews).
  const leftMs = decks === null || due + fresh === 0 || settings?.timeLeft === false ? null : allDecksLeftMs(decks);
  const time = leftMs !== null ? ` · ${timeWords(leftMs)}` : "";
  const reviewDetail = decks === null ? null : none ? "No decks yet" : `${due} due · ${fresh} new${time}`;
  // Once today's limits are reached (the door no longer blue), what's still there past them, said small after the line.
  const newPast = decks?.reduce((sum, deck) => sum + deck.newAvailable - deck.newCount, 0) ?? 0;
  const duePast = decks?.reduce((sum, deck) => sum + deck.dueAvailable - deck.dueCount, 0) ?? 0;
  // Said as extra study, which is where they're had, so it's clear they're a part of it.
  const past = [newPast > 0 ? count(newPast, "new card", "new cards") : null, duePast > 0 ? count(duePast, "review", "reviews") : null].filter((p) => p !== null);
  const reviewNote = due + fresh > 0 || past.length === 0 ? null : `${past.join(" and ")} available as extra study`;
  const decksDetail = decks === null ? null : none ? "None yet" : count(decks.length, "deck", "decks");
  const addDetail = none ? "Make a deck first" : "to any deck";
  const typesDetail = types === null ? null : types.length === 0 ? "None yet" : types.map((t) => t.name).join(", ");
  const srsDetail = srsTypes === null ? null : srsTypes.length === 0 ? "None yet" : srsTypes.map((t) => t.name).join(", ");

  const [layout, setLayout] = useState<BoardLayout>(readLayout);
  const [arranging, setArranging] = useState(false);
  function changeLayout(next: BoardLayout) {
    setLayout(next);
    writeLayout(next);
  }

  // Once the streaks are known, the board's streak tiles follow them: the Streak tile from before is the first one's,
  // a streak deleted takes its tile, a new one is put out once.
  const streakIds = settings?.streaks.map((s) => s.id).join("\n") ?? null;
  useEffect(() => {
    if (streakIds === null) return;
    // No streak at all is an empty list, never one streak with no id.
    const next = fitStreaks(layout, streakIds === "" ? [] : streakIds.split("\n"));
    if (next) changeLayout(next);
    // The layout is read as it stands when the streaks change; a change of the layout alone needs no fitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streakIds]);

  // The Review door's key (Settings → Keybinds, none to begin with), held as long as it's set to be. Its going down is
  // kept from the page, so a Space here never scrolls it; let go, it's kept from a focused button, which Firefox would press.
  const binds = useKeyBinds();
  const hold = useHold();
  useEffect(() => {
    const bind = binds.homeReview;
    if (keysOf(bind).every((own) => own.key === null) || arranging) return;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest("input, textarea, select") !== null);
    function onKey(e: KeyboardEvent) {
      const hit = pressedIn(e, bind);
      if (!hit || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) hold.begin(e, document.getElementById("door-review"), hit.holdMs, onReview);
    }
    function onUp(e: KeyboardEvent) {
      hold.release(e.key);
      if (pressedIn(e, bind) && !typing(e)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Arranging ends on purpose: the header carries Done for as long as it's on.
  useEffect(() => {
    onTool(arranging ? { id: "home-done", label: "Done", onPress: () => setArranging(false) } : null);
    return () => onTool(null);
  }, [arranging, onTool]);

  const ctx: WidgetContext | null = decks && srsTypes && settings ? { decks, srsTypes, settings, onStale, onSettings } : null;
  // The Review door is the accent one only while there's something to do.
  const doors: DoorSpec[] = [
    { id: "door-review", shape: "one", hot: due + fresh > 0, way: { icon: "review", label: "Review", detail: reviewDetail, note: reviewNote, bind: binds.homeReview, onClick: onReview } },
    { id: "door-decks", shape: "one", way: { icon: "decks", label: "Decks", detail: decksDetail, onClick: onDecks } },
    { id: "door-add", shape: "one", way: { icon: "add", label: "Add a card", detail: addDetail, onClick: onAdd } },
    {
      id: "door-types",
      shape: "rows",
      ways: [
        { icon: "type", label: "Card types", detail: typesDetail, count: types?.length, onClick: onTypes },
        { icon: "srs", label: "SRS types", detail: srsDetail, count: srsTypes?.length, onClick: onSrs },
      ],
    },
  ];

  return <Board stats={stats} ctx={ctx} home={{ doors, layout, onLayout: changeLayout, arranging, onArranging: setArranging }} />;
}
