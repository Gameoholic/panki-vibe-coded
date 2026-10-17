import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { WAIT_MAX, placeAt, resolve, waitAt, type Flow, type SrsType, type Step } from "@panki/contracts";
import { AGAIN_OPTIONS, MOVE_OPTIONS, WAIT_UNIT_OPTIONS, STEP_OPTIONS, againWords, answerClass, placeName, spanWords, stageName, stageWaitWords, stepKey, stepLabel, tintStyle } from "../srsKinds";
import { BURNED_SCOPE, flattenAgain, getStep, hasOwnRules, patchStage, scopeFlow, setAgainCapped, setAgainNow, setAgainWait, setStep, syncToDefault, tree, wrapInAgain, type Scope, type TreeNode } from "../srsFlow";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { Segmented } from "./Segmented";
import { Toggle } from "./Toggle";

/** The chart's geometry, one home: box sizes, the pitch between columns and rows, the ports on a box's right edge (how far apart the answers' names fan out, how far the ports keep from the box's corners), how far a "keep asking" arrow swings out before it turns back and where along the box's edge it lands, where an answer's name sits from its port, how far it zooms, how small it's still laid out sharp and how small Fit may go, how much of the rail fades where there's more. */
const G = {
  nodeW: 176,
  nodeH: 48,
  stageW: 244,
  stageH: 160,
  colGap: 136,
  rowPitch: 84,
  port: 26,
  portInset: 10,
  loopLift: 46,
  loopLand: 0.7,
  labelOut: { x: 36, y: 0 },
  bend: 50,
  pad: 40,
  zoomMin: 0.35,
  sharpMin: 0.6,
  fitMin: 0.6,
  zoomMax: 2.5,
  zoomStep: 1.2,
  menuW: 262,
  fitTop: 108,
  fitBottom: 64,
  fitSide: 56,
  dragSlack: 4,
  railPeek: 28,
};

type Pos = { x: number; y: number };
type Box = { id: string; x: number; y: number; w: number; h: number; kind: string; step?: Step; path: string[] };
type Link = { from: string; to: string; i: number; path: string[]; answerName: string; loop: boolean };
/** A link as drawn: its path, where the answer's name sits, where its + goes (none on one that turns back), and the box it reaches (none likewise). */
type Wire = { link: Link; b: Box | null; key: string; out: Pos; d: string; label: Pos; plus: Pos | null };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Chart = { boxes: Box[]; links: Link[]; bounds: Bounds };
type View = { x: number; y: number; k: number };
type Size = { w: number; h: number };
type Ptr = { kind: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean } | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; cur: Pos };

/** The tree laid out left to right: the stage (or the default rules) at the root, one column per ask-again deep, one row per outcome. */
function layout(type: SrsType, flow: Flow, scope: Scope, positions: Record<string, Pos>, readOnly: boolean): Chart {
  const boxes: Box[] = [];
  const links: Link[] = [];
  // A stage's box is big for its fields; where there's nothing to fill in, it's a plain box.
  const plain = scope === "all" || scope === BURNED_SCOPE || readOnly;
  const rootW = plain ? G.nodeW : G.stageW;
  const rootH = plain ? G.nodeH : G.stageH;
  let row = 0;
  function place(items: TreeNode[], depth: number, parentId: string): number[] {
    const ys: number[] = [];
    for (const it of items) {
      const id = it.path.join(",");
      const link = { from: parentId, to: id, i: type.answers.indexOf(it.answer), path: it.path, answerName: it.answer.name };
      // "Keep asking" has no box and takes no row: its arrow turns back into the box it left.
      if (it.step.kind === "retry") {
        links.push({ ...link, loop: true });
        continue;
      }
      let y: number;
      const childYs = it.children.length > 0 ? place(it.children, depth + 1, id) : [];
      if (childYs.length > 0) y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      else y = row++ * G.rowPitch;
      boxes.push({ id, x: rootW + G.colGap + (depth - 1) * (G.nodeW + G.colGap), y, w: G.nodeW, h: G.nodeH, kind: it.children.length > 0 ? "again" : stepKey(it.step), step: it.step, path: it.path });
      links.push({ ...link, loop: false });
      ys.push(y);
    }
    return ys;
  }
  // The end has no rules: its box stands alone.
  const placed = scope === BURNED_SCOPE ? [] : place(tree(type, flow), 1, "root");
  const ys = placed.length > 0 ? placed : [0];
  boxes.push({ id: "root", x: 0, y: (Math.min(...ys) + Math.max(...ys)) / 2 + (G.nodeH - rootH) / 2, w: rootW, h: rootH, kind: "root", path: [] });
  for (const box of boxes) {
    const moved = positions[box.id];
    if (moved) {
      box.x = moved.x;
      box.y = moved.y;
    }
  }
  const bounds = {
    minX: Math.min(...boxes.map((b) => b.x)),
    minY: Math.min(...boxes.map((b) => b.y)),
    maxX: Math.max(...boxes.map((b) => b.x + b.w)),
    maxY: Math.max(...boxes.map((b) => b.y + b.h)),
  };
  return { boxes, links, bounds };
}

