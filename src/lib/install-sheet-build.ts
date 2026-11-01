import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchOsStatuses, type OsOrderStatus } from "@/lib/corporate-os";
import { caDownload } from "@/lib/corporate-art-store";
import { thumbnailBytesRemote } from "@/lib/media-client";
import { sheetPhotoFor } from "@/lib/order-wall-photo";


/**
 * THE INSTALL SHEET FOR A DISPATCHED ORDER — what the fitter is holding.
 *
 * The engine prints an order number, a piece number and a QR onto a header
 * strip at the top of every roll. At Shahibaug (Vijay Sales, Aug 2026) the
 * installer trimmed all of it off before hanging anything, and was left with
 * rolls, sixteen walls and no way to pair them. Trimming the header is not a
 * habit anyone will break; what has to exist is a paper reference the site can
 * be re-issued at any time.
 *
 * WHY THE ENGINE RENDERS IT and not this route, which already has pdf-lib next
 * door in install-sheet-pdf.ts: the two numbers the sheet exists to state —
 * how many strips a piece came in, and how wide each one is — are recorded
 * only by the machine. `corporate_orders` never held them; the OS's `panels`
 * is null on six of the twenty-six Shahibaug lines, including four from the
 * most recent dispatch. The engine's own production_jobs row is the record of
 * what physically came off the printer (ZVY-10310 was ordered at 19510 mm and
 * printed at 13772), and it holds the artwork the job was composed from. A
 * sheet built here would be a sheet built on the wrong numbers.
 *
 * SITE BATCHES ARE A DIFFERENT SHEET. lib/install-sheet.ts answers "which
 * printed roll goes on which wall" for a surveyed store, off wall photos. This
 * one answers "what is this roll and how does it go up" for any order at all,
 * including the vast majority that never went through a survey.
 */

const ENGINE = (process.env.MIMAKI_BACKEND_URL ?? "").replace(/\/$/, "");

type Row = {
  id: string;
  order_ref: string;
  os_order_id: number | null;
  os_print_order_no: string | null;
  print_name: string | null;
  po_number: string | null;
  group_ref: string | null;
  width_mm: number | null;
  height_mm: number | null;
  ship_city: string | null;
  ship_address: string | null;
  state: string | null;
  crop_data: unknown;
  created_at: string;
  wall_photo_path: string | null;
  wall_photo_at: string | null;
};

/** `Ground floor H wall · piece 3/4` → base name, 3, 4. The same rule as
 *  lib/install-sheet.ts: a name with no suffix is a one-piece wall. */
const PIECE_SUFFIX = /^(.*?)\s*·\s*piece\s+(\d+)\s*\/\s*(\d+)\s*$/i;
function splitPrintName(printName: string): { base: string; index: number; total: number } {
  const m = PIECE_SUFFIX.exec(printName);
  if (!m) return { base: printName.trim(), index: 1, total: 1 };
  return { base: m[1]!.trim(), index: Number(m[2]), total: Number(m[3]) };
}
const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * THE WALL ITSELF, as a small JPEG for the sheet. The survey photo lives on
 * the site batch wall this order's print_name resolves to (the same
 * name-based join lib/install-sheet.ts uses); the newest surveyed wall of
 * that name wins, since a re-measure replaces the photo as well as the size.
 *
 * Sent to the engine as BYTES, not a URL: the engine holds no credential for
 * our media, and a 420 px thumbnail is a few tens of KB. The downscale runs
 * in the media container (no sharp on workerd); if it is down the original
 * is skipped rather than shipped — a 5 MB phone photo × 120 lines would blow
 * the engine's request budget, and a sheet without the photo still says so.
 */
async function wallPhotos(
  sb: ReturnType<typeof supabaseAdmin> & object,
  accountId: string,
  names: string[],
): Promise<Map<string, { jpeg: string; caption: string }>> {
  const out = new Map<string, { jpeg: string; caption: string }>();
  if (!names.length) return out;
  const { data: batches } = await sb
    .from("corporate_site_batches").select("id, created_at").eq("account_id", accountId)
    .order("created_at", { ascending: false });
  const batchIds = (batches ?? []).map((b) => b.id as string);
  if (!batchIds.length) return out;
  const surveyed = new Map((batches ?? []).map((b) => [b.id as string, String(b.created_at ?? "").slice(0, 10)]));
  const { data: walls } = await sb
    .from("corporate_site_batch_walls")
    .select("batch_id, name, photo_path")
    .in("batch_id", batchIds)
    .not("photo_path", "is", null);
  const wanted = new Set(names.map(fold));
  const byName = new Map<string, { photo_path: string; created_at: string }>();
  // Walls have no timestamp of their own; the batch they were surveyed in
  // does, and batches are already newest-first.
  const rank = new Map(batchIds.map((id, i) => [id, i]));
  const sorted = [...(walls ?? [])].sort((a, b) => (rank.get(a.batch_id as string) ?? 0) - (rank.get(b.batch_id as string) ?? 0));
  for (const w of sorted) {
    const k = fold(w.name as string);
    if (wanted.has(k) && !byName.has(k)) {
      byName.set(k, { photo_path: w.photo_path as string, created_at: surveyed.get(w.batch_id as string) ?? "" });
    }
  }
  await Promise.all([...byName].map(async ([k, w]) => {
    try {
      const { data } = await caDownload(w.photo_path);
      if (!data) return;
      const small = await thumbnailBytesRemote(await data.arrayBuffer(), { width: 420, quality: 78 });
      const when = (w.created_at ?? "").slice(0, 10);
      out.set(k, { jpeg: small.toString("base64"), caption: `survey photo${when ? ` · ${when}` : ""}` });
    } catch (e) {
      console.warn("[install-sheet] wall photo skipped", k, e instanceof Error ? e.message : e);
    }
  }));
  return out;
}

