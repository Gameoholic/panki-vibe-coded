import { createApp } from "./app";
import { openAuthDb } from "./authDb";
import { createDbs } from "./dbs";
import { env } from "./env";
import { createForvo } from "./forvo";
import { sharedDictionaryDir } from "./mediaFiles";
import { gatherShared, openShared } from "./shared";
import { spaceOf, storageReport } from "./space";
import { checkTimeZone } from "./time";
import { createEngines } from "./transcribe/engines";
import { createJobs } from "./transcribe/jobs";

// Each account's database opens on its first request; the zone is checked here so a wrong one still fails at startup.
checkTimeZone(env.timeZone);
const auth = openAuthDb(env.dataDir);
const dbs = createDbs(env.dataDir, Date.now, env.timeZone);
const shared = openShared(env.dataDir);
// What accounts held before the shared store existed (a Forvo key, dictionaries) moves over, once, before anyone's served.
gatherShared(shared, env.dataDir, auth, dbs.dbFor, Date.now);
const space = () => spaceOf(env.dataDir, env.lowSpaceBytes);
const engines = createEngines();
const jobs = createJobs(shared, engines, env.engineKeys, Date.now);
// A whole-video download the API stopped under (a restart, a deploy) is taken up again, once.
jobs.resume();
const server = createApp({
  auth,
  dbFor: dbs.dbFor,
  mediaDirFor: dbs.mediaDirFor,
  shared,
  dictionaryDir: sharedDictionaryDir(env.dataDir),
  space,
  storage: () => storageReport(env.dataDir, auth, env.lowSpaceBytes),
  // Every request to Forvo is counted, for the day's allowance an admin sees in Settings.
  forvo: createForvo(fetch, () => shared.recordCall("forvo", Date.now())),
  wordAudioKeys: env.wordAudioKeys,
  engines,
  engineKeys: env.engineKeys,
  jobs,
}).listen(env.port, env.host, () => {
  console.log(`Panki API on http://${env.host}:${env.port} · data in ${env.dataDir} · day turns over on ${env.timeZone}`);
});

// Stopped (pm2 sends SIGINT, then kills what's still there a moment and a half later): nothing new is taken, what's under
// way is let finish, then the databases are closed. Past the deadline the process goes as it is; every committed write is
// already safe in SQLite's journal, and a request cut short is answered again by the browser (every write is retried safely).
const STOP_DEADLINE_MS = 1_500;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      dbs.closeAll();
      shared.close();
      auth.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), STOP_DEADLINE_MS).unref();
  });
}
