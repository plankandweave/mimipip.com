import {catalogue,card} from "@/brand/review/data";
import { NextResponse } from "next/server";
import { getProductsByHandles } from "@/lib/queries";

// Hydrates a list of product handles (from the client's localStorage wishlist /
// recently-viewed) into product cards. Only returns active products.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const handles = (searchParams.get("handles") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!handles.length) return NextResponse.json({ products: [] });
  if(process.env.MIMIPIP_LOCAL_REVIEW==="1")return NextResponse.json({products:catalogue.filter(p=>handles.includes(p.slug)).map(card)});
  try {
    const products = await getProductsByHandles(handles);
    return NextResponse.json({ products });
  } catch (e) {
    console.error("products lookup failed:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
