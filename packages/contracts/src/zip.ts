/**
 * Reads a zip file, as dictionaries come: the list of what's in it, and each file's bytes when they're asked for. Written
 * here against the format's published description rather than taken from a library: a dictionary is a stranger's
 * file, and this is the one place its bytes are first handled. Only what dictionaries use is read: files stored as
 * they are or squeezed the usual way (deflate, undone by the platform's own `DecompressionStream`), in a zip of under
 * 4 GB. Anything else is refused, never guessed at. Shared: the extension imports dictionaries with it, and the API
 * reads what a dictionary kept on Panki is called with it (Blob, DataView and DecompressionStream are the browser's
 * and Node's alike).
 */

export class ZipError extends Error {}

export type ZipEntry = {
  name: string;
  /** How big it is once unpacked, as the zip says; reading it never gives more than this. */
  size: number;
  read: () => Promise<Uint8Array<ArrayBuffer>>;
};

/** The most one file inside may unpack to. A dictionary's biggest are a few tens of megabytes. */
const ENTRY_MAX = 256 * 1024 * 1024;
/** The most files a zip may hold: dictionaries have a few hundred at most. */
const ENTRIES_MAX = 20_000;

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The end record is 22 bytes, and may be followed by a comment of up to 65535. */
const END_SEARCH = 22 + 65535;

async function bytesOf(file: Blob, from: number, to: number): Promise<DataView> {
  if (from < 0 || to > file.size || to < from) throw new ZipError("The file is cut short.");
  return new DataView(await file.slice(from, to).arrayBuffer());
}

/** Unpacks a stream, stopping the moment it gives more than it said it would: a zip may lie about its sizes. */
async function collect(stream: ReadableStream<Uint8Array>, size: number): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Uint8Array(size);
  let at = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > size) {
      await reader.cancel();
      throw new ZipError("A file inside is bigger than the zip says.");
    }
    out.set(value, at);
    at += value.length;
  }
  if (at !== size) throw new ZipError("A file inside is smaller than the zip says.");
  return out;
}

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const tailFrom = Math.max(0, file.size - END_SEARCH);
  const tail = await bytesOf(file, tailFrom, file.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("That isn't a zip file.");
  const count = tail.getUint16(end + 10, true);
  const centralSize = tail.getUint32(end + 12, true);
  const centralAt = tail.getUint32(end + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralAt === 0xffffffff) throw new ZipError("Zips this big aren't read.");
  if (count > ENTRIES_MAX) throw new ZipError("That zip holds too many files.");

  const central = await bytesOf(file, centralAt, centralAt + centralSize);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > central.byteLength || central.getUint32(at, true) !== CENTRAL_SIGNATURE) throw new ZipError("The zip's list of files is broken.");
    const method = central.getUint16(at + 10, true);
    const packed = central.getUint32(at + 20, true);
    const size = central.getUint32(at + 24, true);
    const nameLength = central.getUint16(at + 28, true);
    const extraLength = central.getUint16(at + 30, true);
    const commentLength = central.getUint16(at + 32, true);
    const localAt = central.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(central.buffer, central.byteOffset + at + 46, nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    // A folder is a name ending in a slash, with nothing in it.
    if (name.endsWith("/")) continue;
    if (packed === 0xffffffff || size === 0xffffffff || localAt === 0xffffffff) throw new ZipError("Zips this big aren't read.");
    if (method !== 0 && method !== 8) throw new ZipError("A file inside is packed in a way that isn't read.");
    entries.push({
      name,
      size,
      async read() {
        if (size > ENTRY_MAX) throw new ZipError(`${name} is too big to read.`);
        const local = await bytesOf(file, localAt, localAt + 30);
        if (local.getUint32(0, true) !== LOCAL_SIGNATURE) throw new ZipError("The zip is broken.");
        const dataAt = localAt + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const data = file.slice(dataAt, dataAt + packed);
        if (data.size !== packed) throw new ZipError("The file is cut short.");
        const stream = method === 0 ? data.stream() : data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return collect(stream, size);
      },
    });
  }
  return entries;
}
