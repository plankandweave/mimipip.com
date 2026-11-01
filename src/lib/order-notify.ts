import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import { sendEmail } from "./email";
import { fetchInstallBrief } from "./os-install";
import { INSTALL_RATE_EX_GST, GST_RATE } from "./pricing";
import {
  productionStartedEmail,
  productionCompleteEmail,
  orderShippedEmail,
  orderCancelledEmail,
  type OrderEmailData,
} from "./email-templates";

type OrderRow = OrderEmailData & { email?: string | null; access_token?: string | null };
type OrderItem = {
  product_title?: string | null;
  preview_url?: string | null;
  area_sqft?: number | string | null;
  quantity?: number | string | null;
  crop_data?: { imageUrl?: string | null; installation?: { total?: number | string | null } | null } | null;
};

// 'paid' is handled separately by sendFounderNote (the personalised founder's
// email) — everything else is transactional.
const TEMPLATE: Record<string, (d: OrderEmailData) => { subject: string; html: string }> = {
  in_production: productionStartedEmail,
  printed: productionCompleteEmail,
  shipped: orderShippedEmail,
  cancelled: orderCancelledEmail,
};

/**
 * Send the lifecycle email for an order's new status, exactly once. Idempotent
 * via claim_order_notification (so webhook + admin double-fires don't duplicate).
 * A no-op if the status has no email or RESEND_API_KEY isn't configured.
 */
export async function notifyOrderStatus(orderId: string, status: string): Promise<void> {
  // Service role, not the anon key: get_order_for_invoice is SECURITY DEFINER
  // with no internal auth gate and returns the customer's contact and address.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("order-notify: SUPABASE_SERVICE_ROLE_KEY not configured");
    return;
  }

  const build = TEMPLATE[status];
  if (!build) return;

  const { data: claimed } = await supabase.rpc("claim_order_notification", {
    p_order_id: orderId,
    p_status: status,
  });
  if (!claimed) return; // already sent for this status

  const { data: bundle } = await sb.rpc("get_order_for_invoice", { p_order_id: orderId });
  const b = bundle as { order?: OrderRow; items?: OrderItem[] } | null;
  const order = b?.order;
  if (!order?.email) return;

  // Lead the email with the order's own image: the customer's room mockup if
  // they placed one, otherwise the design (flat pattern) they ordered.
  const first = b?.items?.[0];
  const imageUrl = first?.preview_url || first?.crop_data?.imageUrl || null;
  const productTitle = first?.product_title || null;

  // Install-by-us orders: the dispatch email is the one place the customer gets
  // the fitter's details and the start OTP, so pull them live from the OS. The
  // OTP is rendered and forgotten — never stored on our side.
  const items = b?.items ?? [];
  const installByUs = items.some((it) => it.crop_data?.installation != null);
  let install = {};
  if (installByUs && status === "shipped") {
    // The area the fitter actually faces — derived from what installation was
    // CHARGED (rate × area × qty, GST on top), not from area_sqft, which
    // carries the small-order billing minimum and would overstate a small
    // wall in a mixed order. Installation itself is never floored.
    const installAreaSqft = items.reduce((s, it) => {
      const charged = Number(it.crop_data?.installation?.total ?? 0);
      return charged > 0 ? s + charged / (INSTALL_RATE_EX_GST * (1 + GST_RATE)) : s;
    }, 0);
    const brief = await fetchInstallBrief(order.access_token);
    install = {
      installByUs: true,
      installAreaSqft,
      installerName: brief?.installerName ?? null,
      installerPhone: brief?.installerPhone ?? null,
      startOtp: brief?.startOtp ?? null,
    };
  }

  const { subject, html } = build({ ...order, imageUrl, productTitle, ...install });
  await sendEmail({ to: order.email, subject, html });
}
