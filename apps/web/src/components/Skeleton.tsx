import type { CSSProperties } from "react";

/**
 * What's coming, drawn as its shape while it loads (the owner, 2026-10-26: "make it a skeleton whenever we do loading
 * across the entire app"): quiet blocks where the words, rows and tiles will be, a soft sweep passing over them. Each
 * shape is built of the real screen's own classes (a deck's row is a `deck-row`, a setting a `setting`, the review a
 * `review is-fit`), so it stands exactly where the real thing will and nothing jumps as it arrives; and it shows only
 * once a load has taken a moment (`.skel-in`, `.skel`), so a quick one never shows it at all (the owner, the same day:
 * the first skeletons "don't really fit the UI… super jumpy"). The one way anything in the app says it's loading; never
 * "Loading…" in words.
 */

/** One block: a line of words, a button, a picture, as wide and as tall as given. */
export function Bone({ w = "100%", h = "0.9em", round = false, className = "" }: { w?: string; h?: string; round?: boolean; className?: string }) {
  const style: CSSProperties = { width: w, height: h };
  return <span className={`skel ${round ? "is-round" : ""} ${className}`.trim()} style={style} aria-hidden="true" />;
}

/**
 * The shapes a screen or a part of one takes while it loads, one registry: a list of rows (decks, types, SRS types), a
 * deck's cards, the rows of a panel in Settings (`kept-row`: storage, the extension, dictionaries), today's cards before
 * a review (`review-today`), panels of settings, setting rows inside a panel already there, the board's tiles, a review, a form, an
 * editor beside its card, a few lines in a panel, and one tile's body. A new kind of screen takes the one it looks
 * like, or is one entry here built of its own classes.
 */
export type SkeletonShape = "rows" | "cards" | "kept" | "panels" | "settings" | "board" | "today" | "review" | "form" | "editor" | "lines" | "tile";

/** Widths that vary a little from row to row, so a list of blocks reads as a list of things and not a grid. */
const WIDTHS = ["46%", "62%", "38%", "54%", "70%", "42%"];
const widthAt = (i: number) => WIDTHS[i % WIDTHS.length] ?? "50%";
const times = (n: number) => Array.from({ length: n }, (_, i) => i);

/** What says it's loading, on the shape's own root. */
const status = { role: "status", "aria-label": "Loading", "aria-busy": true } as const;

