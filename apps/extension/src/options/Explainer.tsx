import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@web/components/Button";
import { KeyCap } from "@web/components/KeyCap";
import { useDismiss } from "@web/hooks/useDismiss";

/**
 * What a panel's feature is, shown rather than said (the owner, 2026-10-28: "a picture is worth 100 words"): a (?)
 * beside the panel's title opens a window, under it, playing the feature being used on a page as it would really be,
 * round and round, Panki's own components doing it. Pointed at it opens; let go of, it closes; a click keeps it open
 * until a press elsewhere or Escape. What each panel plays is `explainerScenes.tsx`.
 */

/** The page a picture is drawn on, at a real page's size: a scene lays itself out in these pixels, Panki's components at their own size, and the whole is scaled to the window. */
export const CANVAS = { width: 1100, height: 620 };
/** How far the camera moves in on what's being done: a little, so the page still reads whole (the owner, 2026-10-28: "quite subtle and smooth, not too much"). */
const CAMERA_ZOOM = 1.08;
/** The rest between one round of a picture and the next. */
const LOOP_REST_MS = 1800;
/** How long the window waits, once the pointer has left the (?) and the window, before it closes: time to cross the gap between them. */
const CLOSE_AFTER_MS = 180;

/** The browser a picture's page is in: what its tab says, its icon, its address. */
export type Site = { tab: string; url: string; icon: "news" | "video" };
/** A place on the page, as shares of its width and height (0 to 100). */
export type Spot = { left: number; top: number; right: number; bottom: number };
type Point = readonly [x: number, y: number];

class Stopped extends Error {}

/** What a scene's script does with the page: wait, move the pointer (and the camera with it), click, hold a key and let it go. */
export type Tools = {
  wait: (ms: number) => Promise<void>;
  /** The pointer to something on the page (its middle), or to a point of it; then a wait. */
  move: (to: Element | null | Point, ms?: number) => Promise<void>;
  click: () => Promise<void>;
  hold: (key: string) => void;
  letGo: (key: string) => void;
  /** Where something stands on the page, for placing what a scene draws by it (the pop-up under a word). */
  spot: (el: Element | null) => Spot | null;
  /** Whether the picture holds still (the system's reduced motion): the script runs through once, to its last frame. */
  still: boolean;
};

const START: Point = [88, 88];
const isPoint = (to: Element | null | Point): to is Point => Array.isArray(to);

/**
 * A page in a browser window, with a pointer on it and the keys being held beside it, its script played round and
 * round while it's shown. The page is drawn at `CANVAS`'s size and scaled to the window; the camera leans in on the
 * pointer, a little.
 */
