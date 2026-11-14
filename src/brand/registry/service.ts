import { z } from "zod";
import type { Env } from "../commerce/checkout";
import { priceCart, validCustomer } from "../commerce/checkout";
import records from "../review/catalogue.json";
import { registrySchema } from "./schema";
type DB = NonNullable<Env["DB"]>;
export const occasions = [
  "Birthday",
  "A new room",
  "Family celebration",
  "Just because",
] as const;
const short = z.string().trim().min(1).max(100);
const delivery = z
  .object({
    name: short,
    email: z.email().max(254),
    phone: z.string().max(30),
    address: z.string().max(500),
    city: short,
    state: short,
    postcode: z.string().max(20),
    countryCode: z.enum(["IN", "US"]),
  })
  .strict();
export const registryInput = z
  .object({
    title: short,
    kind: z.enum(["baby", "gift"]),
    occasion: z.enum(["Baby shower", "Welcome baby", ...occasions]),
    eventDate: z
      .string()
      .regex(/^(?:\d{4}-\d{2}-\d{2})?$/)
      .refine(
        (s) =>
          !s ||
          (!Number.isNaN(Date.parse(s)) &&
            new Date(s).toISOString().slice(0, 10) === s),
      ),
    message: z.string().trim().max(500),
    delivery,
    closed: z.boolean().optional(),
  })
  .strict()
  .refine((v) => validCustomer(v.delivery), "Check your delivery details.")
  .refine(
    (v) =>
      v.kind === "baby"
        ? ["Baby shower", "Welcome baby"].includes(v.occasion)
        : (occasions as readonly string[]).includes(v.occasion),
    "Choose an occasion for this registry.",
  );
