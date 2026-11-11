// The OS → website installed-wall contract: auth, consent scope, product
// check, size, idempotent replace, and idempotent takedown — against an
// in-memory store, the same decision path the route runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  handleIntake,
  handleTakedown,
  installedMonthOf,
  MAX_IMAGE_BYTES,
  type InstalledWallRow,
  type IntakeDeps,
  formatInstalledMonth,
} from "./installed-walls-intake";

const SECRET = "s3cret-token";

function fakeDeps(activeHandles = ["forest-mural"]) {
  const rows = new Map<number, InstalledWallRow>();
  const objects = new Map<string, Uint8Array>();
  let bumps = 0;
  let clock = Date.parse("2026-09-30T06:00:00Z");
  const deps: IntakeDeps = {
    secret: SECRET,
    now: () => new Date((clock += 1000)),
    publicUrl: (key) => `https://zyvorah.com/media/${key}`,
    productIsActive: async (h) => activeHandles.includes(h),
    findByOrder: async (id) => rows.get(id) ?? null,
    upsert: async (row) => {
      const id = rows.get(row.os_order_id)?.id ?? `row-${row.os_order_id}`;
      rows.set(row.os_order_id, { ...row, id });
      return { id };
    },
    markWithdrawn: async (id, at) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, status: "withdrawn", withdrawn_at: at });
    },
    putObject: async (key, bytes) => void objects.set(key, bytes),
    deleteObjects: async (keys) => keys.forEach((k) => objects.delete(k)),
    bumpCache: async () => void bumps++,
  };
  return { deps, rows, objects, bumps: () => bumps };
}

let jpegB64: string;
async function jpeg(): Promise<string> {
  jpegB64 ??= (
    await sharp({ create: { width: 16, height: 16, channels: 3, background: "green" } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "18/1 31/1 0/1" } })
      .toBuffer()
  ).toString("base64");
  return jpegB64;
}

async function payload(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    osOrderId: 4242,
    productHandle: "forest-mural",
    city: "Pune",
    installedAt: "2026-09-14T10:30:00+05:30",
    scope: ["site", "social"],
    approvedAt: "2026-09-29T12:00:00Z",
    imageBase64: await jpeg(),
    contentType: "image/jpeg",
    ...over,
  });
}

test("refuses a missing or wrong token, in constant time", async () => {
  const { deps, rows } = fakeDeps();
  assert.equal((await handleIntake(null, await payload(), deps)).status, 401);
  assert.equal((await handleIntake("s3cret-tokeN", await payload(), deps)).status, 401);
  assert.equal((await handleIntake("s3cret", await payload(), deps)).status, 401);
  assert.equal((await handleIntake(SECRET, await payload(), { ...deps, secret: "" })).status, 401, "unset secret refuses all");
  assert.equal((await handleTakedown("nope", JSON.stringify({ osOrderId: 1 }), deps)).status, 401);
  assert.equal(rows.size, 0);
});

test("refuses a photo without website consent", async () => {
  const { deps, rows } = fakeDeps();
  const r = await handleIntake(SECRET, await payload({ scope: ["social"] }), deps);
  assert.equal(r.status, 422);
  assert.equal((await handleIntake(SECRET, await payload({ scope: [] }), deps)).status, 422);
  assert.equal(rows.size, 0);
});

test("refuses a design that is not an active product", async () => {
  const { deps, objects } = fakeDeps();
  const r = await handleIntake(SECRET, await payload({ productHandle: "archived-thing" }), deps);
  assert.equal(r.status, 422);
  assert.equal(objects.size, 0);
});

test("refuses non-JPEG, bad base64 and oversize images", async () => {
  const { deps } = fakeDeps();
  const png = (await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer()).toString("base64");
  assert.equal((await handleIntake(SECRET, await payload({ imageBase64: png }), deps)).status, 422);
  assert.equal((await handleIntake(SECRET, await payload({ contentType: "image/png" }), deps)).status, 422);
  assert.equal((await handleIntake(SECRET, await payload({ imageBase64: "not base64!!" }), deps)).status, 422);
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  assert.equal((await handleIntake(SECRET, await payload({ imageBase64: big.toString("base64") }), deps)).status, 413);
  assert.equal((await handleIntake(SECRET, "{not json", deps)).status, 400);
  assert.equal((await handleIntake(SECRET, await payload({ osOrderId: "4242" }), deps)).status, 422);
  assert.equal((await handleIntake(SECRET, await payload({ city: "" }), deps)).status, 422);
  assert.equal((await handleIntake(SECRET, await payload({ installedAt: "2031-01-01" }), deps)).status, 422);
});

