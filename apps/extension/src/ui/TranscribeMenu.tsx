import { useEffect, useRef, useState } from "react";
import { Button } from "@web/components/Button";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { useDismiss } from "@web/hooks/useDismiss";
import { clock } from "@web/words";
import { parseStamp } from "../capture/words";
import type { TranscribeState, TranscribeStatus } from "../transcribe/transcriber";

/**
 * The strip's menu: everything about transcribing this video, in one place at the right of the head (the owner,
 * 2026-10-17, of the two bare buttons that stood there: "a little better and more polished"). How much of the video
 * is transcribed and how it stands; then what to do about it: start from here or stop, the whole video in the
 * background, a part of it typed as two times; Auto transcribe, whether it starts by itself (this viewer's own; the
 * one place it's switched since the options page lost its copy, 2026-10-17); and forgetting a part or the whole transcript, to start from scratch, which asks in place. The
 * panel stands under its button, closes on a press outside or Escape, and is this file's alone; what each item does
 * is the strip's (`content/youtube.tsx`).
 */

/** A stretch of the video, in seconds. */
export type Seconds = { start: number; end: number };

type Props = {
  state: TranscribeState;
  /** The video's length and where the viewer is, in seconds; null when the player doesn't say. */
  duration: number | null;
  at: number | null;
  onStart: () => void;
  onStop: () => void;
  onWhole: () => void;
  onStretch: (stretch: Seconds) => void;
  onForget: (stretch: Seconds | null) => void;
  /** Whether transcribing is to start by itself on every video played: this viewer's own. */
  onAuto: (on: boolean) => void;
};

/** A part to transcribe or forget starts as this much of the video from where the viewer is. Seconds. */
const PART_SECONDS = 300;

/** What the menu says when something's wrong. One home. */
const MESSAGES = {
  notATime: "Type a time like 12:34.",
  endsFirst: "The end comes before the start.",
  pastEnd: "That's past the end of the video.",
  forgetAll: "Forget everything transcribed of this video? Everyone loses it, and transcribing it again costs.",
};

/** What the strip says of transcribing, beside the name and in the menu; nothing while there's nothing to say. */
export function statusWords(status: TranscribeStatus): { words: string; live: boolean } | null {
  switch (status.kind) {
    case "loading":
      // A run begun, its silent player not up yet: "Preparing" (the owner's word, 2026-10-18).
      return { words: status.run ? "Preparing…" : "Loading…", live: true };
    case "running":
      return { words: `Transcribing · until ${clock(status.to)}`, live: true };
    case "held":
      return { words: `Transcribed until ${clock(status.to)}`, live: false };
    case "done":
      return { words: "Transcribed", live: false };
    case "noKey":
      return { words: "No key to transcribe with", live: false };
    case "blocked":
      return { words: "The browser stopped the silent player", live: false };
    case "failed":
      return { words: status.message, live: false };
    default:
      return null;
  }
}
/** What the item that starts it says: the way to start, or to start over what stopped it. */
export function startWords(status: TranscribeStatus): string {
  if (status.kind === "blocked" || status.kind === "failed") return "Try again";
  return "Transcribe";
}

/**
 * The button is the status (the owner, 2026-10-17: "whether it's transcribing, standing by on lead, turned off… the
 * button should lightly light in different colours based on status, maybe a small dot"): a word, and a look that
 * tints it and colours its dot. Going, in the accent with the dot breathing; ready (standing by at the lead, or the
 * whole video done) in the good colour; trouble in the danger colour; nothing going, plain.
 */
type Look = "loading" | "going" | "ready" | "quiet" | "trouble";
const LOOKS: Record<TranscribeStatus["kind"], { words: string; look: Look }> = {
  // The first moments of a video, before it can be said how it stands: plain, the dot breathing (the owner, 2026-10-18).
  loading: { words: "Loading", look: "loading" },
  running: { words: "Transcribing", look: "going" },
  held: { words: "Standing by", look: "ready" },
  done: { words: "Transcribed", look: "ready" },
  off: { words: "Not transcribing", look: "quiet" },
  noKey: { words: "No key", look: "trouble" },
  blocked: { words: "Blocked", look: "trouble" },
  failed: { words: "Failed", look: "trouble" },
  signedOut: { words: "Signed out", look: "trouble" },
};

/** How much of the video is transcribed: "6:15 of 17:25 transcribed", or that nothing is yet. */
function coveredWords(state: TranscribeState, duration: number | null): string {
  const ms = state.transcript?.covered.reduce((sum, stretch) => sum + (stretch.endMs - stretch.startMs), 0) ?? 0;
  if (ms <= 0) return "Nothing transcribed yet";
  const seconds = duration === null ? ms / 1000 : Math.min(ms / 1000, duration);
  return duration === null ? `${clock(seconds)} transcribed` : `${clock(seconds)} of ${clock(duration)} transcribed`;
}

/** Which question is open under the items, if any. */
type Asking = "part" | "forgetPart" | "forgetAll" | null;

