import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CLAIM_KINDS, UUID_RE, evidenceType } from "@/lib/quality-claim";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = req.headers.get("x-order-token") || "";
  if (!UUID_RE.test(token))
    return NextResponse.json(
      { error: "Order link is invalid." },
      { status: 400 },
    );
  const db = supabaseAdmin();
  if (!db)
    return NextResponse.json(
      {
        error:
          "Reporting is temporarily unavailable. Please contact hello@zyvorah.com.",
      },
      { status: 503 },
    );
  const { data: order, error: orderError } = await db
    .from("orders")
    .select(
      "id,order_number,zvy,payment_status,shipping_address,order_items(id,product_title,material_name,width_cm,height_cm,crop_data)",
    )
    .eq("access_token", token)
    .maybeSingle();
  if (orderError)
    return NextResponse.json(
      { error: "Order lookup is temporarily unavailable." },
      { status: 503 },
    );
  if (!order)
    return NextResponse.json(
      { error: "Order link is invalid." },
      { status: 404 },
    );
  if (order.payment_status !== "paid")
    return NextResponse.json(
      {
        error:
          "For a payment issue, contact hello@zyvorah.com with your order number.",
      },
      { status: 400 },
    );
  // Bound the stream before multipart parsing; Content-Length alone can be spoofed.
  const reader = req.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Missing report." }, { status: 400 });
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16 * 1024 * 1024) {
      await reader.cancel();
      return NextResponse.json(
        { error: "Upload up to three photographs, 5MB each." },
        { status: 413 },
      );
    }
    parts.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(new Blob(parts as BlobPart[]), {
      headers: { "content-type": req.headers.get("content-type") || "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
  const requestId = String(form.get("requestId") || "");
  const kind = String(form.get("kind") || "");
  const details = String(form.get("details") || "").trim();
  const panel = String(form.get("panel") || "").trim();
  if (
    !UUID_RE.test(requestId) ||
    !CLAIM_KINDS.includes(kind as (typeof CLAIM_KINDS)[number]) ||
    details.length < 10 ||
    details.length > 3000 ||
    panel.length > 150
  )
    return NextResponse.json(
      { error: "Choose an issue and describe it in 10–3000 characters." },
      { status: 400 },
    );
  const existing = await db
    .from("order_quality_claims")
    .select("id")
    .eq("order_id", order.id)
    .eq("request_id", requestId)
    .maybeSingle();
  if (existing.data) return NextResponse.json({ id: existing.data.id });
  const { count, error: countError } = await db
    .from("order_quality_claims")
    .select("id", { head: true, count: "exact" })
    .eq("order_id", order.id)
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if (countError)
    return NextResponse.json(
      { error: "Please retry shortly." },
      { status: 503 },
    );
  if ((count || 0) >= 5)
    return NextResponse.json(
      {
        error: "Your reports are saved. Please contact us for further updates.",
      },
      { status: 429 },
    );
  const files = form
    .getAll("photos")
    .filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (
    files.length < 1 ||
    files.length > 3 ||
    files.some((f) => f.size > 5 * 1024 * 1024)
  )
    return NextResponse.json(
      { error: "Attach 1–3 photographs, up to 5MB each." },
      { status: 400 },
    );
  const checked = await Promise.all(
    files.map(async (f) => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      return { bytes, type: evidenceType(bytes) };
    }),
  );
  if (checked.some((f) => !f.type))
    return NextResponse.json(
      { error: "Photographs must be JPG, PNG or WEBP." },
      { status: 400 },
    );
  const paths: string[] = [];
  const uploadAttempt = randomUUID();
  try {
    for (const [i, f] of checked.entries()) {
      const path = `${order.id}/${requestId}/${uploadAttempt}-${i}.${f.type!.ext}`;
      const { error } = await db.storage
        .from("quality-evidence")
        .upload(path, f.bytes, { contentType: f.type!.mime, upsert: false });
      if (error) throw error;
      paths.push(path);
    }
    const address = order.shipping_address as {
      country?: string;
      countryCode?: string;
    } | null;
    const { data, error } = await db
      .from("order_quality_claims")
      .insert({
        order_id: order.id,
        request_id: requestId,
        kind,
        details,
        panel,
        photo_paths: paths,
        snapshot: {
          orderNumber: order.order_number,
          zvy: order.zvy,
          country: address?.countryCode || address?.country || "IN",
          items: order.order_items,
        },
      })
      .select("id")
      .single();
    if (error) {
      const retry = await db
        .from("order_quality_claims")
        .select("id")
        .eq("order_id", order.id)
        .eq("request_id", requestId)
        .maybeSingle();
      if (retry.data) {
        await db.storage.from("quality-evidence").remove(paths);
        return NextResponse.json({ id: retry.data.id });
      }
      throw error;
    }
    return NextResponse.json({ id: data.id });
  } catch {
    if (paths.length) await db.storage.from("quality-evidence").remove(paths);
    return NextResponse.json(
      {
        error:
          "Could not save your report. Please retry; your form is still here.",
      },
      { status: 503 },
    );
  }
}
