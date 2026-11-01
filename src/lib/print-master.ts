import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";

/**
 * Print masters — the high-resolution tier.
 *
 * A design has two images now. The one on the product page is the studio's
 * ~2048 px upload: right for a web page, and about 21 DPI once stretched over
 * an 8x8 ft wall — which is why prints and A4 samples came back soft. The
 * master is what we actually print from, ~14400 px on its SHORT edge (walls are
 * ~8 ft tall, so the short edge is what limits sharpness).
 *
 * No high-resolution originals exist to import — the studio's own uploads ARE
 * the 2048 px files — so a master has to be MANUFACTURED by the Real-ESRGAN
 * cascade inside the Mimaki engine, which is where the Replicate token lives.
 *
 * Built ON DEMAND: the first order or sample for a design builds one, that
 * build is what gets printed, and it is kept for ever after. We never pay to
 * upscale artwork nobody has bought.
 *
 * The invariant that matters most: **a master build must never block or fail a
 * customer's order.** Every failure path returns null, and null means "print
 * from the web flat exactly as the pipeline did before masters existed".
 */

const BUCKET = "print-masters";

/** 8 ft in inches — the reference wall `print_source_dpi` is expressed against,
 *  matching MASTER_REFERENCE_IN in the engine. */
const REFERENCE_IN = 96;

/** How long a signed master URL stays valid. Long enough to pull a
 *  multi-hundred-megabyte file over a slow link, short enough that a leaked URL
 *  is not a permanent hole. */
const SIGNED_URL_TTL_S = 60 * 60;

/** Ceiling on how long an order will wait for a master. Beyond this the order
 *  prints from the web flat rather than keeping a customer waiting on a
 *  Replicate queue. */
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

/** How long to wait on a build another request already claimed. Deliberately
 *  much shorter than BUILD_TIMEOUT_MS: this request did not start that work and
 *  must not inherit its full wait. */
const FOLLOWER_WAIT_MS = 30 * 1000;

export type PrintMaster = {
  url: string;              // signed bucket URL, or the engine's /master/file
  dpiAtReference: number;
  widthPx?: number;
  heightPx?: number;
  /** True when `url` points at the engine and needs the service-key header.
   *  A signed Supabase URL carries its own auth in the query string; the
   *  engine's does not, so the fetcher has to know which it is holding. */
  engine?: boolean;
};

/** Marks a master kept in the ENGINE's archive rather than the Supabase bucket. */
const ENGINE_PREFIX = "engine:";

type ProductMasterRow = {
  handle: string;
  master_status: "none" | "building" | "ready" | "manual";
  print_source_url: string | null;
  print_source_dpi: number | null;
};

function engineConfigured(): boolean {
  return Boolean(process.env.MIMAKI_BACKEND_URL && process.env.MIMAKI_SERVICE_KEY);
}

function engineUrl(path: string): string {
  return `${process.env.MIMAKI_BACKEND_URL!.replace(/\/$/, "")}${path}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sign a stored master for reading.
 *
 * Service-role, not the anon client: `print-masters` is a private bucket with
 * no RLS policies precisely so a master — the full-resolution artwork, the one
 * asset a competitor would need — is never publicly addressable.
 */
async function signMaster(path: string): Promise<string | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
  if (error || !data?.signedUrl) {
    console.error(`print-master: could not sign ${path}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Where a ready master is read from.
 *
 * New masters stay in the ENGINE's own storage (`engine:master_<handle>.jpg`),
 * served by GET /master/file/{ref}, which transparently restores from Google
 * Drive when the engine's volume has evicted the file. Keeping a second
 * full-resolution copy in Supabase would double the storage this whole change
 * exists to stop paying for, and would leave two copies to keep in step.
 *
 * Rows written before the switch hold a bucket path and are still signed the
 * old way, so nothing has to be migrated.
 */
async function readyMaster(row: ProductMasterRow): Promise<PrintMaster | null> {
  if (!row.print_source_url) return null;
  const dpi = row.print_source_dpi ?? 0;

  if (row.print_source_url.startsWith(ENGINE_PREFIX)) {
    if (!engineConfigured()) return null;
    const ref = row.print_source_url.slice(ENGINE_PREFIX.length);
    return { url: engineUrl(`/master/file/${ref}`), dpiAtReference: dpi, engine: true };
  }

  const url = await signMaster(row.print_source_url);
  if (!url) return null;
  return { url, dpiAtReference: dpi };
}

/** Products are anon-readable (active catalogue), so the plain client is fine. */
async function loadRow(handle: string): Promise<ProductMasterRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select("handle, master_status, print_source_url, print_source_dpi")
    .eq("handle", handle)
    .maybeSingle();
  if (error) {
    console.error(`print-master: product lookup failed for ${handle}:`, error.message);
    return null;
  }
  return (data as ProductMasterRow) ?? null;
}