export function TranscribeMenu({ state, duration, at, onStart, onStop, onWhole, onStretch, onForget, onAuto }: Props) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  // Closed, it forgets what it was asking.
  useEffect(() => {
    if (!open) setAsking(null);
  }, [open]);

  const status = statusWords(state.status);
  const chip = LOOKS[state.status.kind];
  const transcribing = state.status.kind === "running" || state.status.kind === "held" || (state.status.kind === "loading" && state.status.run);
  const canStart = state.key && state.status.kind !== "noKey" && state.status.kind !== "signedOut";
  const hasAny = (state.transcript?.covered.length ?? 0) > 0;
  const ask = (which: Asking) => setAsking(asking === which ? null : which);
  const done = (what: () => void) => {
    what();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button
        className={`capture-tool strip-menu-button is-${chip.look}`}
        aria-expanded={open}
        aria-controls="panki-transcribe-menu"
        aria-label={`Transcription: ${chip.words}`}
        onClick={() => setOpen((was) => !was)}
      >
        <i className="strip-menu-dot" aria-hidden="true" />
        {chip.words}
        <Icon name="down" />
      </Button>
      {open ? (
        <div id="panki-transcribe-menu" className="strip-menu" role="dialog" aria-label="Transcription">
          <p className="strip-menu-covered">{coveredWords(state, duration)}</p>
          {status ? (
            <p className="strip-menu-status" role="status">
              {status.live ? <i className="live-dot" aria-hidden="true" /> : null}
              {status.words}
            </p>
          ) : null}
          {canStart || transcribing ? (
            <div className="strip-menu-items">
              {transcribing ? (
                <Button variant="item" onClick={() => done(onStop)}>
                  Stop
                </Button>
              ) : state.status.kind !== "done" ? (
                <Button variant="item" onClick={() => done(onStart)}>
                  {startWords(state.status)} from here
                </Button>
              ) : null}
              {canStart ? (
                <>
                  <Button variant="item" disabled={state.status.kind === "done"} onClick={() => done(onWhole)}>
                    Transcribe the whole video
                  </Button>
                  <Button variant="item" aria-pressed={asking === "part"} onClick={() => ask("part")}>
                    Transcribe a part…
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {asking === "part" ? <StretchForm key="part" id="panki-part" at={at} duration={duration} action="Transcribe" onDone={(stretch) => done(() => onStretch(stretch))} /> : null}
          <div className="strip-menu-row">
            <span>Auto transcribe</span>
            <Toggle id="panki-transcribe-auto" says={{ on: "On", off: "Off" }} on={state.prefs.trigger === "auto"} onChange={onAuto} />
          </div>
          {hasAny ? (
            <div className="strip-menu-items">
              <Button variant="item" aria-pressed={asking === "forgetPart"} onClick={() => ask("forgetPart")}>
                Forget a part…
              </Button>
              <Button variant="item" className="is-danger" aria-pressed={asking === "forgetAll"} onClick={() => ask("forgetAll")}>
                Forget the whole transcript…
              </Button>
            </div>
          ) : null}
          {asking === "forgetPart" ? <StretchForm key="forget" id="panki-forget" at={at} duration={duration} action="Forget" danger onDone={(stretch) => done(() => onForget(stretch))} /> : null}
          {asking === "forgetAll" ? (
            <div className="strip-menu-ask">
              <p>{MESSAGES.forgetAll}</p>
              <div className="strip-menu-actions">
                <Button onClick={() => setAsking(null)}>Keep</Button>
                <Button variant="danger" onClick={() => done(() => onForget(null))}>
                  Forget
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type StretchProps = {
  id: string;
  at: number | null;
  duration: number | null;
  /** What the button says: Transcribe, or Forget. */
  action: string;
  danger?: boolean;
  onDone: (stretch: Seconds) => void;
};

/** From and to, typed as times of the video ("12:34", as `parseStamp` reads them), starting from where the viewer is and a few minutes on. */
function StretchForm({ id, at, duration, action, danger = false, onDone }: StretchProps) {
  const here = Math.max(0, Math.floor(at ?? 0));
  const [from, setFrom] = useState(clock(here));
  const [to, setTo] = useState(clock(Math.floor(duration === null ? here + PART_SECONDS : Math.min(duration, here + PART_SECONDS))));
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  function submit() {
    const start = parseStamp(from);
    const end = parseStamp(to);
    const next: { from?: string; to?: string } = {};
    if (start === null) next.from = MESSAGES.notATime;
    if (end === null) next.to = MESSAGES.notATime;
    else if (start !== null && end <= start) next.to = MESSAGES.endsFirst;
    else if (duration !== null && end > duration + 1) next.to = MESSAGES.pastEnd;
    setErrors(next);
    if (start === null || end === null || next.from || next.to) return;
    onDone({ start, end: duration === null ? end : Math.min(end, duration) });
  }
  return (
    <Form onSubmit={submit} className="strip-menu-form">
      <TextField id={`${id}-from`} label="From" value={from} onChange={setFrom} error={errors.from ?? undefined} />
      <TextField id={`${id}-to`} label="To" value={to} onChange={setTo} error={errors.to ?? undefined} />
      <Button type="submit" variant={danger ? "danger" : "primary"}>
        {action}
      </Button>
    </Form>
  );
}
