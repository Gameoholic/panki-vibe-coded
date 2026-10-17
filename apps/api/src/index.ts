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

// Each account's database opens on its first request; the zone is checked here so a wrong one still fails at startup.
checkTimeZone(env.timeZone);
const auth = openAuthDb(env.dataDir);
const dbs = createDbs(env.dataDir, Date.now, env.timeZone);
const shared = openShared(env.dataDir);
// What accounts held before the shared store existed (a Forvo key, dictionaries) moves over, once, before anyone's served.
gatherShared(shared, env.dataDir, auth, dbs.dbFor, Date.now);
const space = () => spaceOf(env.dataDir, env.lowSpaceBytes);
const server = createApp({
  auth,
  dbFor: dbs.dbFor,
  mediaDirFor: dbs.mediaDirFor,
  shared,
  dictionaryDir: sharedDictionaryDir(env.dataDir),
  space,
  storage: () => storageReport(env.dataDir, auth, env.lowSpaceBytes),
  // Every request to Forvo is counted, for the day's allowance an admin sees in Settings.
  forvo: createForvo(fetch, Date.now, () => shared.recordCall("forvo", Date.now())),
  wordAudioKeys: env.wordAudioKeys,
  engines: createEngines(),
  engineKeys: env.engineKeys,
}).listen(env.port, env.host, () => {
  console.log(`Panki API on http://${env.host}:${env.port} · data in ${env.dataDir} · day turns over on ${env.timeZone}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    dbs.closeAll();
    shared.close();
    auth.close();
    process.exit(0);
  });
}
