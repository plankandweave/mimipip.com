import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, signArt, signArtRender } from "./corporate-files";
import { fetchOsStatuses, type OsOrderStatus } from "./corporate-os";
import { loadBatch } from "./site-batch";
import { isSuggested } from "./site-batch-rules";

/**
 * THE INSTALLATION SHEET — which printed roll goes on which wall.
 *
 * The approval page answers "does this creative belong on that wall". The
 * installer's question is the same one turned around: he is holding a rolled
 * strip whose header band says ZVY-10663, standing in a showroom with sixteen
 * walls, and nothing on the paper tells him which one it belongs to.
 *
 * Nothing on the paper ever will. The engine prints the order number and the
 * strip's position WITHIN that order — "ZVY-10663  PIECE 3 OF 9" — because at
 * print time a wall name is not something the machine has. The mapping from
 * ZVY number back to a wall lives only here, which is exactly why this sheet
 * has to exist as a document he can carry.
 *
 * WHY THE JOIN IS BY NAME. `corporate_site_batch_walls.order_refs` looks like
 * the obvious key and is never written — the approve route stamps the wall
 * `ordered` and drops the refs the batch endpoint hands back (it is read at
 * site-batch/[id]/route.ts and populated nowhere). Rather than backfill a
 * column that would still be empty for every batch already approved, the join
 * runs off the one field approval DOES derive from the wall, verbatim:
 *
 *     printName = art.length > 1 ? `${wall.name} · piece ${i+1}/${n}` : wall.name
 *
 * So `print_name` either IS the wall name or is the wall name plus a suffix
 * this module parses back off. That is a construction guarantee, not a
 * heuristic — and it means an install sheet works for Bhosari today rather
 * than only for stores approved after the fix.
 *
 * WHY STATUS COMES FROM THE OS AND NOT FROM US. `corporate_orders.status` is
 * written once at placement and never again: every one of the 70 rows in that
 * table says `in_production`, including the three Bhosari orders production
 * cancelled. A sheet built on that column would send the installer up a
 * ladder with a roll nobody printed. The OS is the system of record for what
 * actually happened to a job, so readiness is resolved live through
 * `fetchOsStatuses`, and a cancelled order is dropped from the sheet entirely.
 *
 * That dropping matters more than it sounds. Re-passing a wall at a corrected
 * size opens a NEW submission rather than editing the old one (the same
 * behaviour the job document had to absorb — see corporate-job-doc.ts), so a
 * re-measured wall legitimately has orders from two submissions pointing at
 * it. Bhosari's entry wall A carries six: a superseded 2-piece set and the
 * live 4-piece set that replaced it. Listing all six is precisely the
 * confusion this sheet is meant to end.
 */

/** How ready a piece — or a whole wall — is to go up. */
export type Readiness = "on_site" | "in_production" | "not_printed";

/** One printed roll: one ZVY number, one piece of a wall's run. */
export type InstallPiece = {
  /** Partner-facing line ref, e.g. VS-000060. */
  orderRef: string;
  /** The number printed on the strip's header band, e.g. ZVY-10663. The
   *  installer's only physical handle — null if the OS never minted one. */
  zvy: string | null;
  /** Position in the wall's run, left to right. 1/1 for a single-roll wall. */
  index: number;
  total: number;
  widthMm: number;
  /** Strips inside this roll, from the OS. Each is headed P1..Pn — and every
   *  roll restarts at P1, which is why `index` above has to be on the sheet. */
  strips: number | null;
  /** The composed creative for this piece, so the installer can eyeball the
   *  roll against the picture before pasting. */
  previewUrl: string | null;
  readiness: Readiness;
  /** Raw OS state, kept for display ("queued for print", "needs input"). */
  printStatus: string | null;
  stage: string | null;
};

export type InstallWall = {
  seq: number;
  name: string;
  widthMm: number;
  heightMm: number;
  /** The bare site photo, and the corner quad the measurement pass fitted to
   *  it — together these let the sheet show the wall as it will look. */
  photoUrl: string | null;
  quad: unknown | null;
  series: string[];
  codes: string[];
  pieces: InstallPiece[];
  /** The weakest link: a wall is only installable when every piece is on site. */
  readiness: Readiness;
  /** Rolls that were printed for this wall and must NOT be used. */
  supersededZvy: string[];
};

