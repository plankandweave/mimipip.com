import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addIstDays, istDateKey } from "@/lib/ist";
import { PREPARED_HASH } from "@/lib/crm-prepared";
import { bodyToHtml } from "@/lib/crm-task-action";
import {
  GST_RATE, STANDARD_SITE_PREP, VALIDITY_DAYS,
  quotationProblems, quotationTotals, type Quotation, type QuotationRate,
} from "./model";
import { draftAttachmentRefs } from "./store";
import { MATERIAL_SPECS, fill, requireMaterialSpec } from "./material-specs";
import { installRateExGst, RATE_CARD } from "./rates";
import { refreshQuotationCatalogue } from "./catalogue-server";
import { customerCode, parseQuotationNumber, partReference, quotationLabel, quotationNumber } from "./numbering";
import { formatInr } from "./words";
import type { SpecSheetRequest } from "./spec-sheet-pdf";
import { anthropicKeyFor } from "@/lib/ai-keys";

/**
 * The quotation desk: everything the CRM knows about a company → a numbered
 * quotation, its specification sheets and a covering email, waiting under a
 * task for Roheena's Send.
 *
 * Two doors call this with the same arguments: the morning desk cron, when a
 * customer's email asks for a quotation, and the Prepare button on the
 * company's CRM page. Neither sends anything. What waits under the task is
 * ONE quotation as TWO documents — the supply quotation from Magnitude
 * Brands and the installation quotation from Magnitude Spaces — plus the
 * specification sheets (Roheena, 6 October 2026). The desk NEVER sends on its
 * own until the founder sets the rules for that (the quotation-desk doc,
 * question 1); the only route that sends is task-action's Send, which is a
 * button she presses.
 *
 * WHAT THE MODEL DOES AND DOES NOT DECIDE. It reads the take-off — the
 * measured areas in the notes and the threads — into lines, names the
 * material each wall gets, and writes the covering note in her voice. It
 * never prices: rates come from the rate card and the account
 * (src/lib/quotation/rates.ts), totals from the model module, and the number
 * from the series. A quotation with no measured area is not a quotation; the
 * desk then drafts the email that asks for the drawing, and that is all.
 */

const MODEL = "claude-opus-5-5";

export type PrepareInput = {
  companyId: string;
  dealId?: string | null;
  /** "Add the escalator fascia" — Roheena's steer when she presses Prepare again. */
  instruction?: string | null;
  preparedBy: "desk" | "staff";
  sourceThreadId?: string | null;
  /** What asked for it, in a sentence. */
  evidence?: string | null;
  today?: string;
};

export type PrepareResult =
  | { kind: "quotation"; quotationId: string; number: string; revision: number; taskId: string; totalInr: number; blockers: string[] }
  | { kind: "needs_measurements"; taskId: string; blockers: string[] }
  | { kind: "nothing"; reason: string };

const LineSchema = z.object({
  product_handle: z.string().nullable().describe("Exact zyvorah.com/products/ handle supplied in the context. Never invent or infer a handle from a design title. Null when not linked."),
  design_name: z.string().nullable().describe("The exact bespoke wallpaper name from the presentation; null if absent. Do not invent a name."),
  commissioned: z.boolean().describe("True only when the context explicitly says original commissioned artwork, not a catalogue design. Never use this to bypass a missing website design link."),
  location: z.string().describe("Where the wall is, as the customer names it: 'Boundary wall, forecourt', 'Main lobby, ATM side wall'."),
  basis: z.string().describe("How the area was arrived at, from the measurement: 'Inclined wall 72′6″ and six straight bays, all 10′ high'. Use ′ and ″ for feet and inches. Empty only if the customer gave a bare area."),
  material: z.enum(MATERIAL_SPECS.map((m) => m.key) as [string, ...string[]]).describe("outdoor-wall-film for any exterior wall (boundary, driveway, facade); non-woven for interior walls unless the context names Linen Textured, a self-adhesive film or canvas."),
  sqft: z.number().describe("Whole square feet, exactly as measured or stated. Never estimated from a photograph."),
  width_mm: z.number().nullable().describe("The wall's width in millimetres when it is ONE rectangle with a stated width and height; null for a run of bays, an inclined wall or an area given without sides."),
  height_mm: z.number().nullable().describe("The wall's height in millimetres on the same condition; null otherwise."),
  picture_wall: z.string().nullable().describe("The id of the PARTNER WALL (from the walls list) this line is, when the customer's partner page holds that wall's photograph or study — its picture then fronts the line. Null when no listed wall is this wall."),
});

