/** @panki Panki's pill in YouTube's header bar and its numbers (`PankiPill`, `pillNumbersOf`, `pillValue`, `SAMPLE_NUMBERS`, `SAMPLE_STREAK`). Never a second drawing of the pill. */
import { DEFAULT_STREAKS, STREAK_PERIODS, periodCountWords, streakNameOf, type Deck, type Settings, type Stats, type StreakPer } from "@panki/contracts";
import { Mark } from "@web/brand/Mark";
import { Button } from "@web/components/Button";
import { Icon, type IconName } from "@web/components/Icon";
import { Toggle } from "@web/components/Toggle";
import { count, durationWords } from "@web/words";
import type { PillLayout, PillPart } from "../modules";

/**
 * Panki's pill in YouTube's header bar, what's on it entirely the viewer's to pick: the mark, then each part picked, in the order picked,
 * as its icon and value, the whole of it opening Panki; and at its end, when it's picked, Panki's own on / off switch,
 * the one the strip under a video has. Drawn on YouTube's pages (`content/feed.tsx`) and on the options page's preview
 * of it, with made-up numbers there (`SAMPLE_NUMBERS`). Never a second drawing of the pill.
 */

/**
 * The streak the pill says: its name, its type, its run, whether this period counts already (the flame lit), and the
 * hours left while the streak reminder is on for it (null otherwise). A name of null is an older server's one streak,
 * which has none and counts days.
 */
export type PillStreak = { name: string | null; per: StreakPer; current: number; counted: boolean; hoursLeft: number | null };

/** The numbers the pill can say, from Panki's stats and decks; no streak while Streaks is off. */
export type PillNumbers = {
  watchedMs: number;
  due: number;
  reviews: number;
  reviewMs: number;
  streak: PillStreak | null;
};

/** The account's settings the pill reads. */
export type PillSettings = Pick<Settings, "streaksOn" | "pillStreak" | "reminderOnYouTube">;

/**
 * The streak picked for the pill (`pillStreak`, or the first when none is picked or the picked one is gone), as the pill
 * says it; none while Streaks is off or the account has no streak. Whether the reminder is on for it is the server's (`StreakState.atRisk`); whether
 * that shows is the options page's Streak reminder (`reminderOnYouTube`).
 */
function pillStreakOf(stats: Stats, settings: PillSettings): PillStreak | null {
  if (!settings.streaksOn) return null;
  const streak = stats.streaks.find((s) => s.id === settings.pillStreak) ?? stats.streaks[0];
  if (!streak) return null;
  return { name: streakNameOf(streak), per: streak.per, current: streak.current, counted: streak.now, hoursLeft: streak.atRisk && settings.reminderOnYouTube ? streak.hoursLeft : null };
}

/** What the account's stats, decks and settings come to for the pill: cards due counts what's new today too, as Review does. */
export function pillNumbersOf(stats: Stats, decks: readonly Deck[], settings: PillSettings): PillNumbers {
  const lastDay = stats.time.byDay.at(-1);
  return {
    watchedMs: stats.watching.today,
    due: decks.reduce((sum, d) => sum + d.dueCount + d.newCount, 0),
    reviews: stats.reviews.today,
    reviewMs: lastDay && lastDay.day === stats.today ? lastDay.ms : 0,
    streak: pillStreakOf(stats, settings),
  };
}

/** The made-up streak of the options page's previews: the one every account starts with, today counting. */
export const SAMPLE_STREAK: PillStreak = { name: streakNameOf(DEFAULT_STREAKS[0] ?? { name: "" }), per: "day", current: 7, counted: true, hoursLeft: null };
/** Numbers for the options page's preview: made up, none of the account's own. */
export const SAMPLE_NUMBERS: PillNumbers = { watchedMs: 23 * 60_000, due: 11, reviews: 42, reviewMs: 14 * 60_000, streak: SAMPLE_STREAK };

/** How a part stands: as it is, its streak not counting yet (its flame unlit), or tinted with the hours left while the streak reminder is on for it. */
type PartState = "plain" | "pending" | "risk";
type PartValue = { icon: IconName; words: string; said: string; left: string | null; state: PartState };

/**
 * Each part as the pill draws it: its icon, its words, and the same said in full for whoever can't see it; `left`, the
 * hours left after the number while the streak reminder is on for the part; `state`, how it's coloured.
 */
export function pillValue(part: PillPart, n: PillNumbers): PartValue | null {
  switch (part) {
    case "watched":
      return { icon: "watchTime", words: durationWords(n.watchedMs / 1000), said: `${durationWords(n.watchedMs / 1000)} watching today`, left: null, state: "plain" };
    case "due":
      return { icon: "review", words: `${n.due} due`, said: `${count(n.due, "card", "cards")} due`, left: null, state: "plain" };
    case "reviews":
      return { icon: "check", words: String(n.reviews), said: `${count(n.reviews, "review", "reviews")} today`, left: null, state: "plain" };
    case "reviewTime":
      return { icon: "reviewTime", words: durationWords(n.reviewMs / 1000), said: `${durationWords(n.reviewMs / 1000)} studying today`, left: null, state: "plain" };
    case "streak":
      return n.streak ? streakValue(n.streak) : null;
  }
}

/**
 * The streak's part: its run ("3 weeks" for a streak per week, the number alone per day), its flame unlit until this
 * period counts, and "· 3 h left" after it while the reminder is on for it; said with its name, and whether it counts
 * yet, as Panki's Today says it.
 */
function streakValue(s: PillStreak): PartValue {
  const run = periodCountWords(s.per, s.current);
  const hoursLeft = s.hoursLeft !== null ? `, ${s.hoursLeft} h left` : "";
  return {
    icon: "flame",
    words: STREAK_PERIODS[s.per].unitOnPill ? run : s.current.toLocaleString("en"),
    said: `${s.name ? `${s.name}, ${run}` : `${run} streak`}${s.counted ? "" : ", doesn't count yet"}${hoursLeft}`,
    left: s.hoursLeft !== null ? `· ${s.hoursLeft} h left` : null,
    state: s.hoursLeft !== null ? "risk" : s.counted ? "plain" : "pending",
  };
}

/**
 * The pill: the mark, then each shown part (none while `numbers` is null: Panki switched off, or not known yet), the
 * whole of it pressed for `onClick`; then `power`, Panki's on / off switch, when it's to be there. `update` puts a dot
 * on the mark while the extension has an update: the accent's while one is available, the flag's amber while one is
 * needed (`ui/UpdateNotice.tsx` says what it is). `profile` is what the profile in use is called, right after the mark:
 * always said while Panki is on and signed in, with no switch to hide it, so it's always plain
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
          <span key={p.id} className={`ym-part is-${p.id} ${p.state === "plain" ? "" : `is-${p.state}`}`.trim()}>
            <Icon name={p.icon} />
            {p.words}
            {p.left ? <span className="ym-part-left">{p.left}</span> : null}
          </span>
        ))}
      </Button>
      {power ? <Toggle id="ym-power" className="ym-power" icon="power" says={{ on: "On", off: "Off" }} on={power.on} onChange={power.onChange} /> : null}
    </span>
  );
}
