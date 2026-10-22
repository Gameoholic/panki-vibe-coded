// A folder written as one zip file, for the extension's download (`build.mjs`). Written here rather than taken from a
// library (the conventions: never a library for the zip; the contracts' `readZip` is the one reader): each file
// deflated by Node's own zlib, with its CRC-32, a local header before it and a central directory at the end. Small:
// no zip64, so under 4 GB and 65,535 files, which an extension is far below.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/** Every file under a folder, as paths from it with forward slashes, in one fixed order. */
export function filesUnder(dir, from = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(at, from);
      return entry.isFile() ? [path.relative(from, at).split(path.sep).join("/")] : [];
    })
    .sort();
}

/** A moment as a zip keeps it: MS-DOS time and date, local, to two seconds. */
function dosTime(at) {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

/** `dir`'s files written as a zip at `out`, every one stamped `at`; `skip` names any left out. */
export function writeZip(dir, out, at, skip = []) {
  const { time, date } = dosTime(at);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of filesUnder(dir).filter((n) => !skip.includes(n))) {
    const data = readFileSync(path.join(dir, ...name.split("/")));
    const packed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // the version needed: 2.0, deflate
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(8, 8); // deflated
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // Extra field, comment, disk number, internal and external attributes: none.
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(out, Buffer.concat([...locals, directory, end]));
}
