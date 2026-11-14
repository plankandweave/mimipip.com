import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node test runner includes SQLite.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  ensureRegistry,
  createRegistry,
  updateRegistry,
  addItem,
  itemAction,
  registryView,
  registryCheckout,
  releaseRegistryOrders,
  registryInput,
} from "../registry/service";
import { handleCommerce } from "./checkout";
const delivery = {
  name: "Private Recipient",
  email: "private@example.test",
  phone: "9000000000",
  address: "Private home address 123",
  city: "Pune",
  state: "Maharashtra",
  postcode: "411008",
  countryCode: "IN" as const,
};
const draft = {
  title: "Tara’s birthday",
  kind: "gift",
  occasion: "Birthday",
  eventDate: "",
  message: "Our little wishes",
  delivery,
};
async function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const f of [
    "0000_volatile_phantom_reporter",
    "0001_typical_sheva_callister",
    "0002_cart_checkout",
    "0006_gift_cards",
    "0007_gift_funding",
    "0008_gift_card_reference",
    "0009_gift_buyer_copy",
  ])
    db.exec(readFileSync("drizzle/" + f + ".sql", "utf8"));
  const DB = {
    prepare(sql: string) {
      return {
        bind(...v: any[]) {
          const st = db.prepare(sql);
          return {
            first: async () => st.get(...v) || null,
            all: async () => ({ results: st.all(...v) }),
            run: async () => ({
              meta: { changes: Number(st.run(...v).changes) },
            }),
          };
        },
      };
    },
  };
  await ensureRegistry(DB);
  await ensureRegistry(DB);
  const code = await createRegistry(DB, "owner", draft);
  const itemId = await addItem(DB, code, "owner", {
    slug: "hopscotch-peach-pop",
    qty: 1,
  });
  let captured = false;
  let total = 0;
  const orders: any[] = [];
  const payment = () => ({
    id: "pay_fixture",
    order_id: "order_fixture",
    status: captured ? "captured" : "authorized",
    captured,
    amount: total,
    currency: "INR",
    amount_refunded: 0,
  });
  const STORE_PAY = {
    ready: () => true,
    keyId: () => "rzp_live_fixture",
    verifySignature: () => true,
    osTokenMatches: () => false,
    sendOrder: async (o: any) => {
      orders.push(o);
      return { ok: true, status: 200, text: "" };
    },
    razorpay: async (path: string, body?: any) => {
      let data: any;
      if (body) {
        total = body.amount;
        data = { id: "order_fixture", amount: total, currency: "INR" };
      } else if (path.endsWith("/payments"))
        data = { items: captured ? [payment()] : [] };
      else if (path.startsWith("payments/")) data = payment();
      else
        data = {
          status: captured ? "paid" : "created",
          amount: total,
          amount_paid: captured ? total : 0,
          currency: "INR",
        };
      return { ok: true, status: 200, data };
    },
  };
  const env = { DB, STORE_PAY, MIMIPIP_CHECKOUT_ENABLED: "1" };
  const registry = {
    code,
    itemId,
    name: "Guest Buyer",
    email: "guest@example.test",
    message: "With love!",
  };
  const call = (action: string, b: any = {}) =>
    handleCommerce(
      new Request("https://mimipip.com/api/checkout/" + action, {
        method: "POST",
        headers: {
          origin: "https://mimipip.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "a".repeat(64), ...b }),
      }),
      env,
    );
  return {
    db,
    DB,
    code,
    itemId,
    registry,
    call,
    orders,
    capture: () => (captured = true),
  };
}
test("registry ownership, private view and exact catalogue selection", async () => {
  const f = await fixture();
  await assert.rejects(
    addItem(f.DB, f.code, "stranger", { slug: "hopscotch-peach-pop", qty: 1 }),
  );
  await assert.rejects(
    itemAction(f.DB, f.code, "stranger", f.itemId, "remove"),
  );
  const pub = await registryView(f.DB, f.code);
  assert.equal(pub?.items[0].remaining, 1);
  const raw = JSON.stringify(pub);
  for (const privateValue of [
    delivery.email,
    delivery.address,
    delivery.phone,
    "owner_id",
    "selection",
  ])
    assert.ok(!raw.includes(privateValue));
  const own = await registryView(f.DB, f.code, "owner");
  assert.deepEqual(own?.delivery, delivery);
  await assert.rejects(
    addItem(f.DB, f.code, "owner", { slug: "made-up-design", qty: 1 }),
  );
  await assert.rejects(
    addItem(f.DB, f.code, "owner", { slug: "hopscotch-peach-pop", qty: 100 }),
  );
  const resolved = await registryCheckout(f.DB, f.registry);
  assert.equal(resolved.lines[0].slug, "hopscotch-peach-pop");
  assert.equal(resolved.customer.address, delivery.address);
});
test("registry checkout ignores tampered cart and address, redacts private recipient, reserves atomically", async () => {
  const f = await fixture();
  const quote = await f.call("quote", {
    registry: f.registry,
    lines: [{ slug: "fake", qty: 99 }],
    countryCode: "US",
  });
  assert.equal(quote.status, 200);
  assert.equal((await quote.json()).currency, "INR");
  const created = await f.call("create", {
    registry: f.registry,
    customer: { address: "tampered" },
    lines: [{ slug: "fake", qty: 99 }],
  });
  assert.equal(created.status, 200);
  const d = await created.json();
  assert.deepEqual(d.customer, {
    name: "Guest Buyer",
    email: "guest@example.test",
  });
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM mimipip_orders").get().n,
    1,
  );
  assert.equal((await f.call("create", { registry: f.registry })).status, 200);
  const competing = await f.call("create", {
    token: "b".repeat(64),
    registry: f.registry,
  });
  assert.equal(competing.status, 409);
  assert.equal((await registryView(f.DB, f.code))?.items[0].remaining, 0);
  await assert.rejects(itemAction(f.DB, f.code, "owner", f.itemId, "remove"));
  const pending = await (await f.call("status")).json();
  assert.equal(pending.paid, false);
  assert.ok(!JSON.stringify(pending).includes(delivery.address));
  f.capture();
  const paid = await f.call("verify", {
    razorpay_order_id: "order_fixture",
    razorpay_payment_id: "pay_fixture",
    razorpay_signature: "fixture",
  });
  assert.equal(paid.status, 200);
  const p = await paid.json();
  assert.equal(p.paid, true);
  assert.ok(!JSON.stringify(p).includes(delivery.email));
  await f.call("status");
  const view = await registryView(f.DB, f.code, "owner");
  assert.equal(view?.items[0].purchased, 1);
  assert.equal(view?.thanks?.length, 1);
  assert.equal(f.orders[0].customer.address, delivery.address);
});
test("closing registry blocks new purchases; captured payments still reconcile", async () => {
  const f = await fixture();
  await f.call("create", { registry: f.registry });
  await updateRegistry(f.DB, f.code, "owner", { ...draft, closed: true });
  assert.equal(
    (await f.call("create", { token: "b".repeat(64), registry: f.registry }))
      .status,
    400,
  );
  f.capture();
  assert.equal((await (await f.call("status")).json()).paid, true);
});
test("unpaid holds release only on definite gateway emptiness; late payment never fulfils", async () => {
  const f = await fixture();
  await f.call("create", { registry: f.registry });
  const now = Date.now() + 91 * 60000;
  await releaseRegistryOrders(f.DB, async () => ({}), now);
  assert.equal((await registryView(f.DB, f.code))?.items[0].held, 1);
  await releaseRegistryOrders(
    f.DB,
    async () => ({ items: [{ status: "authorized" }] }),
    now,
  );
  assert.equal((await registryView(f.DB, f.code))?.items[0].held, 1);
  await releaseRegistryOrders(f.DB, async () => ({ items: [] }), now);
  assert.equal((await registryView(f.DB, f.code))?.items[0].remaining, 1);
  f.capture();
  await f.call("verify", {
    razorpay_order_id: "order_fixture",
    razorpay_payment_id: "pay_fixture",
    razorpay_signature: "fixture",
  });
  assert.equal(f.orders.length, 0);
  assert.equal((await registryView(f.DB, f.code))?.items[0].purchased, 0);
});
test("registry validates occasion, dates and delivery; guests cannot choose gift-card tender", async () => {
  const f = await fixture();
  assert.equal(
    registryInput.safeParse({ ...draft, kind: "baby" }).success,
    false,
  );
  assert.equal(
    registryInput.safeParse({ ...draft, eventDate: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    (await f.call("create", { registry: f.registry, giftTicket: "forged" }))
      .status,
    400,
  );
  assert.equal(
    (await f.call("create", { registry: { ...f.registry, quantity: 99 } }))
      .status,
    400,
  );
});

test("two simultaneous guests cannot reserve the last gift", async () => {
  const f = await fixture();
  const responses = await Promise.all([
    f.call("create", { token: "c".repeat(64), registry: f.registry }),
    f.call("create", { token: "d".repeat(64), registry: f.registry }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM mimipip_orders").get().n,
    1,
  );
});
test("interrupted creating registry orders recover without releasing a published payment", async () => {
  const f = await fixture();
  await f.call("create", { registry: f.registry });
  f.db
    .prepare(
      "UPDATE mimipip_orders SET status='creating',razorpay_order_id=NULL",
    )
    .run();
  await releaseRegistryOrders(
    f.DB,
    async () => {
      throw Error("should not query an unpublished order");
    },
    Date.now() + 6 * 60000,
  );
  assert.equal((await registryView(f.DB, f.code))?.items[0].remaining, 1);
});