export type InstallSheet = {
  batchId: string;
  title: string;
  shipCity: string | null;
  state: string | null;
  shipAddress: string | null;
  shipContactName: string | null;
  shipContactPhone: string | null;
  accountName: string;
  /** True when production could not be reached, so every readiness on this
   *  sheet is a guess. The sheet still renders — an installer with a stale
   *  wall list is better off than one with none — but it has to SAY so, or it
   *  reads as "nothing was printed" in a confident typeface. */
  statusUnknown: boolean;
  walls: InstallWall[];
  totals: {
    walls: number;
    wallsReady: number;
    stripsReady: number;
    wallsInProduction: number;
    wallsNotPrinted: number;
  };
};

/** `Ground floor H wall · piece 3/4` → base name, 3, 4. A name with no suffix
 *  is a one-piece wall, which is the same shape with index 1 of 1. */
const PIECE_SUFFIX = /^(.*?)\s*·\s*piece\s+(\d+)\s*\/\s*(\d+)\s*$/i;

function splitPrintName(printName: string): { base: string; index: number; total: number } {
  const m = PIECE_SUFFIX.exec(printName);
  if (!m) return { base: printName.trim(), index: 1, total: 1 };
  return { base: m[1]!.trim(), index: Number(m[2]), total: Number(m[3]) };
}

/** Wall names are typed on site and their case is not consistent ("Ground
 *  floor c wall" beside "Ground floor B wall"), so match on a folded form. */
const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The OS reports WHAT state a job is in. Three of those states matter to
 * somebody standing at the wall: it is here, it is coming, or it does not
 * exist yet. Everything else collapses into one of the three.
 */
function readinessOf(os: { stage?: string | null; printStatus?: string | null; dispatchedAt?: string | null } | undefined): Readiness {
  if (!os) return "not_printed";
  if (os.dispatchedAt || os.stage === "dispatched") return "on_site";
  if (os.printStatus === "needs_input" || os.stage === "received") return "not_printed";
  return "in_production";
}

/** A wall is as ready as its least ready piece — half a run is not a wall. */
function weakest(pieces: { readiness: Readiness }[]): Readiness {
  if (!pieces.length) return "not_printed";
  if (pieces.some((p) => p.readiness === "not_printed")) return "not_printed";
  if (pieces.some((p) => p.readiness === "in_production")) return "in_production";
  return "on_site";
}

type OrderRow = {
  order_ref: string;
  print_name: string | null;
  os_order_id: number | null;
  os_print_order_no: string | null;
  width_mm: number | null;
  created_at: string;
};

/**
 * Build the sheet for one site batch. Returns null when the batch is unknown.
 *
 * `accountId` is the caller's account and is used to scope the order lookup —
 * two partners can name a wall the same thing, and a name-based join across
 * accounts would be a cross-tenant leak rather than a bug.
 */