/** Setting rows as `Setting` draws them: the label at the left, the control at the right. */
function SettingRows({ count }: { count: number }) {
  return (
    <>
      {times(count).map((i) => (
        <div key={i} className="setting">
          <div className="setting-head">
            <span className="setting-label">
              <Bone w={`${7 + (i % 3) * 2}em`} h="1em" />
            </span>
            <Bone w="9em" h="2.4em" />
          </div>
        </div>
      ))}
    </>
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

/**
 * `count` is how many rows, lines or tiles; `parts`, for `today`, how many tiles each of its panels holds (reviews,
 * then new), and `firstReviews` whether the first is the reviews one, whose head alone carries a stage's chip.
 */
export function Skeleton({ shape, count, parts, firstReviews = false, tabs = false }: { shape: SkeletonShape; count?: number; parts?: readonly number[]; firstReviews?: boolean; tabs?: boolean }) {
  switch (shape) {
    case "today":
      // As `ReviewView` → `TodayCards` draws today's cards: Start at the right, then a panel of tiles for each kind.
      return (
        <section className="skel-in review-today" {...status}>
          <div className="today-bar">
            <span className="today-left" />
            <Bone w="11em" h="52px" />
          </div>
          {(parts ?? [count ?? 6]).map((tiles, i) => (
            <section key={i} className="panel today-panel">
              <div className="today-head">
                <h2 className="panel-title">
                  <Bone w="5em" h="0.8em" />
                </h2>
                <span className="today-of">
                  <Bone w="2.5em" h="0.9em" />
                </span>
                <span className="chips">
                  {firstReviews && i === 0 ? <Bone w="7em" h="2em" /> : null}
                  <Bone w="2.4em" h="2em" />
                  <Bone w="3.2em" h="2em" />
                </span>
              </div>
              <div className="today-cards">
                {times(tiles).map((t) => (
                  <div key={t} className="btn btn-chip today-card">
                    <Bone w={`${2.4 + (t % 3) * 0.8}em`} h="1.8em" />
                    <Bone w="6.5em" h="1.4em" round />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </section>
      );
    case "rows":
      // As `DeckList`, `TypesView` and `SrsTypesView` draw theirs: a title, then rows of a name, a line under it and a pill.
      return (
        <section className="skel-in" {...status}>
          <h2 className="list-title">
            <Bone w="5em" h="1em" />
          </h2>
          <ul className="deck-list">
            {times(count ?? 4).map((i) => (
              <li key={i} className="deck-item">
                <div className="btn btn-row deck-row">
                  <span className="deck-name">
                    <Bone w={widthAt(i)} h="1em" />
                    <span className="row-sub">
                      <Bone w={widthAt(i + 3)} h="0.8em" className="is-faint" />
                    </span>
                  </span>
                  <span className="deck-count">
                    <Bone w="3.5em" h="0.9em" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    case "cards": {
      // As `CardsView` really stands: the count with Sort by at its right and Search under them (there with two cards
      // or more, as the real ones are), then `CardList`'s rows: the word with its sentence, the meaning under them,
      // the pill and its due time at the right, the pencil and delete past them.
      const rows = count ?? 5;
      return (
        <section className="skel-in" {...status}>
          {rows >= 2 ? (
            <>
              <div className="list-head">
                <h2 className="list-title">
                  <Bone w="4em" h="0.8em" />
                </h2>
                <span className="skel-tools">
                  <Bone w="3em" h="0.8em" className="is-faint" />
                  <Bone w="5.5em" h="2em" />
                  <Bone w="10.5em" h="2em" />
                </span>
              </div>
              <div className="list-search">
                <span className="skel-field">
                  <Bone w="3em" h="0.75em" className="is-faint" />
                  <Bone h="38px" />
                </span>
              </div>
            </>
          ) : (
            <h2 className="list-title">
              <Bone w="4em" h="0.8em" />
            </h2>
          )}
          <ul className="card-list">
            {times(rows).map((i) => (
              <li key={i} className="card-row has-state has-tools">
                <div className="card-row-ja">
                  <Bone w={`${3 + (i % 3)}em`} h="1.1em" />
                  <Bone w={widthAt(i)} h="0.95em" className="is-faint" />
                </div>
                <div className="card-meaning">
                  <Bone w={widthAt(i + 2)} h="0.95em" />
                </div>
                <div className="card-state">
                  <Bone w="3.5em" h="1.35em" round />
                  <Bone w="2.5em" h="0.8em" className="is-faint" />
                </div>
                <div className="card-tools">
                  <Bone w="28px" h="28px" />
                  <Bone w="28px" h="28px" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "kept":
      // As Settings' panels list what's kept: a name with a line under it, and a size or a button at the right.
      return (
        <div className="skel-in kept-rows" {...status}>
          {times(count ?? 2).map((i) => (
            <div key={i} className="kept-row">
              <span className="kept-name">
                <Bone w={widthAt(i)} h="1em" />
                <span className="row-sub">
                  <Bone w={widthAt(i + 2)} h="0.8em" className="is-faint" />
                </span>
              </span>
              <span className="kept-size">
                <Bone w="4em" h="1em" />
              </span>
            </div>
          ))}
        </div>
      );
    case "panels":
      // As Settings and a deck's settings draw theirs: panels of setting rows under a small title; `tabs` is the
      // Segmented row over the app's Settings, which a deck's settings don't have.
      return (
        <div className="skel-in skel-panels" {...status}>
          {tabs ? <Bone h="42px" /> : null}
          {[4, 3].map((rows, i) => (
            <section key={i} className="panel">
              <h2 className="panel-title">
                <Bone w="7em" h="0.8em" />
              </h2>
              <SettingRows count={rows} />
            </section>
          ))}
        </div>
      );
    case "settings":
      return (
        <div className="skel-in" {...status}>
          <SettingRows count={count ?? 3} />
        </div>
      );
    case "board":
      return (
        <div className="skel-in board" {...status}>
          {times(count ?? 6).map((i) => (
            <section key={i} className="panel widget">
              <div className="w-head">
                <h3 className="panel-title">
                  <Bone w={widthAt(i)} h="0.8em" />
                </h3>
              </div>
              <TileBody />
            </section>
          ))}
        </div>
      );
    case "review":
      // The review's own frame (`ReviewView`, `.review.is-fit`): the counts, the card taking the room, Show answer under it.
      return (
        <section className="skel-in review is-fit" {...status}>
          <div className="review-top">
            <span className="review-counts">
              <Bone w="4.5em" h="1em" />
              <Bone w="3.5em" h="1em" />
              <Bone w="3.5em" h="1em" />
            </span>
          </div>
          <div className="review-card is-still skel-review-card">
            <span className="review-place">
              <Bone w="6em" h="1.5em" round />
            </span>
            <Bone w="30%" h="3em" />
            <Bone w="60%" h="1.1em" className="is-faint" />
          </div>
          <div className="review-actions">
            <Bone h="46px" />
          </div>
        </section>
      );
    case "form":
      return (
        <section className="skel-in panel skel-form" {...status}>
          <h2 className="panel-title">
            <Bone w="8em" h="0.8em" />
          </h2>
          {times(3).map((i) => (
            <span key={i} className="skel-field">
              <Bone w="6em" h="0.8em" />
              <Bone h="2.75em" />
            </span>
          ))}
          <Bone w="7em" h="2.6em" />
        </section>
      );
    case "editor":
      return (
        <div className="skel-in skel-editor" {...status}>
          <div className="panel skel-editor-main">
            <Bone w="40%" h="1.2em" />
            <Bone h="16em" />
          </div>
          <section className="panel">
            <SettingRows count={3} />
          </section>
        </div>
      );
    case "lines":
      return (
        <div className="skel-in skel-lines" {...status}>
          {times(count ?? 3).map((i) => (
            <Bone key={i} w={i === (count ?? 3) - 1 && (count ?? 3) > 1 ? "40%" : widthAt(i + 1)} />
          ))}
        </div>
      );
    case "tile":
      return (
        <div className="skel-in" {...status}>
          <TileBody />
        </div>
      );
  }
}
