import { useEffect, useState } from "react";
import type { CardType, Deck, Settings, SrsType, Stats } from "@panki/contracts";
import { Board, type DoorSpec } from "../components/Board";
import { readLayout, writeLayout, type BoardLayout } from "../layout";
import type { WidgetContext } from "../widgets";
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
  onDecks: () => void;
  onAdd: () => void;
  onTypes: () => void;
  onSrs: () => void;
  /** What the header should offer right now, or nothing. */
  onTool: (tool: HomeTool | null) => void;
};

/** The hub: the five doors and the tiles this device was set up with, on one board, arranged by holding a tile. Everything but Settings and Stats is behind a door. */
export function HomeView({ decks, types, srsTypes, stats, settings, onReview, onStale, onDecks, onAdd, onTypes, onSrs, onTool }: Props) {
  const none = decks !== null && decks.length === 0;
  const due = decks?.reduce((sum, deck) => sum + deck.dueCount, 0) ?? 0;
  const fresh = decks?.reduce((sum, deck) => sum + deck.newCount, 0) ?? 0;
  // Null while what a door says is loading: the door draws its shape there.
  const reviewDetail = decks === null ? null : none ? "No decks yet" : due + fresh === 0 ? "Nothing due right now" : `${due} due · ${fresh} new`;
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

  // Arranging ends on purpose: the header carries Done for as long as it's on.
  useEffect(() => {
    onTool(arranging ? { id: "home-done", label: "Done", onPress: () => setArranging(false) } : null);
    return () => onTool(null);
  }, [arranging, onTool]);

  const ctx: WidgetContext | null = decks && srsTypes && settings ? { decks, srsTypes, settings, onReview, onStale } : null;
  // The Review door is the accent one only while there's something to do.
  const doors: DoorSpec[] = [
    { id: "door-review", icon: "review", label: "Review", detail: reviewDetail, hot: due + fresh > 0, onClick: onReview },
    { id: "door-decks", icon: "decks", label: "Decks", detail: decksDetail, onClick: onDecks },
    { id: "door-add", icon: "add", label: "Add a card", detail: addDetail, onClick: onAdd },
    { id: "door-types", icon: "type", label: "Card types", detail: typesDetail, onClick: onTypes },
    { id: "door-srs", icon: "srs", label: "SRS types", detail: srsDetail, onClick: onSrs },
  ];

  return <Board stats={stats} ctx={ctx} home={{ doors, layout, onLayout: changeLayout, arranging, onArranging: setArranging }} />;
}
