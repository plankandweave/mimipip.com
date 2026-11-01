import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalTokenOk, loadBatch } from "@/lib/site-batch";
import { drawnWalls, orderOrigin, sqftOf, suggestedWalls, wallsWord } from "@/lib/site-batch-rules";
import { priceProjectLines } from "@/lib/corporate-project";
import type { CorporateAccount } from "@/lib/corporate-auth";
import { sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";
const ESCALATE_TO = process.env.CORPORATE_ESCALATION_EMAIL || "roheena@plankandweave.com";

// POST → the composed batch goes to the partner's approvers: status flips to
// proposed and the account's approver gets the review link. From here the
// pipeline is out of our hands until their ONE approval fires the orders.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!internalTokenOk(req)) {
    const session = await currentCorporateSession();
    // Account admins run their own store, and OUR OWN STAFF run the pipeline
    // they built — `can()` has always granted staff everything, but this gate
    // asked isAccountAdmin, which is member?.role and therefore NULL for
    // staff. That locked Zyvorah out of allocate/compose on every account
    // (live 401, 19 Aug 2026). Client sign-off (approve) and the client's own
    // member list stay account-admin only.
    if (!session || session.account.id !== loaded.batch.account_id || (!isAccountAdmin(session) && !session.staff)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }

  // A revised batch has to be able to go back out. It used to demand
  // status==='composed' exactly, while feedback set the batch to 'allocated' —
  // so after ONE client change request a proposal could never be re-sent and
  // the approve buttons disappeared for good.
  const revision = loaded.batch.revision ?? 1;
  const alreadyProposedThis = loaded.batch.proposed_revision != null
    && revision <= loaded.batch.proposed_revision;
  if (loaded.batch.status === "needs_attention") {
    return NextResponse.json({
      error: "Some walls could not be composed. Fix or re-allocate those walls before proposing — a partial store must not go out for approval.",
    }, { status: 409 });
  }
  if (loaded.batch.status !== "composed") {
    return NextResponse.json({ error: `Batch is ${loaded.batch.status} — compose it before proposing.` }, { status: 409 });
  }
  if (alreadyProposedThis) {
    return NextResponse.json({ error: `Revision ${revision} has already been proposed.` }, { status: 409 });
  }

  const { data: acc } = await sb.from("corporate_accounts")
    .select("*").eq("id", loaded.batch.account_id).single();

  // Who signs this off. approver_email is the account's legacy single contact;
  // the people who can actually approve are the account's admins, so both get
  // it. A null approver_email used to mean the proposal was silently never
  // sent and nobody — client or desk — was told.
  // …unless the founder has named who it goes to (`proposal_to`): then those
  // people and nobody else (Nelamangala, 14 October 2026: "send the proposal
  // to Abhay & Nilesh"). The founder's copy is unchanged either way.
  const named = (loaded.batch.proposal_to ?? [])
    .filter((e): e is string => typeof e === "string" && e.includes("@"))
    .map((e) => e.trim().toLowerCase());
  const { data: admins } = named.length ? { data: [] as { email: string }[] } : await sb.from("corporate_members")
    .select("email").eq("account_id", loaded.batch.account_id)
    .eq("role", "admin").eq("active", true);
  const recipients = named.length ? [...new Set(named)] : [...new Set(
    [(acc?.approver_email as string) || null, ...(admins ?? []).map((m) => m.email as string)]
      .filter((e): e is string => Boolean(e && e.includes("@")))
      .map((e) => e.trim().toLowerCase()),
  )];

  const url = `${SITE_URL}/partners/${acc?.slug ?? ""}/site-batches/${id}`;

  if (!recipients.length) {
    // Nowhere to send it. Park it rather than mark it proposed, and tell our
    // own desk — this is a data gap on the account, not a transient failure.
    const msg = "No approver_email and no active admin on the account — nobody to send the proposal to.";
    await sb.from("corporate_site_batches").update({ email_error: msg }).eq("id", id);
    await sendEmailWithId({
      to: DESK_EMAIL, cc: ESCALATE_TO,
      subject: `${loaded.batch.title} — proposal ready but has no recipient`,
      html: `<p>${loaded.batch.title} composed cleanly and is ready to propose, but the account has no <code>approver_email</code> and no active admin member, so there is no one to send it to.</p><p>Add an admin or an approver email, then re-run propose.</p><p><a href="${url}">${url}</a></p>`,
    }).catch(() => { /* the park above is the durable record */ });
    return NextResponse.json({ ok: false, url, emailed: false, error: msg }, { status: 409 });
  }

  {
    // ONE consolidated mail (Roheena 2026-08-18): the approver gets the whole
    // store in a single message — every wall listed with its size and what
    // the AI read it as — with Roheena in copy so both sides hold the same
    // record of what was asked for approval.
    // The client's own walls are the proposal; a wall Zyvorah suggested is
    // listed BELOW them, with its reason, as an optional addition — never
    // folded into the count or the area they asked for (site-batch-rules.ts).
    const drawn = drawnWalls(loaded.walls);
    const suggested = suggestedWalls(loaded.walls);
    // Honest about repeats: a series shorter than the store's walls repeats a
    // design on walls that are not next to each other (Nelamangala,
    // 14 October 2026, "go ahead with repeats"); the old line promised none.
    const seenDesign = new Set<string>();
    const repeated = loaded.walls.some((w) => w.design_ids.some((d) => seenDesign.size === seenDesign.add(d).size));
    const repeatsLine = repeated
      ? "Where the chosen series runs shorter than the store, a design is repeated only on walls that are not next to each other."
      : "No design repeats anywhere in the store.";
    const wallCount = drawn.length;
    const measuredSqft = Math.round(drawn.reduce((s, w) => s + sqftOf(w), 0));
    const measuredSuggestedSqft = Math.round(suggested.reduce((s, w) => s + sqftOf(w), 0));
    // The BILLED area, from the same pricing the quotation and the invoice
    // use, so the email never names a smaller number than the bill. A band
    // narrower than the roll uses the full web for its whole run, so its
    // billed area is larger than its measured area (the media floor,
    // Roheena 26 August 2026) — and the email says so when it is.
    const priced = acc
      ? await priceProjectLines(acc as CorporateAccount, loaded.walls.map((w) => ({
          designUrl: w.art_json?.[0]?.url ?? "", widthMm: w.width_mm, heightMm: w.height_mm, printName: w.name,
        })))
      : null;
    const billedOf = (set: typeof loaded.walls) => priced?.ok
      ? Math.round(set.reduce((s, w) => s + (priced.lines[loaded.walls.indexOf(w)]?.price.areaSqft ?? sqftOf(w)), 0))
      : null;
    const floorMm = priced?.ok ? priced.lines[0]?.price.minBillableWidthMm ?? null : null;
    const floorApplied = priced?.ok && priced.lines.some((l) => l.price.mediaFloorApplied);
    const sqft = billedOf(drawn) ?? measuredSqft;
    const suggestedSqft = billedOf(suggested) ?? measuredSuggestedSqft;
    const areaLine = (billed: number, measured: number) =>
      billed !== measured ? `~${billed.toLocaleString("en-IN")} sq ft billed (${measured.toLocaleString("en-IN")} sq ft measured)` : `~${billed.toLocaleString("en-IN")} sq ft`;
    const floorNote = floorApplied && floorMm
      ? `<p style="color:#525252;font-size:13px">Billed area is larger than measured area where a wall or band is narrower than the roll: it still uses the full ${(floorMm / 1000).toFixed(2)} m web for its whole run, so that run is billed at run length × ${(floorMm / 1000).toFixed(2)} m. The quotation on the review page shows both figures for every wall.</p>`
      : "";
    const row = (w: (typeof loaded.walls)[number]) => {
      const ctx = w.context_json?.context ? ` — ${w.context_json.context}` : "";
      return `<tr><td style="padding:3px 10px 3px 0">${w.seq}.</td><td style="padding:3px 10px 3px 0"><b>${w.name}</b>${ctx}</td><td style="padding:3px 0;white-space:nowrap">${(w.width_mm / 1000).toFixed(2)} × ${(w.height_mm / 1000).toFixed(2)} m</td></tr>`;
    };
    const rows = drawn.map(row).join("");
    const suggestedBlock = suggested.length
      ? `<p style="margin-top:18px"><b>Our suggestion${suggested.length === 1 ? "" : "s"}</b> — not in your drawing, offered as ${suggested.length === 1 ? "an optional addition" : "optional additions"} (${areaLine(suggestedSqft, measuredSuggestedSqft)}). Each is shown with its creative on the review page and is released only if you tick it; it is not part of the ${wallsWord(wallCount)} above.</p>
<table style="font-size:13px;border-collapse:collapse">${suggested.map(row).join("")}</table>
${suggested.map((w) => w.suggestion_reason ? `<p style="color:#525252;font-size:13px;margin:6px 0 0">Wall ${w.seq}: ${w.suggestion_reason}</p>` : "").join("")}`
      : "";
    const rev = loaded.batch.revision_note;
    const revBlock = rev
      ? `<p style="background:#f5f5f4;padding:10px 12px;border-radius:8px"><b>What changed in this revision:</b><br/>${rev}</p>`
      : "";
    // Who the order came from. On a store-link survey this is somebody at the
    // branch rather than one of ours, and the person signing off should know
    // that before they release walls to print. An order sent on WhatsApp names
    // the partner's person who sent it — never the one of us who keyed it in
    // (Narsingi, 23 October 2026; `orderOrigin`).
    const origin = orderOrigin(loaded.batch);
    const measuredBlock = origin
      ? `<p style="color:#525252;font-size:13px">${origin}${loaded.batch.ship_city ? ` · ${loaded.batch.ship_city}` : ""}.</p>`
      : "";

    const sent = await sendEmailWithId({
      // The proposal is the team's document, never a personal mail: it goes
      // FROM Team Zyvorah and signs as the team (Roheena, 6 October 2026 —
      // "these emails should go from team Zyvorah, not from my email or me").
      from: "Team Zyvorah <hello@mail.zyvorah.com>",
      to: recipients,
      cc: ESCALATE_TO,
      subject: rev
        ? `${loaded.batch.title} — revised proposal, ${wallsWord(wallCount)} for your approval`
        : `${loaded.batch.title} — ${wallsWord(wallCount)} ready for your approval`,
      html: `<p>Dear approver,</p>
${revBlock}
<p>The complete creative proposal for <b>${loaded.batch.title}</b> is ready: <b>${wallsWord(wallCount)}, ${areaLine(sqft, measuredSqft)}</b>, with every wall shown beside its site photograph, in the same clockwise order the store was measured. ${repeatsLine}</p>
${floorNote}
${measuredBlock}
<table style="font-size:13px;border-collapse:collapse">${rows}</table>
${suggestedBlock}
<p><a href="${url}"><b>Open the review in your login</b></a> — you can approve each wall individually, or all remaining walls at once. Every approval releases that wall directly to print.</p>
<p>Warm regards,<br/><b>Team Zyvorah</b></p>`,
    });

    // Only now is it proposed.
    //
    // This used to flip the status BEFORE sending and then swallow the failure
    // with `.catch(() => {})` while still returning `emailed: true`. A bounced
    // proposal left a batch that looked proposed to everyone and had reached
    // nobody. Leaving it at 'composed' with email_error set means the drive
    // worker tries again, and a mail outage delays a proposal instead of
    // losing it.
    if (!sent.ok) {
      const msg = "The proposal email could not be sent — it will be retried.";
      await sb.from("corporate_site_batches").update({ email_error: msg }).eq("id", id);
      return NextResponse.json({ ok: false, url, emailed: false, error: msg }, { status: 502 });
    }

    await sb.from("corporate_site_batches").update({
      status: "proposed",
      proposed_at: new Date().toISOString(),
      proposed_revision: revision,
      email_error: null,
    }).eq("id", id);

    return NextResponse.json({ ok: true, url, emailed: true, to: recipients, revision });
  }
}