/**
 * The photo of the wall taken FOR an order (added on the order form or the
 * order card — /api/corporate/orders/[id]/wall-photo), keyed by order id. It
 * shows where on the wall this print goes, so it wins over a survey photo
 * matched by name. Same thumbnail, same failure rule as wallPhotos.
 */
async function orderPhotos(rows: Row[]): Promise<Map<string, { jpeg: string; caption: string }>> {
  const out = new Map<string, { jpeg: string; caption: string }>();
  await Promise.all(rows.filter((r) => r.wall_photo_path).map(async (r) => {
    try {
      const { data } = await caDownload(r.wall_photo_path!);
      if (!data) return;
      const small = await thumbnailBytesRemote(await data.arrayBuffer(), { width: 420, quality: 78 });
      const when = (r.wall_photo_at ?? "").slice(0, 10);
      out.set(r.id, { jpeg: small.toString("base64"), caption: `wall photo${when ? ` · ${when}` : ""}` });
    } catch (e) {
      console.warn("[install-sheet] order wall photo skipped", r.id, e instanceof Error ? e.message : e);
    }
  }));
  return out;
}

/** The framing the partner confirmed in the visualiser, in the shape the print
 *  engine composes with. Absent = the cover-fit default, which is what the
 *  overwhelming majority of orders printed. */
