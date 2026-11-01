import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { importPlan } from "@/lib/marketing/plan";
import { PERSONAL_PLAN_KEY } from "@/lib/marketing/profiles";
import { logicalDayKey } from "@/lib/dailyRotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uses the same private plan store and note/review workflow. Ideas are never
// sent to the product-led composer, or to either brand publishing credential.
export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "The draft store is unavailable." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  if (!["instagram", "linkedin"].includes(channel) || !title || title.length > 160 || brief.length > 8000) {
    return NextResponse.json({ error: "Choose Instagram or LinkedIn and add a title (up to 160 characters) and brief (up to 8,000)." }, { status: 400 });
  }
  try {
    const result = await importPlan({
      campaign: {
        key: PERSONAL_PLAN_KEY, name: "Roheena — Personal Creative", status: "draft",
        big_idea: "How I see, imagine and create spaces — through pattern, colour and the stories behind them.",
        grid_system: "Full-image editorial storytelling; occasional photographs of Roheena; her own voice; AI concept studies clearly identified.",
        window: { start: "2026-09-27", end: "2100-12-31" }, source: "Roheena personal creative workspace",
      },
      slots: [{ date: logicalDayKey(), seq: 100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000,
        channel, format: "feed", status: "idea", title, visual_brief: brief,
        art: { profile: "roheena", unscheduled: true },
      }],
    }, staff.email);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "The idea could not be saved. Please try again." }, { status: 500 });
  }
}
