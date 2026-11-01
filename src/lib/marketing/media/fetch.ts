// Fetch a remote catalogue image (Supabase Storage public URL) into a Buffer for
// Sharp. Uses the Supabase image-transform CDN to pull a sensibly-sized source
// rather than a full-resolution original, matching the site's own loader.

export async function fetchImage(url: string, targetWidth = 1440): Promise<Buffer> {
  let fetchUrl = url;
  // Route public objects through the render/transform endpoint (free CDN resize).
  if (url.includes("/storage/v1/object/public/")) {
    const rendered = url.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/",
    );
    const sep = rendered.includes("?") ? "&" : "?";
    fetchUrl = `${rendered}${sep}width=${targetWidth}&quality=85&resize=contain`;
  }
  const res = await fetch(fetchUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchImage ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
