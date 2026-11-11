// A customer's install photo must never reach zyvorah.com carrying the GPS
// fix of their home. These tests build a REAL camera-style JPEG with sharp
// (a dev/test-time dependency; the stripper itself is pure TS for Workers),
// write GPS into its EXIF, and prove the stripper removes it while the image
// still decodes to the same pixels.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { stripJpegMetadata, looksLikeJpeg } from "./jpeg-strip";

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 180, g: 90, b: 40 } } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "PhoneCo", Model: "X1", Artist: "Customer Name" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "18/1 31/1 12/1", GPSLongitudeRef: "E", GPSLongitude: "73/1 51/1 30/1" },
    })
    .toBuffer();
}

function containsAscii(buf: Uint8Array, text: string): boolean {
  return Buffer.from(buf).includes(Buffer.from(text, "latin1"));
}

function markers(buf: Uint8Array): number[] {
  // Marker sequence up to the first SOS (header segments only).
  const out: number[] = [];
  let i = 2;
  while (i < buf.length && buf[i] === 0xff) {
    const m = buf[i + 1];
    out.push(m);
    if (m === 0xda) break;
    i += 2 + ((buf[i + 2] << 8) | buf[i + 3]);
  }
  return out;
}

test("the fixture really carries EXIF with GPS (the test has teeth)", async () => {
  const src = await jpegWithGps();
  const meta = await sharp(src).metadata();
  assert.ok(meta.exif && meta.exif.length > 0);
  assert.ok(containsAscii(src, "Exif\0"));
  assert.ok(containsAscii(src, "Customer Name"));
  assert.ok(markers(src).includes(0xe1));
});

test("strips APP1 EXIF (GPS, owner) and keeps the image decodable", async () => {
  const src = await jpegWithGps();
  const r = stripJpegMetadata(src);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.removed.includes("APP1:EXIF"));
  assert.ok(!markers(r.bytes).includes(0xe1), "no APP1 segment left");
  assert.ok(!containsAscii(r.bytes, "Exif\0"));
  assert.ok(!containsAscii(r.bytes, "Customer Name"));
  assert.ok(!containsAscii(r.bytes, "PhoneCo"));

  // Structure: SOI … SOS … EOI.
  assert.deepEqual([...r.bytes.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...r.bytes.subarray(-2)], [0xff, 0xd9]);
  assert.ok(markers(r.bytes).includes(0xda));

  const meta = await sharp(Buffer.from(r.bytes)).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.width, 64);
  assert.equal(meta.height, 48);
  const [a, b] = await Promise.all([
    sharp(src).raw().toBuffer(),
    sharp(Buffer.from(r.bytes)).raw().toBuffer(),
  ]);
  assert.ok(a.equals(b), "pixels are unchanged — only metadata was removed");
});

test("strips COM and APP13 (IPTC captions) and trailing data after EOI", async () => {
  const base = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).jpeg().toBuffer();
  const seg = (marker: number, text: string) => {
    const payload = Buffer.from(text, "latin1");
    const len = payload.length + 2;
    return Buffer.concat([Buffer.from([0xff, marker, len >> 8, len & 0xff]), payload]);
  };
  const doctored = Buffer.concat([
    base.subarray(0, 2),
    seg(0xfe, "shot at 12 Some Road"),
    seg(0xed, "Photoshop 3.0\0caption: the Sharma home"),
    seg(0xe2, "MPF\0secondary"),
    base.subarray(2),
    Buffer.from("TRAILING-THUMBNAIL"),
  ]);
  const r = stripJpegMetadata(doctored);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const text of ["Some Road", "Sharma", "MPF", "TRAILING"]) assert.ok(!containsAscii(r.bytes, text), text);
  assert.ok(r.removed.includes("COM"));
  assert.ok(r.removed.includes("APP13"));
  assert.ok(r.removed.includes("trailing-data"));
  assert.ok(Buffer.from(r.bytes).equals(base), "the result is exactly the clean original");
});

test("keeps an ICC colour profile", async () => {
  const src = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
    .withIccProfile("srgb").jpeg().toBuffer();
  assert.ok(containsAscii(src, "ICC_PROFILE\0"));
  const r = stripJpegMetadata(src);
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(containsAscii(r.bytes, "ICC_PROFILE\0"));
});

test("rejects non-JPEG and truncated input", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  assert.equal(looksLikeJpeg(png), false);
  assert.equal(stripJpegMetadata(png).ok, false);
  assert.equal(stripJpegMetadata(new Uint8Array([])).ok, false);
  assert.equal(stripJpegMetadata(Buffer.from("GIF89a....")).ok, false);
  const jpg = await jpegWithGps();
  assert.equal(stripJpegMetadata(jpg.subarray(0, jpg.length - 40)).ok, false, "no EOI → rejected");
  assert.equal(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xd9])).ok, false, "no image data");
});
