import { isHigh, moraeOf, pitchesOf } from "@panki/contracts";

/**
 * A pitch accent drawn over its reading: a line over the morae said high, and down its side where the voice falls.
 * A card's Pitch accent field, the extension's popup and its dictionaries' rows are all this; never a second drawing.
 */
export function PitchAccent({ reading, position, className = "" }: { reading: string; position: number; className?: string }) {
  return (
    <span className={`pitch-accent ${className}`.trim()} lang="ja">
      {moraeOf(reading).map((mora, i) => (
        <span key={i} className={`${isHigh(position, i) ? "is-high" : ""} ${i === position - 1 ? "is-fall" : ""}`.trim() || undefined}>
          {mora}
        </span>
      ))}
    </span>
  );
}

/**
 * A Pitch accent field's value drawn, each accent in it side by side; null when it says none that can be read, so it's
 * shown as it was typed.
 */
export function PitchAccents({ value }: { value: string }) {
  const accents = pitchesOf(value);
  if (accents.length === 0) return null;
  return (
    <span className="pitch-accents">
      {accents.map((accent, i) => (
        <PitchAccent key={i} reading={accent.reading} position={accent.position} />
      ))}
    </span>
  );
}
