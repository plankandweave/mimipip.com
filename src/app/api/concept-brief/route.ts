import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getConceptReference } from "@/lib/concept-reference";
import { recordCommercialEvent, visitorTokenOf } from "@/lib/server-events";
import { TASTE_COOKIE } from "@/lib/taste";
import { toIndianMobile } from "@/lib/phone";
import { allowConceptRequest } from "@/lib/concept-request";
import { CONCEPT_TRANSCRIPTION_LANGUAGES } from "@/lib/concept-transcription";
const schema = z
  .object({
    id: z.uuid(),
    conceptSlug: z.string().max(100),
    name: z.string().trim().min(1).max(100),
    phone: z.string().max(20),
    email: z.email().max(200),
    brief: z.string().trim().min(2).max(12000),
    language: z.enum(CONCEPT_TRANSCRIPTION_LANGUAGES),
    wantsExclusive: z.boolean(),
    website: z.string().max(0),
  })
  .strict();
export async function POST(req: Request) {
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Check your name, phone, email and message." },
      { status: 400 },
    );
  const v = input.data;
  const phone = toIndianMobile(v.phone);
  if (!phone || !getConceptReference(v.conceptSlug))
    return NextResponse.json(
      { error: "Check your phone number and project reference." },
      { status: 400 },
    );
  if (!(await allowConceptRequest(req, "brief", 10)))
    return NextResponse.json(
      { error: "Please wait before sending another request, then try again." },
      { status: 429 },
    );
  const db = supabaseAdmin();
  if (!db)
    return NextResponse.json(
      { error: "We cannot save your request right now. Please try again." },
      { status: 503 },
    );
  const { error } = await db
    .from("concept_briefs")
    .upsert(
      {
        id: v.id,
        name: v.name,
        phone,
        email: v.email.toLowerCase(),
        concept_slug: v.conceptSlug,
        brief: v.brief,
        language: v.language,
        wants_exclusive: v.wantsExclusive,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("concept brief save failed", error.code);
    return NextResponse.json(
      {
        error:
          "Your request could not be saved. Please try again; your words are still here.",
      },
      { status: 503 },
    );
  }
  const token = visitorTokenOf((await cookies()).get(TASTE_COOKIE)?.value);
  after(() => recordCommercialEvent({
    event: "lead_captured", subject: `concept-brief:${v.id}`, token,
    meta: { lead_type: "concept_brief", concept_slug: v.conceptSlug },
  }));
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