const TakeOffSchema = z.object({
  installation_local: z.boolean().describe("True only when installation is confirmed within the local team’s city. False for outstation or unknown."),
  has_measured_areas: z.boolean().describe("True only when the notes or emails hold measured areas: a drawing, a survey, a take-off, or wall sizes the customer stated in figures. Photographs, 'about 4000 sq ft across two floors' from a call, or a deal's area_sqft alone are NOT measured areas."),
  blockers: z.array(z.string()).describe("Plain-English reasons a quotation cannot be written, or things Roheena should check before it goes (a digit swap in a drawing, a wall with no height). Empty when the take-off is clean."),
  title: z.string().describe("The document's title: 'Mural wallpaper design for the common areas'. Say what and where, in one line, no customer name."),
  site: z.string().nullable().describe("The site and city, as the customer says it: 'OIC, Parel, Mumbai'. Null if unknown."),
  attention: z.string().nullable().describe("The person it is addressed to, with title: 'Ms Priyanka Singh'. Null if unknown."),
  measurement_source: z.string().nullable().describe("'Zyvorah' when our team or anyone measuring on Zyvorah's behalf took the measurements (a survey, a measured drawing we commissioned). Never name an architect, designer or drawing number. Null when the customer stated sizes themselves."),
  measurement_date: z.string().nullable().describe("The date of the drawing or survey in words, '23 September 2026', or null."),
  lines: z.array(LineSchema).describe("One line per wall or band, in the drawing's order. Empty when has_measured_areas is false."),
  site_prep: z.array(z.string()).describe("What the customer prepares on site, one sentence each, specific to these walls (outdoor walls washed a day before; interior walls primed with an oil-based primer; travertine panels included). Empty to use the standard lines."),
  extra_terms: z.array(z.string()).describe("Terms specific to this job beyond the standard ones, one sentence each. Usually empty."),
  sheets: z.array(z.object({
    material: z.string().describe("A material key used in lines."),
    kicker: z.string().describe("The walls this sheet is for, as a short label: 'KRT boundary wall', 'KRT interior walls'. Use the customer's short name or initials."),
    for_what: z.string().describe("The same walls mid-sentence, lower case: 'the KRT boundary wall', 'the interior walls at OIC, Parel'."),
  })).describe("One entry per DISTINCT material in lines. Never a material that is not in lines."),
  email: z.object({
    gmail_thread_id: z.string().describe("The thread this replies in, copied exactly from the context; empty string for a new conversation."),
    to: z.array(z.string()).describe("Addresses from the context only. The person who asked, or the primary contact."),
    cc: z.array(z.string()).describe("Everyone else on the thread's latest message, and anyone the notes say is always copied. Never Roheena's own addresses."),
    subject: z.string().describe("For a reply: 'Re: ' + the thread subject. For a new email: 'Quotation ' + the reference + ' — ' + what it is for."),
    body: z.string().describe("The covering email in plain text, SHORT: 'Dear <title surname>,', one line saying the quotations (supply and installation) and the product specification are attached (or 'Please find attached the quotation and the product specification.'), then 'Regards,\nRoheena Nagpal\nZyvorah'. No prices, no company details, no GSTIN or PAN, no validity, no offer of a call, no measurement talk. When has_measured_areas is false, this is instead a two-line email asking for the measured drawing, no price in it."),
  }),
  evidence: z.string().describe("One sentence on what asked for this quotation and when: 'Priyanka Singh asked for the quotation by email on 6 October.'"),
});

type TakeOff = z.infer<typeof TakeOffSchema>;

