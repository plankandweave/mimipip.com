import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { staffKey } from "@/lib/staff-key";
import { metaIgAccountId, metaPublishToken } from "@/lib/meta-env";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only, boolean-only config check for the trade partner program's
// external credentials. Exists purely to answer "did the env vars I just
// added in Vercel actually take effect" without making any real vendor call
// (no payout, no PAN verification, no side effects) — a Vercel env var
// change only applies to a NEW deployment, so this is meant to be hit right
// after a redeploy. Never returns a secret's value, only whether it's set;
// CASHFREE_API_BASE_URL is returned in full since it's a URL, not a secret.
// Gated by the same admin_key_ok check every other admin_* surface uses.
export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!key) return NextResponse.json({ error: "missing_key" }, { status: 400 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: ok, error } = await admin.rpc("admin_key_ok", { p_key: key });
  if (error || !ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json({
    razorpayWebhookSecretSet: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    razorpayxAccountNumberSet: !!process.env.RAZORPAYX_ACCOUNT_NUMBER,
    cashfreeClientIdSet: !!process.env.CASHFREE_CLIENT_ID,
    cashfreeClientSecretSet: !!process.env.CASHFREE_CLIENT_SECRET,
    cashfreeApiBaseUrl: process.env.CASHFREE_API_BASE_URL || "https://api.cashfree.com/verification (default: production)",
    anthropicApiKeySet: !!anthropicKeyFor("shoppers"),

    // Marketing lane. Vercel marks Production variables sensitive by default,
    // so `vercel env pull` reads them back EMPTY whether or not they are set —
    // which makes "did that env var actually take" unanswerable from a terminal.
    // These booleans answer it from inside the running deployment, which is the
    // only place that can. Presence only; never a value.
    geminiApiKeySet: !!process.env.GEMINI_API_KEY,
    marketingImageProvider: process.env.MARKETING_IMAGE_PROVIDER || "(unset — lane uses owned scene renders)",
    reelWorkerUrl: process.env.REEL_WORKER_URL || "(unset — reels fall back to stills)",
    reelWorkerTokenSet: !!process.env.REEL_WORKER_TOKEN,
    // Read through the same fallback the publisher actually uses
    // (src/lib/meta-env.ts) — checking the literal env var names here
    // reported "unconfigured" even once the account/token were live under
    // their fallback names (META_IG_ACCOUNT_ID / META_ADS_TOKEN).
    instagramConfigured: !!metaIgAccountId() && !!metaPublishToken(),
  });
}