export type RegistryInput = z.infer<typeof registryInput>;
export type RegistryRow = {
  id: string;
  owner_id: string;
  title: string;
  kind: "baby" | "gift";
  occasion: string;
  event_date: string;
  message: string;
  delivery: string;
  closed: number;
  created_at: number;
};
type ItemRow = {
  id: string;
  registry_id: string;
  selection: string;
  quantity: number;
  favourite: number;
};
export const validCode = (s: string) => /^[a-f0-9]{32}$/.test(s);
export const newId = () => crypto.randomUUID().replaceAll("-", "");
export async function ensureRegistry(db: DB) {
  for (const sql of registrySchema) await db.prepare(sql).bind().run();
}
export async function owned(db: DB, id: string, owner: string) {
  return db
    .prepare("SELECT * FROM mimipip_registries WHERE id=? AND owner_id=?")
    .bind(id, owner)
    .first<RegistryRow>();
}
export async function createRegistry(db: DB, owner: string, raw: unknown) {
  const b = registryInput.parse(raw),
    id = newId();
  const r = await db
    .prepare(
      `INSERT INTO mimipip_registries(id,owner_id,title,kind,occasion,event_date,message,delivery,created_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mimipip_registries WHERE owner_id=?)<20`,
    )
    .bind(
      id,
      owner,
      b.title,
      b.kind,
      b.occasion,
      b.eventDate,
      b.message,
      JSON.stringify(b.delivery),
      Date.now(),
      owner,
    )
    .run();
  if (!r.meta.changes) throw Error("You can keep up to 20 registries.");
  return id;
}
export async function updateRegistry(
  db: DB,
  id: string,
  owner: string,
  raw: unknown,
) {
  const b = registryInput.parse(raw);
  const r = await db
    .prepare(
      "UPDATE mimipip_registries SET title=?,kind=?,occasion=?,event_date=?,message=?,delivery=?,closed=? WHERE id=? AND owner_id=?",
    )
    .bind(
      b.title,
      b.kind,
      b.occasion,
      b.eventDate,
      b.message,
      JSON.stringify(b.delivery),
      b.closed ? 1 : 0,
      id,
      owner,
    )
    .run();
  if (!r.meta.changes) throw Error("Registry not found.");
}
function checkedSelection(raw: unknown, country: string) {
  const r = z
    .object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      qty: z.number().int().min(1).max(99),
      materialSlug: z.string().max(80).optional(),
      widthCm: z.number().positive().optional(),
      heightCm: z.number().positive().optional(),
      fixedSize: z.boolean().optional(),
      crop: z.unknown().optional(),
      placement: z.unknown().optional(),
    })
    .strict()
    .parse(raw);
  if (["custom-wallpaper", "bespoke-customisation"].includes(r.slug))
    throw Error("Choose a catalogue design for this registry.");
  const one = { ...r, qty: 1 };
  const price = priceCart([one], country);
  if ("refused" in price) throw Error(price.refused);
  if (price.lines[0].kind || price.lines[0].crop?.installation)
    throw Error("Choose a product without installation for your registry.");
  return { selection: one, quantity: r.qty };
}
export async function addItem(
  db: DB,
  code: string,
  owner: string,
  raw: unknown,
) {
  const registry = await owned(db, code, owner);
  if (!registry) throw Error("Registry not found.");
  if (registry.closed) throw Error("Reopen this registry before adding gifts.");
  const { selection, quantity } = checkedSelection(
    raw,
    JSON.parse(registry.delivery).countryCode,
  );
  const id = newId();
  const r = await db
    .prepare(
      `INSERT INTO mimipip_registry_items(id,registry_id,selection,quantity,created_at)
 SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM mimipip_registry_items WHERE registry_id=?)<100`,
    )
    .bind(id, code, JSON.stringify(selection), quantity, Date.now(), code)
    .run();
  if (!r.meta.changes) throw Error("A registry can contain up to 100 gifts.");
  return id;
}
export async function itemAction(
  db: DB,
  code: string,
  owner: string,
  itemId: string,
  action: "remove" | "favourite",
  value?: boolean,
) {
  if (!(await owned(db, code, owner))) throw Error("Registry not found.");
  if (action === "remove")
    await db
      .prepare(
        "DELETE FROM mimipip_registry_items WHERE id=? AND registry_id=?",
      )
      .bind(itemId, code)
      .run();
  else
    await db
      .prepare(
        "UPDATE mimipip_registry_items SET favourite=? WHERE id=? AND registry_id=?",
      )
      .bind(value ? 1 : 0, itemId, code)
      .run();
}
export async function registryView(db: DB, code: string, owner?: string) {
  const r = await db
    .prepare("SELECT * FROM mimipip_registries WHERE id=?")
    .bind(code)
    .first<RegistryRow>();
  if (!r) return null;
  const isOwner = r.owner_id === owner;
  const items = await db
    .prepare(
      `SELECT i.*,
 COALESCE((SELECT SUM(json_extract(o.fulfilment,'$.registry.quantity')) FROM mimipip_orders o WHERE json_extract(o.fulfilment,'$.registry.itemId')=i.id AND o.status='paid'),0) purchased,
 COALESCE((SELECT SUM(json_extract(o.fulfilment,'$.registry.quantity')) FROM mimipip_orders o WHERE json_extract(o.fulfilment,'$.registry.itemId')=i.id AND o.status IN ('creating','pending','review')),0) held
 FROM mimipip_registry_items i WHERE registry_id=? ORDER BY favourite DESC,created_at`,
    )
    .bind(code)
    .all<ItemRow & { purchased: number; held: number }>();
  const country = JSON.parse(r.delivery).countryCode;
  const gifts = items.results.map((i) => {
    const selection = JSON.parse(i.selection);
    const p = priceCart([selection], country);
    const record = records.find((x) => x.slug === selection.slug);
    return {
      id: i.id,
      name: record?.name ?? "Gift",
      slug: selection.slug,
      image: record?.image ?? null,
      quantity: i.quantity,
      purchased: i.purchased,
      held: i.held,
      favourite: !!i.favourite,
      remaining: Math.max(0, i.quantity - i.purchased - i.held),
      ...(isOwner ? { selection } : {}),
      ...("refused" in p
        ? { unavailable: p.refused }
        : {
            amountMinor: p.totalMinor,
            currency: p.currency,
            size:
              p.lines[0].widthCm && p.lines[0].heightCm
                ? `${p.lines[0].widthCm} × ${p.lines[0].heightCm} cm`
                : "",
          }),
    };
  });
  let thanks: unknown[] = [];
  if (isOwner) {
    const rows = await db
      .prepare(
        "SELECT id,created_at,json_extract(fulfilment,'$.registry') gift FROM mimipip_orders WHERE json_extract(fulfilment,'$.registry.code')=? AND status='paid' ORDER BY created_at DESC",
      )
      .bind(code)
      .all<{ id: string; created_at: number; gift: string }>();
    thanks = rows.results.map((o) => ({
      order: o.id,
      date: o.created_at,
      ...JSON.parse(o.gift),
    }));
  }
  return {
    code: r.id,
    title: r.title,
    kind: r.kind,
    occasion: r.occasion,
    eventDate: r.event_date,
    message: r.message,
    closed: !!r.closed,
    isOwner,
    countryCode: country,
    items: gifts,
    ...(isOwner ? { delivery: JSON.parse(r.delivery), thanks } : {}),
  };
}
export const giftRequest = z
  .object({
    code: z.string().regex(/^[a-f0-9]{32}$/),
    itemId: z.string().regex(/^[a-f0-9]{32}$/),
    name: short,
    email: z.email().max(254),
    message: z.string().trim().max(500),
  })
  .strict();
