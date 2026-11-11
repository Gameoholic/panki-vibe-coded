import { useEffect, useState } from "react";
import { streakNameOf, type CardType, type Deck, type Settings, type SettingsUpdate, type SrsType, type Stats, type StreakState } from "@panki/contracts";
import { Board, type DoorSpec } from "../components/Board";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { fitStreaks, readLayout, writeLayout, type BoardLayout } from "../layout";
import { useHold } from "../hooks/useHold";
import { keysOf, pressedIn, useKeyBinds } from "../keys";
import { leftOf, reviewHelps, risksShown, type WidgetContext } from "../widgets";
import { count } from "../words";

/** What the header offers while on the home: Done, while the board is being arranged. */
export type HomeTool = { id: string; label: string; onPress: () => void };

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
 * The reminder at the top of the home: a line for each streak at risk, what's left of it and the hours left, never a
 * pop-up; Review beside them while a review would help one of them.
 */
function RiskNotice({ risks, onReview }: { risks: readonly StreakState[]; onReview: () => void }) {
  return (
    <section className="panel risk-notice" aria-label="Streaks at risk">
      <ul className="risk-lines">
        {risks.map((s) => (
          <li key={s.id}>
            <Icon name="flame" />
            <span>
              <b>{streakNameOf(s)}</b> at risk · {leftOf(s)} to go · {s.hoursLeft} h left
            </span>
          </li>
        ))}
      </ul>
      {risks.some(reviewHelps) ? (
        <Button id="risk-review" variant="primary" onClick={onReview}>
          <Icon name="review" />
          Review
        </Button>
      ) : null}
    </section>
  );
}

/** The hub: the five doors and the tiles this device was set up with, on one board, arranged by holding a tile. Everything but Settings and Stats is behind a door. */
export function HomeView({ decks, types, srsTypes, stats, settings, onReview, onStale, onSettings, onDecks, onAdd, onTypes, onSrs, onTool }: Props) {
  const none = decks !== null && decks.length === 0;
  const due = decks?.reduce((sum, deck) => sum + deck.dueCount, 0) ?? 0;
  const fresh = decks?.reduce((sum, deck) => sum + deck.newCount, 0) ?? 0;
  // Null while what a door says is loading: the door draws its shape there.
  const reviewDetail = decks === null ? null : none ? "No decks yet" : due + fresh === 0 ? "Nothing due right now" : `${due} due · ${fresh} new`;
  // Once today's limits are reached (the door no longer blue), what's still there past them, said small after the line.
  const newPast = decks?.reduce((sum, deck) => sum + deck.newAvailable - deck.newCount, 0) ?? 0;
  const duePast = decks?.reduce((sum, deck) => sum + deck.dueAvailable - deck.dueCount, 0) ?? 0;
  // Said as extra study, which is where they're had, so it's clear they're a part of it.
  const past = [newPast > 0 ? count(newPast, "new card", "new cards") : null, duePast > 0 ? count(duePast, "review", "reviews") : null].filter((p) => p !== null);
  const extraNote = due + fresh > 0 || past.length === 0 ? null : `${past.join(" and ")} available as extra study`;
  // A streak at risk that a review would help says so on the Review door, before anything else it would say.
  const risks = risksShown(stats, settings);
  const helped = risks.find(reviewHelps);
  const reviewNote = helped ? `${leftOf(helped)} to go for ${streakNameOf(helped)}` : extraNote;
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
    const next = fitStreaks(layout, streakIds.split("\n"));
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
    { id: "door-review", icon: "review", label: "Review", detail: reviewDetail, note: reviewNote, ...(helped ? { noteIcon: "flame" as const } : {}), hot: due + fresh > 0, bind: binds.homeReview, onClick: onReview },
    { id: "door-decks", icon: "decks", label: "Decks", detail: decksDetail, onClick: onDecks },
    { id: "door-add", icon: "add", label: "Add a card", detail: addDetail, onClick: onAdd },
    { id: "door-types", icon: "type", label: "Card types", detail: typesDetail, onClick: onTypes },
    { id: "door-srs", icon: "srs", label: "SRS types", detail: srsDetail, onClick: onSrs },
  ];

  return (
    <>
      {risks.length > 0 ? <RiskNotice risks={risks} onReview={onReview} /> : null}
      <Board stats={stats} ctx={ctx} home={{ doors, layout, onLayout: changeLayout, arranging, onArranging: setArranging }} />
    </>
  );
}
