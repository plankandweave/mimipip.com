import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { areaLabel } from "@/lib/portfolio";
import { composeDigest, type AlertItem } from "@/lib/portfolio-alert";
import { fileSection } from "@/lib/briefing";
import { loadPulse } from "@/lib/vault";
import { draftPendingWalks } from "@/lib/pulse-draft";
import type { BlueprintRow } from "@/lib/trace-link";
import { osPipelineUrl } from "@/lib/crm-in-the-os";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The other half of the portfolio brief.
 *
 * Roheena's original ask was that a client capturing their own walls means "it
 * directly comes into us as a project and we are able to design and process
 * it". Everything else built for Knowledge Realty does the first part — they
 * can photograph a whole tower without us — and none of it did the second.
 * Without this, they could capture twenty walls, record three walkthroughs and
 * approve a direction, and nobody here would know until somebody looked.
 *
 * Why a sweep rather than an email fired at the moment of each action: the same
 * reason the corporate-attention cron next door exists. An alert that depends
 * on a request completing is an alert that is lost whenever that request dies,
 * and the actions here happen on lift-lobby connections. Reading the state
 * cannot miss anything; sending from inside the action can.
 *
 * Idempotent through corporate_portfolio_alerts (migration 0160): the insert IS
 * the claim, so two overlapping runs cannot both report the same six walls.
 *
 * Auth: the scheduler sends `Authorization: Bearer <CRON_SECRET>`, as every
 * other cron route here does.
 */

const ESCALATE_TO = process.env.CORPORATE_ESCALATION_EMAIL || "roheena@plankandweave.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";
/** A guard rail, not a page size: a run that would mail fifty lines means
 *  something has gone wrong upstream, and a wall of text is not read anyway. */
const MAX_ITEMS = 25;