const SYSTEM = `You are the quotation desk at Zyvorah, an Indian design house for original mural wallpapers and wall art for homes, offices, hotels, campuses and commercial buildings. You read everything the CRM knows about one company and produce the take-off for a quotation and the covering email, for the founder (Roheena Nagpal) to send from roheena@zyvorah.com. You do not price anything; the rates are read from each linked design’s live website price. A material has no retail price of its own.

RULES THAT ARE NOT NEGOTIABLE
1. Areas come ONLY from measured sources in the context: a drawing or survey (a "FULL TAKE-OFF" note, a DWG reference, a measured-survey email) or wall sizes the customer stated in figures. Photographs never price. A preliminary estimate note is not a measurement. If there is no measured area, set has_measured_areas=false, return no lines, and write the email that asks for the measured drawing or offers a measured survey.
2. Where a take-off note gives per-wall areas, use them exactly, whole square feet, in the drawing's order. Keep conflicting totals visible in blockers rather than silently choosing.
3. Materials: outdoor-wall-film for every exterior wall (boundary, driveway, facade, compound). non-woven for interior walls unless the context names Linen Textured (linen-textured), a self-adhesive film (self-adhesive) or canvas (canvas). A material you pick must be one of the keys offered.
4. One sheet per distinct material in the lines, never for a material not in the lines.
5. The covering email is as short as a founder's reply: attached, nothing else. Do not repeat anything the documents already say. The quotation PDFs and the specification PDF ARE attached by the system. Use no placeholders.
6. Reply inside the thread the request came in on when one exists (gmail_thread_id copied exactly; subject "Re: " + its subject, no "Re: Re:"), keeping everyone on its latest message in Cc, minus roheena@zyvorah.com, roheena@plankandweave.com and roheena@magnitudegroup.in. Notes may say someone is always copied (a head of design); honour that.
7. Indian English, warm and brief, British spelling, no exclamation marks, no emoji. Address senior people by title and surname unless the thread uses first names.
8. product_handle must be the exact website handle from the supplied context. A title or picture alone is not a verified handle. Mark commissioned only for explicitly commissioned original artwork.
9. Every wall is quoted with its picture, then its measurement, then its price. When the partner page lists walls, match each line to the wall it is (picture_wall) so the quotation carries that wall's study or photograph; never match a wall that is a different wall. Give width_mm and height_mm only for a wall that is one stated rectangle.`;

type Ctx = {
  company: { id: string; name: string; kind: string; city: string | null; corporate_account_id: string | null };
  contacts: { name: string; email: string | null; role: string | null; is_primary: boolean }[];
  deals: { id: string; title: string; stage: string; value_inr: number | null; area_sqft: number | null }[];
  notes: { kind: string; body: string; happened_at: string; source: string }[];
  threads: {
    gmail_thread_id: string; subject: string; last_message_id: string | null;
    to: { name?: string; email: string }[]; cc: { name?: string; email: string }[];
    last_direction: string | null; last_at: string | null; excerpt: string | null;
  }[];
  quotations: { id: string; number: string; revision: number; status: string; deal_id: string | null; total_inr: number }[];
  account: { pricing_mode: string | null; rate_per_sqft: string | null; legal_name: string | null } | null;
  /** The walls on the company's partner page, with the picture each can
   *  front a line with: an approved study (the artwork on the wall) over the
   *  site photograph. The Vijay Sales proposals read picture → measurement
   *  → price (Roheena, 6 October 2026); every quotation does now. */
  walls: PartnerWall[];
};

export type PartnerWall = {
  id: string;
  name: string;
  area: string | null;
  widthMm: number;
  heightMm: number;
  /** Where the best picture of this wall lives, and what it is. */
  picture: { path: string; kind: "proposed" | "site"; caption: string | null } | null;
};

/** Every wall the partner page holds for this account, newest batch first,
 *  each with its best picture: an approved wall study's render (the artwork
 *  on the wall) beats the bare site photograph. */
