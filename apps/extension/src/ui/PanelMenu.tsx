/** @panki The Panki panel's one menu on its head (`PanelMenu`). Never a second menu on the head. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { sizeWords, type SubtitleStyle } from "@panki/contracts";
import { Ask } from "@web/components/Ask";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Segmented } from "@web/components/Segmented";
import { SubtitleStyleFields } from "@web/components/SubtitleStyleFields";
import { useDismiss } from "@web/hooks/useDismiss";
import type { DownloadRow } from "../download/download";
import { shareOf, totalWords } from "../download/words";
import { askOpenPanki, askOptions } from "../messages";
import { PANEL_VIEWS, PANEL_VIEW_IDS, type PanelView } from "../modules";
import { SUBTITLE_SOURCES, SUBTITLE_SOURCE_IDS, type SubtitleSource } from "../subtitles";

type Props = {
  /** Where the words come from; null while Panki's settings aren't in, when there's nothing to pick from yet. */
  source: { value: SubtitleSource; onChange: (source: SubtitleSource) => void } | null;
  /** Where the panel stands, kept for every video. */
  view: { value: PanelView; onChange: (view: PanelView) => void };
  /**
   * How the transcript looks over the video; null while it isn't over the video. `onStyling` says whether its page is
   * showing, the only time the band on the video can be dragged.
   */
  style: { value: SubtitleStyle; onChange: (style: SubtitleStyle) => void; onStyling: (open: boolean) => void } | null;
  /** Downloading the video on the page, and every download there is; null off a video. */
  download: DownloadMenu | null;
};

/**
 * The video's download in the menu (`download/runner.ts`): its row when it has one; every download, null until read;
 * whether it can be downloaded now (its length known, no ad playing); asking for it, taking it off; and `watch`, read
 * again every moment while the menu is open, so another page's progress shows.
 */
export type DownloadMenu = {
  row: DownloadRow | null;
  /** While it runs on this page and has kept nothing yet, where it got to. */
  where: string | null;
  /** Downloaded, what playing it from the copy did last on this page (`download/playback.ts`); null before it has done anything. */
  playing: string | null;
  rows: readonly DownloadRow[] | null;
  can: boolean;
  onDownload: () => void;
  onRemove: () => void;
  watch: () => () => void;
};

/** Which of the menu's two pages shows: its rows, or the subtitle style's settings in their place. */
type Page = "rows" | "style";

/**
 * The video's download as a row of the menu: Download this video; while it comes in, how far, a thin bar under it
 * filling; once it's whole, Downloaded and its size. Pressed while it's there, it asks before it's taken off, in a
 * small panel hanging from it. Then Downloads…, every download on the options page, how many and their room.
 */
function DownloadRows({ download, onList }: { download: DownloadMenu; onList: () => void }) {
  const [asking, setAsking] = useState(false);
  const at = useRef<HTMLButtonElement>(null);
  const row = download.row;
  const share = row ? shareOf(row) : 0;
  return (
    <div className="strip-menu-items">
      <p className="strip-menu-label">Download</p>
      {row === null ? (
        <Button variant="item" disabled={!download.can} onClick={download.onDownload}>
          <Icon name="download" />
          Download this video
        </Button>
      ) : (
        <Button
          ref={at}
          variant="item"
          className={row.state === "done" ? "download-item is-done" : "download-item"}
          aria-expanded={asking}
          style={{ "--p": share / 100 } as CSSProperties}
          onClick={() => setAsking(!asking)}
        >
          <Icon name={row.state === "done" ? "downloaded" : "download"} />
          {row.state === "done" ? "Downloaded" : row.state === "going" ? "Downloading" : "Waiting"}
          <span className="item-note">{row.state === "done" ? sizeWords(row.bytes) : `${share}%`}</span>
          {row.state === "done" ? null : <i className="download-bar" aria-hidden="true" />}
        </Button>
      )}
      {row !== null && row.state === "waiting" && row.trouble ? <p className="download-why">{row.trouble}</p> : null}
      {row !== null && row.state === "going" && download.where ? <p className="download-why">{download.where}</p> : null}
      {row !== null && row.state === "done" && download.playing ? <p className="download-why">{download.playing}</p> : null}
      {row !== null && asking ? (
        <Ask
          idPrefix="panki-download-remove"
          anchor={at}
          question={row.state === "done" ? "Remove this download?" : "Stop and remove this download?"}
          detail={row.state === "done" ? sizeWords(row.bytes) : `${share}% in, ${sizeWords(row.bytes)}`}
          go={{ words: "Remove", busy: "Removing…" }}
          busy={false}
          failure={null}
          onKeep={() => setAsking(false)}
          onGo={() => {
            setAsking(false);
            download.onRemove();
          }}
        />
      ) : null}
      <Button variant="item" onClick={onList}>
        <Icon name="folder" />
        Downloads…
        {download.rows && download.rows.length > 0 ? <span className="item-note">{totalWords(download.rows)}</span> : null}
      </Button>
    </div>
  );
}