/** Answers stacked around a box's middle, `gap` apart. */
const stackY = (box: Box, i: number, n: number, gap: number) => box.y + box.h / 2 + (i - (n - 1) / 2) * gap;
/** Where an answer's arrow leaves a box: ports stacked on its right edge, one per answer, squeezed so none hangs off a corner. */
const portY = (box: Box, i: number, n: number) => stackY(box, i, n, n > 1 ? Math.min(G.port, (box.h - 2 * G.portInset) / (n - 1)) : 0);
function bezier(p0: Pos, p1: Pos, p2: Pos, p3: Pos, t: number): Pos {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
/** One stretch of an arrow: level where it leaves and where it lands, bending less when the two are close. */
function curve(from: Pos, to: Pos): [Pos, Pos, Pos, Pos] {
  const c = Math.max(Math.abs(to.x - from.x) / 2, Math.min(G.bend, Math.hypot(to.x - from.x, to.y - from.y) / 2));
  return [from, { x: from.x + c, y: from.y }, { x: to.x - c, y: to.y }, to];
}
const labelKey = (to: string) => `label:${to}`;
/** An arrow runs from its answer's port, through the answer's name, to the box. The names fan out wider than the ports, so they never sit on each other; `out` is where a name is from its place in that fan. */
function linkGeometry(a: Box, b: Box, i: number, n: number, out: Pos) {
  const port = { x: a.x + a.w, y: portY(a, i, n) };
  const label = { x: port.x + out.x, y: stackY(a, i, n, G.port) + out.y };
  const [, p1, p2] = curve(port, label);
  const rest = curve(label, { x: b.x, y: b.y + b.h / 2 });
  const [, r1, r2, end] = rest;
  return { d: `M ${port.x} ${port.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${label.x} ${label.y} C ${r1.x} ${r1.y}, ${r2.x} ${r2.y}, ${end.x} ${end.y}`, label, plus: bezier(...rest, 0.72) };
}
/** "Keep asking" turns back into the box it left: out through the answer's name, then round and into the box's top (its bottom when the name sits low). */
function loopGeometry(a: Box, i: number, n: number, out: Pos) {
  const port = { x: a.x + a.w, y: portY(a, i, n) };
  const label = { x: port.x + out.x, y: stackY(a, i, n, G.port) + out.y };
  const [, p1, p2] = curve(port, label);
  const over = label.y <= a.y + a.h / 2;
  const lift = over ? -G.loopLift : G.loopLift;
  const end = { x: a.x + a.w * G.loopLand, y: over ? a.y : a.y + a.h };
  return { d: `M ${port.x} ${port.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${label.x} ${label.y} C ${label.x + G.loopLift} ${label.y + lift}, ${end.x} ${end.y + lift}, ${end.x} ${end.y}`, label, plus: null };
}
/** The view that shows the whole chart: clear of the rail and the tools, or, without a rail (the review's chart), with a thin margin at the top. */
function fitView(bounds: Bounds, size: Size, rail = true): View {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const top = rail ? G.fitTop : G.pad;
  const k = Math.max(rail ? G.fitMin : G.zoomMin, Math.min(1, (size.w - G.fitSide) / bw, (size.h - top - G.fitBottom) / bh));
  return { k, x: (size.w - bw * k) / 2 - bounds.minX * k, y: top + (size.h - top - G.fitBottom - bh * k) / 2 - bounds.minY * k };
}
const boxStyle = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });
const kindClass = (kind: string) => (kind.startsWith("to:") ? "to" : kind);

