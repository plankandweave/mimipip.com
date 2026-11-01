import { NextResponse } from "next/server";
import { installSheetsAvailable, sheetForPrintOrder } from "@/lib/install-sheet-build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

/**
 * The install sheet behind the QR printed on every strip: /o/<token>/sheet
 * (a picture, for the page) or ?format=pdf (to download and send on). The
 * token is the order page's own unguessable slug — whoever holds the printed
 * strip holds the right to read how it goes up, and nothing more.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slug = decodeURIComponent(token).trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,60}$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!installSheetsAvailable()) return NextResponse.json({ error: "Install sheets are unavailable right now." }, { status: 503 });

  let order: { ok?: boolean; orderNo?: string | null; designName?: string | null; widthMm?: number | null; heightMm?: number | null; panels?: number | null } | null = null;
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/order-page/${encodeURIComponent(slug)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.ok) order = await r.json();
  } catch { /* answered below */ }
  if (!order?.ok || !order.orderNo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "png";
  return sheetForPrintOrder({ orderNo: order.orderNo, designName: order.designName, widthMm: order.widthMm, heightMm: order.heightMm, panels: order.panels }, format);
}
