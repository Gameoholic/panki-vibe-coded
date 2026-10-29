import type { ReactNode } from "react";
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_BOUNDS, SUBTITLE_FONTS, SUBTITLE_FONT_IDS, type SubtitleAlign, type SubtitleStyle } from "@panki/contracts";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { Segmented } from "./Segmented";
import { Setting } from "./Setting";

type Props = {
  /** Every row's id starts with it, so two sets on one page never share one. */
  idPrefix: string;
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
  /** Said under the Across row: how else it's set, where there's another way (the extension's band, dragged on the video). */
  acrossWhy?: string;
  /** Smaller controls, for a menu. */
  small?: boolean;
};

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
          <Icon name="reset" />
        </Button>
      ) : null}
    </span>
  );
}

/**
 * How subtitles look, as rows of settings: size, font (each with where it comes with beside it), height, across,
 * alignment, the band's darkness, each with its own way back to the default (the owner, 2026-10-17). The extension's
 * Subtitles menu over a YouTube video and the app's Settings (a card's clip) both draw these; each keeps its own style.
 */
export function SubtitleStyleFields({ idPrefix, style, onChange, acrossWhy, small = false }: Props) {
  const set = (patch: Partial<SubtitleStyle>) => onChange({ ...style, ...patch });
  const size = small ? ("sm" as const) : ("md" as const);
  const id = (part: string) => `${idPrefix}-${part}`;
  return (
    <>
      <Setting
        id={id("size")}
        label="Size"
        control={
          <Resettable which="size" label="Size" style={style} onChange={set}>
            <NumberField id={id("size-value")} label="Size" size={size} value={style.size} min={SUBTITLE_BOUNDS.size.min} max={SUBTITLE_BOUNDS.size.max} suffix="px" onChange={(n) => set({ size: n })} />
          </Resettable>
        }
      />
      <Setting
        id={id("font")}
        label="Font"
        control={
          <Resettable which="font" label="Font" style={style} onChange={set}>
            {/* Where each font comes with, beside it: a font this device hasn't got does nothing, and this says why. */}
            <Dropdown
              id={id("font-choice")}
              label="Font"
              options={SUBTITLE_FONT_IDS.map((font) => ({ id: font, label: SUBTITLE_FONTS[font].name, note: SUBTITLE_FONTS[font].from }))}
              columns={{ choice: "Font", note: "Comes with" }}
              value={style.font}
              onChange={(font) => set({ font })}
            />
          </Resettable>
        }
      />
      <Setting
        id={id("bottom")}
        label="Height"
        control={
          <Resettable which="bottom" label="Height" style={style} onChange={set}>
            <NumberField id={id("bottom-value")} label="Height" size={size} value={style.bottom} min={SUBTITLE_BOUNDS.bottom.min} max={SUBTITLE_BOUNDS.bottom.max} suffix="%" onChange={(bottom) => set({ bottom })} />
          </Resettable>
        }
      />
      <Setting
        id={id("x")}
        label="Across"
        {...(acrossWhy ? { why: acrossWhy } : {})}
        control={
          <Resettable which="x" label="Across" style={style} onChange={set}>
            <NumberField id={id("x-value")} label="Across" size={size} value={style.x} min={SUBTITLE_BOUNDS.x.min} max={SUBTITLE_BOUNDS.x.max} suffix="%" onChange={(x) => set({ x })} />
          </Resettable>
        }
      />
      <Setting
        id={id("align")}
        label="Alignment"
        control={
          <Resettable which="align" label="Alignment" style={style} onChange={set}>
            <Segmented idPrefix={id("align")} label="Alignment" size={size} options={ALIGN_OPTIONS} value={style.align} onChange={(align) => set({ align })} />
          </Resettable>
        }
      />
      <Setting
        id={id("opacity")}
        label="Background"
        control={
          <Resettable which="opacity" label="Background" style={style} onChange={set}>
            <NumberField id={id("opacity-value")} label="Background" size={size} value={style.opacity} min={SUBTITLE_BOUNDS.opacity.min} max={SUBTITLE_BOUNDS.opacity.max} suffix="%" onChange={(opacity) => set({ opacity })} />
          </Resettable>
        }
      />
    </>
  );
}
