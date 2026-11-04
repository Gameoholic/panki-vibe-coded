import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type ReactNode } from "react";

/** How long unfolding and folding away take, in ms. The one home: the styles are handed these, they don't repeat them. */
const IN_MS = 320;
const OUT_MS = 260;
/** If the browser never says an animation ended (a tab in the background, a place not on the page), it's taken as ended this much after it should have. */
const GRACE_MS = 150;

type Props = {
  open: boolean;
  /** Whether it unfolds when it's there open from the start. Off for something that takes the place of the same thing, which should simply be there. */
  arrives?: boolean;
  /** Told once it has folded away. */
  onGone?: () => void;
  className?: string;
  children: ReactNode;
};

/** Where it is: not shown, unfolding, open and at rest, folding away. */
type At = "away" | "in" | "still" | "out";

/**
 * Something that opens and closes by its height, fading as it goes, so that what stands around it is moved aside and
 * let back smoothly instead of jumping: the drawer as it arrives and leaves, the line that says a clip is being
 * recorded, the form giving way to "Added". What's in it stays in it while it folds away; nothing in a folded thing
 * can be pressed or tabbed to. Someone who asked their device for less motion gets it at once (the styles see to that).
 */
export function Fold({ open, arrives = true, onGone, className = "", children }: Props) {
  const [at, setAt] = useState<At>(open ? (arrives ? "in" : "still") : "away");
  if (open && (at === "away" || at === "out")) setAt("in");
  if (!open && (at === "in" || at === "still")) setAt("out");

  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  });
  /** An animation of its own has ended, or been given up on. */
  function ended(was: At) {
    if (was === "in") setAt((now) => (now === "in" ? "still" : now));
    if (was !== "out") return;
    setAt((now) => (now === "out" ? "away" : now));
    gone.current?.();
  }
  useEffect(() => {
    if (at !== "in" && at !== "out") return;
    const timer = setTimeout(() => ended(at), (at === "in" ? IN_MS : OUT_MS) + GRACE_MS);
    return () => clearTimeout(timer);
  }, [at]);
  function onAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    // One of its own, not one of something inside it: those are heard here too.
    if (e.target === e.currentTarget) ended(at);
  }

  const times = { "--fold-in": `${IN_MS}ms`, "--fold-out": `${OUT_MS}ms` } as CSSProperties;
  return (
    <div className={`fold is-${at} ${className}`.trim()} style={times} inert={at === "away" || at === "out"} onAnimationEnd={onAnimationEnd}>
      <div className="fold-body">{children}</div>
    </div>
  );
}
