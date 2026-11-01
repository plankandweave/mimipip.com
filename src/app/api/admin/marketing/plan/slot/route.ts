import { isPersonalPlan } from "@/lib/marketing/profiles";
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { commentOnSlot, planSlotById, removeSlot, restoreSlot, setSlotFrame } from "@/lib/marketing/plan";
import { serviceClient } from "@/lib/marketing/db";
import { applyNoteNow } from "@/lib/marketing/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A picture note recomposes one slot inside the request (see applyNoteNow).
export const maxDuration = 300;

// The founder's hand on a plan slot.
//   remove     — it vanishes from the desk; its composed post is skipped so
//                the engine never composes it again. Kept, never deleted.
//   restore    — undo a removal.
//   comment    — a note on the slot, kept with it.
//   variation  — "make it different, because …": the note is kept, and it is
//                acted on in this request (applyNoteNow): a words-only note
//                edits the caption in seconds, a picture note recomposes this
//                one slot. It used to wait for the hourly run.
//   frame      — the grid-frame tool: where the composed picture's cover
//                window sits and how far in it reaches, saved to the slot's
//                art (zoom / focus_x / focus_y) and the post marked for
//                regeneration so the next compose draws the chosen frame.
// Approve / rewrite / don't-run of the COMPOSED post stay on /approve, which
// signs the exact caption and images on screen.

type Body = { id?: unknown; action?: unknown; text?: unknown; crop?: unknown };

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set — nothing can be recorded" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const slot = await planSlotById(id);
  if (!slot) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (isPersonalPlan(slot.plan_key) && action === "frame") return NextResponse.json({ error: "Personal artwork is prepared by your creative team." }, { status: 400 });

  try {
    switch (action) {
      case "remove":
        await removeSlot(id, staff.email, text || undefined);
        return NextResponse.json({ ok: true, status: "removed" });
      case "restore":
        await restoreSlot(id, staff.email);
        return NextResponse.json({ ok: true, status: "planned" });
      case "frame": {
        const c = body?.crop as { zoom?: unknown; x?: unknown; y?: unknown; sceneUrl?: unknown } | null | undefined;
        const crop =
          c == null
            ? null
            : {
                zoom: Math.min(6, Math.max(1, Number(c.zoom ?? 1))),
                x: Math.min(1, Math.max(0, Number(c.x ?? 0.5))),
                y: Math.min(1, Math.max(0, Number(c.y ?? 0.5))),
                sceneUrl:
                  typeof c.sceneUrl === "string" && /^https:\/\//.test(c.sceneUrl)
                    ? c.sceneUrl.slice(0, 500)
                    : undefined,
              };
        if (crop && (![crop.zoom, crop.x, crop.y].every(Number.isFinite))) {
          return NextResponse.json({ error: "crop needs numeric zoom, x, y" }, { status: 400 });
        }
        await setSlotFrame(slot, staff.email, crop);
        return NextResponse.json({ ok: true, art: { ...slot.art, ...(crop ? { zoom: crop.zoom, focus_x: crop.x, focus_y: crop.y } : {}) } });
      }
      case "comment":
      case "variation": {
        if (!text) return NextResponse.json({ error: "say what should be different" }, { status: 400 });
        const comments = await commentOnSlot(slot, staff.email, text, action);
        if (action !== "variation") return NextResponse.json({ ok: true, comments });
        const { data: live } = await serviceClient()
          .from("marketing_posts")
          .select("id")
          .eq("plan_slot_id", slot.id)
          .in("status", ["queued", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!live) return NextResponse.json({ ok: true, comments, applied: { done: "waiting", why: "not composed yet — the note is used when it is" } });
        const applied = await applyNoteNow(live.id, text).catch((e) => ({ done: "waiting" as const, why: (e as Error).message }));
        return NextResponse.json({ ok: true, comments, applied });
      }
      default:
        return NextResponse.json({ error: "action must be remove, restore, comment, variation or frame" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
