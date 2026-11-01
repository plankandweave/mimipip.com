import { visitorReady } from "./visitor-ready";
import type { PurchaseStage } from "./purchase-progress";

const completed = new Set<PurchaseStage>();
const pending = new Set<PurchaseStage>();
/** At most one successful beacon per stage/page load; failed writes can retry. */
export async function trackPurchaseProgress(stage: PurchaseStage) {
  if (completed.has(stage) || pending.has(stage)) return;
  pending.add(stage);
  try {
    await visitorReady();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch("/api/purchase-progress", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }), keepalive: true,
      });
      if (response.ok) { completed.add(stage); break; }
      if (response.status !== 409 && response.status !== 503) break;
    }
  } catch { /* Measurement must never prevent a purchase. */ }
  finally { pending.delete(stage); }
}
