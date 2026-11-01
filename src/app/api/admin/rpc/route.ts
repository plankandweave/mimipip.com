import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { adminRpcKey } from "@/lib/elevated-key";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { ADMIN_RPCS, isAdminRpc } from "@/lib/admin-rpc-allowlist";

// The staff pages used to call these SECURITY DEFINER functions straight from the
// browser, passing `p_key` — the shared admin key — as an argument. That is why
// the key had to exist in the browser at all, and it is the one call path that
// Cloudflare Access can never gate: a browser→Supabase request does not pass
// through this Worker, so the only thing standing between the data and anyone
// holding the key was admin_key_ok() inside Postgres.
//
// Now the browser asks THIS route, which checks the Google sign-in and supplies
// p_key itself from admin_config. The key never leaves the server, and the
// database keeps its own gate: if this route were ever reachable unauthenticated,
// admin_key_ok() is still a second lock rather than a formality.
//
// The function name is checked against an explicit list, not a prefix. A prefix
// rule quietly widens every time someone names a new function well.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The design uploader writes through this route, rather than the Studio route
// that already invalidates catalogue reads.  Keep the storefront in step with
// a draft, publish or deletion: a status-only change otherwise leaves its
// product page live while the matching collection still serves its old cards.
function revalidateDesignCatalogue(handle?: unknown) {
  void bumpCatalogueVersion();
  revalidatePath("/");
  revalidatePath("/new");
  revalidatePath("/collections/[handle]", "page");
  revalidatePath("/products/[handle]", "page");
  if (typeof handle === "string" && handle) revalidatePath(`/products/${handle}`);
  revalidatePath("/office");
  revalidatePath("/office/[space]", "page");
  revalidatePath("/hospitality");
  revalidatePath("/hospitality/[space]", "page");
  revalidatePath("/rooms");
}

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();

  let body: { fn?: unknown; args?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ data: null, error: "bad request" }, { status: 400 });
  }

  const fn = typeof body.fn === "string" ? body.fn : "";
  if (!isAdminRpc(fn)) {
    return NextResponse.json({ data: null, error: `unknown function: ${fn}` }, { status: 400 });
  }

  const supplied =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};
  // A caller cannot choose the key it is authorised with, whatever it sends.
  const { p_key: _ignored, ...args } = supplied;

  const key = await adminRpcKey();
  if (!key) {
    return NextResponse.json(
      { data: null, error: "admin key not configured" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc(fn, { ...args, p_key: key });
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 200 });
  }
  if (fn === "admin_create_design" || fn === "admin_activate_design" || fn === "admin_delete_design") {
    revalidateDesignCatalogue(supplied.p_handle ?? (data as { handle?: unknown } | null)?.handle);
  }
  return NextResponse.json(
    { data, error: null },
    { headers: { "cache-control": "no-store" } },
  );
}

export const GET = () =>
  NextResponse.json({ functions: ADMIN_RPCS.length }, { headers: { "cache-control": "no-store" } });