async function loadPartnerWalls(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, accountId: string | null): Promise<PartnerWall[]> {
  if (!accountId) return [];
  const { data: batches } = await sb.from("corporate_site_batches").select("id, area_id").eq("account_id", accountId).order("created_at", { ascending: false }).limit(12);
  const batchIds = (batches ?? []).map((b) => b.id as string);
  if (!batchIds.length) return [];
  const [{ data: walls }, { data: studies }, { data: areas }] = await Promise.all([
    sb.from("corporate_site_batch_walls").select("id, batch_id, seq, name, width_mm, height_mm, photo_path").in("batch_id", batchIds).order("seq"),
    sb.from("corporate_wall_studies").select("wall_id, design_id, status, render_path, note").eq("account_id", accountId).not("render_path", "is", null),
    sb.from("corporate_site_areas").select("id, name").in("id", (batches ?? []).map((b) => b.area_id as string).filter(Boolean)),
  ]);
  const areaOf = new Map((batches ?? []).map((b) => [b.id as string, (areas ?? []).find((a) => a.id === b.area_id)?.name as string | undefined]));
  const designIds = [...new Set((studies ?? []).map((s) => s.design_id as string))];
  const { data: designs } = designIds.length ? await sb.from("corporate_designs").select("id, title").in("id", designIds) : { data: [] as { id: string; title: string }[] };
  return (walls ?? []).map((w) => {
    const mine = (studies ?? []).filter((s) => s.wall_id === w.id);
    const best = mine.find((s) => s.status === "approved") ?? mine[0] ?? null;
    const design = best ? (designs ?? []).find((d) => d.id === best.design_id) : null;
    return {
      id: w.id as string,
      name: w.name as string,
      area: areaOf.get(w.batch_id as string) ?? null,
      widthMm: Number(w.width_mm), heightMm: Number(w.height_mm),
      picture: best?.render_path
        ? { path: best.render_path as string, kind: "proposed", caption: design ? `Proposed: ${design.title}` : "Proposed" }
        : w.photo_path ? { path: w.photo_path as string, kind: "site", caption: "The wall today" } : null,
    };
  });
}

async function loadContext(companyId: string): Promise<Ctx | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: company } = await sb.from("crm_companies")
    .select("id, name, kind, city, corporate_account_id").eq("id", companyId).maybeSingle();
  if (!company) return null;
  const [contacts, deals, notes, threads, quotations] = await Promise.all([
    sb.from("crm_contacts").select("name, email, role, is_primary").eq("company_id", companyId).order("is_primary", { ascending: false }),
    sb.from("crm_deals").select("id, title, stage, value_inr, area_sqft").eq("company_id", companyId).order("updated_at", { ascending: false }),
    sb.from("crm_notes").select("kind, body, happened_at, source").eq("company_id", companyId).order("happened_at", { ascending: false }).limit(40),
    sb.from("crm_email_threads").select("gmail_thread_id, subject, last_message_id, to_addrs, cc_addrs, last_direction, last_at, excerpt").eq("company_id", companyId).order("last_at", { ascending: false }).limit(5),
    sb.from("crm_quotations").select("id, number, revision, status, deal_id, total_inr").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  const [account, walls] = await Promise.all([
    company.corporate_account_id
      ? sb.from("corporate_accounts").select("pricing_mode, rate_per_sqft, legal_name").eq("id", company.corporate_account_id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    loadPartnerWalls(sb, (company.corporate_account_id as string | null) ?? null),
  ]);
  return {
    company: company as Ctx["company"],
    contacts: (contacts.data ?? []) as Ctx["contacts"],
    deals: (deals.data ?? []) as Ctx["deals"],
    notes: (notes.data ?? []) as Ctx["notes"],
    threads: ((threads.data ?? []) as Record<string, unknown>[]).map((t) => ({
      gmail_thread_id: t.gmail_thread_id as string, subject: t.subject as string,
      last_message_id: (t.last_message_id as string | null) ?? null,
      to: (t.to_addrs as { name?: string; email: string }[]) ?? [], cc: (t.cc_addrs as { name?: string; email: string }[]) ?? [],
      last_direction: (t.last_direction as string | null) ?? null, last_at: (t.last_at as string | null) ?? null,
      excerpt: (t.excerpt as string | null) ?? null,
    })),
    quotations: ((quotations.data ?? []) as Record<string, unknown>[]).map((q) => ({
      id: q.id as string, number: q.number as string, revision: Number(q.revision), status: q.status as string,
      deal_id: (q.deal_id as string | null) ?? null, total_inr: Number(q.total_inr),
    })),
    account: (account as Ctx["account"]) ?? null,
    walls,
  };
}

async function readTakeOff(ctx: Ctx, input: PrepareInput, today: string): Promise<TakeOff> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("quotations") });
  const materials = MATERIAL_SPECS.map((m) => `${m.key}: ${m.name}${m.outdoor ? " (exterior)" : ""}`).join("\n");
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{
      role: "user",
      content:
        `Today is ${today} (India).\n\nMATERIAL KEYS\n${materials}\n\n` +
        (input.instruction ? `ROHEENA'S INSTRUCTION FOR THIS QUOTATION\n${input.instruction}\n\n` : "") +
        (input.evidence ? `WHY THIS IS BEING PREPARED\n${input.evidence}\n\n` : "") +
        (ctx.walls.length
          ? `WALLS ON THE CUSTOMER'S PARTNER PAGE (each has a photograph or an approved study; name a line's picture_wall by id when the line IS that wall, so its picture fronts the line)\n` +
            JSON.stringify(ctx.walls.map((w) => ({ id: w.id, name: w.name, area: w.area, width_mm: w.widthMm, height_mm: w.heightMm, picture: w.picture?.kind ?? "none" })), null, 1) + "\n\n"
          : "") +
        `EVERYTHING THE CRM KNOWS (notes newest first; thread excerpts are the real emails, newest first; earlier quotations listed so a changed scope becomes a revision):\n\n` +
        JSON.stringify({
          company: ctx.company, contacts: ctx.contacts, deals: ctx.deals, notes: ctx.notes,
          threads: ctx.threads, earlier_quotations: ctx.quotations,
        }, null, 2),
    }],
    output_config: { format: zodOutputFormat(TakeOffSchema) },
  });
  const out = response.parsed_output;
  if (!out) throw new Error("no_takeoff");
  return out;
}

