import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { capiAccounting, metaHash, metaPurchaseBody, metaUserData, type CapiOrderRow } from "@/lib/meta-capi";
import { cookieFromRequest, metaContextFromRequest } from "@/lib/meta-request";
import { metaContentId, metaPurchaseEventId } from "@/lib/meta-pixel";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const order: CapiOrderRow = {
  id: "uuid-1",
  zvy: "ZVY-0042",
  order_number: 42,
  total: 11_800,
  notes: null,
  email: "  Roheena@Example.COM ",
  phone: "98765 43210",
  billing_name: "Roheena Nagpal",
  paid_at: "2026-09-22T06:00:00.000Z",
};

test("identifiers are hashed over the normalised value, and absent ones are omitted entirely", () => {
  const data = metaUserData({ email: " A@B.com ", phone: null, name: null });
  assert.deepEqual(data.em, [sha("a@b.com")]);
  // A hashed empty string is a real hash that matches nobody — it must not be
  // sent as a placeholder, because Meta counts it against match quality.
  assert.equal("ph" in data, false);
  assert.equal("fn" in data, false);
  assert.equal(metaHash("   "), null);
});

test("a phone is normalised to digits with the country code before hashing", () => {
  const data = metaUserData({ phone: "98765 43210" });
  assert.deepEqual(data.ph, [sha("919876543210")]);
});

test("name splits to first and last; a single name sends only a first", () => {
  assert.deepEqual(metaUserData({ name: "Roheena Nagpal" }).fn, [sha("roheena")]);
  assert.deepEqual(metaUserData({ name: "Roheena Nagpal" }).ln, [sha("nagpal")]);
  assert.equal("ln" in metaUserData({ name: "Roheena" }), false);
});

test("fbp, fbc, ip and user agent are sent RAW — hashing them makes them unmatchable", () => {
  const data = metaUserData({ fbp: "fb.1.123.456", fbc: "fb.1.123.CLICKID", ip: "1.2.3.4", userAgent: "Mozilla/5.0" });
  assert.equal(data.fbp, "fb.1.123.456");
  assert.equal(data.fbc, "fb.1.123.CLICKID");
  assert.equal(data.client_ip_address, "1.2.3.4");
  assert.equal(data.client_user_agent, "Mozilla/5.0");
});

test("the server Purchase carries the SAME event id the browser sends, or Meta counts it twice", () => {
  const body = metaPurchaseBody({
    orderId: "ZVY-0042", value: 11_800, currency: "INR",
    handles: ["mati-jodi-01"], eventTime: 1_790_000_000, user: { email: "a@b.com" },
  })!;
  const event = (body.data as Record<string, unknown>[])[0]!;
  assert.equal(event.event_id, metaPurchaseEventId("ZVY-0042"));
  assert.equal(event.event_id, "zyvorah_purchase_ZVY-0042");
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.action_source, "website");
});

test("content ids are the catalogue GROUP ids the feed publishes, de-duplicated", () => {
  const body = metaPurchaseBody({
    orderId: "ZVY-1", value: 100, currency: "INR",
    handles: ["mati-jodi-01", "mati-jodi-01", null, "taash-02"],
    eventTime: 1_790_000_000, user: {},
  })!;
  const custom = (body.data as Record<string, unknown>[])[0]!.custom_data as Record<string, unknown>;
  assert.deepEqual(custom.content_ids, ["ZYV-MATI-JODI-01", "ZYV-TAASH-02"]);
  assert.equal(custom.content_type, "product_group");
  // The id must match the feed's g:item_group_id exactly — see the feed route.
  assert.equal(metaContentId("mati-jodi-01"), "ZYV-MATI-JODI-01");
});

test("India's value is the GST-INCLUSIVE total the card was charged, not GA's ex-GST goods", () => {
  // GA nets this to 10,000. Meta must not: its bidder optimises against what
  // the shopper actually paid.
  assert.deepEqual(capiAccounting(order), { value: 11_800, currency: "INR" });
});

test("a USD order reads the presentment split off the order notes", () => {
  const usd = { ...order, notes: JSON.stringify({ presentmentCurrency: "USD", presentmentGoods: 120, presentmentDelivery: 30 }) };
  assert.deepEqual(capiAccounting(usd), { value: 150, currency: "USD" });
});

test("prose notes are not accounting, and a broken total yields no event rather than a wrong one", () => {
  assert.deepEqual(capiAccounting({ ...order, notes: "leave at the gate" }), { value: 11_800, currency: "INR" });
  assert.equal(capiAccounting({ ...order, total: null }), null);
  assert.equal(capiAccounting({ ...order, total: -1 }), null);
  assert.equal(metaPurchaseBody({ orderId: "", value: 1, currency: "INR", handles: [], eventTime: 1, user: {} }), null);
});

test("_fbp and _fbc are read off the request, and the client IP is the FIRST forwarded entry", () => {
  const req = new Request("https://zyvorah.com/api/razorpay/verify", {
    headers: {
      cookie: "zyv_country=IN; _fbp=fb.1.123.456; _fbc=fb.1.123.CLICK",
      "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2",
      "user-agent": "Mozilla/5.0",
    },
  });
  const ctx = metaContextFromRequest(req);
  assert.equal(ctx.fbp, "fb.1.123.456");
  assert.equal(ctx.fbc, "fb.1.123.CLICK");
  // A proxy's address sent as the shopper's is worse than sending none.
  assert.equal(ctx.ip, "203.0.113.9");
  assert.equal(cookieFromRequest(req, "nope"), null);
});

test("cf-connecting-ip wins over x-forwarded-for, because Cloudflare terminates TLS", () => {
  const req = new Request("https://zyvorah.com/", {
    headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" },
  });
  assert.equal(metaContextFromRequest(req).ip, "198.51.100.7");
});

test("a request with no cookies yields no identifiers rather than empty strings", () => {
  const ctx = metaContextFromRequest(new Request("https://zyvorah.com/"));
  assert.deepEqual(ctx, { fbp: null, fbc: null, ip: null, userAgent: null });
  assert.deepEqual(metaUserData(ctx), {});
});

test("a total of exactly zero is refused, like a null one", () => {
  // #423 caught `null`; 0 is the same trap one step further on — finite,
  // non-negative, and still not a sale. Meta counts a zero-value Purchase as
  // a conversion and the campaign's ROAS drops.
  const base = { ...order, total: 0 as number | string | null };
  assert.equal(capiAccounting(base), null);
  assert.equal(capiAccounting({ ...order, total: "0" }), null);
  // A real sale still passes — the guard must not drop revenue.
  assert.ok(capiAccounting({ ...order, total: 1_180 }));
});
