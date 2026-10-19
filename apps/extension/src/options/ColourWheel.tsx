import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TextField } from "@web/components/TextField";

/** A colour as hue (0 to 360, from the top of the wheel clockwise), saturation and value (0 to 1 each). */
type Hsv = { h: number; s: number; v: number };

/** `#rrggbb` from a hue, saturation and value. */
function hexOf({ h, s, v }: Hsv): string {
  const part = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const byte = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${byte(part(5))}${byte(part(3))}${byte(part(1))}`;
}

/** A hue, saturation and value from `#rrggbb`. */
function hsvOf(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/** What's typed as a colour, as `#rrggbb`; null while it isn't one yet. The `#` may be left out. */
function typedHex(text: string): string | null {
  const bare = text.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(bare) ? `#${bare.toLowerCase()}` : null;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** How far an arrow key turns the hue (degrees), and moves the saturation or the value. */
const STEP = { hue: 5, share: 0.05 } as const;

/**
 * A colour of the viewer's own, picked on a wheel: around it the hue, out from its middle how vivid, and under it a
 * line from dark to bright; or typed as a hex. Seen as it's moved, kept as it's let go (`onPick`), so a drag isn't a
 * hundred writes. Never the browser's own colour picker. The arrow keys move whichever has the focus.
 */
export function ColourWheel({ id, start, onPick }: { id: string; start: string; onPick: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => hsvOf(start));
  const [typed, setTyped] = useState(start.toUpperCase());
  const now = useRef(hsv);
  now.current = hsv;
  const disc = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const held = useRef<"disc" | "line" | null>(null);
  const hex = hexOf(hsv);
  const bright = hexOf({ ...hsv, v: 1 });

  function show(next: Hsv) {
    setHsv(next);
    setTyped(hexOf(next).toUpperCase());
  }
  function onDisc(x: number, y: number) {
    const box = disc.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    show({ ...now.current, h, s: clamp(Math.hypot(dx, dy) / (box.width / 2)) });
  }
  function onLine(x: number) {
    const box = line.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    show({ ...now.current, v: clamp((x - box.left) / box.width) });
  }
  const press = (which: "disc" | "line") => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    held.current = which;
    if (which === "disc") onDisc(e.clientX, e.clientY);
    else onLine(e.clientX);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (held.current === "disc") onDisc(e.clientX, e.clientY);
    else if (held.current === "line") onLine(e.clientX);
  };
  const letGo = () => {
    if (held.current === null) return;
    held.current = null;
    onPick(hexOf(now.current));
  };
  function keyed(e: KeyboardEvent<HTMLDivElement>, which: "disc" | "line") {
    const was = now.current;
    const next =
      which === "line"
        ? { ArrowLeft: { ...was, v: clamp(was.v - STEP.share) }, ArrowRight: { ...was, v: clamp(was.v + STEP.share) } }[e.key]
        : {
            ArrowLeft: { ...was, h: (was.h + 360 - STEP.hue) % 360 },
            ArrowRight: { ...was, h: (was.h + STEP.hue) % 360 },
            ArrowDown: { ...was, s: clamp(was.s - STEP.share) },
            ArrowUp: { ...was, s: clamp(was.s + STEP.share) },
          }[e.key];
    if (!next) return;
    e.preventDefault();
    show(next);
    onPick(hexOf(next));
  }
  const angle = (hsv.h * Math.PI) / 180;

  return (
    <div className="colour-wheel">
      <div
        ref={disc}
        className="colour-disc"
        role="slider"
        tabIndex={0}
        aria-label="Hue and vividness"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={hex.toUpperCase()}
        onPointerDown={press("disc")}
        onPointerMove={move}
        onLostPointerCapture={letGo}
        onKeyDown={(e) => keyed(e, "disc")}
      >
        {/* How dark: the whole disc dimmed, as the line under it says. */}
        <span className="colour-disc-dim" style={{ opacity: 1 - hsv.v }} />
        <span className="colour-knob" style={{ left: `${50 + 50 * hsv.s * Math.sin(angle)}%`, top: `${50 - 50 * hsv.s * Math.cos(angle)}%`, background: hex }} />
      </div>
      <div className="colour-side">
        <span className="colour-now" style={{ background: hex }} aria-hidden="true" />
        <div
          ref={line}
          className="colour-line"
          role="slider"
          tabIndex={0}
          aria-label="Brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          style={{ background: `linear-gradient(90deg, var(--theater), ${bright})` }}
          onPointerDown={press("line")}
          onPointerMove={move}
          onLostPointerCapture={letGo}
          onKeyDown={(e) => keyed(e, "line")}
        >
          <span className="colour-knob" style={{ left: `${hsv.v * 100}%`, top: "50%", background: hex }} />
        </div>
        <TextField
          id={`${id}-hex`}
          label="Hex"
          value={typed}
          error={/^#?[0-9a-f]{0,6}$/i.test(typed.trim()) ? undefined : "Six digits, 0–9 and A–F."}
          onChange={(text) => {
            setTyped(text);
            const picked = typedHex(text);
            if (!picked) return;
            setHsv(hsvOf(picked));
            onPick(picked);
          }}
        />
      </div>
    </div>
  );
}