export async function buildInstallSheet(
  sb: SupabaseClient,
  batchId: string,
  accountId: string,
): Promise<InstallSheet | null> {
  const loaded = await loadBatch(sb, batchId);
  if (!loaded || loaded.batch.account_id !== accountId) return null;
  const { batch, walls } = loaded;

  const { data: account } = await sb
    .from("corporate_accounts").select("name").eq("id", accountId).single();

  // Who to ring from the site. The batch itself carries only an address; the
  // contact lives on the state profile, which is exactly where approval read
  // it from when it placed these orders — so the sheet names the same person
  // the consignment was addressed to.
  const { data: profile } = await sb
    .from("corporate_state_profiles")
    .select("contact_name, contact_phone")
    .eq("account_id", accountId)
    .eq("state", batch.state ?? "Maharashtra")
    .maybeSingle();

  // Design codes + series, exactly as the approval page shows them, so the
  // two documents cannot describe the same wall differently.
  const allIds = [...new Set(walls.flatMap((w) => w.design_ids))];
  const { data: designRows } = allIds.length
    ? await sb.from("corporate_designs").select("id, design_code, series_name").in("id", allIds)
    : { data: [] };
  const designById = new Map((designRows ?? []).map((d) => [d.id as string, d]));

  // Every order this account has ever placed whose print_name resolves to one
  // of THIS batch's walls. Scoped by account, then filtered by name — a batch
  // spans several submissions (group_refs), so filtering on the batch's own
  // group_ref would miss the very replacement walls that make this hard.
  const { byWall, osById, osReachable } = await resolveWallOrders(sb, walls, accountId);

  const out: InstallWall[] = [];
  // A wall Zyvorah suggested and the client never released has no roll to
  // find; it is not on the installer's paper.
  for (const w of walls.filter((x) => !(isSuggested(x) && x.status !== "ordered"))) {
    const { chosen, supersededZvy } = byWall.get(w.seq) ?? { chosen: [], supersededZvy: [] };

    // The composed creative, piece for piece. art_json is what approval turned
    // into order lines in the same order, so art[i] IS piece i+1.
    const art = w.art_json ?? [];
    const signed = await Promise.all(
      // signArtRender, not signArt: these URLs are fetched by the install-sheet
      // PDF renderer, which embeds ~420px thumbnails — signing the render CDN
      // at 420 keeps a 30-wall sheet in the hundreds of KB instead of tens of
      // MB of full phone photos (the renderer no longer downscales locally).
      art.map(async (p) => (p.path ? await signArtRender(sb, p.path, DAY, 420) : p.previewUrl ?? null)),
    );

    const pieces: InstallPiece[] = chosen
      .map((o) => {
        const { index, total } = splitPrintName(o.print_name!);
        const os = o.os_order_id != null ? osById[o.os_order_id] : undefined;
        return {
          orderRef: o.order_ref,
          zvy: o.os_print_order_no ?? (os?.printOrderNo as string | null) ?? null,
          index,
          total,
          widthMm: o.width_mm ?? 0,
          strips: (os?.panels as number | null) ?? null,
          previewUrl: signed[index - 1] ?? null,
          readiness: readinessOf(os),
          printStatus: (os?.printStatus as string | null) ?? null,
          stage: (os?.stage as string | null) ?? null,
        };
      })
      .sort((a, b) => a.index - b.index);

    const picks = w.design_ids.map((id) => designById.get(id)).filter(Boolean);
    out.push({
      seq: w.seq,
      name: w.name,
      widthMm: w.width_mm,
      heightMm: w.height_mm,
      photoUrl: w.photo_path ? await signArtRender(sb, w.photo_path, DAY, 420) : null,
      quad: w.quad_json ?? null,
      series: [...new Set(picks.map((d) => (d!.series_name as string) ?? "—"))],
      codes: picks.map((d) => (d!.design_code as string) ?? "").filter(Boolean),
      pieces,
      readiness: weakest(pieces),
      supersededZvy: [...new Set(supersededZvy)],
    });
  }

  const stripsReady = out
    .filter((w) => w.readiness === "on_site")
    .reduce((s, w) => s + w.pieces.reduce((t, p) => t + (p.strips ?? 0), 0), 0);

  return {
    batchId: batch.id,
    title: batch.title,
    shipCity: batch.ship_city ?? null,
    state: batch.state ?? null,
    shipAddress: batch.ship_address ?? null,
    shipContactName: (profile?.contact_name as string) ?? null,
    shipContactPhone: (profile?.contact_phone as string) ?? null,
    accountName: (account?.name as string) ?? "",
    statusUnknown: !osReachable,
    walls: out,
    totals: {
      walls: out.length,
      wallsReady: out.filter((w) => w.readiness === "on_site").length,
      stripsReady,
      wallsInProduction: out.filter((w) => w.readiness === "in_production").length,
      wallsNotPrinted: out.filter((w) => w.readiness === "not_printed").length,
    },
  };
}

/** The orders that belong to one wall, once cancellations and superseded
 *  re-measure sets have been taken out. */
export type WallOrders = { chosen: OrderRow[]; supersededZvy: string[] };

