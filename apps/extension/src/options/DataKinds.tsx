import { useRef, useState, type ReactNode } from "react";
import type { DataKind } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Tip } from "@web/components/Tip";
import { count, listWords } from "@web/words";
import { DATA_KINDS } from "../dataKinds";
import { PART_NAMES } from "../popupKinds";
import { DICTIONARY_ROLE, ROLES } from "../roles";

/** One kind of data on a line of them, with what's known of it where it's shown. */
export type KindItem = {
  kind: DataKind;
  /** How many of the dictionary's entries carry it, on a dictionary's row. */
  count?: number;
  /** How many entries it has in all, for a kind its entries may or may not carry; none for a list's own (a frequency, a pitch accent), which is all it holds. */
  of?: number;
  /** One word's, from that dictionary. */
  example?: ReactNode;
  /** The dictionaries it comes from; empty when none that's on provides it. */
  from?: readonly string[];
};

/** Half the hint's widest, so a hint for a chip at either end of the line stays over the line. */
const TIP_HALF = 120;

/** Where a kind goes, in the names it has there: the parts of the popup it's shown in, the card fields it can fill. */
function whereWords(kind: DataKind, ownName: string | undefined): string[] {
  const entry = DATA_KINDS[kind];
  const parts = [...entry.parts.map((part) => PART_NAMES[part]), ...(entry.ownPart ? [ownName ? `its own part, ${ownName}` : "a part of its own, under the dictionary's name"] : [])];
  // Every kind can fill a field: the field mapping offers each by its own name.
  return [...(parts.length > 0 ? [`In the popup: ${listWords(parts)}.`] : []), `Can fill: ${ROLES[DICTIONARY_ROLE[kind]].name}.`];
}

/**
 * How much of a dictionary carries a kind: of all its entries (a word with one reading is one entry), or a list's own
 * words. Said as a part of the whole, since a kind can be on only some entries (a noun has no word type).
 */
function amountWords(item: KindItem): string {
  if (item.count === undefined) return "";
  if (item.of === undefined) return ` · for ${count(item.count, "word", "words")}`;
  if (item.count >= item.of) return ` · in all ${count(item.of, "entry", "entries")}`;
  return ` · in ${item.count.toLocaleString("en")} of ${count(item.of, "entry", "entries")}`;
}

/** What a kind is and where it goes, in the hint and in the note alike. */
function Explained({ item, ownName }: { item: KindItem; ownName: string | undefined }) {
  const entry = DATA_KINDS[item.kind];
  return (
    <span className="kind-words">
      <strong>
        {entry.name}
        {amountWords(item)}
      </strong>
      <span>{entry.about}</span>
      {item.example ? <span>{item.example}</span> : null}
      {whereWords(item.kind, ownName).map((line) => (
        <span key={line}>{line}</span>
      ))}
      {item.from ? <span>{item.from.length > 0 ? `From ${listWords(item.from)}.` : "No dictionary that's on provides it."}</span> : null}
    </span>
  );
}

/**
 * A line of the kinds of data Panki reads from a dictionary (`dataKinds.ts`), after a word that says what the line is
 * ("Provides"). Each is pointed at for a hint, or pressed for the same words under the line (the way on a touch
 * screen too): what it is, one word's from the dictionary, where it goes in the popup and on a card, and where it
 * comes from. One that nothing provides is drawn faint. `ownName` is the dictionary's name, for its own part of the
 * popup. A dictionary's row, the top of the dictionaries and the popup's layout all draw this.
 */
export function KindChips({ label, items, ownName }: { label: string; items: readonly KindItem[]; ownName?: string }) {
  const [open, setOpen] = useState<DataKind | null>(null);
  const [pointed, setPointed] = useState<{ kind: DataKind; x: number; y: number } | null>(null);
  const line = useRef<HTMLDivElement>(null);

  function point(kind: DataKind, chip: HTMLElement) {
    const width = line.current?.clientWidth ?? 0;
    setPointed({ kind, x: Math.max(TIP_HALF, Math.min(chip.offsetLeft + chip.offsetWidth / 2, width - TIP_HALF)), y: chip.offsetTop });
  }
  const said = items.find((item) => item.kind === open);
  // The one open under the line says it already.
  const hinted = items.find((item) => item.kind === pointed?.kind && item.kind !== open);

  return (
    <div className="kind-line">
      <div ref={line} className="kind-chips">
        <span className="kind-label">{label}</span>
        {items.map((item) => (
          <Button
            key={item.kind}
            className={`look-tag kind-chip ${item.from?.length === 0 ? "is-missing" : ""}`.trim()}
            aria-expanded={open === item.kind}
            onClick={() => setOpen((was) => (was === item.kind ? null : item.kind))}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") point(item.kind, e.currentTarget);
            }}
            onPointerLeave={() => setPointed(null)}
            onFocus={(e) => point(item.kind, e.currentTarget)}
            onBlur={() => setPointed(null)}
          >
            {DATA_KINDS[item.kind].name}
          </Button>
        ))}
        {hinted && pointed ? (
          <Tip x={pointed.x} y={pointed.y}>
            <Explained item={hinted} ownName={ownName} />
          </Tip>
        ) : null}
      </div>
      {said ? (
        <p className="look-note kind-note">
          <Explained item={said} ownName={ownName} />
        </p>
      ) : null}
    </div>
  );
}
