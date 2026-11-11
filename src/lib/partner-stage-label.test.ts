import assert from "node:assert/strict";
import { test } from "node:test";
import { labelFor, settledStatus, type OsStageFacts } from "./partner-stage-label";
import { groupBoardOrders, type BoardOrder } from "./partner-order-board";

const os: OsStageFacts = { printStatus: "processed", stage: "received", dispatchedAt: null, labelReleasedAt: null, archivedAt: null };

test("a wall the OS finished without a dispatch date is never shown as rendering", () => {
  assert.equal(labelFor({ ...os, printStatus: "cancelled" }, "delivered"), "Cancelled");
  for (const stage of ["dispatched", "install_scheduled", "installed", "closed"]) {
    assert.equal(labelFor({ ...os, stage }, "delivered"), "Dispatched");
  }
  assert.equal(labelFor({ ...os, archivedAt: "2026-08-30T10:00:00Z" }, "delivered"), "Closed");
  assert.equal(labelFor({ ...os, archivedAt: "2026-08-30T10:00:00Z", dispatchedAt: "2026-08-29T10:00:00Z" }, "delivered"), "Dispatched");
});

test("live production states keep their labels", () => {
  assert.equal(labelFor(os, "delivered"), "Rendering");
  assert.equal(labelFor({ ...os, printStatus: "queued_for_print" }, ""), "Pending printing");
  assert.equal(labelFor({ ...os, printStatus: "printed" }, ""), "Printing complete");
  assert.equal(labelFor({ ...os, printStatus: "printed", labelReleasedAt: "2026-08-29" }, ""), "Awaiting pickup");
  assert.equal(labelFor({ ...os, printStatus: "awaiting_payment" }, ""), "Awaiting payment");
  assert.equal(labelFor(undefined, "draft"), "Draft");
});

test("a site job whose last wall the OS closed or archived leaves In production", () => {
  const wall = (key: string, o: OsStageFacts): BoardOrder => ({ key, ref: key, name: "Wall", po: null, group: "VSG-MT2SCQDY",
    osId: null, batch: null, width: null, height: null, stage: labelFor(o, "delivered"), attention: null,
    createdAt: "2026-08-21", dispatchedAt: o.dispatchedAt, courier: null, pod: null, trackingUrl: null, location: "Pune", fromDesk: false });
  const rows = [wall("ZVY-10688", { ...os, dispatchedAt: "2026-08-29" }), wall("ZVY-10667", { ...os, printStatus: "cancelled" }),
    wall("ZVY-10670", { ...os, stage: "closed" }), wall("ZVY-10675", { ...os, archivedAt: "2026-09-01" })];
  assert.equal(groupBoardOrders(rows)[0].lane, "archive");
  assert.equal(groupBoardOrders([...rows, wall("ZVY-10680", os)])[0].lane, "production");
});

test("a finished wall is remembered on our row, a live one is not", () => {
  assert.equal(settledStatus({ ...os, dispatchedAt: "2026-08-29" }), "delivered");
  assert.equal(settledStatus({ ...os, stage: "installed" }), "delivered");
  assert.equal(settledStatus({ ...os, archivedAt: "2026-09-01" }), "delivered");
  assert.equal(settledStatus({ ...os, printStatus: "cancelled" }), "cancelled");
  assert.equal(settledStatus({ ...os, printStatus: "queued_for_print", stage: "printing" }), null);
  assert.equal(settledStatus({ ...os, printStatus: "printed", labelReleasedAt: "2026-10-24" }), null);
  assert.equal(settledStatus(undefined), null);
});

test("when the OS does not answer, finished walls stay out of In production", () => {
  // Vijay Sales, 25 Oct 2026: a read without the OS put all 102 walls under In production.
  assert.equal(labelFor(undefined, "delivered"), "Dispatched");
  assert.equal(labelFor(undefined, "cancelled"), "Cancelled");
  assert.equal(labelFor(undefined, "in_production"), "Received");
  const wall = (key: string, status: string): BoardOrder => ({ key, ref: key, name: "Wall", po: null, group: "VSG-MT2SCQDY",
    osId: null, batch: null, width: null, height: null, stage: labelFor(undefined, status), attention: null,
    createdAt: "2026-08-21", dispatchedAt: null, courier: null, pod: null, trackingUrl: null, location: "Pune", fromDesk: false });
  assert.equal(groupBoardOrders([wall("ZVY-10688", "delivered"), wall("ZVY-10667", "cancelled")])[0].lane, "archive");
  assert.equal(groupBoardOrders([wall("ZVY-20516", "in_production")])[0].lane, "production");
});

test("the courier's delivered scan reads Delivered and is finished", () => {
  const delivered = { ...os, printStatus: "dispatched", dispatchedAt: "2026-10-24T09:00:00Z", deliveredAt: "2026-10-25T11:05:00Z" };
  assert.equal(labelFor(delivered, "in_production"), "Delivered");
  assert.equal(settledStatus(delivered), "delivered");
  assert.equal(labelFor({ ...delivered, deliveredAt: null }, ""), "Dispatched");
  const row: BoardOrder = { key: "ZVY-20515", ref: "ZVY-20515", name: "Behind cash counter", po: null, group: null,
    osId: null, batch: null, width: null, height: null, stage: "Delivered", attention: null,
    createdAt: "2026-10-23", dispatchedAt: null, courier: null, pod: null, trackingUrl: null, location: "Hyderabad", fromDesk: false };
  assert.equal(groupBoardOrders([row])[0]!.lane, "archive");
});