/** The stage the chart is shown for: the picked one, or for the default rules the one chosen on their box (a few rungs up until one is). */
function exampleIdx(type: SrsType, scope: Scope, shown: string | null): number {
  if (scope !== "all") return type.stages.findIndex((s) => s.id === scope);
  const chosen = type.stages.findIndex((s) => s.id === shown);
  return chosen === -1 ? Math.min(2, type.stages.length - 1) : chosen;
}
function outcomeOf(type: SrsType, flow: Flow, ex: number, box: Box) {
  const last = box.path[box.path.length - 1] ?? "";
  return resolve(type, { ...placeAt(type, ex), node: box.path.slice(0, -1) }, last, flow);
}
function subWords(type: SrsType, flow: Flow, scope: Scope, ex: number, box: Box): string {
  if (box.kind === "root") return scope === "all" ? `shown for ${stageName(type, ex)}` : `waits ${spanWords(waitAt(type, ex) ?? 0)}`;
  if (box.kind === "hidden") return "the button isn't shown here";
  const r = outcomeOf(type, flow, ex, box);
  if (r.burned) return box.kind === "burn" ? "never comes back" : `→ ${type.burnedName} · never comes back`;
  if (r.again) return "";
  return `→ ${placeName(type, r.place)} · ${r.wait ? `back in ${spanWords(r.wait)}` : "no wait"}`;
}