export function Stage({ site, script, children }: { site: Site; script: (t: Tools) => Promise<void>; children: ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.6);
  const [pointer, setPointer] = useState<{ at: Point; down: boolean }>({ at: START, down: false });
  const [camera, setCamera] = useState<Point | null>(null);
  const [keys, setKeys] = useState<readonly { name: string; down: boolean }[]>([]);
  const [ripple, setRipple] = useState<{ id: number; at: Point } | null>(null);
  /** Where the pointer is, for a click to ripple from. */
  const where = useRef<Point>(START);
  const latest = useRef(script);
  latest.current = script;

  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    const measure = () => setFit(el.clientWidth / CANVAS.width);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = (ms: number) =>
      still ? (alive ? Promise.resolve() : Promise.reject(new Stopped())) : new Promise<void>((done, fail) => setTimeout(() => (alive ? done() : fail(new Stopped())), ms));
    const spot = (el: Element | null): Spot | null => {
      const ground = page.current?.getBoundingClientRect();
      const box = el?.getBoundingClientRect();
      if (!ground || !box || ground.width === 0) return null;
      const x = (v: number) => ((v - ground.left) / ground.width) * 100;
      const y = (v: number) => ((v - ground.top) / ground.height) * 100;
      return { left: x(box.left), top: y(box.top), right: x(box.right), bottom: y(box.bottom) };
    };
    let rippled = 0;
    const tools: Tools = {
      still,
      wait,
      spot,
      async move(to, ms = 750) {
        let at: Point | null = null;
        if (isPoint(to)) at = to;
        else {
          const s = spot(to);
          if (s) at = [(s.left + s.right) / 2, s.top + (s.bottom - s.top) * 0.55];
        }
        if (at) {
          const point = at;
          where.current = point;
          setPointer((p) => ({ ...p, at: point }));
          setCamera(point);
        }
        await wait(ms);
      },
      async click() {
        if (still) return;
        setRipple({ id: ++rippled, at: where.current });
        setPointer((p) => ({ ...p, down: true }));
        await wait(170);
        setPointer((p) => ({ ...p, down: false }));
      },
      hold(key) {
        if (still) return;
        setKeys((was) => (was.some((k) => k.name === key) ? was : [...was, { name: key, down: false }]));
        requestAnimationFrame(() => setKeys((was) => was.map((k) => (k.name === key ? { ...k, down: true } : k))));
      },
      letGo(key) {
        setKeys((was) => was.filter((k) => k.name !== key));
      },
    };
    void (async () => {
      try {
        do {
          where.current = START;
          setPointer({ at: START, down: false });
          setCamera(null);
          setKeys([]);
          setRipple(null);
          await wait(400);
          await latest.current(tools);
          if (still) return;
          await wait(LOOP_REST_MS);
        } while (alive);
      } catch (e) {
        if (!(e instanceof Stopped)) throw e;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="explain-stage">
      <div className="explain-chrome" aria-hidden="true">
        <span className="explain-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="explain-tab">
          <b className={`explain-favicon is-${site.icon}`} />
          <span lang="ja">{site.tab}</span>
        </span>
        <span className="explain-address">
          <span className="explain-lock" />
          {site.url}
        </span>
      </div>
      <div ref={view} className="explain-view" style={{ height: CANVAS.height * fit }}>
        <div
          className="explain-camera"
          style={{ transformOrigin: camera ? `${camera[0]}% ${camera[1]}%` : "50% 50%", transform: camera ? `scale(${CAMERA_ZOOM})` : "none" }}
        >
          {/* The page is only to be looked at: nothing in it takes a press or the focus. */}
          <div ref={page} className="explain-page" inert style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${fit})` }}>
            {children}
            {ripple ? <i key={ripple.id} className="explain-ripple" style={{ left: `${ripple.at[0]}%`, top: `${ripple.at[1]}%` }} /> : null}
            <span className={`explain-pointer ${pointer.down ? "is-down" : ""}`.trim()} style={{ left: `${pointer.at[0]}%`, top: `${pointer.at[1]}%` }}>
              <svg viewBox="0 0 16 22" aria-hidden="true">
                <path d="M1.5 1.5v16.2l4.3-4.1 3 6.6 2.7-1.2-3-6.5h6z" />
              </svg>
            </span>
          </div>
        </div>
        <span className="explain-keys" aria-hidden="true">
          {keys.map((k) => (
            <span key={k.name} className={k.down ? "is-down" : undefined}>
              <KeyCap bind={{ key: k.name, holdMs: 0 }} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * The (?) beside a panel's title, and the window it opens with the feature playing in it. The picture is made only
 * while the window is open, so nothing plays for a panel nobody is looking at.
 */
export function Explainer({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const closing = useRef(0);
  const close = () => {
    window.clearTimeout(closing.current);
    setOpen(false);
    setKept(false);
  };
  useDismiss(root, open, close);
  const show = () => {
    window.clearTimeout(closing.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (kept) return;
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setOpen(false), CLOSE_AFTER_MS);
  };
  useEffect(() => () => window.clearTimeout(closing.current), []);
  return (
    <span ref={root} className="explain" onMouseLeave={closeSoon}>
      <Button
        className="explain-q"
        aria-label={`What ${name} is`}
        aria-expanded={open}
        onMouseEnter={show}
        onFocus={show}
        onBlur={closeSoon}
        onClick={() => {
          if (kept) close();
          else {
            setKept(true);
            show();
          }
        }}
      >
        ?
      </Button>
      {open ? (
        <div className="explain-window" role="dialog" aria-label={name} onMouseEnter={show}>
          {children}
        </div>
      ) : null}
    </span>
  );
}