const OWN = /^roheena@(zyvorah\.com|plankandweave\.com|magnitudegroup\.in)$/i;
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

/** Addresses the model may use: contacts and thread participants, nothing else. */
function cleanAddresses(ctx: Ctx, list: string[]): string[] {
  const known = new Set<string>();
  for (const c of ctx.contacts) if (c.email) known.add(c.email.toLowerCase());
  for (const t of ctx.threads) for (const a of [...t.to, ...t.cc]) known.add(a.email.toLowerCase());
  return [...new Set(list.map((a) => a.trim().toLowerCase()))].filter((a) => EMAIL_RE.test(a) && !OWN.test(a) && known.has(a));
}

/** The number this quotation takes: a new revision of the open quotation on
 *  the same deal, else the next serial for the customer's code this year. */
function assignNumber(ctx: Ctx, dealId: string | null, today: string): { number: string; revision: number; supersedes: string | null } {
  const open = ctx.quotations.find((q) => (q.status === "draft" || q.status === "sent") && (dealId ? q.deal_id === dealId : true));
  if (open) return { number: open.number, revision: open.revision + 1, supersedes: open.id };
  const code = customerCode(ctx.company.name);
  const fy = (() => {
    const [y, m] = today.split("-").map(Number);
    const start = m >= 4 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  })();
  const serials = ctx.quotations
    .map((q) => parseQuotationNumber(q.number))
    .filter((p): p is NonNullable<typeof p> => !!p && p.fy === fy && p.code === code)
    .map((p) => p.serial);
  return { number: quotationNumber(code, (serials.length ? Math.max(...serials) : 0) + 1, fy), revision: 1, supersedes: null };
}

