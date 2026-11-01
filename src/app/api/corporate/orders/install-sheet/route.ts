import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { installSheetsAvailable, sheetFor, type SheetAccount, type Selector } from "@/lib/install-sheet-build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The fitter's install sheet. Why the engine draws it, and how the rows are
// resolved, is in lib/install-sheet-build.ts.

export async function GET(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // No agreement gate: this is a read, and a fitter standing at a wall is the
  // last person who should be blocked by a countersignature.
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (!installSheetsAvailable()) {
    return NextResponse.json({ error: "Install sheets are unavailable right now." }, { status: 503 });
  }

  const url = new URL(req.url);
  const sel: Selector = { order: url.searchParams.get("order"), group: url.searchParams.get("group"), po: url.searchParams.get("po") };
  if (!sel.order && !sel.group && !sel.po) return NextResponse.json({ error: "Nothing asked for" }, { status: 400 });
  return sheetFor(sb, session.account, sel);
}

/**
 * THE SAME SHEET, FOR PRODUCTION. When Delhivery reports a parcel delivered,
 * the OS emails the customer the install sheet for what was in it (Roheena,
 * 25 Oct 2026, ZVY-20515: "the moment delivery confirms … this should get
 * emailed to the same customer"). The OS knows its own order ids, not our
 * rows, so it names those; every one must belong to ONE partner account, and
 * the sheet is that account's — exactly what its signed-in members see.
 * Authorised by the token the two systems already share.
 */
export async function POST(req: Request) {
  const expected = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";
  if (!expected || req.headers.get("x-zyvorah-token") !== expected) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { osOrderIds?: unknown } | null;
  const raw: unknown[] = Array.isArray(body?.osOrderIds) ? body.osOrderIds : [];
  const ids = [...new Set(raw.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0))];
  if (ids.length === 0 || ids.length > 120) return NextResponse.json({ error: "osOrderIds: 1 to 120 OS order ids" }, { status: 400 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (!installSheetsAvailable()) {
    return NextResponse.json({ error: "Install sheets are unavailable right now." }, { status: 503 });
  }
  const { data: owners } = await sb.from("corporate_orders").select("account_id").in("os_order_id", ids);
  const accounts = [...new Set((owners ?? []).map((o) => o.account_id as string))];
  if (accounts.length === 0) return NextResponse.json({ error: "Not a partner order" }, { status: 404 });
  if (accounts.length > 1) return NextResponse.json({ error: "Those orders belong to more than one account" }, { status: 409 });
  const { data: account } = await sb.from("corporate_accounts").select("id, name, slug").eq("id", accounts[0]).maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return sheetFor(sb, account as SheetAccount, { osOrderIds: ids });
}

