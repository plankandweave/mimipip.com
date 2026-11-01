import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approvedCandidates, type SiteBatch, type SiteBatchWall } from "@/lib/site-batch";
import { cityAllows, storeCity } from "@/lib/site-batch-rules";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { vsOpenAIJson } from "@/lib/vs-openai";

// ─── Feedback → revision ────────────────────────────────────────────────────
//
// The partner's team writes what they want changed, in their own words, on
// the proposal itself. This turns that into a concrete revision: which walls
// change, to which approved designs. It re-allocates ONLY from their library,
// never invents artwork, and never touches a wall already released to print.
//
// When the ask cannot be met from what is approved — "add local Pune scenes"
// with no Pune designs in the library — it says so plainly instead of
// substituting something and hoping. An honest "we don't have this yet, shall
// we create it?" is worth more to the client than a silent near-miss.

const REVISE_MODEL = "claude-opus-5";

export type Revision = {
  reply: string;
  changedSeqs: number[];
  unmet: string[];
  perWall: Map<string, { ids: string[]; context: string; note?: string }>;
};

export type FeedbackRow = { body: string; wall_seq: number | null; author_email: string };

export async function reviseFromFeedback(
  sb: SupabaseClient,
  batch: SiteBatch,
  walls: SiteBatchWall[],
  feedback: FeedbackRow[],
): Promise<Revision> {
  const batchCity = storeCity(batch.ship_city);
  const all = await approvedCandidates(sb, batch.account_id);
  const candidates = all.filter((c) =>
    (c.usage ?? "showroom") !== "office" &&
    // City OR state, and one city's spellings as one (site-batch-rules.ts):
    // a Gujarat store's own collection is tagged "Gujarat", not "Ahmedabad".
    cityAllows(c.city, { city: batchCity, state: batch.state }));

  const { data: accRow } = await sb.from("corporate_accounts")
    .select("allocation_rules").eq("id", batch.account_id).single();

  // Walls already in production are immovable; their designs stay spoken for.
  const frozen = walls.filter((w) => w.status === "ordered");
  const open = walls.filter((w) => w.status !== "ordered");

  const codeOf = new Map<string, string>();
  for (const c of candidates) codeOf.set((c.design_code ?? c.id).toUpperCase(), c.id);
  const byId = new Map(all.map((c) => [c.id, c]));
  const codeFor = (id: string) => byId.get(id)?.design_code ?? id;

  const wallLines = open.map((w) => {
    const wa = w.width_mm / w.height_mm;
    const cur = w.design_ids.map(codeFor).join(", ") || "(none)";
    return `Wall ${w.seq} "${w.name}": ${w.width_mm}x${w.height_mm}mm, aspect ${wa.toFixed(2)}${wa < 1 ? " (TALL PIER)" : ""} — currently: ${cur}`;
  });
  const catLines = candidates.map((c) =>
    `${c.design_code ?? c.id} | ${c.series_name ?? "—"} | city ${c.city ?? "neutral"} | aspect ${c.aspect.toFixed(2)}${c.aspect < 1 ? " (PORTRAIT)" : ""} | ${c.title}`);
  const fbLines = feedback.map((f) =>
    `${f.wall_seq ? `[wall ${f.wall_seq}] ` : "[whole store] "}${f.author_email}: ${f.body}`);

  const prompt = `The client has reviewed a wallpaper proposal for their store and sent feedback. Revise the allocation to answer it.

STORE: ${batch.title}${batchCity ? ` (city: ${batchCity})` : ""}
ACCOUNT STANDING RULES:
${(accRow?.allocation_rules as string) ?? "(none)"}

CLIENT FEEDBACK (newest last):
${fbLines.join("\n")}

WALLS YOU MAY CHANGE (already-printed walls are omitted and immovable):
${wallLines.join("\n")}
${frozen.length ? `\nALREADY IN PRODUCTION — cannot change, their designs are unavailable: ${frozen.map((w) => `wall ${w.seq}`).join(", ")}` : ""}

APPROVED LIBRARY YOU MAY USE (code | series | city | aspect | title):
${catLines.join("\n")}

RULES:
- Change ONLY the walls the feedback actually concerns. Leave every other wall exactly as it is (omit it from your answer).
- Use ONLY codes from the library above. You cannot create, commission or imagine artwork — if the client asks for something that does not exist in the library (a city's scenes nobody has uploaded, a subject that is not there), you MUST list it under "unmet" and leave those walls alone.
- No design may repeat anywhere in the store.
- A chain must cover its wall (sum of aspect x wall height >= wall width), and the subject must sit centred and whole — prefer designs whose shape suits the wall.

Return STRICT JSON only:
{"walls":[{"seq":1,"designCodes":["ZYVS-..."],"context":"<8 words>","note":"<optional>"}],
 "reply":"<2-4 sentences to the client: what you changed and why, in their language>",
 "unmet":["<anything asked for that the library cannot supply, and what would be needed>"]}`;

  type RawRevision = {
    walls?: { seq?: number; designCodes?: string[]; context?: string; note?: string }[];
    reply?: string; unmet?: string[];
  };
  // GPT-6 Astra first (vs-openai.ts); Claude when it is unavailable.
  const viaOpenAI = await vsOpenAIJson<RawRevision>({ text: prompt, maxOutputTokens: 16000 }, "revise");
  let raw: RawRevision;
  if (viaOpenAI) {
    raw = viaOpenAI.json;
  } else {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
    const msg = await anthropic.messages.create({
      model: REVISE_MODEL, max_tokens: 16000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    if (start < 0) throw new Error("The reviser returned no JSON.");
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === "{") depth++;
      else if (!inStr && ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error("The reviser's JSON never closed.");
    raw = JSON.parse(text.slice(start, end + 1)) as RawRevision;
  }

  // Enforce in code what the prompt merely asked for.
  const valid = new Map(candidates.map((c) => [c.id, c]));
  const used = new Set<string>([
    ...frozen.flatMap((w) => w.design_ids),
    ...open.filter((w) => !(raw.walls ?? []).some((x) => Number(x.seq) === w.seq)).flatMap((w) => w.design_ids),
  ]);
  const perWall: Revision["perWall"] = new Map();
  const changedSeqs: number[] = [];
  for (const pick of raw.walls ?? []) {
    const w = open.find((x) => x.seq === Number(pick.seq));
    if (!w) continue;
    const ids: string[] = [];
    for (const code of pick.designCodes ?? []) {
      const id = codeOf.get(String(code).trim().toUpperCase());
      if (id && valid.has(id) && !used.has(id)) { ids.push(id); used.add(id); }
    }
    const coverage = () => ids.reduce((s, id) => s + valid.get(id)!.aspect, 0) * w.height_mm;
    while (ids.length && coverage() < w.width_mm) {
      const next = candidates.find((c) => !used.has(c.id));
      if (!next) break;
      ids.push(next.id); used.add(next.id);
    }
    if (!ids.length) continue;   // nothing usable — leave the wall untouched
    perWall.set(w.id, { ids, context: pick.context ?? w.context_json?.context ?? "", note: pick.note });
    changedSeqs.push(w.seq);
  }
  return { reply: raw.reply ?? "Revision applied.", changedSeqs, unmet: raw.unmet ?? [], perWall };
}
