import {catalogue,card} from "@/brand/review/data";
import { NextResponse } from "next/server";
import { searchIntent, searchProducts } from "@/lib/queries";

// JSON endpoint behind the nav-bar inline search: lets the client fetch matches
// on Enter and render them in place, without navigating to the /search page.
//
// `intent` says what the query was read as — the collection it names, if any,
// and the room its pictures should show — after spelling correction, exactly
// as the results read it. The nav ignores it; the daily live check
// (scripts/verify-search.mjs) reads it to prove every collection is findable
// by its own name.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1));
  if (!q) return NextResponse.json({ results: [], corrected: null, intent: null });
  if(process.env.MIMIPIP_LOCAL_REVIEW==='1'){const hits=catalogue.filter(p=>(p.name+' '+p.description).toLowerCase().includes(q.toLowerCase()));return NextResponse.json({results:hits.slice((page-1)*60,page*60).map(card),corrected:null,total:hits.length,page,intent:null});}
  // `corrected` is the query the results answer when a misspelling was fixed
  // ("piano" for "paino"), null otherwise — the panel says so.
  const { results, corrected, total } = await searchProducts(q, 60, (page - 1) * 60);
  const intent = await searchIntent(corrected ?? q);
  return NextResponse.json({
    results,
    total,
    page,
    corrected,
    intent: { collection: intent.collection?.handle ?? null, tag: intent.collection?.tag ?? null, roomKey: intent.roomKey ?? null },
  });
}
