/** @panki How saving what's watched stands, an icon in the Panki panel's head, its words in a tip (`SavingMark`). */
import { useEffect, useRef, useState } from "react";
import { Button } from "@web/components/Button";
import { Icon, type IconName } from "@web/components/Icon";
import { Tip } from "@web/components/Tip";
import { useDismiss } from "@web/hooks/useDismiss";
import { durationWords, hourWords } from "@web/words";
import type { Saving } from "../watch/watcher";

/** How long a batch must be on its way before the head says Sending: most land at once, and a flicker every 30 s would only stir the eye. */
const SENDING_SHOWN_MS = 600;

type Shown = Exclude<Saving["state"], "idle">;
/** Each state as the head draws it: its icon, and its tone (`.saving-mark.is-*`). */
const LOOKS: Record<Shown, { icon: IconName; tone: string }> = {
  saved: { icon: "cloudSaved", tone: "is-saved" },
  sending: { icon: "cloudSending", tone: "is-sending" },
  waiting: { icon: "cloudOff", tone: "is-waiting" },
  lost: { icon: "cloudLost", tone: "is-lost" },
};

/** A length of watching in words: seconds under a minute ("45 s"), the app's minutes and hours after ("2 min"). */
const spanWords = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : durationWords(ms / 1000));
/** "Saved 12 s ago", "Saved just now". */
const savedWords = (at: number, now: number) => (now - at < 5_000 ? "Saved just now" : `Saved ${spanWords(now - at)} ago`);

/** What the tip says, a line each: what the icon means now, then what's waiting or gone and since when. */
function wordsOf(saving: Saving, state: Shown, now: number): { lines: string[]; loss: string | null } {
  if (state === "lost") {
    return { lines: [`Video tracking · ${spanWords(saving.lostMs)} not saved`, saving.savedAt !== null ? `Panki couldn't be reached. ${savedWords(saving.savedAt, now)}` : "Panki couldn't be reached"], loss: null };
  }
  if (state === "waiting") {
    const since = saving.waitingSince === null ? "" : `, since ${hourWords(saving.waitingSince)}`;
    return { lines: ["Video tracking · Can't reach Panki", `${spanWords(saving.waitingMs)} watched waiting${since}`], loss: "Closing this tab loses it" };
  }
  if (state === "sending") return { lines: ["Video tracking · Sending…"], loss: null };
  return { lines: [`Video tracking · ${saving.savedAt === null ? "Saved" : savedWords(saving.savedAt, now)}`], loss: null };
}

/**
 * How saving what's watched here stands, among the Panki panel's head: only an icon in its state's colour (a cloud
 * ticked in the good colour, an arrow up in the accent, struck through in `--risk` while Panki can't be reached, a !
 * in `--danger` once some gave way), never words in the head. Its words (how long ago, how much waits and since when,
 * what was lost) are the app's `Tip` under it while a mouse rests on it or it has the keyboard's focus, and the same
 * tip on a press with a finger, closed by a press outside or Esc. Shown while the video is noted, or while something
 * still waits or gave way (`watch/watcher.ts` → `Saving`).
 */
export function SavingMark({ saving }: { saving: Saving }) {
  const [over, setOver] = useState<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [slow, setSlow] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const fingered = useRef(false);
  useDismiss(root, pressed, () => setPressed(false));

  // Sending is said only once a batch has been on its way a while; before that the head keeps what it said.
  const [held, setHeld] = useState<Shown | null>(null);
  useEffect(() => {
    if (saving.state !== "sending") {
      setSlow(false);
      if (saving.state !== "idle") setHeld(saving.state);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SENDING_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [saving.state]);

  // The words tell the time as they stand, so the clock moves while they're shown.
  const open = over !== null || pressed;
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const state: Shown | null = saving.state === "sending" ? (slow ? "sending" : held) : saving.state === "idle" ? null : saving.state;
  if (state === null || (!saving.noting && state !== "waiting" && state !== "lost")) return null;
  const look = LOOKS[state];
  const words = wordsOf(saving, state, now);
  // Under it, since the head stands at the top of the panel, where a tip over it is cut off (`Tip`'s `below`).
  const under = (el: HTMLElement) => ({ x: el.offsetWidth / 2, y: el.offsetHeight });
  const tipAt = over ?? (pressed && root.current ? under(root.current) : null);
  return (
    <span ref={root} className={`saving-mark ${look.tone}${pressed ? " is-pressed" : ""}`}>
      <Button
        className="saving-mark-button"
        aria-label={[...words.lines, words.loss].filter(Boolean).join(". ")}
        aria-expanded={pressed}
        onPointerDown={(e) => {
          fingered.current = e.pointerType !== "mouse";
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOver(under(e.currentTarget));
        }}
        onPointerLeave={() => setOver(null)}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setOver(under(e.currentTarget));
        }}
        onBlur={() => setOver(null)}
        onClick={() => {
          // A mouse has the tip already; a finger, which has no hover, opens and closes it with a press.
          if (fingered.current) setPressed(!pressed);
        }}
      >
        <Icon name={look.icon} />
      </Button>
      {tipAt ? (
        <Tip x={tipAt.x} y={tipAt.y} below>
          <span className="saving-tip">
            {words.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {words.loss ? <span className="saving-tip-loss">{words.loss}</span> : null}
          </span>
        </Tip>
      ) : null}
    </span>
  );
}
