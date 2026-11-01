// Strip every metadata segment from a JPEG, in pure TypeScript.
//
// WHY. The installed-wall photos the OS pushes to /api/installed-walls/intake
// are a real customer's home. The OS already runs a privacy gate before it
// sends one, but the website trusts nobody's word (the account-wide zero-trust
// rule): a phone photo carries the GPS fix of the customer's front room in its
// EXIF block, often a camera serial and owner name, and Photoshop/IPTC blocks
// can carry a caption or byline. Publishing that on zyvorah.com would publish
// the customer's address. So the bytes are cleaned HERE, again, before they are
// stored — whatever the sender says it did.
//
// Workers has no native image library (no sharp, no canvas), and re-encoding
// would cost quality and CPU for nothing; metadata lives in marker segments
// that can be dropped without touching a single pixel. So this walks the
// marker structure and copies everything EXCEPT:
//   - APP1  (EXIF incl. GPS, XMP)
//   - APP3–APP13, APP15 (vendor blocks; APP13 = Photoshop/IPTC captions)
//   - APP2 unless it is an ICC colour profile (APP2 "MPF" indexes embedded
//     secondary images — which carry their own EXIF — and FlashPix blocks)
//   - COM   (free-text comments)
//   - anything after the first EOI (MPF secondary images, trailing junk)
// APP0 (JFIF), APP2 ICC_PROFILE and APP14 (Adobe colour transform) are kept:
// dropping them changes how the picture decodes.
//
// It fails CLOSED: anything that is not a well-formed baseline/progressive
// JPEG (SOI … SOFn … SOS … EOI) is rejected rather than passed through.

export type JpegStripResult =
  | { ok: true; bytes: Uint8Array; removed: string[] }
  | { ok: false; error: string };

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;

function isSof(m: number): boolean {
  // C0–CF are frame headers except C4 (DHT), C8 (JPG reserved), CC (DAC).
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

function isStandalone(m: number): boolean {
  // Markers with no length field: TEM and RST0–7 (SOI/EOI handled separately).
  return m === 0x01 || (m >= 0xd0 && m <= 0xd7);
}

function startsWithAscii(buf: Uint8Array, at: number, end: number, text: string): boolean {
  if (at + text.length > end) return false;
  for (let i = 0; i < text.length; i++) if (buf[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** Name of the segment if it must be dropped, else null. `payloadAt` is the
 *  first byte after the 2-byte length. */
function dropReason(marker: number, buf: Uint8Array, payloadAt: number, end: number): string | null {
  if (marker === COM) return "COM";
  if (marker === 0xe0 || marker === 0xee) return null; // APP0 JFIF, APP14 Adobe
  if (marker === 0xe2) {
    return startsWithAscii(buf, payloadAt, end, "ICC_PROFILE\0") ? null : "APP2";
  }
  if (marker >= 0xe1 && marker <= 0xef) {
    if (marker === 0xe1) {
      if (startsWithAscii(buf, payloadAt, end, "Exif\0")) return "APP1:EXIF";
      if (startsWithAscii(buf, payloadAt, end, "http://ns.adobe.com/")) return "APP1:XMP";
      return "APP1";
    }
    return `APP${marker - 0xe0}`;
  }
  return null;
}

/** True when the bytes start with a JPEG SOI + marker (FF D8 FF). */
export function looksLikeJpeg(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === SOI && buf[2] === 0xff;
}

export function stripJpegMetadata(input: Uint8Array): JpegStripResult {
  const buf = input;
  const n = buf.length;
  if (!looksLikeJpeg(buf)) return { ok: false, error: "not a JPEG (missing SOI)" };

  const out = new Uint8Array(n);
  let w = 0;
  const copy = (from: number, to: number) => {
    out.set(buf.subarray(from, to), w);
    w += to - from;
  };
  const removed: string[] = [];

  copy(0, 2); // SOI
  let i = 2;
  let sawSof = false;
  let sawSos = false;
  let inScan = false;

  while (i < n) {
    if (inScan) {
      // Entropy-coded data: copy through until a real marker. FF00 is a
      // stuffed byte, FFD0–D7 restart markers, FFFF fill.
      const scanStart = i;
      while (i < n) {
        if (buf[i] !== 0xff) { i++; continue; }
        const next = buf[i + 1];
        if (next === undefined) { i = n; break; }
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { i += 2; continue; }
        if (next === 0xff) { i++; continue; }
        break;
      }
      copy(scanStart, i);
      inScan = false;
      continue;
    }

    if (buf[i] !== 0xff) return { ok: false, error: `expected a marker at byte ${i}` };
    // Fill bytes before a marker.
    while (i < n && buf[i] === 0xff && buf[i + 1] === 0xff) i++;
    if (i + 1 >= n) break;
    const marker = buf[i + 1];

    if (marker === EOI) {
      if (!sawSof || !sawSos) return { ok: false, error: "EOI before any image data" };
      copy(i, i + 2);
      if (i + 2 < n) removed.push("trailing-data");
      return { ok: true, bytes: out.slice(0, w), removed };
    }
    if (marker === SOI) return { ok: false, error: "nested SOI" };
    if (isStandalone(marker)) { copy(i, i + 2); i += 2; continue; }
    if (i + 4 > n) return { ok: false, error: "truncated segment header" };

    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) return { ok: false, error: `bad segment length at byte ${i}` };
    const segEnd = i + 2 + len;
    if (segEnd > n) return { ok: false, error: "truncated segment" };

    const reason = dropReason(marker, buf, i + 4, segEnd);
    if (reason) {
      removed.push(reason);
    } else {
      if (isSof(marker)) sawSof = true;
      if (marker === SOS) {
        if (!sawSof) return { ok: false, error: "SOS before frame header" };
        sawSos = true;
        inScan = true;
      }
      copy(i, segEnd);
    }
    i = segEnd;
  }
  return { ok: false, error: "missing EOI (truncated JPEG)" };
}