function placementOf(crop: unknown) {
  const c = (crop ?? null) as
    | { zoom?: number; cropX?: number; cropY?: number; flipH?: boolean; flipV?: boolean }
    | null;
  if (!c) return {};
  const clamp = (v: number | undefined, lo: number, hi: number, dflt: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  return {
    zoom: clamp(c.zoom, 1, 4, 1),
    crop_x: clamp(c.cropX, 0, 1, 0.5),
    crop_y: clamp(c.cropY, 0, 1, 0.5),
    flip_h: c.flipH === true,
    flip_v: c.flipV === true,
  };
}


/** False when the print engine cannot be reached from here at all. */
export function installSheetsAvailable(): boolean {
  return Boolean(ENGINE && process.env.MIMAKI_SERVICE_KEY);
}

export type SheetAccount = { id: string; name: string; slug: string };
export type Selector = { order?: string | null; group?: string | null; po?: string | null; osOrderIds?: number[] };

export async function sheetFor(sb: ReturnType<typeof supabaseAdmin> & object, account: SheetAccount, sel: Selector, format: SheetFormat = "pdf") {
  const { order, group, po, osOrderIds } = sel;
  // Always scoped to the account's own rows, and never to a set a partner
  // names by id — the selector is theirs, the rows are ours to resolve.
  let q = sb.from("corporate_orders")
    .select("id, order_ref, os_order_id, os_print_order_no, print_name, po_number, " +
            "group_ref, width_mm, height_mm, ship_city, ship_address, state, crop_data, created_at, " +
            "wall_photo_path, wall_photo_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: true })
    .limit(120);
  if (order) q = q.eq("id", order);
  else if (group) q = q.eq("group_ref", group);
  else if (po) q = q.eq("po_number", po);
  else if (osOrderIds?.length) q = q.in("os_order_id", osOrderIds);
  else return NextResponse.json({ error: "Nothing asked for" }, { status: 400 });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not read those orders" }, { status: 500 });
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Live status, for the ZVY number and the dispatch date. The stored copy is
  // only ever a cache of this, and is null until the first sync after placing.
  const statuses = await fetchOsStatuses(
    rows.map((r) => r.os_order_id).filter((v): v is number => typeof v === "number"),
  );

  // A wall printed as several orders ("… · piece 1/2", "… · piece 2/2") is
  // one run: piece i's right edge meets piece i+1's left. Both pieces carry
  // their 15 mm bleed past that join (ZVY-10661 / 10662, Bhosari, Sep 2026),
  // so the sheet has to name the neighbour and say to double-cut. Resolved
  // among the printed rows of THIS request only — a neighbour that has not
  // been printed yet cannot be joined to.
  const printed = rows.flatMap((r) => {
    const os = r.os_order_id != null ? statuses[r.os_order_id] : undefined;
    const orderNo = (os?.printOrderNo ?? r.os_print_order_no ?? "").trim();
    // Nothing has been printed yet, so there is no piece to hang and nothing
    // the machine can be asked about. Dropped rather than printed empty.
    if (!orderNo) return [];
    const piece = splitPrintName(r.print_name ?? "");
    return [{ r, os, orderNo, piece }];
  });
  // Keyed by name, index AND total: Bhosari's wall A was composed twice
  // (piece 1/2 + 2/2, then 1/4 … 4/4), and "piece 1" of one run is not a
  // neighbour of "piece 2" of the other.
  const pieceKey = (base: string, i: number, total: number) => `${fold(base)}#${i}/${total}`;
  const byPiece = new Map<string, { orderNo: string; os?: OsOrderStatus }>(
    printed.map((p) => [pieceKey(p.piece.base, p.piece.index, p.piece.total),
                        { orderNo: p.orderNo, os: p.os }]));

  // A per-order sheet (?order=) carries ONE piece of a run, so its neighbours
  // are never in this request — the Bhosari A-wall sheets (ZVY-10681/10682,
  // Sep 2026) each called their shared join a wall end for exactly that
  // reason, and the fitter cut a washing machine in half. The neighbours
  // exist as the account's own orders; pull them in as join context only —
  // they name the seam, they never add a page.
  const requestKeys = new Set(byPiece.keys());
  const wantsNeighbours = printed.some((p) => p.piece.total >= 2 && (
    (p.piece.index > 1 && !byPiece.has(pieceKey(p.piece.base, p.piece.index - 1, p.piece.total))) ||
    (p.piece.index < p.piece.total && !byPiece.has(pieceKey(p.piece.base, p.piece.index + 1, p.piece.total)))));
  if (wantsNeighbours) {
    const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
    const fams = [...new Map(
      printed.filter((p) => p.piece.total >= 2)
        .map((p) => [`${fold(p.piece.base)}#${p.piece.total}`, p.piece]),
    ).values()];
    const sibs = (await Promise.all(fams.map(async (f) => {
      const { data } = await sb.from("corporate_orders")
        .select("os_order_id, os_print_order_no, print_name, created_at")
        .eq("account_id", account.id)
        .ilike("print_name", `${escLike(f.base)} · piece %`)
        .order("created_at", { ascending: true })
        .limit(60);
      return (data ?? []) as Pick<Row, "os_order_id" | "os_print_order_no" | "print_name" | "created_at">[];
    }))).flat();
    const sibStatuses = await fetchOsStatuses(
      sibs.map((s) => s.os_order_id)
        .filter((v): v is number => typeof v === "number" && !(v in statuses)),
    );
    for (const s of sibs) {
      const piece = splitPrintName(s.print_name ?? "");
      if (piece.total < 2) continue;
      const key = pieceKey(piece.base, piece.index, piece.total);
      if (requestKeys.has(key)) continue;          // the request's own rows win
      const os = s.os_order_id != null ? (statuses[s.os_order_id] ?? sibStatuses[s.os_order_id]) : undefined;
      // Production's word, same as everywhere else: a cancelled roll must not
      // be named as a neighbour, and an unprinted one has no edge to meet.
      if (os?.printStatus === "cancelled" || os?.stage === "cancelled") continue;
      const orderNo = (os?.printOrderNo ?? s.os_print_order_no ?? "").trim();
      if (!orderNo) continue;
      // created_at ascending, so a re-passed duplicate settles on the newest.
      byPiece.set(key, { orderNo, os });
    }
  }

  const neighbourOf = (p: (typeof printed)[number], side: -1 | 1) => {
    if (p.piece.total < 2) return undefined;
    const n = byPiece.get(pieceKey(p.piece.base, p.piece.index + side, p.piece.total));
    if (!n) return undefined;
    // The neighbour's edge strip: its last strip on our left, its first on our right.
    const panels = typeof n.os?.panels === "number" && n.os.panels > 1 ? n.os.panels : null;
    return side === 1 ? `${n.orderNo} P1` : `${n.orderNo}${panels ? ` P${panels}` : ""}`;
  };

  const [photos, ownPhotos] = await Promise.all([
    wallPhotos(sb, account.id, [...new Set(printed.map((p) => p.piece.base).filter(Boolean))]),
    orderPhotos(printed.map((p) => p.r)),
  ]);

  const lines = printed.map(({ r, os, orderNo, piece }) => {
    const designRef = (os?.designRef ?? "").trim();
    const photo = sheetPhotoFor(ownPhotos.get(r.id), photos.get(fold(piece.base)));
    return {
      order_no: orderNo,
      title: r.print_name ?? undefined,
      reference: r.order_ref,
      dispatched: (os?.dispatchedAt ?? "").slice(0, 10) || undefined,
      // Fallbacks only — the engine prefers its own job row for all three.
      width_mm: r.width_mm ?? undefined,
      height_mm: r.height_mm ?? undefined,
      panels: typeof os?.panels === "number" ? os.panels : undefined,
      image_id: designRef.startsWith("mimaki:") ? designRef.slice(7) : undefined,
      ...placementOf(r.crop_data),
      site_photo_jpeg: photo?.jpeg,
      site_photo_caption: photo?.caption,
      joins_left: neighbourOf({ r, os, orderNo, piece }, -1),
      joins_right: neighbourOf({ r, os, orderNo, piece }, 1),
    };
  });

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Nothing here has been printed yet — an install sheet exists once production has the job." },
      { status: 409 },
    );
  }

  // One site, one address on the sheet. Mixed cities (a PO covering two stores)
  // keep the account name alone rather than claiming a site it isn't.
  const cities = [...new Set(rows.map((r) => (r.ship_city ?? "").trim()).filter(Boolean))];
  const site = cities.length === 1 ? cities[0] : "";
  const address = cities.length === 1
    ? [rows[0].ship_address, rows[0].ship_city, rows[0].state].filter(Boolean).join(", ")
    : "";
  const poLabel = po ?? (rows.every((r) => r.po_number && r.po_number === rows[0].po_number)
    ? rows[0].po_number : null);

  return renderSheet({
    title: site ? `${site} — ${account.name}` : account.name,
    subtitle: [address, poLabel ? `PO ${poLabel}` : ""].filter(Boolean).join("  ·  ") || undefined,
    lines,
  }, `install-sheet-${(site || account.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    + (lines.length === 1 ? `-${lines[0].order_no}` : ""), format);
}

export type SheetFormat = "pdf" | "png";

/** The engine draws the sheet; this asks it, as the PDF or — for the page the
 *  printed QR opens — as one picture of the same page. */
async function renderSheet(
  body: { title: string; subtitle?: string; lines: Array<Record<string, unknown>> },
  name: string,
  format: SheetFormat,
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE}/install-sheet${format === "png" ? "?format=png" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Key": process.env.MIMAKI_SERVICE_KEY! },
      signal: AbortSignal.timeout(55_000),
      // overlap_mm is deliberately not sent: the printed seam allowance is
      // production's rule (zyvorah.print.overlap_mm), and a second copy of it
      // here would drift the day someone changes it.
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "The print server did not answer. Try again in a minute." }, { status: 504 });
  }
  if (!res.ok) {
    console.error("[install-sheet] engine", res.status, (await res.text()).slice(0, 300));
    return NextResponse.json({ error: "Could not build the install sheet." }, { status: 502 });
  }
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": format === "png" ? "image/png" : "application/pdf",
      "Content-Disposition": `inline; filename="${name}.${format}"`,
      "Cache-Control": "no-store, private",
    },
  });
}

/**
 * THE SHEET BEHIND THE PRINTED QR (Roheena, 25 Oct 2026: "when somebody scans
 * the QR which we are printing with the print itself, it should also show
 * exactly this page for all orders").
 *
 * The QR opens /o/<page token>, which knows the ZVY number. A partner's wall
 * gets its account's sheet — survey photo, placement, the joins to the walls
 * beside it — exactly what the partner's portal shows. Any other order (a
 * zyvorah.com customer, a desk order) has no such rows here, so the engine is
 * given the order number and draws from its own record of what came off the
 * machine: the artwork, the finished size, the strips.
 */
export async function sheetForPrintOrder(
  order: { orderNo: string; designName?: string | null; widthMm?: number | null; heightMm?: number | null; panels?: number | null },
  format: SheetFormat,
): Promise<NextResponse> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data: row } = await sb.from("corporate_orders").select("id, account_id")
      .eq("os_print_order_no", order.orderNo).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (row) {
      const { data: account } = await sb.from("corporate_accounts").select("id, name, slug").eq("id", row.account_id).maybeSingle();
      if (account) return sheetFor(sb, account as SheetAccount, { order: row.id as string }, format);
    }
  }
  return renderSheet({
    title: `Zyvorah — ${order.orderNo}`,
    lines: [{
      order_no: order.orderNo,
      title: order.designName ?? undefined,
      // Fallbacks only — the engine prefers its own job row.
      width_mm: order.widthMm ?? undefined,
      height_mm: order.heightMm ?? undefined,
      panels: order.panels ?? undefined,
    }],
  }, `install-sheet-${order.orderNo}`, format);
}
