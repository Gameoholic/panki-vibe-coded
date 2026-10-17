/**
 * Plays a stretch of a video in place, on the page's own player: to hear a clip before it's made. Round and round
 * until it's stopped, or once (the second around an end that was just moved). Nothing is recorded and nothing is
 * fetched: the video is moved to where the stretch begins and stopped, or sent back, where it ends.
 *
 * It also remembers where the video stood before the first time it was moved, so that whoever opened the panel can
 * put it back when the panel closes: looking a clip over must not lose someone their place in the video.
 */

/** How it's being played: round and round, or once. */
export type Replaying = "round" | "once";

/** How often where the video is gets looked at, in ms. A video says so itself only about four times a second, which would overshoot an end by a word. */
const WATCH_MS = 30;

export function createReplay() {
  let video: HTMLVideoElement | null = null;
  let mode: Replaying | null = null;
  let from = 0;
  let to = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let home: number | null = null;
  /** Counts the times a stretch was started, so a late answer about an earlier one is known for what it is. */
  let run = 0;
  const listeners = new Set<() => void>();

  /** No longer playing a stretch; the video itself is left as it is. */
  function halt() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    video?.removeEventListener("pause", onPause);
    if (mode === null) return;
    mode = null;
    for (const listener of listeners) listener();
  }
  // Stopped by anything else (the player's own button, the end of the video): it isn't this playing it any more. A
  // video says it paused a moment after it did, so one that is playing again by then was stopped for the stretch before.
  function onPause() {
    if (video?.paused) halt();
  }
  function stop() {
    if (mode === null) return;
    const playing = video;
    halt();
    playing?.pause();
  }
  function watch() {
    if (!video || mode === null || video.currentTime < to) return;
    if (mode === "round") video.currentTime = from;
    else stop();
  }

  return {
    /** Plays from `at` (the beginning of the stretch, unless said) to its end, then stops, or goes round. */
    play(next: HTMLVideoElement, stretch: { from: number; to: number }, how: Replaying, at = stretch.from) {
      halt();
      const mine = ++run;
      video = next;
      from = stretch.from;
      to = stretch.to;
      home ??= next.currentTime;
      mode = how;
      next.currentTime = at;
      next.addEventListener("pause", onPause);
      timer = setInterval(watch, WATCH_MS);
      // A video that won't play isn't being played. One refused because it was stopped again meanwhile is old news.
      void next.play().catch(() => {
        if (run === mine) halt();
      });
      for (const listener of listeners) listener();
    },
    stop,
    /** The stretch going round has other ends now: it goes on inside them. */
    retarget(stretch: { from: number; to: number }) {
      if (mode !== "round" || !video) return;
      from = stretch.from;
      to = stretch.to;
      if (video.currentTime < from || video.currentTime >= to) video.currentTime = from;
    },
    /** The panel is closing: stops, and gives back where the video stood before it was first moved (null when it never was). */
    leave(): number | null {
      stop();
      const stood = home;
      home = null;
      return stood;
    },
    /** The player has gone on to another video: nothing of the last one applies, and this one is left playing. */
    forget() {
      halt();
      home = null;
    },
    mode: (): Replaying | null => mode,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
