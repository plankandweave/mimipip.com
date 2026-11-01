import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { instagramPermalink } from "@/lib/marketing/publish/instagram";
import { isPersonalPlan } from "@/lib/marketing/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve old ledger rows too, without rewriting IDs or publishing anything.
export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return new Response("Publishing record unavailable.", { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid post.", { status: 400 });
  const { data, error } = await serviceClient().from("marketing_posts")
    .select("channel,status,external_id,plan_key").eq("id", id).maybeSingle();
  if (error) return new Response("Publishing record unavailable.", { status: 503 });
  if (!data || data.channel !== "instagram" || data.status !== "published" || !data.external_id
    || isPersonalPlan(data.plan_key)) return new Response("Published brand post not found.", { status: 404 });
  try {
    const link = await instagramPermalink(data.external_id);
    if (!link) return new Response("Instagram does not provide a link for this post. It may be an expired Story.", { status: 404 });
    return new Response(null, { status: 302, headers: { location: link, "cache-control": "private, no-store" } });
  } catch {
    return new Response("Instagram's post link could not be verified. Please check the brand profile.", { status: 502 });
  }
}