type Account = { id: string; name: string; slug: string };

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: accountRows } = await sb.from("corporate_accounts")
    .select("id, name, slug").eq("portfolio_mode", true).eq("active", true);
  const accounts = (accountRows ?? []) as Account[];
  if (accounts.length === 0) return NextResponse.json({ ok: true, accounts: 0, sent: false });

  // Everything already reported, read once. A portfolio's ledger is small, and
  // one read beats a round trip per candidate.
  const { data: seenRows } = await sb.from("corporate_portfolio_alerts")
    .select("kind, subject_id")
    .in("account_id", accounts.map((a) => a.id));
  const seen = new Set((seenRows ?? []).map((r) => `${r.kind}:${r.subject_id}`));
  const fresh = (kind: string, id: string) => !seen.has(`${kind}:${id}`);

  const items: AlertItem[] = [];
  const claims: { account_id: string; kind: string; subject_id: string; detail: string }[] = [];

  for (const account of accounts) {
    const { data: areaRows } = await sb.from("corporate_site_areas")
      .select("id, store_id, floor, name").eq("account_id", account.id).eq("active", true);
    const areas = (areaRows ?? []);
    if (areas.length === 0) continue;

    const { data: storeRows } = await sb.from("corporate_stores")
      .select("id, name").eq("account_id", account.id);
    const storeName = new Map((storeRows ?? []).map((s) => [s.id as string, s.name as string]));
    const placeOf = (areaId: string) => {
      const a = areas.find((x) => x.id === areaId);
      if (!a) return account.name;
      return `${storeName.get(a.store_id as string) ?? "—"} · ${areaLabel(a as never)}`;
    };

    const { data: batchRows } = await sb.from("corporate_site_batches")
      .select("id, area_id").in("area_id", areas.map((a) => a.id)).eq("status", "collecting");
    const batches = (batchRows ?? []);
    const areaOfBatch = new Map(batches.map((b) => [b.id as string, b.area_id as string]));

    // ── Walls captured ────────────────────────────────────────────────────
    // Reported per wall so nothing is missed, but SUMMARISED per space in the
    // mail — "6 walls in the lift lobby" is what a person can act on, where six
    // separate lines about six walls is just noise.
    const { data: wallRows } = batches.length
      ? await sb.from("corporate_site_batch_walls")
          .select("id, batch_id, name").in("batch_id", batches.map((b) => b.id))
      : { data: [] as { id: string; batch_id: string; name: string }[] };

    const newWallsByArea = new Map<string, string[]>();
    for (const w of wallRows ?? []) {
      if (!fresh("walls", w.id as string)) continue;
      const areaId = areaOfBatch.get(w.batch_id as string);
      if (!areaId) continue;
      const list = newWallsByArea.get(areaId) ?? [];
      list.push(w.id as string);
      newWallsByArea.set(areaId, list);
      claims.push({ account_id: account.id, kind: "walls", subject_id: w.id as string, detail: String(w.name) });
    }
    for (const [areaId, ids] of newWallsByArea) {
      items.push({
        kind: "walls",
        // The alert is keyed per wall in the ledger; the LINE is keyed by the
        // first of them purely so it has an id.
        subjectId: ids[0]!,
        accountName: account.name,
        where: placeOf(areaId),
        detail: `${ids.length} ${ids.length === 1 ? "wall" : "walls"}`,
      });
    }

    // ── Walkthroughs recorded ─────────────────────────────────────────────
    const { data: walkRows } = await sb.from("corporate_walkthroughs")
      .select("id, area_id, video_seconds, video_path")
      .in("area_id", areas.map((a) => a.id));
    for (const w of walkRows ?? []) {
      // Only once the recording has actually landed — a row created the instant
      // somebody pressed start is not yet news.
      if (!w.video_path || !fresh("walkthrough", w.id as string)) continue;
      const secs = Number(w.video_seconds) || 0;
      items.push({
        kind: "walkthrough",
        subjectId: w.id as string,
        accountName: account.name,
        where: placeOf(w.area_id as string),
        detail: secs ? `${Math.floor(secs / 60)}m ${secs % 60}s` : "recorded",
      });
      claims.push({ account_id: account.id, kind: "walkthrough", subject_id: w.id as string, detail: "recorded" });
    }

    // ── Studies approved ──────────────────────────────────────────────────
    // The one that matters commercially: they have decided.
    const { data: studyRows } = await sb.from("corporate_wall_studies")
      .select("id, wall_id, design_id").eq("account_id", account.id).eq("status", "approved");
    const approved = (studyRows ?? []).filter((s) => fresh("approved", s.id as string));
    if (approved.length) {
      const { data: designRows } = await sb.from("corporate_designs")
        .select("id, title").in("id", [...new Set(approved.map((s) => s.design_id as string))]);
      const title = new Map((designRows ?? []).map((d) => [d.id as string, d.title as string]));
      const { data: wallNames } = await sb.from("corporate_site_batch_walls")
        .select("id, batch_id, name").in("id", approved.map((s) => s.wall_id as string));
      const wall = new Map((wallNames ?? []).map((w) => [w.id as string, w]));

      for (const s of approved) {
        const w = wall.get(s.wall_id as string);
        const areaId = w ? areaOfBatch.get(w.batch_id as string) : null;
        items.push({
          kind: "approved",
          subjectId: s.id as string,
          accountName: account.name,
          where: areaId ? placeOf(areaId) : account.name,
          detail: `${title.get(s.design_id as string) ?? "a design"}${w ? ` on ${w.name}` : ""}`,
        });
        claims.push({ account_id: account.id, kind: "approved", subject_id: s.id as string, detail: "approved" });
      }
    }

    // ── A design run that has stopped ─────────────────────────────────────
    // compose sets status 'needs_attention' and its own comment says "a person
    // has to look at it" — but nothing has ever told that person, and the
    // site-batch-drive cron deliberately skips these rows. So a failed run has
    // been silent by construction.
    //
    // Scoped to PORTFOLIO accounts on purpose. The same hole exists for every
    // reseller account, but mailing about another account's operations is a
    // change to how their desk works and is not mine to make unasked.
    const { data: stuckRows } = await sb.from("corporate_site_batches")
      .select("id, area_id, title, warning")
      .in("area_id", areas.map((a) => a.id))
      .eq("status", "needs_attention");
    for (const s of stuckRows ?? []) {
      if (!fresh("stuck", s.id as string)) continue;
      items.push({
        kind: "stuck",
        subjectId: s.id as string,
        accountName: account.name,
        where: placeOf(s.area_id as string),
        detail: (s.warning as string | null)?.slice(0, 140) ?? "it needs a person to look at it",
      });
      claims.push({
        account_id: account.id, kind: "stuck", subject_id: s.id as string,
        detail: "needs_attention",
      });
    }

    // ── Waiting on us ─────────────────────────────────────────────────────
    // They have done their part and their library is still empty, so their own
    // screen is currently telling them we are the hold-up. Keyed on the account
    // so it is said once, not every tick — but it is the loudest line when it
    // does appear.
    const { count: designCount } = await sb.from("corporate_designs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id).neq("status", "archived");
    const wallTotal = (wallRows ?? []).length;
    if ((designCount ?? 0) === 0 && wallTotal > 0 && fresh("waiting_library", account.id)) {
      items.push({
        kind: "waiting_library",
        subjectId: account.id,
        accountName: account.name,
        where: `${SITE_URL}/partners/${account.slug}`,
        detail: `${wallTotal} ${wallTotal === 1 ? "wall" : "walls"} captured and their library is still empty`,
      });
      claims.push({
        account_id: account.id, kind: "waiting_library", subject_id: account.id,
        detail: `${wallTotal} walls`,
      });
    }
  }

  // ── Campus projects: Pulse to the brief ───────────────────────────────
  // Every open Blueprint, its walls drafted from any walk still owed, and
  // its readiness filed as one section. What needs Roheena is only a project
  // that has turned READY — Prism can start — never a college that is still
  // sending plans; that is theirs to do and their own board tells them.
  const pulseFiled = await filePulse(sb, accounts);

  const digest = composeDigest(items.slice(0, MAX_ITEMS), osPipelineUrl());
  if (!digest) return NextResponse.json({ ok: true, accounts: accounts.length, sent: false, pulse: pulseFiled });

  // CLAIM BEFORE SENDING. If the insert wins and the mail then fails, we lose
  // one notification; if the mail wins and the claim then fails, we re-send the
  // same thing every few minutes until somebody acts — and an alert that cries
  // wolf is worse than one that occasionally misses, because the second is
  // noticed and the first is filtered.
  const { error: claimError } = await sb.from("corporate_portfolio_alerts")
    .upsert(claims, { onConflict: "kind,subject_id", ignoreDuplicates: true });
  if (claimError) {
    console.error("[portfolio-attention] could not claim alerts:", claimError.message);
    return NextResponse.json({ ok: false, error: "claim failed" }, { status: 500 });
  }

  const sent = await sendEmail({
    to: ESCALATE_TO,
    subject: digest.subject,
    html: digest.html,
  });
  if (!sent) console.error("[portfolio-attention] digest send failed:", digest.subject);

  return NextResponse.json({
    ok: true,
    accounts: accounts.length,
    items: items.length,
    sent,
    subject: digest.subject,
  });
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function filePulse(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, accounts: Account[]): Promise<number> {
  const { data: bpRows } = await sb.from("campus_blueprints").select("*")
    .in("account_id", accounts.map((a) => a.id)).neq("status", "closed").order("created_at");
  const blueprints = (bpRows ?? []) as BlueprintRow[];
  if (blueprints.length === 0) return 0;
  const observedAt = new Date().toISOString();
  const lines: string[] = [];
  const needs: string[] = [];
  for (const bp of blueprints) {
    try { await draftPendingWalks(sb, bp.id); } catch (e) { console.error("[portfolio-attention] pulse draft:", (e as Error)?.message); }
    const pulse = await loadPulse(sb, bp);
    const account = accounts.find((a) => a.id === bp.account_id);
    const link = account ? `${SITE_URL}/partners/${account.slug}/vault` : null;
    const title = link ? `<a href="${link}">${escapeHtml(bp.name)}</a>` : escapeHtml(bp.name);
    lines.push(`<li>${title}: ${escapeHtml(pulse.readiness.headline)}${pulse.readiness.ask ? ` ${escapeHtml(pulse.readiness.ask)}` : ""}</li>`);
    if (pulse.readiness.canStart && pulse.status === "ready") {
      needs.push(`${bp.name} is ready for Prism: every wall is photographed, measured, drawn and briefed.`);
    }
  }
  const ready = blueprints.filter((bp) => bp.status === "ready").length;
  const headline = `${blueprints.length} campus ${blueprints.length === 1 ? "project" : "projects"} · ${ready} ready for Prism`;
  const body = `<ul>${lines.join("")}</ul>` + (needs.length
    ? `<p><strong>What needs you:</strong><br>${needs.map(escapeHtml).join("<br>")}</p>` : "");
  const filed = await fileSection({
    key: "campus-pulse", status: needs.length ? "amber" : "green", headline, bodyHtml: body,
    source: "portfolio-attention", observedAt,
  });
  if (!filed.ok) console.error("[portfolio-attention] pulse filing failed:", filed.error);
  return blueprints.length;
}

export const GET = withCronRun("portfolio-attention", handler);
export const POST = withCronRun("portfolio-attention", handler);
