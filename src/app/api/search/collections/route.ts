import { NextResponse } from "next/server";
import { getSearchableCollections } from "@/lib/queries";

// Every collection the shop shows, by name: the list scripts/verify-search.mjs
// types into the live search one by one, so a collection added tomorrow is
// checked tomorrow without anyone remembering to add it to a list. Public
// names only — the same titles the index pages print.
export async function GET() {
  return NextResponse.json({ collections: await getSearchableCollections() });
}
