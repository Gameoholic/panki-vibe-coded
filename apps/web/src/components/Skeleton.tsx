import type { CSSProperties } from "react";

/**
 * What's coming, drawn as its shape while it loads (the owner, 2026-10-26: "make it a skeleton whenever we do loading
 * across the entire app"): quiet blocks where the words, rows and tiles will be, a soft sweep passing over them. It
 * comes in after a beat (`.skel-in`), so something that loads at once never flashes. The one way anything in the app
 * says it's loading; never "Loading…" in words.
 */

/** One block: a line of words, a button, a picture, as wide and as tall as given. */
export function Bone({ w = "100%", h = "0.9em", round = false, className = "" }: { w?: string; h?: string; round?: boolean; className?: string }) {
  const style: CSSProperties = { width: w, height: h };
  return <span className={`skel ${round ? "is-round" : ""} ${className}`.trim()} style={style} aria-hidden="true" />;
}

/**
 * The shapes a screen or a part of one takes while it loads, one registry: rows of a list, panels of settings, setting
 * rows inside a panel already there, the board's tiles, a review, a form, an editor beside its card, a few lines in a
 * panel, and one tile's body. A new kind of
 * screen takes the one it looks like, or is one entry here.
 */
export type SkeletonShape = "rows" | "panels" | "settings" | "board" | "review" | "form" | "editor" | "lines" | "tile";

/** Widths that vary a little from row to row, so a list of blocks reads as a list of things and not a grid. */
const WIDTHS = ["46%", "62%", "38%", "54%", "70%", "42%"];
const widthAt = (i: number) => WIDTHS[i % WIDTHS.length] ?? "50%";

function Rows({ count }: { count: number }) {
  return (
    <div className="skel-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-row">
          <span className="skel-stack">
            <Bone w={widthAt(i)} h="1.05em" />
            <Bone w={widthAt(i + 3)} h="0.75em" className="is-faint" />
          </span>
          <Bone w="4.5em" h="1.5em" round />
        </div>
      ))}
    </div>
  );
}

function Lines({ count }: { count: number }) {
  return (
    <div className="skel-lines">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} w={i === count - 1 && count > 1 ? "40%" : widthAt(i + 1)} />
      ))}
    </div>
  );
}

/** A setting's row: its label at the left, its control at the right. */
function SettingRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-setting">
          <Bone w={widthAt(i)} h="1em" />
          <Bone w="7em" h="2.2em" />
        </div>
      ))}
    </>
  );
}

function Panel({ rows }: { rows: number }) {
  return (
    <section className="panel skel-panel">
      <Bone w="8em" h="0.8em" className="is-faint" />
      <SettingRows count={rows} />
    </section>
  );
}

/** One tile's body: a big figure and a line or two under it. */
function TileBody() {
  return (
    <div className="skel-tile">
      <Bone w="35%" h="2em" />
      <Bone w="80%" />
      <Bone w="55%" className="is-faint" />
    </div>
  );
}

export function Skeleton({ shape, count }: { shape: SkeletonShape; count?: number }) {
  let body;
  switch (shape) {
    case "rows":
      body = <Rows count={count ?? 5} />;
      break;
    case "lines":
      body = <Lines count={count ?? 3} />;
      break;
    case "tile":
      body = <TileBody />;
      break;
    case "settings":
      body = (
        <div className="skel-panel">
          <SettingRows count={count ?? 3} />
        </div>
      );
      break;
    case "panels":
      body = (
        <div className="skel-panels">
          <Panel rows={3} />
          <Panel rows={2} />
        </div>
      );
      break;
    case "board":
      body = (
        <div className="board skel-board">
          {Array.from({ length: count ?? 6 }, (_, i) => (
            <section key={i} className="panel widget">
              <div className="w-head">
                <Bone w={widthAt(i)} h="0.8em" className="is-faint" />
              </div>
              <TileBody />
            </section>
          ))}
        </div>
      );
      break;
    case "review":
      body = (
        <div className="skel-review">
          <div className="skel-review-top">
            <Bone w="4.5em" />
            <Bone w="3.5em" />
            <Bone w="3.5em" />
          </div>
          <div className="panel skel-review-card">
            <Bone w="5em" h="1.4em" round />
            <Bone w="30%" h="3em" />
            <Bone w="70%" h="1.1em" className="is-faint" />
          </div>
          <Bone h="2.9em" />
        </div>
      );
      break;
    case "form":
      body = (
        <section className="panel skel-panel">
          <Bone w="9em" h="0.8em" className="is-faint" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="skel-field">
              <Bone w="6em" h="0.8em" />
              <Bone h="2.6em" />
            </span>
          ))}
          <Bone w="7em" h="2.6em" />
        </section>
      );
      break;
    case "editor":
      body = (
        <div className="skel-editor">
          <div className="panel skel-editor-main">
            <Bone w="40%" h="1.2em" />
            <Bone h="16em" />
          </div>
          <div className="skel-panels">
            <Panel rows={3} />
          </div>
        </div>
      );
      break;
  }
  return (
    <div className={`skel-in skel-${shape}-shape`} role="status" aria-label="Loading" aria-busy="true">
      {body}
    </div>
  );
}