/** The design's own web flat — the source a master is built FROM. */
async function flatUrlFor(handle: string): Promise<string | null> {
  const { data } = await supabase
    .from("products")
    .select("id, product_images!inner(url, is_flat)")
    .eq("handle", handle)
    .eq("product_images.is_flat", true)
    .maybeSingle();
  return (data as { product_images?: { url: string }[] } | null)?.product_images?.[0]?.url ?? null;
}

/**
 * Resolve an order item to its design handle.
 *
 * Service-role: order_items is RLS-protected with no anon policy. Returns null
 * for a customer's own uploaded artwork (custom_image_url) — that file IS the
 * master, and there is no catalogue design to build one for.
 */
export async function designHandleForItem(orderItemId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("order_items")
    .select("custom_image_url, products(handle)")
    .eq("id", orderItemId)
    .maybeSingle();
  if (error) {
    console.error(`print-master: item lookup failed for ${orderItemId}:`, error.message);
    return null;
  }
  const row = data as { custom_image_url: string | null; products?: { handle: string } | null } | null;
  if (!row || row.custom_image_url) return null;
  return row.products?.handle ?? null;
}

/**
 * Ask the engine to build the master, then store the result.
 *
 * The engine does the expensive part and leaves a JPEG on its own disk; we
 * stream that into the private bucket, because the engine runs on Railway with
 * an ephemeral filesystem — a master left only there would vanish on redeploy.
 */