/**
 * THE JOIN, ONCE. Which live orders belong to each wall of a batch, resolved
 * against the OS. Both readers of this — the installation sheet and the
 * approval page's status badge — have to agree about what happened to a wall,
 * so neither owns the rule. See the module header for why the join is by
 * print_name and why the OS, not `corporate_orders.status`, is the authority.
 *
 * `osReachable` is false when we asked the OS about orders and it told us
 * nothing. `fetchOsStatuses` fails OPEN — any error, timeout or missing token
 * returns `{}` — which is indistinguishable from "these orders have no status"
 * and, read naively, resolves every wall to not_printed. On a dashboard that
 * is a stale badge; on a sheet an installer is holding, it is a confident lie
 * that nothing was printed, which is the exact failure this whole module
 * exists to prevent. So callers are told when the answer is unknown rather
 * than being handed a fabricated one.
 */
export async function resolveWallOrders(
  sb: SupabaseClient,
  walls: { seq: number; name: string }[],
  accountId: string,
): Promise<{
  byWall: Map<number, WallOrders>;
  osById: Record<number, OsOrderStatus>;
  osReachable: boolean;
}> {
  const byWall = new Map<number, WallOrders>();
  if (!walls.length) return { byWall, osById: {}, osReachable: true };

  // Every order this account has ever placed whose print_name resolves to one
  // of THIS batch's walls. Scoped by account, then filtered by name — a batch
  // spans several submissions (group_refs), so filtering on the batch's own
  // group_ref would miss the very replacement walls that make this hard.
  const wantedNames = new Set(walls.map((w) => fold(w.name)));
  const { data: orderRows } = await sb
    .from("corporate_orders")
    .select("order_ref, print_name, os_order_id, os_print_order_no, width_mm, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const relevant = ((orderRows ?? []) as OrderRow[]).filter(
    (o) => o.print_name && wantedNames.has(fold(splitPrintName(o.print_name).base)),
  );

  // One call for the whole batch, not one per wall.
  const osIds = relevant.map((o) => o.os_order_id).filter((n): n is number => typeof n === "number");
  const osById = await fetchOsStatuses(osIds);
  // Asked about orders and got nothing back = the OS did not answer. It cannot
  // legitimately return zero statuses for ids it minted itself.
  const osReachable = osIds.length === 0 || Object.keys(osById).length > 0;

  for (const w of walls) {
    const mine = relevant.filter((o) => fold(splitPrintName(o.print_name!).base) === fold(w.name));

    // Drop what production cancelled, but remember it: a cancelled roll may
    // still be sitting in the consignment, and "do not use this one" is worth
    // more to the installer than silence.
    const supersededZvy: string[] = [];
    const live = mine.filter((o) => {
      const os = o.os_order_id != null ? osById[o.os_order_id] : undefined;
      if (os?.printStatus === "cancelled" || os?.stage === "cancelled") {
        if (o.os_print_order_no) supersededZvy.push(o.os_print_order_no);
        return false;
      }
      return true;
    });

    // A re-measured wall can leave two LIVE sets behind if production never
    // cancelled the first — different piece totals against the same wall.
    // The most recently placed set is the one that was re-measured, so it
    // wins, and the older set joins the do-not-use list rather than being
    // silently mixed into the run.
    const byTotal = new Map<number, OrderRow[]>();
    for (const o of live) {
      const { total } = splitPrintName(o.print_name!);
      const arr = byTotal.get(total) ?? [];
      arr.push(o);
      byTotal.set(total, arr);
    }
    let chosen = live;
    if (byTotal.size > 1) {
      const sets = [...byTotal.values()].sort(
        (a, b) => Date.parse(newest(a)) - Date.parse(newest(b)),
      );
      chosen = sets[sets.length - 1]!;
      for (const older of sets.slice(0, -1)) {
        for (const o of older) if (o.os_print_order_no) supersededZvy.push(o.os_print_order_no);
      }
    }

    byWall.set(w.seq, { chosen, supersededZvy: [...new Set(supersededZvy)] });
  }

  return { byWall, osById, osReachable };
}

