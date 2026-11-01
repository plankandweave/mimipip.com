// Reads what an MP4 actually is — display width, height and duration — from
// its own header, so the Library checks a film against its destination using
// the file rather than the uploader's word.
//
// Only the top-level box headers and the `moov` box are read, never the media
// data: a 100 MB film stored in R2 is measured with a handful of small range
// reads, which matters on a Worker with a 128 MB memory ceiling.

export type Mp4Measure = { width: number; height: number; durationS: number };

/** Read `length` bytes at `offset`. May return fewer at end of file. */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

const MAX_MOOV = 32 * 1024 * 1024;

const type4 = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

type Box = { type: string; start: number; body: number; end: number };

/** Children of a box held in memory, between `from` and `to`. */
function children(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = from;
  while (at + 8 <= to) {
    let size = v.getUint32(at);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(v.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) size = to - at;
    if (size < body - at || at + size > to) break;
    out.push({ type: type4(b, at + 4), start: at, body, end: at + size });
    at += size;
  }
  return out;
}

/** Locate `moov` among the top-level boxes and return its bytes. */
async function readMoov(read: ByteReader, size: number): Promise<Uint8Array | null> {
  let at = 0;
  while (at + 8 <= size) {
    const head = await read(at, 16);
    if (head.length < 8) return null;
    const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let box = v.getUint32(0);
    if (box === 1) {
      if (head.length < 16) return null;
      box = Number(v.getBigUint64(8));
    } else if (box === 0) box = size - at;
    if (box < 8) return null;
    if (type4(head, 4) === "moov") {
      if (box > MAX_MOOV) return null;
      const moov = await read(at, box);
      return moov.length === box ? moov : null;
    }
    at += box;
  }
  return null;
}

function parseMoov(moov: Uint8Array): Mp4Measure | null {
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const top = children(moov, 0, moov.length).find((b) => b.type === "moov");
  if (!top) return null;
  const boxes = children(moov, top.body, top.end);

  // Movie duration from mvhd.
  const mvhd = boxes.find((b) => b.type === "mvhd");
  if (!mvhd) return null;
  const version = moov[mvhd.body];
  const timescale = v.getUint32(mvhd.body + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(v.getBigUint64(mvhd.body + 24)) : v.getUint32(mvhd.body + 16);
  if (!timescale || !duration) return null;

  // Display size from the video track's tkhd, with its rotation applied.
  for (const trak of boxes.filter((b) => b.type === "trak")) {
    const inner = children(moov, trak.body, trak.end);
    const mdia = inner.find((b) => b.type === "mdia");
    const hdlr = mdia && children(moov, mdia.body, mdia.end).find((b) => b.type === "hdlr");
    if (!hdlr || type4(moov, hdlr.body + 8) !== "vide") continue;
    const tkhd = inner.find((b) => b.type === "tkhd");
    if (!tkhd) continue;
    const tv = moov[tkhd.body];
    const matrix = tkhd.body + (tv === 1 ? 52 : 40);
    const a = v.getInt32(matrix);
    const bm = v.getInt32(matrix + 4);
    let width = Math.round(v.getUint32(matrix + 36) / 65536);
    let height = Math.round(v.getUint32(matrix + 40) / 65536);
    if (a === 0 && bm !== 0) [width, height] = [height, width]; // 90° / 270°
    if (width > 0 && height > 0) return { width, height, durationS: Math.round((duration / timescale) * 100) / 100 };
  }
  return null;
}

/** Measure an MP4 held in memory. Null when it is not a readable MP4. */
export async function probeMp4Bytes(bytes: Uint8Array): Promise<Mp4Measure | null> {
  const read: ByteReader = async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length));
  return probeMp4(read, bytes.length);
}

/** Measure an MP4 through ranged reads (e.g. an R2 object). */
export async function probeMp4(read: ByteReader, size: number): Promise<Mp4Measure | null> {
  try {
    const moov = await readMoov(read, size);
    return moov ? parseMoov(moov) : null;
  } catch {
    return null;
  }
}
