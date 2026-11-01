import { NextResponse } from "next/server";
import { searchSampleDesigns, getSampleDesigns, getFlatImageMap } from "@/lib/queries";

export const runtime = "nodejs";

// Backs the design picker in the sample-order flow — a small, fast title
// search so a customer ordering a sample without a product page in context
// (e.g. from /materials or /samples) can pick a real design by name, instead
// of typing free text that has no guaranteed match to anything printable.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  // Samples are offered on one collection (see SAMPLE_COLLECTION_TAGS), so an
  // empty query browses that collection instead of returning nothing — with a
  // catalogue-wide picker there was nothing sensible to list, with a single
  // collection there is.
  const results = q ? await searchSampleDesigns(q, 6) : await getSampleDesigns(24);
  // The picker feeds the room visualizer, which must show the FLAT design —
  // resolve each result's flat image rather than its styled card image.
  const flat = await getFlatImageMap(results.map((p) => p.handle));
  return NextResponse.json({
    results: results.map((p) => ({ handle: p.handle, title: p.title, image: p.image, flatImage: flat[p.handle] ?? null })),
  });
}
