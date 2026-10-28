/** The app's icons, one registry: a name and the strokes that draw it on a 24-unit grid. */
const ICONS = {
  home: ["M3 11l9-8 9 8", "M5 10v10h14V10"],
  settings: ["M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"],
  stats: ["M3 17l6-6 4 4 8-8", "M14 7h7v7"],
  review: ["M4 12a8 8 0 0 1 13.7-5.7", "M18 2v5h-5", "M20 12a8 8 0 0 1-13.7 5.7", "M6 22v-5h5"],
  decks: ["M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z", "M7 4h10"],
  type: ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M7 9h10", "M7 13h6"],
  srs: ["M4 20h4v-5H4z", "M10 20h4v-9h-4z", "M16 20h4V7h-4z"],
  add: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  back: ["M15 5l-7 7 7 7"],
  /** The other way from `back`: the next of something, as a review card's next example. */
  forward: ["M9 5l7 7-7 7"],
  down: ["M6 9l6 6 6-6"],
  up: ["M6 15l6-6 6 6"],
  /** One arrow going round: asked again (`review`, two arrows, is the Review door). */
  again: ["M20 12a8 8 0 1 1-2.3-5.7", "M20 4v4h-4"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  grip: ["M9 5v1.5", "M15 5v1.5", "M9 11v1.5", "M15 11v1.5", "M9 17v1.5", "M15 17v1.5"],
  flame: ["M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 3-2 4-3 4 0-3-1-6-4-9 0 4-4 6-4 11 0 4 3 8 7 8z"],
  undo: ["M9 14L4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-4"],
  redo: ["M15 14l5-5-5-5", "M20 9H9a5 5 0 0 0 0 10h4"],
  check: ["M5 12l5 5L20 7"],
  lock: ["M6 11h12v9H6z", "M8 11V8a4 4 0 0 1 8 0v3"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  play: ["M8 5l11 7-11 7z"],
  pause: ["M8 5v14", "M16 5v14"],
  /** A crescent: a card buried until tomorrow (`pause` is a suspended one too). */
  moon: ["M20 13.5A8 8 0 1 1 10.5 4a7 7 0 0 0 9.5 9.5z"],
  sound: ["M4 9.5h3.5L12 6v12l-4.5-3.5H4z", "M15.5 9a4 4 0 0 1 0 6", "M18 6.5a7.5 7.5 0 0 1 0 11"],
  quiet: ["M4 9.5h3.5L12 6v12l-4.5-3.5H4z", "M15.5 9a4 4 0 0 1 0 6"],
  muted: ["M4 9.5h3.5L12 6v12l-4.5-3.5H4z", "M16 9.5l5 5", "M21 9.5l-5 5"],
  film: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M7 5v14", "M17 5v14", "M3 9.5h4", "M3 14.5h4", "M17 9.5h4", "M17 14.5h4"],
  picture: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M3 16l5-5 4 4 3-3 6 6", "M15.5 9.5h.01"],
  full: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  unfull: ["M9 4v5H4", "M15 4v5h5", "M9 20v-5H4", "M15 20v-5h5"],
  out: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  /** Two links of a chain: a setting set somewhere else and shown here as it stands there (Video tracking in Panki's Settings, the extension's). */
  link: ["M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5", "M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"],
  /** A clock: where a video was stopped, on its seek bar and in Continue watching. */
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z", "M12 7v5l3 2"],
  /** A screen: a video watched, the immersion tiles. */
  tv: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M9 21h6", "M12 18v3"],
  /**
   * Time spent, by what on: a clock at the foot of a video, its play sign on it (time watched), or of a card (time reviewing). The pill's
   * two times, told apart at a glance with the clock the same in both (the owner, 2026-10-28).
   */
  watchTime: ["M4 3h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M6.5 5.5v4l3.5-2z", "M17.5 13a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9z", "M17.5 15.5v2l1.5 1"],
  reviewTime: ["M3 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M5 6h4", "M5 9h3", "M17.5 13a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9z", "M17.5 15.5v2l1.5 1"],
  /** A warning sign: a card being added is called the same as one already there (`AlreadyIn`). */
  alert: ["M12 3.5L21.5 20h-19z", "M12 10v4.5", "M12 17.5h.01"],
  /** The transcription modes' (`ModeChip.tsx` → `MODE_ICONS`, picked by the owner, 2026-10-20): the whole video downloaded into a tray (Full), an arrow running ahead to a bar (Live), the download with a chunk's head start (Hybrid). (Auto's bolt went with Auto.) */
  download: ["M12 3v11", "M8 10l4 4 4-4", "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"],
  lead: ["M3 12h11", "M10 8l4 4-4 4", "M19 6v12"],
  hybrid: ["M12 3v11", "M8 10l4 4 4-4", "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2", "M16 2l2 2-2 2", "M19.5 2l2 2-2 2"],
} as const;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  className?: string;
};

/** Decorative always: the button or label next to it carries the words. */
export function Icon({ name, className = "" }: Props) {
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
