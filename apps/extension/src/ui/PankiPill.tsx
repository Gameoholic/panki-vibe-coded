import type { Deck, Stats } from "@panki/contracts";
import { Mark } from "@web/brand/Mark";
import { Button } from "@web/components/Button";
import { Icon, type IconName } from "@web/components/Icon";
import { Toggle } from "@web/components/Toggle";
import { count, durationWords } from "@web/words";
import type { PillLayout, PillPart } from "../modules";

/**
 * Panki's pill in YouTube's header bar (the owner, 2026-10-21: "make it so I can completely customize this widget,
 * including what to put there (cards, review spending, etc.)"): the mark, then each part picked, in the order picked,
 * as its icon and value, the whole of it opening Panki; and at its end, when it's picked, Panki's own on / off switch,
 * the one the strip under a video has. Drawn on YouTube's pages (`content/feed.tsx`) and on the options page's preview
 * of it, with made-up numbers there (`SAMPLE_NUMBERS`). Never a second drawing of the pill.
 */

/** The numbers the pill can say, from Panki's stats and decks. */
export type PillNumbers = {
  /** Video tracking on: the minutes watched today counted; off, the part says nothing. */
  watching: boolean;
  watchedMs: number;
  due: number;
  reviews: number;
  reviewMs: number;
  streak: number;
};

/** What the account's stats and decks come to for the pill: cards due counts what's new today too, as Review does. */
export function pillNumbersOf(stats: Stats, decks: readonly Deck[]): PillNumbers {
  const lastDay = stats.time.byDay.at(-1);
  return {
    watching: stats.watching.on,
    watchedMs: stats.watching.today,
    due: decks.reduce((sum, d) => sum + d.dueCount + d.newCount, 0),
    reviews: stats.reviews.today,
    reviewMs: lastDay && lastDay.day === stats.today ? lastDay.ms : 0,
    streak: stats.streak.current,
  };
}

/** Numbers for the options page's preview: none of the owner's own. */
export const SAMPLE_NUMBERS: PillNumbers = { watching: true, watchedMs: 23 * 60_000, due: 11, reviews: 42, reviewMs: 14 * 60_000, streak: 7 };

/** Each part as the pill draws it: its icon, its words, and the same said in full for whoever can't see it. Null when it has nothing to say (watching with Video tracking off). */
export function pillValue(part: PillPart, n: PillNumbers): { icon: IconName; words: string; said: string } | null {
  switch (part) {
    case "watched":
      return n.watching ? { icon: "watchTime", words: durationWords(n.watchedMs / 1000), said: `${durationWords(n.watchedMs / 1000)} watched today` } : null;
    case "due":
      return { icon: "review", words: `${n.due} due`, said: `${count(n.due, "card", "cards")} due` };
    case "reviews":
      return { icon: "check", words: String(n.reviews), said: `${count(n.reviews, "review", "reviews")} today` };
    case "reviewTime":
      return { icon: "reviewTime", words: durationWords(n.reviewMs / 1000), said: `${durationWords(n.reviewMs / 1000)} reviewing today` };
    case "streak":
      return { icon: "flame", words: String(n.streak), said: `${count(n.streak, "day", "days")} review streak` };
  }
}

/**
 * The pill: the mark, then each shown part (none while `numbers` is null: Panki switched off, or not known yet), the
 * whole of it pressed for `onClick`; then `power`, Panki's on / off switch, when it's to be there. `update` puts a dot
 * on the mark while the extension has an update: the accent's while one is available, the flag's amber while one is
 * needed (`ui/UpdateNotice.tsx` says what it is). `profile` is what the profile in use is called, right after the mark:
 * always said while Panki is on and signed in, with no switch to hide it (the owner, 2026-10-22), so it's always plain
 * which Panki this is, the real one or the one for trying things.
 */
export function PankiPill({
  layout,
  numbers,
  onClick,
  profile = null,
  power = null,
  update = null,
}: {
  layout: PillLayout;
  numbers: PillNumbers | null;
  onClick: () => void;
  profile?: string | null;
  power?: { on: boolean; onChange: (on: boolean) => void } | null;
  update?: "available" | "needed" | null;
}) {
  const parts = numbers
    ? layout.flatMap((part) => {
        const value = part.shown ? pillValue(part.id, numbers) : null;
        return value ? [{ id: part.id, ...value }] : [];
      })
    : [];
  const said = update === "needed" ? "update needed" : update === "available" ? "update available" : null;
  return (
    <span className="ym-pill-wrap">
      <Button className="ym-pill" aria-label={["Panki", ...(profile ? [profile] : []), ...(said ? [said] : []), ...parts.map((p) => p.said)].join(", ")} onClick={onClick}>
        <Mark size={18} />
        {update ? <i className={`ym-update is-${update}`} aria-hidden="true" /> : null}
        {profile ? <span className="ym-profile">{profile}</span> : null}
        {parts.map((p) => (
          <span key={p.id} className={`ym-part is-${p.id}`}>
            <Icon name={p.icon} />
            {p.words}
          </span>
        ))}
      </Button>
      {power ? <Toggle id="ym-power" className="ym-power" says={{ on: "On", off: "Off" }} on={power.on} onChange={power.onChange} /> : null}
    </span>
  );
}
