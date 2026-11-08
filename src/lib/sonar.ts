import "server-only";
import { randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@/brand/database-types";
import QRCode from "qrcode";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { sayIn } from "@/lib/timbre";
import { LANGUAGES, type TimbreLanguage } from "@/lib/timbre-rules";
import {
  DEMO_PIECE, DEMO_TITLE, missingLanguages, newCode, PIECE_WORDS, pieceReady, SONAR_VERSION, sonarUrl, wallLanguages,
  type SonarLines,
} from "@/lib/sonar-rules";
import type { ProposalRow } from "@/lib/prism";
import type { BlueprintRow } from "@/lib/trace-link";
import type { BlueprintWallRow } from "@/lib/vault";

// Sonar — the talking wall, in code. A wall's voice is made in two steps
// that both happen on the desk, never on the public page: the piece is
// WRITTEN once from Prism's concept (first person of the wall), then SPOKEN
// once per language through Timbre, which keeps every line. The public page
// only plays what exists and counts the scan. A wall keeps its code for
// ever, so a QR already printed is never orphaned by a rewrite.

const MODEL = "claude-opus-5";

export type SonarRow = {
  id: string; code: string; kind: "wall" | "demo"; blueprint_id: string | null; account_id: string | null; proposal_id: string | null;
  wall_id: string | null; title: string; place: string | null; piece: string; lines: SonarLines; status: "live" | "off";
  scans: number; error: string | null; created_by_email: string | null; created_at: string; updated_at: string;
};

/* ───────────────────────────── writing ───────────────────────────── */

async function writePiece(blueprint: BlueprintRow, concept: { title: string; concept: string; rationale: string; voiceLine: string }, wall: { name: string; location: string | null }, designTitle: string | null): Promise<{ ok: true; piece: string } | { ok: false; error: string }> {
  if (!anthropicKeyFor("sonar")) return { ok: false, error: "Sonar has no key to spend (ANTHROPIC_KEY_SONAR or the shared key)." };
  const prompt = `You are Sonar ${SONAR_VERSION}. Write what a WALL says to the person who has just scanned the small code on it, at ${blueprint.name}${blueprint.city ? `, ${blueprint.city}` : ""}. The wall speaks in the FIRST PERSON, as itself ("I am the wall at the end of the library corridor…"), to one person standing in front of it — often a student from a smaller town arriving somewhere built to feel large. Calm, warm, exact; everyday words; no slogans, no exclamation marks, nothing salesy; never mention Zyvorah, the founder, a company or a price. Describe what the artwork shows and where the eye should go, say in one breath why it is on THIS wall, and end by sending them on ("Walk on; the next wall is by the stairs"). ${PIECE_WORDS.min} to ${PIECE_WORDS.max} words, in English, as spoken sentences.

THE WALL: ${wall.name}${wall.location ? ` (${wall.location})` : ""}
THE CONCEPT: ${concept.title}. ${concept.concept}
WHY HERE: ${concept.rationale}
${designTitle ? `THE DESIGN ON IT: ${designTitle}\n` : ""}A LINE PRISM GAVE THE WALL TO SAY: "${concept.voiceLine}" — keep its spirit, not its words.

Return JSON only: {"piece": "..."}`;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("sonar") });
    const message = await anthropic.messages.create({
      model: MODEL, max_tokens: 1200,
      output_config: { format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["piece"], properties: { piece: { type: "string" } } } } },
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const parsed = text ? (JSON.parse(text) as { piece?: string }) : null;
    const piece = parsed?.piece?.trim() ?? "";
    const ready = pieceReady(piece);
    if (!ready.ok) return { ok: false, error: ready.reason };
    return { ok: true, piece };
  } catch (e) {
    console.error("[sonar] write failed:", (e as Error)?.message);
    return { ok: false, error: "Sonar could not be reached to write the wall's piece. Try again in a moment." };
  }
}

/* ───────────────────────────── speaking ──────────────────────────── */

/** Speak every language the wall still owes. Each line is kept as it lands,
 *  so a failure half-way resumes; the row's `error` names what stopped it. */
