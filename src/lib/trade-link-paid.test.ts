// The webhook's trade settlement runs off two pure pieces: recognising OUR
// payment links (reference_id `trade-<n>` — anything else belongs to another
// flow and must be left alone) and giving a trade line the cover-fit crop the
// OS push reads its artwork from, WITHOUT losing the billing snapshot
// trade_checkout stored underneath. Both are cheap to get subtly wrong in a
// refactor, so both are pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeLinkPaidOf, tradeLineCrop } from "./trade-link-paid";

const linkEvent = (referenceId: string | undefined) => ({
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_ABC", ...(referenceId !== undefined ? { reference_id: referenceId } : {}) } },
    payment: { entity: { id: "pay_XYZ" } },
  },
});

test("a trade-<n> payment link is recognised with its parts", () => {
  assert.deepEqual(tradeLinkPaidOf(linkEvent("trade-1042")), {
    linkId: "plink_ABC",
    paymentId: "pay_XYZ",
    orderNumber: 1042,
  });
});

test("someone else's payment link is not ours", () => {
  assert.equal(tradeLinkPaidOf(linkEvent("invoice-77")), null);
  assert.equal(tradeLinkPaidOf(linkEvent("trade-")), null);
  assert.equal(tradeLinkPaidOf(linkEvent(undefined)), null);
});

test("other event types never match, whatever the payload says", () => {
  assert.equal(tradeLinkPaidOf({ ...linkEvent("trade-1"), event: "payment.captured" }), null);
});

test("a missing payment id refuses the match rather than settling half an event", () => {
  const e = linkEvent("trade-9");
  e.payload.payment = { entity: { id: undefined as unknown as string } };
  assert.equal(tradeLinkPaidOf(e), null);
});

test("the crop is a centred cover fit that keeps the trade snapshot", () => {
  const existing = { trade: { design_source: "catalogue", markup_pct: 0 } };
  const crop = tradeLineCrop(existing, "https://cdn.example/flat.png", 300, 250);
  assert.equal(crop["imageUrl"], "https://cdn.example/flat.png");
  assert.equal(crop["wallWidthCm"], 300);
  assert.equal(crop["wallHeightCm"], 250);
  assert.deepEqual([crop["offsetX"], crop["offsetY"], crop["zoom"]], [0.5, 0.5, 1]);
  assert.deepEqual(crop["trade"], existing.trade);
});

test("a null crop_data still yields a complete crop", () => {
  const crop = tradeLineCrop(null, "https://cdn.example/flat.png", 100, 100);
  assert.equal(crop["zoom"], 1);
  assert.equal(crop["imageUrl"], "https://cdn.example/flat.png");
});

// A paid trade order is settled through the one paid door (lib/retail-paid.ts,
// 8 October 2026) — never by a private ZVY mint or OS push of its own — and its
// print files and order copy follow from the webhook, as retail's do.
test("trade settlement goes through the shared paid door", async () => {
  const { readFileSync } = await import("node:fs");
  const tradeOs = readFileSync(new URL("./trade-os.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../app/api/webhooks/razorpay/route.ts", import.meta.url), "utf8");
  assert.match(tradeOs, /settlePaidOrderReporting\(/);
  assert.doesNotMatch(tradeOs, /pushOrderToOs\(|ensureOrderZvy\(/);
  assert.match(webhook, /producePaidOrder\(/);
});
