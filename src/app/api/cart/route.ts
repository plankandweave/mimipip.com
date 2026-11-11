import { priceCart } from "@/brand/commerce/checkout";
import {pricedLettering} from '@/brand/commerce/lettering';
import {pricedInstallation} from '@/brand/commerce/installation';
import { approvedLayout } from '@/brand/commerce/approved-layout';
import { artFor } from '@/brand/commerce/order-payload';
import { textOverlaySchema, overlayPlacementError } from "@/lib/text-overlay";
import { renderTextOverlay } from "@/lib/text-overlay-server";
import { NAME_FEE } from "@/lib/pricing";
import { imageQuality } from "@/lib/image-quality";
import { NextResponse, after } from "next/server";
import { refusePartnerPurchase } from "@/lib/partner-mode";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { getGatedUser } from "@/lib/auth-server";
import type { CropData } from "@/lib/visualizer";
import { toUploadBody, CACHE_IMMUTABLE } from "@/lib/storage-body";
import { docStorageClient, docRef, signDoc } from "@/lib/private-doc";
import { recordCommercialEvent, visitorTokenOf } from "@/lib/server-events";
import { TASTE_COOKIE } from "@/lib/taste";
import { recordCartFailure } from "@/lib/cart-diagnostics";

export const runtime = "nodejs";

const COOKIE = "zyv_cart";

async function tokenFrom(store: Awaited<ReturnType<typeof cookies>>): Promise<{ token: string; fresh: boolean }> {
  const existing = store.get(COOKIE)?.value;
  if (existing) return { token: existing, fresh: false };
  return { token: randomUUID(), fresh: true };
}

function withCookie(res: NextResponse, token: string, fresh: boolean) {
  if (fresh) {
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 60, // 60 days
    });
  }
  return res;
}

async function readCart(token: string) {
  const { data, error } = await supabase.rpc("cart_get", { p_session_token: token });
  if (error) throw error;
  if (data?.items) {
    data.items = await Promise.all(data.items.map(async (item: {preview_url?:string|null;handle:string;material_slug?:string;quantity:number;width_cm:number;height_cm:number;crop_data?:CropData;line_total:number;unit_price:number;area_sqft:number}) => {
      const ref=docRef(item.preview_url);
      // RPC callers cannot make this service-role reader sign another cart's file.
      const ownPreview=ref?.bucket==='mimipip-order-previews' && ref.path.startsWith(token+'/');
      const quote = priceCart([{slug:item.handle,materialSlug:item.material_slug,qty:item.quantity,widthCm:item.width_cm,heightCm:item.height_cm,crop:item.crop_data}], 'IN');
      const repriced = 'refused' in quote ? {price_changed:true} : {
        line_total:quote.totalMinor/100,unit_price:quote.lines[0].ratePerSqft??item.unit_price,
        area_sqft:quote.lines[0].billedSqft??item.area_sqft,price_changed:false,
      };
      return {...item,...repriced,preview_url:ownPreview?await signDoc(item.preview_url):null};
    }));
    data.subtotal = data.items.reduce((sum:number,item:{line_total:number})=>sum+item.line_total,0);
  }
  return data;
}

