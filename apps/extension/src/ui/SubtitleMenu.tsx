import { useEffect, useRef, useState } from "react";
import type { SubtitleStyle } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { SubtitleStyleFields } from "@web/components/SubtitleStyleFields";
import { useDismiss } from "@web/hooks/useDismiss";

/**
 * How the transcript looks over the video, set on the page itself (the owner, 2026-10-17: "edit the subtitles directly
 * in YouTube… not the vanilla subtitle settings button but somewhere else", after a day on the options page): a
 * Subtitles button in the strip's head, and under it a panel of the style's settings (the app's `SubtitleStyleFields`,
 * which its own Settings draw for a card's clip), each kept the moment it's changed and seen on the video at once.
 * While the panel is open the band on the video can be dragged where it's wanted (`onOpen` tells the page). The panel
 * is the Transcription menu's shape (`.strip-menu`), a little wider for the controls.
 */
export function SubtitleMenu({ style, onChange, onOpen }: { style: SubtitleStyle; onChange: (style: SubtitleStyle) => void; onOpen: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  useEffect(() => {
    onOpen(open);
  }, [open, onOpen]);
  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button className="capture-tool" aria-expanded={open} aria-controls="panki-subtitle-menu" onClick={() => setOpen((was) => !was)}>
        Subtitles
        <Icon name="down" />
      </Button>
      {open ? (
        <div id="panki-subtitle-menu" className="strip-menu is-settings" role="dialog" aria-label="Subtitles">
          {/* Dragging is the way nobody could guess (the owner, 2026-10-17: "directly drag the subtitle bar"); the one line here says so. */}
          <SubtitleStyleFields idPrefix="subtitle" style={style} onChange={onChange} acrossWhy="Or drag the subtitles on the video while this is open." small />
        </div>
      ) : null}
    </div>
  );
}
