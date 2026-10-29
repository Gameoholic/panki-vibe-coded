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
   * Time spent, by what on: a video with its play sign (time watched) or a card (time reviewing), big, with a small clock tucked into its corner. The pill's
   * two times, told apart at a glance with the clock the same in both (the owner, 2026-10-28).
   */
  watchTime: ["M13 16H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6", "M8 7.5v5l4.5-2.5z", "M18.5 14.5a4 4 0 1 0 0 8 4 4 0 1 0 0-8z", "M18.5 16.5v2l1.3 1"],
  reviewTime: ["M13 20H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8.5", "M7.5 7h5", "M7.5 10.5h5", "M7.5 14h2.5", "M18.5 14.5a4 4 0 1 0 0 8 4 4 0 1 0 0-8z", "M18.5 16.5v2l1.3 1"],
  /** Two arrows passing each other: one thing put in another's place, a card's file changed. */
  swap: ["M4 8h14", "M14 4l4 4-4 4", "M20 16H6", "M10 12l-4 4 4 4"],
  /** A screen with lines of words along its foot: a clip's subtitles, shown or hidden from its player's bar. */
  subtitles: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M7 12h4", "M13 12h4", "M7 15.5h7", "M16 15.5h1"],
  /** An eye: a card seen as a review would show it (`CardPreview`). */
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z"],
  /** A magnifying glass: looking at something without changing it, a card already there opened (`AlreadyIn`). */
  search: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13z", "M15.5 15.5L20 20"],
  /** A warning sign: a card being added is called the same as one already there (`AlreadyIn`). */
  alert: ["M12 3.5L21.5 20h-19z", "M12 10v4.5", "M12 17.5h.01"],
  // Every action carries its icon (the owner, 2026-10-29; the audit page's section 4): what each of these is for.
  /** A disk: Save, wherever something is kept (`check` is a thing already saved, or finished). */
  save: ["M5 4h11l3 3v13H5z", "M8 4v5h7V4", "M8 20v-6h8v6"],
  /** A circle struck through: backing out, Cancel and Keep (a × only closes). */
  cancel: ["M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z", "M6 18L18 6"],
  signIn: ["M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4", "M3 12h11", "M10 8l4 4-4 4"],
  signOut: ["M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4", "M9 12h11", "M16 8l4 4-4 4"],
  /** Panki on or off, and Video tracking turned off. */
  power: ["M12 3v9", "M7 6.5a7.5 7.5 0 1 0 10 0"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  /** A square: transcribing stopped (`pause` is a player's). */
  stop: ["M6 6h12v12H6z"],
  /** Up into a tray: a file sent to Panki or brought into the extension (a dictionary). */
  upload: ["M12 15V4", "M8 8l4-4 4 4", "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"],
  folder: ["M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"],
  /** Two arrows round: asked again, Reload Panki, Check now, Try again (`again` is a card asked again). */
  refresh: ["M20 5v5h-5", "M4 19v-5h5", "M19.5 10A8 8 0 0 0 5 7.5", "M4.5 14A8 8 0 0 0 19 16.5"],
  eyeOff: ["M3 3l18 18", "M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8", "M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  /** Saved for later, Panki's own, never YouTube's. */
  bookmark: ["M6 3h12v18l-6-4-6 4z"],
  /** A box: a video put away from Continue watching, to come back when it's played again. */
  archive: ["M3 4h18v4H3z", "M5 8v12h14V8", "M10 12h4"],
  user: ["M12 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z", "M4 21a8 8 0 0 1 16 0"],
  userAdd: ["M10 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z", "M2 21a8 8 0 0 1 13-6.2", "M19 14v6", "M16 17h6"],
  /** Back to what it was to begin with (`undo` takes back the last thing done). */
  reset: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
  /** Lines put in order: the rules chart tidied up. */
  tidy: ["M4 6h16", "M4 12h10", "M4 18h13"],
  /** A stage's own rules made the default's again. */
  sync: ["M12 3v4", "M12 17v4", "M8 12h8", "M5 8l3 4-3 4", "M19 8l-3 4 3 4"],
  /** Made the default. */
  star: ["M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"],
  /** A sun: a card put aside brought back, Unsnooze and Unsuspend. */
  wake: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z"],
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
