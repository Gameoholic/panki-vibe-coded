import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ClockPiece } from "../components/KeyCap";
import { keyIn, type Bind } from "../keys";
import { TAP_MS, useHold } from "./useHold";

/**
 * One stage of a card on the Hold button: what the button says while it's next, how long it's held, and what it does
 * once it is. The answer's stage is drawn in the answer's colour (`tone`, its `answerClass`), the last `confirmMs` of it,
 * an answer that requires confirmation's extra hold, in the flag's amber.
 */
export type HoldStage = { label: string; ms: number; done: () => void; tone?: string | undefined; confirmMs?: number | undefined };

/** What the Hold button draws (`ShowButton.tsx` → `HoldButton`): its words, and how far along the card's stages it stands. */
export type HoldButtonView = {
  /** The next stage, and how long it's held. */
  label: string;
  ms: number | null;
  /** Its key, in the middle of the clock. */
  bind: Bind;
  /** The share of the card's stages already done, and of the one being held; the clock's stretches, and the answer's colour. */
  from: number;
  span: number;
  pieces: readonly ClockPiece[];
  tone: string | undefined;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLButtonElement>) => void;
};

type Options = {
  /** Every stage of the card from its start (Done listening, Show back of card, the deck's answer), and how many are done. */
  stages: readonly HoldStage[];
  at: number;
  /** What the button says with no stage left (the back of a card in a deck whose Hold button answers with None). */
  rest: string;
  /** Back to start: the card on its start again, nothing answered. */
  back: () => void;
  /** Which card is showing (a new showing ends a hold). */
  showing: string;
  bind: Bind;
  /** Where its hold is drawn now: the Hold button on screen. */
  where: () => HTMLElement | null;
};

/** Where in a turn each stage ends, by how long each is held (`ms`, in order), and what's done and being held at stage `at`. */
export function holdShares(ms: readonly number[], at: number): { from: number; span: number } {
  const total = ms.reduce((n, s) => n + s, 0);
  if (total === 0) return { from: at >= ms.length ? 1 : 0, span: 0 };
  const upTo = (i: number) => ms.slice(0, i).reduce((n, s) => n + s, 0);
  return { from: upTo(at) / total, span: (ms[at] ?? 0) / total };
}
/** The clock's stretches: each stage's share of the turn, an answer's confirmation a stretch of its own. The Hold button's explainer draws its clock by this too. */
export function clockPieces(stages: readonly Pick<HoldStage, "ms" | "tone" | "confirmMs">[]): ClockPiece[] {
  const total = stages.reduce((n, s) => n + s.ms, 0);
  if (total === 0) return [];
  return stages.flatMap((s): ClockPiece[] => {
    const tone = s.tone ? "answer" : "step";
    const confirm = Math.min(s.confirmMs ?? 0, s.ms);
    return confirm > 0
      ? [
          { share: (s.ms - confirm) / total, tone },
          { share: confirm / total, tone: "confirm" },
        ]
      : [{ share: s.ms / total, tone }];
  });
}

/**
 * The Hold button: one button whose
 * key or press, held, carries the card through every stage without letting go, each stage held for its own time
 * (`useHold`, so it's drawn and let go as every hold is). Let go, the card stays at the stage it reached, and a new hold
 * goes on from there; a tap of the button takes the card back to its start (Back to start, which has its own key in the
 * review: `keys.ts` → `holdReset`). Its key is heard by whoever has the keys (`keyDown`, `keyUp`: the review); the
 * button's own presses are the view's. The review and the Layout tab are both this.
 */
export function useHoldButton({ stages, at, rest, back, showing, bind, where }: Options) {
  const hold = useHold();
  /** What's held now: the key or the pointer, when it went down, and whether a stage was done on it. Spent, it does nothing more until let go. */
  const held = useRef<{ by: string; at: number; moved: boolean; spent: boolean } | null>(null);
  const now = useRef({ stages, at });
  now.current = { stages, at };

  /** Holds the next stage on what's held, the first of a hold waiting out a tap first. */
  function go(first: boolean) {
    const h = held.current;
    const { stages, at } = now.current;
    const stage = stages[at];
    if (!h || h.spent || !stage) return;
    hold.begin(
      h.by,
      where(),
      stage.ms,
      () => {
        h.moved = true;
        if (at + 1 >= stages.length) h.spent = true;
        stage.done();
      },
      first,
    );
  }
  /**
   * The card moved on while it's held (a stage done, or by something else: its clip ending its Listen phase): the next
   * stage goes on from there as soon as it's drawn. Another card showing ends the hold.
   */
  const shownNow = useRef(showing);
  useEffect(() => {
    const h = held.current;
    if (shownNow.current !== showing) {
      shownNow.current = showing;
      if (h) h.spent = true;
      hold.release();
      return;
    }
    if (!h || h.spent) return;
    hold.release();
    go(false);
  }, [at, showing]); // eslint-disable-line react-hooks/exhaustive-deps -- `go` and `hold` read refs
  useEffect(() => {
    const away = () => (held.current = null);
    window.addEventListener("blur", away);
    return () => window.removeEventListener("blur", away);
  }, []);

  function down(by: string) {
    held.current = { by, at: performance.now(), moved: false, spent: false };
    go(true);
  }
  /** Let go: what was held eases back; a tap, let go before anything was done, is `tap`'s (the button's: Back to start). */
  function up(by: string, tap?: () => void) {
    const h = held.current;
    if (!h || h.by !== by) return;
    held.current = null;
    hold.release(by);
    if (tap && !h.moved && !h.spent && performance.now() - h.at < TAP_MS) tap();
  }

  /** A key going down: whether it's the Hold button's (the caller then keeps it from the page). */
  function keyDown(e: KeyboardEvent, key: string): boolean {
    if (!keyIn(bind, key)) return false;
    if (!e.repeat) down(e.key);
    return true;
  }
  function keyUp(e: KeyboardEvent) {
    up(e.key);
  }

  const next = stages[at];
  const view: HoldButtonView = {
    label: next?.label ?? rest,
    ms: next ? next.ms : null,
    bind,
    ...holdShares(
      stages.map((s) => s.ms),
      at,
    ),
    pieces: clockPieces(stages),
    tone: stages.find((s) => s.tone)?.tone,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      down("pointer");
    },
    // A tap is Back to start; with no stage left to hold, so is a press of any length.
    onPointerUp: () => {
      if (stages[at]) up("pointer", back);
      else if (held.current?.by === "pointer") {
        held.current = null;
        back();
      }
    },
    onPointerCancel: () => {
      held.current = null;
      hold.release("pointer");
    },
    // Pressed from the keyboard (Enter on it with the focus), the next stage at once.
    onClick: (e) => {
      if (e.detail !== 0) return;
      const stage = now.current.stages[now.current.at];
      if (stage) stage.done();
      else back();
    },
    // A finger held on it is a hold, never the phone's menu.
    onContextMenu: (e) => e.preventDefault(),
  };
  return { view, keyDown, keyUp };
}