async function buildAndStore(handle: string): Promise<PrintMaster | null> {
  const admin = supabaseAdmin();
  if (!admin) throw new Error("service-role key not configured");

  const sourceUrl = await flatUrlFor(handle);
  if (!sourceUrl) throw new Error(`${handle} has no flat image to build from`);

  const start = await fetch(engineUrl("/master/build"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": process.env.MIMAKI_SERVICE_KEY!,
    },
    body: JSON.stringify({ source_url: sourceUrl, design_ref: handle }),
  });
  if (!start.ok) throw new Error(`master build start ${start.status}: ${await start.text()}`);
  const { job_id: jobId } = (await start.json()) as { job_id: string };

  // Poll. The engine reports through the same progress contract as /upscale,
  // with the payload under `result` — job_progress has no other columns, so a
  // top-level key there would fail the whole upsert.
  type Done = { download: string; width: number; height: number; dpi_at_reference: number };
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  let done: Done | null = null;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const p = await fetch(engineUrl(`/process/progress/${jobId}`), {
      headers: { "X-Service-Key": process.env.MIMAKI_SERVICE_KEY! },
    });
    if (!p.ok) continue;
    const prog = (await p.json()) as { status?: string; error?: string; result?: Done };
    if (prog.status === "error") throw new Error(`master build failed: ${prog.error}`);
    if (prog.status === "done" && prog.result?.download) {
      done = prog.result;
      break;
    }
  }
  if (!done) throw new Error(`master build timed out after ${BUILD_TIMEOUT_MS}ms`);

  // The master STAYS on the engine. It was previously downloaded here and
  // pushed into the Supabase bucket, which meant paying to store a second
  // ~72 MB copy of every design and having two copies that could drift. The
  // engine already archives it to Drive and restores on demand, so a reference
  // is all that needs recording.
  //
  // Confirm it is actually servable before claiming 'ready': set_print_master
  // flips master_status, and a row that says ready while the file is
  // unreachable would send every future order down the master path only to
  // fail and fall back.
  // Store the bare handle, NOT the filename: /master/file/{ref} builds
  // `master_<ref>.jpg` itself, so passing the filename would have it look for
  // master_master_<handle>.jpg and 404 every fetch.
  const probe = await fetch(engineUrl(`/master/file/${handle}`), {
    method: "HEAD",
    headers: { "X-Service-Key": process.env.MIMAKI_SERVICE_KEY! },
  });
  if (!probe.ok) throw new Error(`master built but not servable (${probe.status})`);

  const dpi = Math.round(done.dpi_at_reference || Math.min(done.width, done.height) / REFERENCE_IN);
  const { error: setErr } = await supabase.rpc("set_print_master", {
    p_handle: handle,
    p_path: `${ENGINE_PREFIX}${handle}`,
    p_dpi: dpi,
  });
  if (setErr) throw new Error(`set_print_master failed: ${setErr.message}`);

  return {
    url: engineUrl(`/master/file/${handle}`),
    dpiAtReference: dpi,
    widthPx: done.width,
    heightPx: done.height,
    engine: true,
  };
}

/**
 * Get the print master for a design, building it if this is the first time.
 *
 * Returns null whenever the web flat should be used instead — no master yet, a
 * design reserved for a hand-made Topaz pass, a build already running
 * elsewhere, or any failure at all. Callers must treat null as "print the way
 * you always did", never as an error.
 */
export async function ensurePrintMaster(handle: string): Promise<PrintMaster | null> {
  if (!handle) return null;

  const row = await loadRow(handle);
  if (!row) return null;

  if (row.master_status === "ready") return readyMaster(row);

  if (row.master_status === "manual") {
    // Marked exotic: auto-upscaling would ruin it, and no hand-made master has
    // been uploaded yet. Print from the flat; the low-DPI warning surfaces it.
    console.warn(`print-master: ${handle} awaits a hand-made master; using web flat`);
    return null;
  }

  if (!engineConfigured()) return null;

  if (row.master_status === "building") {
    // Another request claimed this build. Wait briefly in case it lands within
    // this request, but never inherit its full timeout.
    const deadline = Date.now() + FOLLOWER_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const again = await loadRow(handle);
      if (again?.master_status === "ready") return readyMaster(again);
      if (again?.master_status !== "building") return null;
    }
    return null;
  }

  // status === 'none'. Claim it: the RPC flips none -> building atomically and
  // reports whether WE won. Without that, two orders placed seconds apart would
  // each fire a full Real-ESRGAN cascade for the same design and both pay for
  // it, racing to overwrite one storage path.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_master_build", {
    p_handle: handle,
  });
  if (claimErr) {
    console.error(`print-master: claim failed for ${handle}:`, claimErr.message);
    return null;
  }
  if (!claimed) return null; // someone else got there first — use the flat

  try {
    return await buildAndStore(handle);
  } catch (e) {
    // Put the design back so a later order retries. Leaving it 'building' would
    // suppress every future attempt for ever.
    await supabase.rpc("release_master_build", { p_handle: handle });
    console.error(`print-master: build failed for ${handle}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Kick a build without waiting. Used where a master would be good to have by
 *  the time something is printed, but nothing should be delayed now. */
export function warmPrintMaster(handle: string): void {
  ensurePrintMaster(handle).catch((e) =>
    console.error(`print-master: warm failed for ${handle}:`, e),
  );
}