/** What the approval page says about a wall AFTER it was released to print. */
export type WallLive = {
  /** Null when the OS said nothing — an unknown is not "not_printed". The
   *  sheet can afford a floor value because it states its uncertainty in a
   *  banner above the walls; a single badge has no such banner, so the absence
   *  is carried in the type and a caller cannot read past it by accident. */
  readiness: Readiness | null;
  /** Furthest milestone the whole wall has reached — the weakest piece wins,
   *  because a wall half-dispatched is not a wall you can install. */
  milestone: "placed" | "printing" | "printed" | "packed" | "dispatched";
  dispatchedAt: string | null;
  courier: string | null;
  podNo: string | null;
  trackingUrl: string | null;
  /** The numbers on the rolls, so "dispatched" can be checked against paper. */
  zvy: string[];
  /** False when the OS told us nothing about this wall's rolls. Every field
   *  above is then a default, not an observation, and the badge must say so —
   *  see the note on `milestoneOf`. */
  statusKnown: boolean;
};

/** How far one order has actually got. Ordered weakest-first; a wall reports
 *  the lowest its pieces reach. */
const MILESTONES = ["placed", "printing", "printed", "packed", "dispatched"] as const;

/**
 * A missing status resolves to "placed" — the weakest milestone — because that
 * is the only honest ORDERING for an unknown. It is not an honest THING TO
 * SAY: `fetchOsStatuses` fails open, so one OS timeout would otherwise render
 * every wall of a dispatched store as "Queued for print", which is the same
 * confident lie this whole change set out to remove (the sheet had the harsher
 * version of it — see 7c66edd). Callers must gate the words on `statusKnown`
 * rather than print this milestone unconditionally.
 */
function milestoneOf(os: OsOrderStatus | undefined): WallLive["milestone"] {
  if (!os) return "placed";
  if (os.dispatchedAt || os.stage === "dispatched") return "dispatched";
  if (os.labelReleasedAt) return "packed";
  if (os.printedAt) return "printed";
  if (os.printingAt) return "printing";
  return "placed";
}

/**
 * Live status per wall seq, for walls the batch has already released to print.
 *
 * The wall's own `status` column stops at `ordered` — approve/route.ts writes
 * it once and nothing ever writes a later value — so a badge rendered off that
 * column says "In production" for the rest of time, including after the
 * consignment has been delivered (reported 2026-08-27 for Bhosari, whose walls
 * were already dispatched). Fulfilment is the OS's fact, and this is where the
 * page goes to ask for it.
 */
export async function fetchWallLiveStatus(
  sb: SupabaseClient,
  walls: { seq: number; name: string }[],
  accountId: string,
): Promise<Record<number, WallLive>> {
  const { byWall, osById } = await resolveWallOrders(sb, walls, accountId);
  const out: Record<number, WallLive> = {};

  for (const w of walls) {
    const chosen = byWall.get(w.seq)?.chosen ?? [];
    if (!chosen.length) continue;

    const statuses = chosen.map((o) => (o.os_order_id != null ? osById[o.os_order_id] : undefined));
    const milestone = statuses
      .map(milestoneOf)
      .reduce((weakest, m) => (MILESTONES.indexOf(m) < MILESTONES.indexOf(weakest) ? m : weakest));
    // Courier details come from a dispatched piece — they are identical across
    // a wall's rolls, which travel in one consignment.
    const shipped = statuses.find((os) => os?.dispatchedAt);

    const statusKnown = statuses.some((os) => os !== undefined);
    out[w.seq] = {
      statusKnown,
      readiness: statusKnown
        ? weakest(statuses.map((os) => ({ readiness: readinessOf(os) })))
        : null,
      milestone,
      dispatchedAt: (shipped?.dispatchedAt as string | null) ?? null,
      courier: (shipped?.courier as string | null) ?? null,
      podNo: (shipped?.podNo as string | null) ?? null,
      trackingUrl: (shipped?.trackingUrl as string | null) ?? null,
      zvy: chosen
        .map((o, i) => o.os_print_order_no ?? (statuses[i]?.printOrderNo as string | null) ?? null)
        .filter((z): z is string => Boolean(z)),
    };
  }

  return out;
}

function newest(rows: OrderRow[]): string {
  return rows.reduce((max, r) => (r.created_at > max ? r.created_at : max), rows[0]!.created_at);
}
