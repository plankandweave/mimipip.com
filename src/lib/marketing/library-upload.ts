import { createHash } from "node:crypto";
import { probeMp4 } from "./mp4-probe";

// formData already owns the uploaded File. Never make another film-sized
// ArrayBuffer: a 100 MB film otherwise exhausts a Worker's 128 MB heap.
export async function inspectLibraryFilm(file: Blob) {
  const measured = await probeMp4(async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()), file.size);
  if (!measured) return { measured: null, digest: null };
  const hash = createHash("sha256");
  for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
    hash.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()));
  }
  return { measured, digest: hash.digest("hex") };
}
