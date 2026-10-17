import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Icon } from "@web/components/Icon";
import { NumberField } from "@web/components/NumberField";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { useDismiss } from "@web/hooks/useDismiss";
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_BOUNDS, SUBTITLE_FONTS, SUBTITLE_FONT_IDS, type SubtitleAlign, type SubtitleStyle } from "../transcribe/subtitleStyle";

/**
 * How the transcript looks over the video, set on the page itself (the owner, 2026-10-17: "edit the subtitles directly
 * in YouTube… not the vanilla subtitle settings button but somewhere else", after a day on the options page): a
 * Subtitles button in the strip's head, and under it a panel of the style's settings, each kept the moment it's
 * changed and seen on the video at once, each with its own way back to the default (the owner, the same day). While
 * the panel is open the band on the video can be dragged where it's wanted (`onOpen` tells the page). The panel is the
 * Transcription menu's shape (`.strip-menu`), a little wider for the controls.
 */
const ALIGN_OPTIONS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
] as const satisfies readonly { id: SubtitleAlign; label: string }[];

/** A setting's control with, beside it, the way back to its default while it stands anywhere else. */
function Resettable<K extends keyof SubtitleStyle>({ which, label, style, onChange, children }: { which: K; label: string; style: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void; children: ReactNode }) {
  const off = style[which] !== DEFAULT_SUBTITLE_STYLE[which];
  return (
    <span className="setting-pair">
      {children}
      {off ? (
        <Button className="btn-icon" aria-label={`Reset ${label}`} onClick={() => onChange({ [which]: DEFAULT_SUBTITLE_STYLE[which] })}>
          <Icon name="undo" />
        </Button>
      ) : null}
    </span>
  );
}

export function SubtitleMenu({ style, onChange, onOpen }: { style: SubtitleStyle; onChange: (style: SubtitleStyle) => void; onOpen: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  useEffect(() => {
    onOpen(open);
  }, [open, onOpen]);
  const set = (patch: Partial<SubtitleStyle>) => onChange({ ...style, ...patch });
  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button className="capture-tool" aria-expanded={open} aria-controls="panki-subtitle-menu" onClick={() => setOpen((was) => !was)}>
        Subtitles
        <Icon name="down" />
      </Button>
      {open ? (
        <div id="panki-subtitle-menu" className="strip-menu is-settings" role="dialog" aria-label="Subtitles">
          <Setting
            id="subtitle-size"
            label="Size"
            control={
              <Resettable which="size" label="Size" style={style} onChange={set}>
                <NumberField id="subtitle-size-value" label="Size" size="sm" value={style.size} min={SUBTITLE_BOUNDS.size.min} max={SUBTITLE_BOUNDS.size.max} suffix="px" onChange={(size) => set({ size })} />
              </Resettable>
            }
          />
          <Setting
            id="subtitle-font"
            label="Font"
            control={
              <Resettable which="font" label="Font" style={style} onChange={set}>
                {/* Where each font comes with, beside it: a font this device hasn't got does nothing, and this says why. */}
                <Dropdown
                  id="subtitle-font-choice"
                  label="Font"
                  options={SUBTITLE_FONT_IDS.map((id) => ({ id, label: SUBTITLE_FONTS[id].name, note: SUBTITLE_FONTS[id].from }))}
                  columns={{ choice: "Font", note: "Comes with" }}
                  value={style.font}
                  onChange={(font) => set({ font })}
                />
              </Resettable>
            }
          />
          <Setting
            id="subtitle-bottom"
            label="Height"
            control={
              <Resettable which="bottom" label="Height" style={style} onChange={set}>
                <NumberField id="subtitle-bottom-value" label="Height" size="sm" value={style.bottom} min={SUBTITLE_BOUNDS.bottom.min} max={SUBTITLE_BOUNDS.bottom.max} suffix="%" onChange={(bottom) => set({ bottom })} />
              </Resettable>
            }
          />
          <Setting
            id="subtitle-x"
            label="Across"
            // Dragging is the way nobody could guess (the owner, 2026-10-17: "directly drag the subtitle bar"); the one line here says so.
            why="Or drag the subtitles on the video while this is open."
            control={
              <Resettable which="x" label="Across" style={style} onChange={set}>
                <NumberField id="subtitle-x-value" label="Across" size="sm" value={style.x} min={SUBTITLE_BOUNDS.x.min} max={SUBTITLE_BOUNDS.x.max} suffix="%" onChange={(x) => set({ x })} />
              </Resettable>
            }
          />
          <Setting
            id="subtitle-align"
            label="Alignment"
            control={
              <Resettable which="align" label="Alignment" style={style} onChange={set}>
                <Segmented idPrefix="subtitle-align" label="Alignment" size="sm" options={ALIGN_OPTIONS} value={style.align} onChange={(align) => set({ align })} />
              </Resettable>
            }
          />
          <Setting
            id="subtitle-opacity"
            label="Background"
            control={
              <Resettable which="opacity" label="Background" style={style} onChange={set}>
                <NumberField id="subtitle-opacity-value" label="Background" size="sm" value={style.opacity} min={SUBTITLE_BOUNDS.opacity.min} max={SUBTITLE_BOUNDS.opacity.max} suffix="%" onChange={(opacity) => set({ opacity })} />
              </Resettable>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
