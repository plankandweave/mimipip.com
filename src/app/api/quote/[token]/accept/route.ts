import { NextResponse } from "next/server";
import { acceptQuote } from "@/lib/zyvorah-quote-os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept the quotation without paying now — for the customers we invoice on
 *  our own terms. The OS is the one that decides what acceptance releases. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await acceptQuote(token);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "accept_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