type Props = {
  type: SrsType;
  /** Which rules are shown and edited: the default ones, or a stage's own. */
  scope: Scope;
  onScope: (scope: Scope) => void;
  /** Every change to the type goes through here; the editor keeps the history. `group` names a run of keystrokes that undo as one. */
  onChange: (next: SrsType, group?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** For looking only (a type that comes with the app): the chart pans, zooms and shows any stage, and nothing on it changes the rules. */
  readOnly?: boolean;
  /**
   * A glance at one card's place on the chart (the review, with a mouse resting on an answer): the box the card is at
   * (`now`), the box or loop that answer leads to (`next`, by its path; null where it leads nowhere), and the stage the
   * rules are worked out for. For looking only, fitted to its frame, with no rail, no tools and no menu.
   */
  glance?: { now: string; next: string | null; stage: number };
};

/**
 * The rules as a chart: the stage on the left, an arrow per answer to the box that says where the card goes, and an
 * ask-again box that branches again. Tap a box for its card beside it (the moves in one row, the rare ones as chips,
 * the stages as numbered dots; another tap on the box, a tap on the ground or Escape closes it), drag
 * any box or an answer's name around, press + on an arrow to ask again first; drag the ground to pan, scroll or the
 * buttons to zoom. The rail of stages scrolls sideways when there are more than fit.
 */
export function FlowCanvas({ type, scope, onScope, onChange, onUndo, onRedo, canUndo, canRedo, readOnly: readOnlyGiven = false, glance }: Props) {
  // A glance is never edited.
  const readOnly = readOnlyGiven || glance !== undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [railMore, setRailMore] = useState("");
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const views = useRef(new Map<string, View>());
  const shownScope = useRef<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Record<string, Pos>>>({});
  const [drag, setDrag] = useState<({ id: string } & Pos) | null>(null);
  const [panning, setPanning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  /** The stage dot under the pointer or the focus, so the card can say its name. */
  const [peek, setPeek] = useState<number | null>(null);
  /** The stage the default rules are worked out for on the chart, once one is chosen on their box. */
  const [shown, setShown] = useState<string | null>(null);
  const ptr = useRef<Ptr | null>(null);
  const suppressClick = useRef(false);

  const flow = scopeFlow(type, scope);
  // What's been dragged somewhere: a box by its id (where it is), an answer's name by its label key (how far from its port).
  const placed = drag ? { ...positions[scope], [drag.id]: { x: drag.x, y: drag.y } } : (positions[scope] ?? {});
  const chart = layout(type, flow, scope, placed, readOnly);
  const byId = new Map(chart.boxes.map((b) => [b.id, b]));
  const n = type.answers.length;
  const wires = chart.links.flatMap((link): Wire[] => {
    const a = byId.get(link.from);
    const b = byId.get(link.to) ?? null;
    if (!a) return [];
    const key = labelKey(link.to);
    const out = placed[key] ?? G.labelOut;
    if (link.loop) return [{ link, b: null, key, out, ...loopGeometry(a, link.i, n, out) }];
    if (!b) return [];
    return [{ link, b, key, out, ...linkGeometry(a, b, link.i, n, out) }];
  });
  const ex = glance ? glance.stage : exampleIdx(type, scope, shown);
  const stage = type.stages[ex];

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Each scope has a view of its own: fitted to the frame the first time it shows, and after that wherever the owner
  // left it. One view for all of them would leave a chart off in the dark after a look at one of another size.
  useEffect(() => {
    if (!size || shownScope.current === scope) return;
    if (shownScope.current !== null) views.current.set(shownScope.current, view);
    shownScope.current = scope;
    setView(views.current.get(scope) ?? fitView(chart.bounds, size, !glance));
  }, [scope, size]); // eslint-disable-line react-hooks/exhaustive-deps -- the view and the bounds at that moment are what's kept and fitted
  useEffect(() => {
    setSelected(null);
    // The picked stage comes fully into the rail, clear of the fade.
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!rail || !chip) return;
    const left = chip.offsetLeft - G.railPeek;
    const right = chip.offsetLeft + chip.offsetWidth + G.railPeek;
    if (left < rail.scrollLeft) rail.scrollTo({ left, behavior: "smooth" });
    else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollTo({ left: right - rail.clientWidth, behavior: "smooth" });
  }, [scope]);
  // The wheel zooms around the pointer (a trackpad pinch arrives as a wheel too); the ground is dragged to pan. React
  // registers wheel as a passive listener, so the page would scroll along; a native listener can stop it.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const rail = e.target instanceof HTMLElement ? e.target.closest(".rail-track") : null;
      if (rail) {
        // A mouse wheel only turns one way; over the rail it moves the stages sideways.
        if (rail.scrollWidth > rail.clientWidth && e.deltaX === 0) {
          e.preventDefault();
          rail.scrollLeft += e.deltaY;
        }
        return;
      }
      if (e.target instanceof HTMLElement && e.target.closest(".menu, .rail")) return;
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // Escape lets go of the picked box; Delete takes its ask-again out, or sets it back to Stays.
  useEffect(() => {
    const sel = selected;
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") setSelected(null);
      else if (sel !== "root" && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        const path = sel.split(",");
        const current = getStep(type, scope, path);
        onChange(current?.kind === "again" ? flattenAgain(type, scope, path) : setStep(type, scope, path, "stay"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, type, scope, onChange]);
  // A ladder that no longer ends has no end to show.
  useEffect(() => {
    if (scope === BURNED_SCOPE && type.after !== "burn") onScope("all");
  }, [scope, type.after, onScope]);
  // The menu sits beside its box and stays inside the frame.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !size) return;
    const top = parseFloat(menu.style.top);
    const height = menu.offsetHeight;
    if (top + height > size.h - 8) menu.style.top = `${Math.max(8, size.h - 8 - height)}px`;
  });
  useLayoutEffect(measureRail);

  /** Which ends of the rail have stages out of sight, so those ends fade. */
  function measureRail() {
    const rail = railRef.current;
    if (!rail) return;
    const start = rail.scrollLeft > 1;
    const end = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;
    setRailMore(start && end ? "start end" : start ? "start" : end ? "end" : "");
  }

  function zoomAt(mx: number, my: number, factor: number) {
    setView((v) => {
      const k = Math.min(G.zoomMax, Math.max(G.zoomMin, v.k * factor));
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) };
    });
  }
  function fit() {
    if (size) setView(fitView(chart.bounds, size));
  }
  function tidy() {
    setPositions((ps) => ({ ...ps, [scope]: {} }));
    if (size) setView(fitView(layout(type, flow, scope, {}, readOnly).bounds, size));
  }
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-top, .canvas-bottom, .own-line, .menu, .edge-plus, input, .segmented, .btn-switch")) return;
    const el = target.closest<HTMLElement>("[data-node], [data-label]");
    const id = el?.dataset.node ?? (el?.dataset.label ? labelKey(el.dataset.label) : undefined);
    if (el && id) {
      const from = byId.get(id) ?? wires.find((w) => w.key === id)?.out;
      if (!from) return;
      ptr.current = { kind: "move", id, sx: e.clientX, sy: e.clientY, ox: from.x, oy: from.y, moved: false, cur: { x: from.x, y: from.y } };
      el.setPointerCapture(e.pointerId);
    } else {
      ptr.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
    }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = ptr.current;
    if (!p) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) < G.dragSlack) return;
    p.moved = true;
    if (p.kind === "pan") setView((v) => ({ ...v, x: p.ox + dx, y: p.oy + dy }));
    else {
      p.cur = { x: p.ox + dx / view.k, y: p.oy + dy / view.k };
      setDrag({ id: p.id, ...p.cur });
    }
  }
  function endPointer(commit: boolean) {
    const p = ptr.current;
    if (!p) return;
    ptr.current = null;
    setPanning(false);
    if (p.moved) {
      // The click that follows a drag isn't a pick.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 60);
    }
    if (p.kind === "move") {
      if (p.moved && commit) setPositions((ps) => ({ ...ps, [scope]: { ...(ps[scope] ?? {}), [p.id]: p.cur } }));
      setDrag(null);
      // A tap on the name of an answer that keeps asking picks it: it has no box of its own to tap.
      const looped = !p.moved && commit && !readOnly ? wires.find((w) => w.key === p.id && w.link.loop) : undefined;
      if (looped) setSelected((s) => (s === looped.link.to ? null : looped.link.to));
    } else if (!p.moved && commit) {
      // A press on the ground that never became a pan is a tap: it lets go of the picked box.
      setSelected(null);
    }
  }
  function select(id: string) {
    // For looking only, the one thing to pick is the default rules' box: it chooses the stage they're shown for.
    if (suppressClick.current || (readOnly && id !== "root")) return;
    setSelected((s) => (s === id ? null : id));
  }

  // The default rules' own box opens a list of the stages, to choose the one they're shown for; it has no step to set.
  const choosingShown = selected === "root";
  const selPath = selected && !choosingShown ? selected.split(",") : null;
  // What the card opens beside: the picked box, or the name of an answer that keeps asking.
  const selLoop = selected ? wires.find((w) => w.link.loop && w.link.to === selected) : undefined;
  const selBox: Pick<Box, "x" | "y" | "w" | "h"> | null = selected ? (byId.get(selected) ?? (selLoop ? { x: selLoop.label.x, y: selLoop.label.y, w: 0, h: 0 } : null)) : null;
  const current = selPath ? getStep(type, scope, selPath) : undefined;
  const currentKey = stepKey(current);
  function pick(key: string) {
    if (!selPath) return;
    onChange(setStep(type, scope, selPath, key));
  }
  const pickedIdx = current?.kind === "to" ? type.stages.findIndex((s) => s.id === current.stage) : -1;
  const namedIdx = peek ?? pickedIdx;
  const named = type.stages[namedIdx];
  const whereWords = named ? `${stageName(type, namedIdx)} · ${stageWaitWords(named)}` : "Straight to a stage";
  /** The stages as numbered dots in their colours; the card writes the name of the one pointed at or picked above them. */
  const stageDots = (label: string, onPick: (stageId: string) => void) => (
    <>
      <div className="menu-where">{whereWords}</div>
      <div className="stage-dots" role="group" aria-label={label} onPointerLeave={() => setPeek(null)}>
        {type.stages.map((s, i) => (
          <Button
            key={s.id}
            variant="chip"
            className="stage-dot"
            style={tintStyle(i, type.stages.length)}
            aria-label={stageName(type, i)}
            aria-pressed={pickedIdx === i}
            data-opt={`to:${s.id}`}
            onPointerEnter={() => setPeek(i)}
            onFocus={() => setPeek(i)}
            onBlur={() => setPeek(null)}
            onClick={() => onPick(s.id)}
          >
            {i + 1}
          </Button>
        ))}
      </div>
    </>
  );
  let menuStyle: CSSProperties | undefined;
  if (selBox && size) {
    let left = view.x + (selBox.x + selBox.w) * view.k + 12;
    if (left + G.menuW > size.w - 8) left = view.x + selBox.x * view.k - G.menuW - 12;
    if (left < 8) left = 8;
    menuStyle = { left, top: Math.max(8, view.y + selBox.y * view.k - 4) };
  }
  // The chart is laid out at its zoom, on whole pixels, so every edge and letter is drawn sharp; a stretched drawing isn't.
  // Browsers stop shrinking text at some size, so under `sharpMin` the rest of the way is a stretch.
  const sharp = Math.max(view.k, G.sharpMin);
  const pan = { x: Math.round(view.x), y: Math.round(view.y) };
  const svgW = Math.max(0, chart.bounds.maxX) + G.pad;
  const svgH = Math.max(0, chart.bounds.maxY) + G.pad;

  return (
    <div
      ref={rootRef}
      className={`canvas ${glance ? "is-peek" : ""} ${size === null ? "is-unfit" : ""} ${panning ? "is-panning" : ""}`.replace(/\s+/g, " ").trim()}
      data-canvas
      data-scope={scope}
      style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endPointer(true)}
      onPointerCancel={() => endPointer(false)}
    >
      <div className="viewport" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${view.k / sharp})` }}>
        <div className="sheet" style={{ zoom: sharp }}>
          <svg width={svgW} height={svgH} aria-hidden="true">
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path className="edge-arrow" d="M 0 1 L 10 5 L 0 9 z" />
              </marker>
            </defs>
            {wires.map(({ link, d }) => (
              <path key={link.to} className={`edge ${answerClass(type.answers, link.i)} ${glance?.next === link.to ? "is-next" : ""}`.trim()} d={d} markerEnd={link.loop ? "url(#flow-arrow)" : undefined} />
            ))}
          </svg>
          {wires.map(({ link, b, key, label, plus }) => {
            return (
              <Fragment key={link.to}>
                <span className={`edge-label ${answerClass(type.answers, link.i)} ${drag?.id === key ? "is-dragging" : ""}`.trim()} data-label={link.to} style={{ left: label.x, top: label.y }}>
                  {link.answerName || "?"}
                </span>
                {!plus || readOnly || b?.kind === "again" ? null : (
                  <Button
                    className="edge-plus"
                    data-plus={link.to}
                    aria-label="Ask again before this"
                    style={{ left: plus.x, top: plus.y }}
                    onClick={() => {
                      onChange(wrapInAgain(type, scope, link.path));
                      setSelected(link.to);
                    }}
                  >
                    <Icon name="add" />
                  </Button>
                )}
              </Fragment>
            );
          })}
          {chart.boxes.map((box) => {
            if (box.kind === "root") {
              const tint = tintStyle(ex, type.stages.length);
              if ((scope !== "all" || glance) && scope !== BURNED_SCOPE && stage && readOnly) {
                return (
                  <div key="root" className={`fnode root ${glance?.now === box.id ? "is-now" : ""} ${drag?.id === box.id ? "is-dragging" : ""}`.trim()} data-node="root" data-kind="root" style={{ ...boxStyle(box), ...tint }}>
                    <span className="t">{stageName(type, ex)}</span>
                    <span className="s">{stage.wait.n === 0 ? "no wait" : `waits ${stageWaitWords(stage)}`}</span>
                  </div>
                );
              }
              if (scope !== "all" && stage) {
                return (
                  <div key="root" className={`fnode root is-stage ${drag?.id === box.id ? "is-dragging" : ""}`.trim()} data-node="root" data-kind="root" style={{ ...boxStyle(box), ...tint }}>
                    <input
                      id="stage-name"
                      className="field-input node-name"
                      value={stage.name}
                      placeholder={`Stage ${ex + 1}`}
                      aria-label="Stage name"
                      autoComplete="off"
                      onChange={(e) => onChange(patchStage(type, stage.id, { name: e.target.value }), `stage-name-${stage.id}`)}
                    />
                    {stage.wait.n === 0 ? null : (
                      <>
                        <div className="node-wait">
                          <span>waits</span>
                          <NumberField id="stage-wait" label="Wait" value={stage.wait.n} min={1} max={WAIT_MAX} steppers={false} size="sm" onChange={(n) => onChange(patchStage(type, stage.id, { wait: { n } }), `stage-wait-${stage.id}`)} />
                          <Segmented size="sm" idPrefix="stage-unit" label="Unit" options={WAIT_UNIT_OPTIONS} value={stage.wait.unit} onChange={(unit) => onChange(patchStage(type, stage.id, { wait: { unit } }))} />
                        </div>
                        <div className="node-since">{ex === 0 ? "since added" : "since promotion"}</div>
                      </>
                    )}
                    <Toggle id="stage-no-wait" says={{ on: "No wait", off: "Waits" }} on={stage.wait.n === 0} onChange={(none) => onChange(patchStage(type, stage.id, { wait: { n: none ? 0 : 1 } }))} />
                  </div>
                );
              }
              if (scope === BURNED_SCOPE) {
                return (
                  <div key="root" className={`fnode root burn ${drag?.id === box.id ? "is-dragging" : ""}`.trim()} data-node="root" data-kind="root" style={boxStyle(box)}>
                    <span className="t">
                      <Icon name="flame" />
                      {type.burnedName}
                    </span>
                    <span className="s">never comes back</span>
                  </div>
                );
              }
              return (
                <Button
                  key="root"
                  variant="node"
                  className={`fnode root ${drag?.id === box.id ? "is-dragging" : ""}`.trim()}
                  data-node="root"
                  data-kind="root"
                  aria-pressed={choosingShown}
                  style={{ ...boxStyle(box), ...tint }}
                  onClick={() => select(box.id)}
                >
                  <span className="t">Default rules</span>
                  <span className="s">
                    {subWords(type, flow, scope, ex, box)}
                    <Icon name="down" />
                  </span>
                </Button>
              );
            }
            const title = box.kind === "again" ? `Ask again ${againWords(outcomeOf(type, flow, ex, box).wait ?? 0)}` : stepLabel(type, box.step);
            return (
              <Button
                key={box.id}
                variant="node"
                className={`fnode ${kindClass(box.kind)} ${glance?.now === box.id ? "is-now" : ""} ${glance?.next === box.id ? "is-next" : ""} ${drag?.id === box.id ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
                data-node={box.id}
                data-kind={box.kind}
                aria-pressed={selected === box.id}
                style={boxStyle(box)}
                onClick={() => select(box.id)}
              >
                <span className="t">
                  {box.kind === "burn" ? <Icon name="flame" /> : box.kind === "again" ? <Icon name="review" /> : box.kind === "hidden" ? <Icon name="lock" /> : null}
                  {title}
                </span>
                {box.kind === "again" ? null : <span className="s">{subWords(type, flow, scope, ex, box)}</span>}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="canvas-top">
        <div className="rail-col">
        <div className="rail" role="group" aria-label="Rules for">
          <div ref={railRef} className="rail-track" data-more={railMore} style={{ "--peek": `${G.railPeek}px` } as CSSProperties} onScroll={measureRail}>
            <Button variant="chip" className="rail-chip" aria-pressed={scope === "all"} onClick={() => onScope("all")}>
              <span>Default rules</span>
              <small>every stage</small>
            </Button>
            {type.stages.map((s, i) => (
              <Button key={s.id} variant="chip" className={`rail-chip ${hasOwnRules(type, s.id) ? "has-dot" : ""}`.trim()} aria-pressed={scope === s.id} onClick={() => onScope(s.id)}>
                <span>{stageName(type, i)}</span>
                <small>{stageWaitWords(s)}</small>
              </Button>
            ))}
            {type.after === "burn" ? (
              <Button variant="chip" className="rail-chip is-burned" aria-pressed={scope === BURNED_SCOPE} onClick={() => onScope(BURNED_SCOPE)}>
                <span>{type.burnedName}</span>
                <small>never comes back</small>
              </Button>
            ) : null}
          </div>
        </div>
        {hasOwnRules(type, scope) ? (
          <div className="own-line">
            <span>{stageName(type, ex)} has its own rules.</span>
            {readOnly ? null : (
              <Button id="flow-sync" variant="chip" onClick={() => onChange(syncToDefault(type, scope))}>
                Sync to default
              </Button>
            )}
          </div>
        ) : null}
        </div>
        <div className="tools">
          {readOnly ? null : (
            <>
              <Button id="flow-undo" className="btn-icon" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
                <Icon name="undo" />
              </Button>
              <Button id="flow-redo" className="btn-icon" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
                <Icon name="redo" />
              </Button>
            </>
          )}
          <Button id="flow-tidy" onClick={tidy}>
            Tidy up
          </Button>
        </div>
      </div>
      <div className="canvas-bottom">
        <div className="legend" aria-label="Answers">
          {type.answers.map((a, i) => (
            <span key={a.id} className={`pill ${answerClass(type.answers, i)}`}>
              {a.name || "?"}
            </span>
          ))}
        </div>
        <div className="tools">
          <Button className="btn-icon" aria-label="Zoom out" onClick={() => size && zoomAt(size.w / 2, size.h / 2, 1 / G.zoomStep)}>
            <Icon name="minus" />
          </Button>
          <span className="zoom">{Math.round(view.k * 100)}%</span>
          <Button className="btn-icon" aria-label="Zoom in" onClick={() => size && zoomAt(size.w / 2, size.h / 2, G.zoomStep)}>
            <Icon name="add" />
          </Button>
          <Button id="flow-fit" onClick={fit}>
            Fit
          </Button>
        </div>
      </div>

      {selBox && menuStyle && (selPath || (choosingShown && scope === "all")) ? (
        <div ref={menuRef} className="menu" role="group" aria-label={selPath ? "What the card does" : "Shown for"} style={menuStyle}>
          {!selPath ? (
            <>
              <div className="menu-title">Show these rules for a card at</div>
              {type.stages.map((s, i) => (
                <Button
                  key={s.id}
                  variant="item"
                  aria-pressed={ex === i}
                  onClick={() => {
                    setShown(s.id);
                    setSelected(null);
                  }}
                >
                  <span className="stage-swatch" style={tintStyle(i, type.stages.length)} />
                  {stageName(type, i)}
                  <small className="item-note">{stageWaitWords(s)}</small>
                </Button>
              ))}
              {type.after === "burn" ? (
                <Button variant="item" onClick={() => onScope(BURNED_SCOPE)}>
                  <Icon name="flame" />
                  {type.burnedName}
                  <small className="item-note">never comes back</small>
                </Button>
              ) : null}
            </>
          ) : current?.kind === "again" ? (
            <>
              <Toggle id="again-now" says={{ on: "Right away, in the same review", off: "After a wait" }} on={current.now === true} onChange={(now) => onChange(setAgainNow(type, scope, selPath, now))} />
              {current.now ? null : (
                <>
                  <div className="menu-title">Ask again in</div>
                  <div className="menu-wait">
                    <NumberField id="again-wait" label="Wait" value={current.wait.n} min={1} max={WAIT_MAX} steppers={false} size="sm" onChange={(n) => onChange(setAgainWait(type, scope, selPath, { n }), `again-${selected}`)} />
                    <Segmented size="sm" idPrefix="again-unit" label="Unit" options={WAIT_UNIT_OPTIONS} value={current.wait.unit} onChange={(unit) => onChange(setAgainWait(type, scope, selPath, { unit }))} />
                  </div>
                  <Toggle id="again-capped" says={{ on: "Never later than the current stage", off: "Can be later than the current stage" }} on={current.capped === true} onChange={(capped) => onChange(setAgainCapped(type, scope, selPath, capped))} />
                </>
              )}
              <div className="menu-sep" />
              <Button
                variant="item"
                className="is-danger"
                onClick={() => {
                  onChange(flattenAgain(type, scope, selPath));
                  setSelected(null);
                }}
              >
                <Icon name="close" />
                Remove this step
              </Button>
            </>
          ) : (
            <>
              <Segmented<string> size="sm" idPrefix="step" label="Up or down the ladder" options={MOVE_OPTIONS} value={currentKey} onChange={pick} />
              <div className="chips menu-chips">
                {STEP_OPTIONS.filter((o) => o.step.kind !== "move").map((o) => (
                  <Button key={o.id} variant="chip" aria-pressed={currentKey === o.id} data-opt={o.id} onClick={() => pick(o.id)}>
                    {o.id === "burn" ? <Icon name="flame" /> : o.id === "hidden" ? <Icon name="lock" /> : null}
                    {stepLabel(type, o.step)}
                  </Button>
                ))}
                {AGAIN_OPTIONS.map((o) => (
                  <Button key={o.id} variant="chip" data-opt={o.id} onClick={() => pick(o.id)}>
                    <Icon name="review" />
                    {o.label}
                  </Button>
                ))}
              </div>
              {stageDots("Straight to a stage", (id) => pick(`to:${id}`))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
