import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { orderNosAtPrinter, partnerMayRequestCancel } from "./cancel-window";

const none = new Set<string>();

test("ZVY-20516: printed on 25 October, the link is gone", () => {
  const row = { status: "in_production", os_order_id: 506, os_print_order_no: "ZVY-20516" };
  const os = { printStatus: "queued_for_print", printOrderNo: "ZVY-20516", printingAt: "2026-10-25T02:50:00Z", printedAt: "2026-10-25T03:17:00Z" };
  assert.equal(partnerMayRequestCancel(row, os, new Set(["ZVY-20516"])), false);
  // Even if the engine read missed it, the OS's own dates say so.
  assert.equal(partnerMayRequestCancel(row, os, none), false);
});

test("the engine holding the wall is enough, whatever the OS says", () => {
  const row = { status: "in_production", os_order_id: 7, os_print_order_no: "ZVY-30001" };
  assert.equal(partnerMayRequestCancel(row, { printStatus: "awaiting_batch" }, new Set(["ZVY-30001"])), false);
  // The OS knows the number before our row has learned it.
  assert.equal(partnerMayRequestCancel({ ...row, os_print_order_no: null }, { printStatus: "awaiting_batch", printOrderNo: "ZVY-30001" }, new Set(["ZVY-30001"])), false);
});

test("sent to the engine (queued_for_print) counts as at the printer", () => {
  const row = { status: "in_production", os_order_id: 8, os_print_order_no: "ZVY-30002" };
  assert.equal(partnerMayRequestCancel(row, { printStatus: "queued_for_print" }, none), false);
  assert.equal(partnerMayRequestCancel(row, { printStatus: "needs_input" }, none), false);
  assert.equal(partnerMayRequestCancel(row, { printStatus: "something_new" }, none), false);
});

test("before the hand-off, with proof, it may be asked", () => {
  const row = { status: "in_production", os_order_id: 9, os_print_order_no: null };
  for (const s of ["awaiting_payment", "awaiting_po", "awaiting_credit_approval", "reviewing", "awaiting_batch"]) {
    assert.equal(partnerMayRequestCancel(row, { printStatus: s }, none), true, s);
  }
  // Never pushed to production at all: nothing can be at the printer.
  assert.equal(partnerMayRequestCancel({ status: "submitted", os_order_id: null }, undefined, none), true);
});

test("no proof, no link: the OS silent, or the engine check failed", () => {
  const pushed = { status: "in_production", os_order_id: 10, os_print_order_no: null };
  assert.equal(partnerMayRequestCancel(pushed, undefined, none), false);
  assert.equal(partnerMayRequestCancel(pushed, null, none), false);
  assert.equal(partnerMayRequestCancel({ status: "submitted", os_order_id: null }, undefined, null), false);
});

test("already asked, answered, or finished: nothing to offer", () => {
  const os = { printStatus: "awaiting_payment" };
  assert.equal(partnerMayRequestCancel({ os_order_id: 1, cancel_requested_at: "2026-10-25T00:00:00Z" }, os, none), false);
  assert.equal(partnerMayRequestCancel({ os_order_id: 1, cancel_outcome: "declined" }, os, none), false);
  for (const status of ["cancelled", "dispatched", "installed", "closed", "archived"]) {
    assert.equal(partnerMayRequestCancel({ status, os_order_id: 1 }, os, none), false, status);
  }
});

test("the engine read fails loudly and reads either response shape", async () => {
  const sb = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) }) as never;
  assert.deepEqual([...await orderNosAtPrinter(sb(["ZVY-1"]), ["ZVY-1", "ZVY-2"])], ["ZVY-1"]);
  assert.deepEqual([...await orderNosAtPrinter(sb([{ order_nos_at_printer: "ZVY-2" }]), ["ZVY-2"])], ["ZVY-2"]);
  assert.deepEqual([...await orderNosAtPrinter(sb(null, { message: "boom" }), [null, ""])], []);
  await assert.rejects(orderNosAtPrinter(sb(null, { message: "permission denied" }), ["ZVY-1"]));
});

test("the page shows the link only on the server's yes", () => {
  const page = readFileSync(new URL("../app/partners/[slug]/orders/dashboard.tsx", import.meta.url), "utf8");
  assert.match(page, /o\.canRequestCancel === true/);
  assert.doesNotMatch(page, /!o\.os\?\.dispatchedAt && !o\.cancel_requested_at/);
});

test("the migration guards every retail cancel path", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261025052835_no_cancel_once_at_printer.sql", import.meta.url), "utf8");
  for (const fn of ["cancel_order_by_token", "concierge_cancel_order"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, body.indexOf("$function$;")), /retail_order_at_printer\(o\.id\)/, fn);
  }
  for (const fn of ["order_by_token", "concierge_order_status"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, body.indexOf("$function$;")), /not public\.retail_order_at_printer\(o\.id\)/, fn);
  }
  // "ZVY-2051" must never match "ZVY-20516": the separator is required.
  assert.match(sql, /in \(n \|\| '_', n \|\| '-'\)/);
  assert.doesNotMatch(sql, /like n \|\| '%'/i);
});