test("stores a stripped JPEG under installed-walls/<order>/, month only, and bumps the cache", async () => {
  const { deps, rows, objects, bumps } = fakeDeps();
  const r = await handleIntake(SECRET, await payload(), deps);
  assert.equal(r.status, 200);
  const row = rows.get(4242)!;
  assert.equal(r.body.id, row.id);
  assert.equal(r.body.url, row.url);
  assert.match(row.r2_key, /^installed-walls\/4242\/after-\d+\.jpg$/);
  assert.equal(row.installed_month, "2026-09-01");
  assert.equal(row.status, "published");
  const stored = objects.get(row.r2_key)!;
  assert.ok(!Buffer.from(stored).includes(Buffer.from("Exif\0", "latin1")), "EXIF stripped before storage");
  assert.equal((await sharp(Buffer.from(stored)).metadata()).exif, undefined);
  assert.equal(bumps(), 1);
});

test("a re-push for the same order replaces the row and deletes the old object", async () => {
  const { deps, rows, objects } = fakeDeps();
  await handleIntake(SECRET, await payload(), deps);
  const first = rows.get(4242)!;
  const r2 = await handleIntake(SECRET, await payload({ city: "Mumbai" }), deps);
  assert.equal(r2.status, 200);
  assert.equal(rows.size, 1);
  const second = rows.get(4242)!;
  assert.equal(second.id, first.id);
  assert.equal(second.city, "Mumbai");
  assert.notEqual(second.r2_key, first.r2_key);
  assert.equal(objects.has(first.r2_key), false);
  assert.equal(objects.has(second.r2_key), true);
  assert.equal(objects.size, 1);
});

test("takedown is idempotent: nothing stored, once, and twice", async () => {
  const { deps, rows, objects, bumps } = fakeDeps();
  const none = await handleTakedown(SECRET, JSON.stringify({ osOrderId: 999 }), deps);
  assert.equal(none.status, 200);

  await handleIntake(SECRET, await payload(), deps);
  const key = rows.get(4242)!.r2_key;
  const once = await handleTakedown(SECRET, JSON.stringify({ osOrderId: 4242 }), deps);
  assert.equal(once.status, 200);
  assert.equal(rows.get(4242)!.status, "withdrawn");
  assert.ok(rows.get(4242)!.withdrawn_at);
  assert.equal(objects.has(key), false);
  const withdrawnAt = rows.get(4242)!.withdrawn_at;

  const twice = await handleTakedown(SECRET, JSON.stringify({ osOrderId: 4242 }), deps);
  assert.equal(twice.status, 200);
  assert.equal(rows.get(4242)!.withdrawn_at, withdrawnAt, "a repeat takedown does not rewrite the record");
  assert.ok(bumps() >= 2);
  assert.equal((await handleTakedown(SECRET, JSON.stringify({ osOrderId: "x" }), deps)).status, 422);
});

test("a re-push after a takedown publishes again (the customer opted back in)", async () => {
  const { deps, rows } = fakeDeps();
  await handleIntake(SECRET, await payload(), deps);
  await handleTakedown(SECRET, JSON.stringify({ osOrderId: 4242 }), deps);
  await handleIntake(SECRET, await payload(), deps);
  assert.equal(rows.get(4242)!.status, "published");
  assert.equal(rows.get(4242)!.withdrawn_at, null);
});

test("month is taken in India time and shown as 'September 2026'", () => {
  assert.equal(installedMonthOf(new Date("2026-09-30T20:00:00Z")), "2026-10-01", "1:30 am IST on 1 Oct");
  assert.equal(installedMonthOf(new Date("2026-09-01T00:00:00+05:30")), "2026-09-01");
  assert.equal(formatInstalledMonth("2026-09-01"), "September 2026");
  assert.equal(formatInstalledMonth("garbage"), null);
});