export async function GET() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ items: [], subtotal: 0 });
  try {
    return NextResponse.json(await readCart(token));
  } catch {
    return NextResponse.json({ error: "cart_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  // A partner's person never buys through the retail till — their wall goes
  // to a customer project and procurement releases it (src/lib/partner-mode.ts).
  const partnerRefusal = await refusePartnerPurchase();
  if (partnerRefusal) return partnerRefusal;

  const store = await cookies();
  const { token, fresh } = await tokenFrom(store);
  let body: {
    productHandle: string;
    materialSlug: string;
    editItemId?: string;
    widthCm: number;
    heightCm: number;
    areaSqft: number;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    crop?: CropData;
    roomComposite?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99 ||
      ![body.widthCm, body.heightCm].every(value => Number.isFinite(value) && value >= 10 && value <= 3000)) {
    return NextResponse.json({error: 'Enter valid wall dimensions and a quantity from 1 to 99.'}, {status:400});
  }

  // Refuse production instructions before saving an unfulfillable cart or rendering paid extras.
  const printArt=artFor(body.productHandle);
  if(!printArt)return NextResponse.json({error:'This design is not available to order yet.'},{status:400});
  try { approvedLayout(body.crop,body.widthCm,body.heightCm,printArt.art,body.productHandle); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Please check your wall layout.'},{status:400}); }

  if(body.crop?.installation){
    try {body.crop.installation=pricedInstallation(body.crop.installation,body.widthCm,body.heightCm,body.quantity,'IN')!;}
    catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Check installation.'},{status:400});}
  }
  try {pricedLettering(body.crop,body.widthCm,body.heightCm,'IN');}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Check lettering.'},{status:400});}
  if (body.crop?.personalisation?.childName && !body.crop.textOverlay) {
    return NextResponse.json({ error: "Please refresh and approve the name cloud preview." }, { status: 400 });
  }
  if (body.crop?.textOverlay) {
    const parsed = textOverlaySchema.safeParse(body.crop.textOverlay);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const problem = overlayPlacementError(parsed.data, body.widthCm, body.heightCm, body.crop.doors);
    if (problem || !body.crop.approval?.approvedAt || body.crop.wallWidthCm !== body.widthCm || body.crop.wallHeightCm !== body.heightCm) {
      return NextResponse.json({ error: problem || "Please approve the lettering on your measured wall." }, { status: 400 });
    }
    try { const preview = await renderTextOverlay(parsed.data); await preview.arrayBuffer(); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Preview unavailable." }, { status: 503 }); }
    body.crop.textOverlay = parsed.data;
    const oldFee = Number(body.crop.personalisation?.fee ?? 0);
    const fee = parsed.data.kind === "cloud" ? NAME_FEE : 0;
    body.lineTotal = body.lineTotal - (Number.isFinite(oldFee) ? oldFee : 0) + fee;
    body.crop.personalisation = fee ? { childName: parsed.data.text, fee } : null;
  }

  // Recompute advisory values; client-submitted resolution scores are not authoritative.
  if (body.crop) {
    const quality = imageQuality(body.crop);
    body.crop.quality = quality ? { ...quality, checkedAt: new Date().toISOString() } : undefined;
  }

  // Persist the room preview (if any) so the order copy can show it later.
  // Only a verified customer's room preview is stored in the private Mimi bucket;
  // and since 30 Sep 2026 anonymous visitors can preview on their own photo in
  // the browser. The server decides, not the page — a stripped client check
  // must not turn this route into free public image hosting. Capped at ~4 MB.
  let previewUrl: string | null = null;
  const previewAllowed =
    !!body.roomComposite?.startsWith("data:image") &&
    body.roomComposite.length <= 5_500_000 &&
    !!(await getGatedUser());
  if (previewAllowed && body.roomComposite) {
    try {
      const b64 = body.roomComposite.split(",")[1];
      const buf = Buffer.from(b64, "base64");
      const path = `${token}/${Date.now()}.jpg`;
      const docs = docStorageClient();
      const up = await docs.storage.from("order-previews").upload(path, toUploadBody(buf, "image/jpeg"), {
        contentType: "image/jpeg",
        cacheControl: CACHE_IMMUTABLE,
      });
      if (!up.error) previewUrl = docs.storage.from("order-previews").getPublicUrl(path).data.publicUrl;
    } catch {
      /* preview is optional */
    }
  }

  if(body.editItemId && !/^[0-9a-f-]{36}$/i.test(body.editItemId))return NextResponse.json({error:"Invalid cart item"},{status:400});
  const { error } = await supabase.rpc(body.editItemId ? "cart_replace_item" : "cart_add_item", {
    ...(body.editItemId?{p_item_id:body.editItemId}:{}),
    p_session_token: token,
    p_product_handle: body.productHandle,
    p_material_slug: body.materialSlug,
    p_width_cm: body.widthCm,
    p_height_cm: body.heightCm,
    p_area_sqft: body.areaSqft,
    p_unit_price: body.unitPrice,
    p_quantity: body.quantity,
    p_line_total: body.lineTotal,
    p_crop_data: body.crop ?? null,
    p_preview_url: previewUrl,
  });
  if (error) {
    console.error("cart_add_item failed:", error.message);
    if (error.message.startsWith("Wallpaper price or surface changed.")) {
      return NextResponse.json({ error: "The price or surface has changed. Refresh this design and review it again." }, { status: 409 });
    }
    after(() => recordCartFailure({ stage: "cart_add_rpc", handle: body.productHandle, databaseCode: error.code }));
    return NextResponse.json({ error: "add_failed" }, { status: 400 });
  }

  // The head of the commercial funnel, recorded where it happens rather than
  // where a script might. after() so it never delays the response, and
  // best-effort inside that: a failed event must not cost somebody their cart.
  //
  // The subject carries the cart token and the item, so the same add is one
  // event however many times the request is retried — the database keys on it.
  after(() =>
    recordCommercialEvent({
      event: "cart_add",
      subject: `${token}:${body.productHandle}:${body.materialSlug}:${body.widthCm}x${body.heightCm}`,
      token: visitorTokenOf(store.get(TASTE_COOKIE)?.value),
      handle: body.productHandle,
      valueInr: Number.isFinite(body.lineTotal) ? body.lineTotal : null,
      meta: { quantity: Math.max(1, Math.floor(body.quantity || 1)), material: body.materialSlug },
    }),
  );

  try {
    return withCookie(NextResponse.json(await readCart(token)), token, fresh);
  } catch {
    after(() => recordCartFailure({ stage: "cart_read_after_add", handle: body.productHandle }));
    // The write succeeded. Preserve ownership and tell the browser not to
    // POST it again just because the following read failed.
    return withCookie(NextResponse.json({ added: true, cartUnavailable: true }, { status: 202 }), token, fresh);
  }
}

export async function PATCH(req: Request) {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_cart" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body?.itemId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Validate quantity — a missing/NaN/≤0 value would otherwise pass NaN to the RPC.
  const qty = Math.floor(Number(body.quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { error } = await supabase.rpc("cart_update_qty", {
    p_session_token: token,
    p_item_id: body.itemId,
    p_quantity: qty,
  });
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 400 });
  try { return NextResponse.json(await readCart(token)); }
  catch { return NextResponse.json({ changed: true, cartUnavailable: true }, { status: 202 }); }
}

export async function DELETE(req: Request) {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_cart" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body?.itemId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { error } = await supabase.rpc("cart_remove_item", {
    p_session_token: token,
    p_item_id: body.itemId,
  });
  if (error) return NextResponse.json({ error: "remove_failed" }, { status: 400 });
  try { return NextResponse.json(await readCart(token)); }
  catch { return NextResponse.json({ changed: true, cartUnavailable: true }, { status: 202 }); }
}