export async function prepareQuotation(input: PrepareInput): Promise<PrepareResult> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("quotation desk: service role not configured");
  if (!anthropicKeyFor("quotations")) throw new Error("quotation desk: ANTHROPIC_API_KEY not set");
  const ctx = await loadContext(input.companyId);
  if (!ctx) return { kind: "nothing", reason: "no such company" };
  const today = input.today ?? istDateKey();

  const take = await readTakeOff(ctx, input, today);
  const to = cleanAddresses(ctx, take.email.to);
  const cc = cleanAddresses(ctx, take.email.cc).filter((a) => !to.includes(a));
  const thread = ctx.threads.find((t) => t.gmail_thread_id === take.email.gmail_thread_id) ?? null;
  const dealId = input.dealId ?? ctx.deals.find((d) => d.stage !== "won" && d.stage !== "lost")?.id ?? null;
  const contactName = ctx.contacts.find((c) => c.email && to.includes(c.email.toLowerCase()))?.name
    ?? ctx.contacts.find((c) => c.is_primary)?.name ?? ctx.company.name;

  // ── No measured area: the email that asks for one, and nothing priced ───
  if (!take.has_measured_areas || take.lines.length === 0) {
    const title = `Ask ${contactName} for the measured drawing before quoting`;
    const { data: task } = await sb.from("crm_tasks")
      .insert({ company_id: ctx.company.id, deal_id: dealId, title, due_on: today, source: input.preparedBy === "desk" ? "inbox" : "manual" })
      .select("id").single();
    if (!task) throw new Error("quotation desk: could not create the task");
    const body = take.email.body.replace(/\[\[total\]\]|\[\[valid until\]\]/g, "");
    await sb.from("crm_task_drafts").upsert({
      task_id: task.id,
      context_hash: PREPARED_HASH,
      draft: {
        kind: "email",
        headline: `A quotation was asked for but there is no measured area on file: ${take.blockers.join(" ") || "no drawing, survey or stated wall sizes."} This asks for it.`,
        recommendation: "", status_note: "", already_resolved: false, needs: [],
        options: [{
          label: "Ask for the drawing", gmail_thread_id: thread?.gmail_thread_id ?? "",
          to, cc, subject: take.email.subject, body, html: bodyToHtml(body),
        }],
        followup: { title: `Check whether ${ctx.company.name} sent the measurements`, days: 3 },
      },
    });
    return { kind: "needs_measurements", taskId: task.id, blockers: take.blockers };
  }

  // ── Price it: rates from the card and the account, never from the model ──
  // Catalogue rates are resolved per design below, never by material or account.
  const materialsUsed = [...new Set(take.lines.map((l) => l.material))];
  const rates: QuotationRate[] = materialsUsed.map((key) => {
    const spec = requireMaterialSpec(key);
    return {
      material: key,
      supplyExGst: spec.outdoor ? RATE_CARD.outdoorFilmSupplyExGst : RATE_CARD.commissionedExGst,
      installExGst: take.installation_local ? installRateExGst(spec) : null,
    };
  });
  const sheets: SpecSheetRequest[] = materialsUsed.map((key) => {
    const s = take.sheets.find((x) => x.material === key);
    const short = customerCode(ctx.company.name);
    return { material: key, kicker: s?.kicker ?? `${short} walls`, forWhat: s?.for_what ?? `the ${short} walls` };
  });
  const { number, revision, supersedes } = assignNumber(ctx, dealId, today);
  const q: Quotation = await refreshQuotationCatalogue({
    pricingPolicy: "website-bespoke-20261013",
    installationLocal: take.installation_local,
    number, revision,
    dateKey: today,
    validUntil: addIstDays(today, VALIDITY_DAYS),
    title: take.title.trim() || "Mural wallpaper design",
    preparedFor: { organisation: ctx.company.name, site: take.site, attention: take.attention },
    measurementSource: take.measurement_source,
    lines: take.lines.map((l, i) => {
      const wall = l.picture_wall ? ctx.walls.find((w) => w.id === l.picture_wall) ?? null : null;
      return {
        seq: i + 1, productHandle: l.product_handle, commissioned: l.commissioned, bespokeName: l.design_name, location: l.location.trim(), basis: l.basis.trim(), material: l.material, sqft: Math.round(l.sqft),
        widthMm: l.width_mm ? Math.round(l.width_mm) : wall?.widthMm ?? null,
        heightMm: l.height_mm ? Math.round(l.height_mm) : wall?.heightMm ?? null,
        // The picture the wall is quoted with: the partner page's study or
        // photograph. Any other picture is added on the Quotations panel.
        picture: wall?.picture ?? null,
      };
    }),
    rates,
    materialNotes: sheets.map((s) => ({ material: s.material, text: fill(requireMaterialSpec(s.material).note, s.forWhat) })),
    sitePrep: take.site_prep.length ? take.site_prep : [...STANDARD_SITE_PREP],
    // Shared by both documents; each adds its own scope, payment and start (termsFor).
    terms: [...take.extra_terms],
    gstRate: GST_RATE,
  });
  const problems = quotationProblems(q);
  if (problems.length) throw new Error(`quotation desk: ${problems.join(" ")}`);
  const totals = quotationTotals(q);

  // ── Store it, supersede the one it replaces, and park it under a task ────
  const { data: row, error: insErr } = await sb.from("crm_quotations").insert({
    company_id: ctx.company.id, deal_id: dealId, number, revision, status: "draft",
    document: q, spec_sheets: sheets, total_inr: totals.total,
    prepared_by: input.preparedBy, source_thread_id: input.sourceThreadId ?? thread?.gmail_thread_id ?? null,
    evidence: input.evidence ?? take.evidence,
  }).select("id").single();
  if (insErr || !row) throw new Error(`quotation desk: could not store the quotation: ${insErr?.message}`);
  if (supersedes) {
    const { data: old } = await sb.from("crm_quotations").select("task_id").eq("id", supersedes).maybeSingle();
    await sb.from("crm_quotations").update({ status: "superseded", superseded_by: row.id }).eq("id", supersedes);
    // The task that carried the superseded draft is done with: its email
    // would attach the old revision, and task-action refuses that anyway.
    if (old?.task_id) {
      await sb.from("crm_task_drafts").delete().eq("task_id", old.task_id);
      await sb.from("crm_tasks").update({ done_at: new Date().toISOString() }).eq("id", old.task_id).is("done_at", null);
    }
  }

  const label = quotationLabel(number, revision);
  const { data: task } = await sb.from("crm_tasks")
    .insert({ company_id: ctx.company.id, deal_id: dealId, title: `Send quotation ${label} to ${contactName}`, due_on: today, source: input.preparedBy === "desk" ? "inbox" : "manual" })
    .select("id").single();
  if (!task) throw new Error("quotation desk: could not create the task");
  await sb.from("crm_quotations").update({ task_id: task.id }).eq("id", row.id);

  const body = take.email.body
    .replace(/\[\[supply total\]\]/g, `${formatInr(totals.supply.total)} including GST`)
    .replace(/\[\[installation total\]\]/g, totals.install ? `${formatInr(totals.install.total)} including GST` : "")
    .replace(/\[\[total\]\]/g, `${formatInr(totals.total)} including GST`)
    .replace(/\[\[valid until\]\]/g, longDateFromKey(q.validUntil));
  const subject = take.email.subject.replace(/^(re:\s*)+/i, "Re: ").trim();
  const documents = totals.install
    ? `the supply quotation ${partReference(number, "supply")} (${formatInr(totals.supply.total)} incl. GST, ${totals.supply.issuer.legalName}) and the installation quotation ${partReference(number, "install")} (${formatInr(totals.install.total)} incl. GST, ${totals.install.issuer.legalName}), ${formatInr(totals.total)} in all`
    : `the supply quotation ${partReference(number, "supply")} (${formatInr(totals.supply.total)} incl. GST, ${totals.supply.issuer.legalName}; nothing installed by us)`;
  await sb.from("crm_task_drafts").upsert({
    task_id: task.id,
    context_hash: PREPARED_HASH,
    draft: {
      kind: "email",
      headline: `Sends ${label} as two documents — ${documents} — for ${totals.totalSqft.toLocaleString("en-IN")} sq ft, with the specification sheet${sheets.length > 1 ? "s" : ""} for ${sheets.map((s) => requireMaterialSpec(s.material).name.toLowerCase()).join(" and ")} attached.${take.blockers.length ? ` Check first: ${take.blockers.join(" ")}` : ""}`,
      recommendation: "", status_note: "", already_resolved: false,
      needs: take.blockers,
      options: [{
        label: "Send the quotation", gmail_thread_id: thread?.gmail_thread_id ?? "",
        to, cc, subject, body, html: bodyToHtml(body),
        attachments: draftAttachmentRefs(
          { id: row.id, number, revision, document: q },
          `Zyvorah_product_specification_${customerCode(ctx.company.name)}.pdf`,
        ),
      }],
      followup: { title: `Follow up on quotation ${label} with ${contactName}`, days: 3 },
    },
  });

  // The timeline says a quotation exists and is waiting, as the hand-written
  // note of 6 October did.
  await sb.from("crm_notes").insert({
    company_id: ctx.company.id, deal_id: dealId, kind: "note", source: input.preparedBy === "desk" ? "inbox" : "manual",
    happened_at: new Date().toISOString(),
    body: `QUOTATION ${label} prepared${supersedes ? " (supersedes the earlier revision)" : ""}, not yet sent: ${totals.totalSqft.toLocaleString("en-IN")} sq ft; ${documents}; valid until ${longDateFromKey(q.validUntil)}. ${input.evidence ?? take.evidence}`,
  });

  return { kind: "quotation", quotationId: row.id, number, revision, taskId: task.id, totalInr: totals.total, blockers: take.blockers };
}

function longDateFromKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}