/**
 * The Panki panel's one menu, behind ≡ at the end of its head: every setting the head doesn't show, as rows grouped under
 * quiet labels the way the Transcription menu groups its items, each changed in its row while the menu stays open so
 * the panel is seen changing behind it (Subtitles, Panel, Download, Panki). Subtitle style… takes the menu's place with the style's settings (the app's
 * `SubtitleStyleFields`, which its own Settings draw for a card's clip), each kept the moment it's changed, and while
 * they show the band on the video can be dragged. The Transcription menu's shape (`.strip-menu`), closed by a press
 * outside or Escape; its rows under ≡ at the head's right edge, as wide as they need (`.is-panel`).
 */
export function PanelMenu({ source, view, style, download }: Props) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("rows");
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  // Open, the downloads are read again every moment: one may be coming in on another page.
  const watch = download?.watch;
  useEffect(() => (open && watch ? watch() : undefined), [open, watch]);
  // Closed, or the transcript no longer over the video, it's the rows again next time.
  const styling = open && page === "style" && style !== null;
  useEffect(() => {
    if (!open || style === null) setPage("rows");
  }, [open, style]);
  const onStyling = style?.onStyling;
  // Said false again as it goes, so the band never stays draggable once the style's settings can't be seen.
  useEffect(() => {
    if (!styling || !onStyling) return;
    onStyling(true);
    return () => onStyling(false);
  }, [styling, onStyling]);
  const done = (what: () => void) => {
    what();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button className="capture-tool btn-icon" aria-label="Panel settings" aria-expanded={open} aria-controls="panki-panel-menu" onClick={() => setOpen((was) => !was)}>
        <Icon name="menu" />
      </Button>
      {!open ? null : styling && style ? (
        <div id="panki-panel-menu" className="strip-menu is-settings" role="dialog" aria-label="Subtitle style">
          <Button variant="item" className="strip-menu-back" onClick={() => setPage("rows")}>
            <Icon name="back" />
            Subtitle style
          </Button>
          {/* Dragging the band is the way nobody could guess; the one line here says so. */}
          <SubtitleStyleFields idPrefix="subtitle" style={style.value} onChange={style.onChange} acrossWhy="Or drag the subtitles on the video while this is open." small />
        </div>
      ) : (
        <div id="panki-panel-menu" className="strip-menu is-panel" role="dialog" aria-label="Panel settings">
          {source || style ? (
            <div className="strip-menu-items">
              <p className="strip-menu-label">Subtitles</p>
              {source ? (
                <div className="strip-menu-seg">
                  <Segmented
                    idPrefix="panki-subtitles"
                    label="Subtitles"
                    size="sm"
                    options={SUBTITLE_SOURCE_IDS.map((id) => ({ id, label: SUBTITLE_SOURCES[id].short }))}
                    value={source.value}
                    onChange={source.onChange}
                  />
                </div>
              ) : null}
              {style ? (
                <Button variant="item" onClick={() => setPage("style")}>
                  <Icon name="subtitles" />
                  Subtitle style…
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="strip-menu-items">
            <p className="strip-menu-label">Panel</p>
            <div className="strip-menu-seg">
              <Segmented
                idPrefix="panki-panel-view"
                label="View"
                size="sm"
                options={PANEL_VIEW_IDS.map((id) => ({ id, label: PANEL_VIEWS[id].name, icon: PANEL_VIEWS[id].icon }))}
                value={view.value}
                onChange={view.onChange}
              />
            </div>
          </div>
          {download ? <DownloadRows download={download} onList={() => done(() => void askOptions("downloads"))} /> : null}
          <div className="strip-menu-items">
            <p className="strip-menu-label">Panki</p>
            {/* Panki itself, the one the profile in use is signed in to, in a tab of its own. */}
            <Button variant="item" onClick={() => done(() => void askOpenPanki())}>
              <Icon name="out" />
              Open Panki
            </Button>
            {/* The extension's own settings, on their Videos tab, where the panel's are. */}
            <Button variant="item" onClick={() => done(() => void askOptions("videos"))}>
              <Icon name="settings" />
              Extension settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