export async function speakMissing(sb: SupabaseClient, row: SonarRow, wanted: TimbreLanguage[]): Promise<SonarRow> {
  const lines: SonarLines = { ...row.lines };
  let error: string | null = null;
  for (const lang of missingLanguages(lines, wanted)) {
    const r = await sayIn(sb, row.piece, lang);
    if (!r.ok) { error = `${LANGUAGES[lang].name}: ${r.error}`; break; }
    lines[lang] = { text: r.line.text, lineId: r.line.id };
    await sb.from("sonar_walls").update({ lines, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  await sb.from("sonar_walls").update({ lines, error, updated_at: new Date().toISOString() }).eq("id", row.id);
  return { ...row, lines, error };
}

/* ───────────────────────────── making ────────────────────────────── */

async function uniqueCode(sb: SupabaseClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newCode(randomBytes(10));
    const { data } = await sb.from("sonar_walls").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("could not mint a code");
}

/** Give every wall of the proposal its voice. A wall that already talks
 *  keeps its code; its piece is written again only when `rewrite` is set,
 *  and then spoken again in every language. */
export async function makeWallsTalk(sb: SupabaseClient, blueprint: BlueprintRow, proposal: ProposalRow, byEmail: string | null, rewrite = false): Promise<{ ok: true; made: number; spoken: number; errors: string[] } | { ok: false; error: string }> {
  const { data: wallRows } = await sb.from("blueprint_walls").select("*").eq("blueprint_id", blueprint.id).neq("status", "dropped").order("seq");
  const walls = (wallRows ?? []) as BlueprintWallRow[];
  const { data: prevRows } = await sb.from("prism_wall_previews").select("wall_id, product_handle").eq("proposal_id", proposal.id).eq("chosen", true);
  const chosen = new Map(((prevRows ?? []) as { wall_id: string; product_handle: string }[]).map((r) => [r.wall_id, r.product_handle]));
  const cands = proposal.narrative.candidates ?? {};
  const languages = wallLanguages(blueprint.language);
  const { data: existingRows } = await sb.from("sonar_walls").select("*").eq("blueprint_id", blueprint.id).eq("kind", "wall");
  const existing = new Map(((existingRows ?? []) as SonarRow[]).filter((r) => r.wall_id).map((r) => [r.wall_id!, r]));

  let made = 0, spoken = 0;
  const errors: string[] = [];
  for (const w of walls) {
    const c = proposal.narrative.walls.find((x) => x.seq === w.seq);
    if (!c) continue;
    let row = existing.get(w.id) ?? null;
    if (!row || rewrite) {
      const handle = chosen.get(w.id);
      const design = handle ? (cands[String(w.seq)] ?? []).find((x) => x.handle === handle) : undefined;
      const written = await writePiece(blueprint, c, w, design?.title ?? null);
      if (!written.ok) { errors.push(`${w.name}: ${written.error}`); continue; }
      if (!row) {
        const { data, error } = await sb.from("sonar_walls").insert({
          code: await uniqueCode(sb), kind: "wall", blueprint_id: blueprint.id, account_id: blueprint.account_id, proposal_id: proposal.id, wall_id: w.id,
          title: c.title, place: w.location ? `${w.name} · ${w.location}` : w.name, piece: written.piece, lines: {}, created_by_email: byEmail,
        }).select("*").single();
        if (error || !data) { errors.push(`${w.name}: ${error?.message ?? "could not keep the wall"}`); continue; }
        row = data as SonarRow;
        made++;
      } else {
        await sb.from("sonar_walls").update({ title: c.title, piece: written.piece, lines: {}, proposal_id: proposal.id, error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
        row = { ...row, title: c.title, piece: written.piece, lines: {}, proposal_id: proposal.id };
      }
    }
    const after = await speakMissing(sb, row, languages);
    spoken += Object.keys(after.lines).length - Object.keys(row.lines).length;
    if (after.error) errors.push(`${w.name} — ${after.error}`);
  }
  return { ok: true, made, spoken, errors };
}

/** The demo wall: one for the whole house, spoken in English, Hindi, Tamil
 *  and Kannada so a college hears its own language before any wall exists. */
export async function makeDemo(sb: SupabaseClient, byEmail: string | null): Promise<{ ok: true; row: SonarRow } | { ok: false; error: string }> {
  const { data } = await sb.from("sonar_walls").select("*").eq("kind", "demo").order("created_at").limit(1).maybeSingle();
  let row = data as SonarRow | null;
  if (!row) {
    const { data: made, error } = await sb.from("sonar_walls").insert({
      code: await uniqueCode(sb), kind: "demo", title: DEMO_TITLE, place: "Zyvorah", piece: DEMO_PIECE, lines: {}, created_by_email: byEmail,
    }).select("*").single();
    if (error || !made) return { ok: false, error: error?.message ?? "could not keep the demo wall" };
    row = made as SonarRow;
  }
  const after = await speakMissing(sb, row, ["en", "hi", "ta", "kn"]);
  return { ok: true, row: after };
}

export async function setStatus(sb: SupabaseClient, id: string, status: "live" | "off"): Promise<boolean> {
  const { error } = await sb.from("sonar_walls").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  return !error;
}

/* ───────────────────────────── reading ───────────────────────────── */

export type SonarView = {
  id: string; code: string; kind: "wall" | "demo"; title: string; place: string | null; piece: string; status: "live" | "off"; scans: number; error: string | null;
  url: string; qrPath: string; languages: { code: TimbreLanguage; name: string; native: string; spoken: boolean; text: string | null; audio: string | null }[];
  blueprintId: string | null; campus: string | null; wallId: string | null; createdAt: string;
};

function view(row: SonarRow, campus: string | null, wanted: TimbreLanguage[]): SonarView {
  return {
    id: row.id, code: row.code, kind: row.kind, title: row.title, place: row.place, piece: row.piece, status: row.status, scans: row.scans, error: row.error,
    url: sonarUrl(row.code), qrPath: `/api/sonar/${row.code}/qr`,
    languages: wanted.map((l) => ({ code: l, name: LANGUAGES[l].name, native: LANGUAGES[l].native, spoken: Boolean(row.lines[l]?.lineId), text: row.lines[l]?.text ?? null, audio: row.lines[l]?.lineId ? `/api/timbre/line/${row.lines[l]!.lineId}` : null })),
    blueprintId: row.blueprint_id, campus, wallId: row.wall_id, createdAt: row.created_at,
  };
}

const DEMO_LANGS: TimbreLanguage[] = ["en", "hi", "ta", "kn"];

/** Every talking wall, for the desk; or one campus's when `blueprintId` is given. */
export async function listSonar(sb: SupabaseClient, blueprintId?: string): Promise<SonarView[]> {
  let q = sb.from("sonar_walls").select("*").order("created_at");
  if (blueprintId) q = q.eq("blueprint_id", blueprintId);
  const { data } = await q;
  const rows = (data ?? []) as SonarRow[];
  const ids = [...new Set(rows.map((r) => r.blueprint_id).filter((x): x is string => Boolean(x)))];
  const { data: bps } = ids.length ? await sb.from("campus_blueprints").select("id, name, language").in("id", ids) : { data: [] };
  const campuses = new Map(((bps ?? []) as { id: string; name: string; language: string }[]).map((b) => [b.id, b]));
  return rows.map((r) => {
    const bp = r.blueprint_id ? campuses.get(r.blueprint_id) : undefined;
    return view(r, bp?.name ?? null, r.kind === "demo" ? DEMO_LANGS : wallLanguages(bp?.language));
  });
}

/** What the public page may show: a LIVE wall's story and its spoken lines. */
export async function publicWall(sb: SupabaseClient, code: string): Promise<SonarView | null> {
  const { data } = await sb.from("sonar_walls").select("*").eq("code", code).eq("status", "live").maybeSingle();
  const row = data as SonarRow | null;
  if (!row) return null;
  const bp = row.blueprint_id ? ((await sb.from("campus_blueprints").select("id, name, language").eq("id", row.blueprint_id).maybeSingle()).data as { name: string; language: string } | null) : null;
  const v = view(row, bp?.name ?? null, row.kind === "demo" ? DEMO_LANGS : wallLanguages(bp?.language));
  // The page shows only languages that are actually spoken.
  return { ...v, languages: v.languages.filter((l) => l.spoken), piece: "" };
}

export async function recordScan(sb: SupabaseClient, sonarId: string, language: string | null, geo: { country: string | null; region: string | null; city: string | null }, referrer: string | null): Promise<void> {
  await sb.from("sonar_scans").insert({ sonar_id: sonarId, language, country: geo.country, region: geo.region, city: geo.city, referrer: referrer?.slice(0, 200) ?? null });
  const { data } = await sb.from("sonar_walls").select("scans").eq("id", sonarId).maybeSingle();
  await sb.from("sonar_walls").update({ scans: ((data as { scans: number } | null)?.scans ?? 0) + 1 }).eq("id", sonarId);
}

/** The QR as an SVG: the brand's charcoal on white, quiet zone of one
 *  module, medium error correction so a printed card survives a scuff. */
export async function qrSvg(code: string): Promise<string> {
  return QRCode.toString(sonarUrl(code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F0F0FFF", light: "#FFFFFFFF" } });
}
