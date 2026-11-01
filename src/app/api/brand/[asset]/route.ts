import { NextResponse } from "next/server";
import { rasterizeSvgRemote } from "@/lib/media-client";
import { brandMarkSvg } from "@/lib/brand-mark";

export const runtime = "nodejs";

// The app mark, served weekly-coloured. Cached for a few hours (CDN + browser)
// so it stays cheap but still rolls over to the new colour within the week.
const CACHE = "public, max-age=21600, s-maxage=21600, stale-while-revalidate=604800";

const PNG_SIZES: Record<string, number> = {
  "icon-180.png": 180, // apple-touch
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable.png": 512, // full-bleed square already satisfies the maskable safe zone
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const svg = brandMarkSvg();

  if (asset === "icon.svg") {
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
    });
  }

  const size = PNG_SIZES[asset];
  if (size) {
    const png = await rasterizeSvgRemote(svg, size, size);
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