/** Never trust a guest's price, selection, shipping address or registry quantity. */
export async function registryCheckout(db: DB, raw: unknown) {
  const gift = giftRequest.parse(raw);
  const r = await db
    .prepare("SELECT * FROM mimipip_registries WHERE id=?")
    .bind(gift.code)
    .first<RegistryRow>();
  if (!r || r.closed) throw Error("This registry is closed or unavailable.");
  const i = await db
    .prepare(
      "SELECT * FROM mimipip_registry_items WHERE id=? AND registry_id=?",
    )
    .bind(gift.itemId, gift.code)
    .first<ItemRow>();
  if (!i) throw Error("This gift is no longer available.");
  return {
    lines: [JSON.parse(i.selection)],
    customer: JSON.parse(r.delivery),
    registry: { ...gift, quantity: 1 },
  };
}
export function privateOrderCustomer(order: {
  customer: string;
  fulfilment?: string;
}) {
  const f = JSON.parse(order.fulfilment || "{}");
  return f.registry
    ? { name: f.registry.name, email: f.registry.email }
    : JSON.parse(order.customer);
}
/** A failed/abandoned payment does not count as a gift. Only release after the gateway reports no attempts. */
export async function releaseRegistryOrders(
  db: DB,
  call: (path: string) => Promise<any>,
  now = Date.now(),
) {
  // No payment window can have been returned while the order is still creating.
  // Conditional deletion cannot race a successfully published pending order.
  await db
    .prepare(
      "DELETE FROM mimipip_orders WHERE status='creating' AND razorpay_order_id IS NULL AND json_extract(fulfilment,'$.registry.itemId') IS NOT NULL AND created_at<?",
    )
    .bind(now - 5 * 60000)
    .run();
  const rows = await db
    .prepare(
      "SELECT id,razorpay_order_id FROM mimipip_orders WHERE json_extract(fulfilment,'$.registry.itemId') IS NOT NULL AND status='pending' AND created_at<? LIMIT 25",
    )
    .bind(now - 90 * 60000)
    .all<{ id: string; razorpay_order_id: string }>();
  for (const o of rows.results) {
    try {
      const p = await call("orders/" + o.razorpay_order_id + "/payments");
      if (Array.isArray(p?.items) && p.items.length === 0)
        await db
          .prepare(
            "UPDATE mimipip_orders SET status='expired',updated_at=? WHERE id=? AND status='pending'",
          )
          .bind(now, o.id)
          .run();
    } catch {
      /* Retain the reservation when the gateway is uncertain. */
    }
  }
}
