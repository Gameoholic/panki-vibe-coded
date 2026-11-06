import { useEffect, useRef, useState } from "react";
import type { SubtitleStyle } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Segmented } from "@web/components/Segmented";
import { SubtitleStyleFields } from "@web/components/SubtitleStyleFields";
import { useDismiss } from "@web/hooks/useDismiss";
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
};

/** Which of the menu's two pages shows: its rows, or the subtitle style's settings in their place. */
type Page = "rows" | "style";

/**
 * The Panki panel's one menu, behind ≡ at the end of its head: every setting the head doesn't show, as rows grouped under
 * quiet labels the way the Transcription menu groups its items, each changed in its row while the menu stays open so
 * the panel is seen changing behind it. Subtitle style… takes the menu's place with the style's settings (the app's
 * `SubtitleStyleFields`, which its own Settings draw for a card's clip), each kept the moment it's changed, and while
 * they show the band on the video can be dragged. The Transcription menu's shape (`.strip-menu`), closed by a press
 * outside or Escape.
 */
export function PanelMenu({ source, view, style }: Props) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("rows");
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
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
        <div id="panki-panel-menu" className="strip-menu" role="dialog" aria-label="Panel settings">
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
          <div className="strip-menu-items">
            <p className="strip-menu-label">Panki</p>
            {/* Panki itself, the one the profile in use is signed in to, in a tab of its own. */}
            <Button variant="item" onClick={() => done(() => void askOpenPanki())}>
              <Icon name="out" />
              Open Panki
            </Button>
            {/* The extension's own settings, on their YouTube tab. */}
            <Button variant="item" onClick={() => done(() => void askOptions("youtube"))}>
              <Icon name="settings" />
              Options
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
