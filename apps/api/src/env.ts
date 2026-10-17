import path from "node:path";
import type { EngineId, WordAudioSourceId } from "@panki/contracts";

/** Everything that differs between the owner's instance and a scratch one comes from the environment. */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  // 127.0.0.1 only: nothing reaches the API except through the proxy in front of it.
  host: "127.0.0.1",
  dataDir: process.env.PANKI_DATA_DIR ?? path.resolve(import.meta.dirname, "../data"),
  // The clock the owner's day turns over on. The VPS may run on UTC while they live elsewhere, so it's never assumed.
  timeZone: process.env.PANKI_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  // With less than this left on the data's disk, everyone signed in is told. A clip is about a megabyte, so the
  // default is a couple of thousand clips of warning; a small disk may want less.
  lowSpaceBytes: megabytes(process.env.PANKI_LOW_SPACE_MB, 2048),
  // A key per source of word audio (Forvo), used when none was typed in Settings → Admin. None unless it's set; never
  // logged, never sent anywhere but that source's own host.
  wordAudioKeys: { forvo: process.env.PANKI_FORVO_KEY?.trim() || null } satisfies Record<WordAudioSourceId, string | null>,
  // A key per transcription engine, used when none was typed in Settings → Admin. None unless it's set; never logged,
  // never sent anywhere but that engine's own host.
  engineKeys: { elevenlabs: process.env.PANKI_ELEVENLABS_KEY?.trim() || null } satisfies Record<EngineId, string | null>,
};

/** A number of megabytes from the environment, in bytes; the fallback when it's missing or isn't a number. */
function megabytes(said: string | undefined, fallback: number): number {
  const asked = Number(said);
  return (said !== undefined && said.trim() !== "" && Number.isFinite(asked) && asked >= 0 ? asked : fallback) * 1024 * 1024;
}
