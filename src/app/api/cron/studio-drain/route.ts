import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withCronRun } from "@/lib/cron-run";
import { processRetagTick } from "@/lib/retag";
import { processQueueTick, processSceneOnceTick, processRoomFillTick } from "@/app/api/studio/[[...path]]/route";
import { serviceClient, hasServiceRole } from "@/lib/marketing/db";
import { ensureCatalogueSeeds } from "@/lib/catalogue-seeds";

export const runtime = "nodejs";
// 300s, matching execute-decisions and newsletter. It was 60 when this cron's
// only job was to fire an HTTP nudge and return; now that it renders scenes
// itself, 60 bought exactly ONE render per five-minute tick — a twelve-design
// batch took an hour of doing nothing but waiting for the next tick.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Auto-drains the Studio queue so nobody has to click "Resume queue".
//
// The self-chaining worker (batch-tick → after() → next tick) is fast when it's
// alive, but on Vercel it occasionally drops between designs (cold start, an
// after() that doesn't fire, a transient fetch failure), stranding the next
// item at 0 rooms. This cron runs every 2 minutes: if there's pending work it
// kicks the worker again, so a dropped chain self-heals within ~2 minutes and
// the queue always finishes on its own. No-op (cheap) when the queue is empty.
// (Was every minute; slowed to cut ~37K invocations/month off the Vercel bill.)
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. The studio
// admin key is read from the DB with the service role — never taken from the
// request — so the endpoint can't be used to drive the worker without cron auth.
async function tick(req: Request) {
  // One budget for the whole invocation, with headroom under maxDuration so a
  // write can still land. The two workers below would otherwise reason about
  // time independently and could together overrun it, which is a hard timeout
  // with whatever was mid-render lost.
  const started = Date.now();
  const BUDGET_MS = 240_000;
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaCron) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!hasServiceRole()) return NextResponse.json({ error: "no_service_role" }, { status: 503 });
  const svc = serviceClient();

  // Collections that ship their artwork in the deploy publish themselves on
  // the first tick after it (lib/catalogue-seeds). One read per seed once
  // they are live; never throws.
  const seeded = await ensureCatalogueSeeds(svc);
  for (const s of seeded) {
    if (s.status === "published") {
      revalidatePath("/");
      revalidatePath(`/collections/${s.handle}`);
    }
  }

  // Age out "New" badges whose 30-day window has passed. The Just In section
  // already filters by new_until, but card badges read the is_new boolean, so
  // clear it once a day to keep it truthful.
  await svc.from("products").update({ is_new: false })
    .eq("is_new", true).lt("new_until", new Date().toISOString());

  // Is there anything to do? (not limited to the 48h status window)
  const { data: pending, error: pendErr } = await svc
    .from("studio_queue")
    .select("id")
    .in("status", ["queued", "naming", "scenes"])
    .limit(1);
  if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 });

  // The classification guarantee: any active design missing a browse tag, a
  // colour, a room, a mood or its embedding is queued for repair. This is the
  // sweep that makes the guarantee hold however a design was created — Studio,
  // batch, import, or a hand-written insert that no trigger saw.
  const { data: retagPending, error: retagErr } = await svc
    .from("retag_queue").select("product_id").eq("status", "queued").limit(1);
  if (retagErr) console.error("studio-drain retag_queue read failed:", retagErr.message);

  // Sweep whenever there is no repair waiting — something may have become
  // incomplete since the last run (a tag deleted, a colour collection added).
  // Note it is the QUEUE, not the sweep's return value, that decides whether
  // there is work: a sweep finding nothing NEW while 430 repairs are already
  // queued is not an idle cron.
  if (!retagPending?.length) {
    const { error: sweepErr } = await svc.rpc("retag_enqueue_missing", { p_limit: 200 });
    if (sweepErr) console.error("studio-drain sweep failed:", sweepErr.message);
  }

  // The worker RPCs are gated by the studio admin key; read it server-side.
  const { data: cfg, error: cfgErr } = await svc
    .from("admin_config").select("v").eq("k", "admin_key").single();
  if (cfgErr || !cfg?.v) return NextResponse.json({ error: "no_admin_key" }, { status: 503 });
  const key = cfg.v as string;

  // Drain the upload queue IN PROCESS, for the same reason the repairs below
  // do: a fetch from here to our own public domain has to pass Vercel Attack
  // Challenge Mode, and a server-to-server request does not. It came back 429
  // `x-vercel-mitigated: challenge`, the failure was swallowed by the catch,
  // and this cron reported ok every five minutes while 21 items sat untouched
  // and never once claimed.
  //
  // It looked like it worked because the Studio page re-kicks the worker from
  // the browser every 20s while it is open (loadBatchStatus), and a browser
  // passes the challenge. So the queue only ever drained while someone had the
  // tab open — an overnight batch with nobody watching went nowhere.
  //
  // A scene render is slow, so this takes a smaller budget than the repairs and
  // leaves them the rest; the queue is resumable and every claim is leased, so
  // stopping mid-queue costs nothing but the wait to the next run.
  let drained = 0;
  if (pending?.length) {
    // Scene renders get the larger share: they are the visible work someone is
    // waiting on, and repairs are a background guarantee that can wait a tick.
    const queueDeadline = Math.min(Date.now() + 180_000, started + BUDGET_MS);
    while (Date.now() < queueDeadline) {
      try {
        const res = await processQueueTick(key);
        if (!res.progressed) break;
        drained += 1;
      } catch (e) {
        // The worker marks its own item failed; keep the cron healthy.
        console.error("studio-drain queue tick failed:", e);
        break;
      }
    }
    if (drained) revalidatePath("/");
  }

  // Repairs run HERE, in process — no HTTP hop to our own public domain.
  // Reaching the worker over that domain means passing Vercel Attack Challenge
  // Mode, which a server-to-server fetch does not; the failure was swallowed,
  // so the queue sat at 430 while the cron reported success every five minutes.
  //
  // A budget rather than a fixed count: a repair is a vision call and sometimes
  // a CLIP embedding, so the cost per design varies. Stop with time to spare
  // inside maxDuration and let the next run continue — the queue is resumable
  // by design, and every claim is leased.
  const deadline = Math.min(Date.now() + 40_000, started + BUDGET_MS);
  let repaired = 0;
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    try {
      const res = await processRetagTick(key);
      if (!res.progressed) break;
      repaired += 1;
      if (res.handle) revalidatePath(`/products/${res.handle}`);
    } catch (e) {
      // One design that cannot be classified must not stall the queue: it is
      // already marked failed by the worker, so move on to the next.
      lastError = e instanceof Error ? e.message : String(e);
      console.error("studio-drain retag tick failed:", lastError);
      break;
    }
  }
  if (repaired) {
    revalidatePath("/");
    revalidatePath("/collections/[handle]", "page");
  }

  // Fill missing ROOM renders, for the rooms on the room_render_fill work
  // list. Last in the tick and on the smallest budget of the three, because
  // it is the only one nobody is waiting on: an upload someone just made and
  // a design missing its tags are both live problems, while a room render
  // that has been missing for months can wait two more minutes.
  //
  // The budget is also the spend control. Each render is a gpt-image-2 call,
  // so at ~2 renders a tick and a tick every 2 minutes a room of 58 designs
  // fills in about an hour — fast enough to fix a page today, slow enough
  // that turning on a room by mistake cannot run up a bill before anyone
  // notices. Enabling a room is a row in room_render_fill, never a deploy.
  // One-off scene requests first: somebody asked for a specific render for a
  // specific reason (a festival post, a product page gap), so it outranks the
  // background room fill. Bounded to a couple per tick for the same spend
  // reason as the fill below.
  for (let i = 0; i < 2 && Date.now() < started + BUDGET_MS - 45_000; i++) {
    try {
      if (!(await processSceneOnceTick(key)).progressed) break;
    } catch (e) {
      console.error("studio-drain one-off scene failed:", e);
      break;
    }
  }

  const fillDeadline = Math.min(Date.now() + 60_000, started + BUDGET_MS);
  let filled = 0;
  while (Date.now() < fillDeadline) {
    try {
      const res = await processRoomFillTick(key);
      if (!res.progressed) break;
      filled += 1;
    } catch (e) {
      console.error("studio-drain room fill failed:", e);
      break;
    }
  }

  const { count: remaining } = await svc
    .from("retag_queue").select("product_id", { count: "exact", head: true }).eq("status", "queued");
  return NextResponse.json({ ok: true, drained, repaired, filled, remaining: remaining ?? null, lastError, seeded });
}

export const GET = withCronRun("studio-drain", tick);
