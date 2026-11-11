import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectLibraryFilm } from "./library-upload";

function box(type: string, body: Buffer) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4);
  return Buffer.concat([head, body]);
}
function movie() {
  const mvhd = Buffer.alloc(20); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(471667, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeInt32BE(65536, 40);
  tkhd.writeUInt32BE(1080 * 65536, 76); tkhd.writeUInt32BE(1920 * 65536, 80);
  const hdlr = Buffer.alloc(12); hdlr.write("vide", 8);
  return box("moov", Buffer.concat([box("mvhd", mvhd), box("trak", Buffer.concat([
    box("tkhd", tkhd), box("mdia", box("hdlr", hdlr)),
  ]))]));
}

test("large film is measured and hashed without a second film-sized allocation", async () => {
  // moov at the END also covers exports without faststart.
  const bytes = Buffer.concat([box("mdat", Buffer.alloc(58_000_000, 7)), movie()]);
  class BoundedFile extends Blob {
    override arrayBuffer(): Promise<ArrayBuffer> { throw new Error("Whole film read"); }
    override slice(start = 0, end = this.size, type?: string) {
      assert.ok(end - start <= 1024 * 1024, "only headers and bounded hash chunks are read");
      return super.slice(start, end, type);
    }
  }
  const result = await inspectLibraryFilm(new BoundedFile([bytes]));
  assert.deepEqual(result.measured, {width: 1080, height: 1920, durationS: 471.67});
  assert.equal(result.digest, createHash("sha256").update(bytes).digest("hex"));
});

test("invalid video is refused without hashing or storing it", async () => {
  assert.deepEqual(await inspectLibraryFilm(new Blob(["not a video"])), {measured: null, digest: null});
});
