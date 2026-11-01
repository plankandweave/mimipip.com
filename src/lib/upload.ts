// Shared by every client-side photo upload flow (header quick search, Match a
// Photo, curator, room visualiser). Downscales before upload so we stay well
// under Vercel's ~4.5MB request-body limit (a phone photo can be 8-12MB) and
// searches run faster. Returns a JPEG blob, or the original file if it's
// already small / canvas is unavailable.
export async function downscaleForUpload(file: File, maxEdge = 1600): Promise<Blob> {
  if (file.size < 2_000_000) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
