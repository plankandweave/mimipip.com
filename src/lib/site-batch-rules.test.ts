// The rules a measured store order is shown and released by. Pinned here so
// a prompt edit or a route refactor cannot quietly reopen any of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocatable, autoProposes, awaitsArt, chainStyle, checkIntakeMapping, fitsChain, cityAllows, drawnWalls, orderOrigin, storeCity, storeForBatch, entranceRule, suggestedWalls, suggestionBrief,
  wallsStillOpen, wallsToApprove, wallsWord,
} from "./site-batch-rules";

const walls = [
  { seq: 1, status: "composed", suggested: false },
  { seq: 2, status: "ordered", suggested: false },
  { seq: 3, status: "composed" },                         // pre-column row: undefined = drawn
  { seq: 4, status: "composed", suggested: true },        // Zyvorah's suggestion
];

test("approve all remaining releases the client's walls and never a suggestion", () => {
  assert.deepEqual(wallsToApprove(walls).map((w) => w.seq), [1, 3]);
});

test("a suggested wall is released only when the approver names it", () => {
  assert.deepEqual(wallsToApprove(walls, [4]).map((w) => w.seq), [4]);
  assert.deepEqual(wallsToApprove(walls, [1, 4]).map((w) => w.seq), [1, 4]);
  // Naming an already-ordered wall never orders it twice.
  assert.deepEqual(wallsToApprove(walls, [2]).map((w) => w.seq), []);
});

test("an untaken suggestion does not hold the store open", () => {
  assert.deepEqual(wallsStillOpen(walls).map((w) => w.seq), [1, 3]);
  assert.deepEqual(wallsStillOpen([
    { seq: 1, status: "ordered", suggested: false },
    { seq: 2, status: "composed", suggested: true },
  ]), []);
});

test("drawn and suggested walls partition the batch", () => {
  assert.deepEqual(drawnWalls(walls).map((w) => w.seq), [1, 2, 3]);
  assert.deepEqual(suggestedWalls(walls).map((w) => w.seq), [4]);
});

test("the entrance rule leads with the city only when the survey starts at the door", () => {
  const at = entranceRule(true, "Pune");
  assert.match(at, /THE ENTRANCE IS THE CITY/);
  assert.match(at, /wall 1 is the first wall on your LEFT/);
  const away = entranceRule(false, "Pune");
  assert.match(away, /DOES NOT START AT THE STORE ENTRANCE/);
  assert.match(away, /do not lead wall 1 or the last wall with the Pune collection/);
  assert.doesNotMatch(away, /THE ENTRANCE IS THE CITY/);
});

test("a suggestion is briefed as ours, optional and never an entrance wall", () => {
  const b = suggestionBrief("it is visible through the staircase from the entrance.");
  assert.match(b, /NOT in the client's drawing/);
  assert.match(b, /because it is visible through the staircase from the entrance\b/);
  assert.match(b, /never an entrance wall/);
  assert.match(suggestionBrief(null), /NOT in the client's drawing/);
});

test("intake mapping: several bands on one wall may share its photograph", () => {
  const five = Array.from({ length: 5 }, () => ({ photoIndex: 1, suggested: false }));
  assert.equal(checkIntakeMapping([...five, { photoIndex: 2, suggested: false }], 2), null);
});

test("intake mapping: a drawn wall without a photograph is refused", () => {
  assert.match(checkIntakeMapping([{ photoIndex: null, suggested: false }], 1) ?? "", /matched no photograph/);
});

test("intake mapping: a suggested wall may have no photograph", () => {
  assert.equal(checkIntakeMapping([
    { photoIndex: 1, suggested: false },
    { photoIndex: null, suggested: true },
  ], 1), null);
});

test("intake mapping: an unused or unknown photograph is a mismatch", () => {
  assert.match(checkIntakeMapping([{ photoIndex: 1, suggested: false }], 2) ?? "", /Photograph 2 matched no measured wall/);
  assert.match(checkIntakeMapping([{ photoIndex: 3, suggested: false }], 2) ?? "", /photograph 3, which was not uploaded/);
  assert.match(checkIntakeMapping([], 1) ?? "", /no walls/);
});


test("a design tagged with the store's state is local to it", () => {
  // Gujarat Collection is tagged "Gujarat"; the Narol store's city is Ahmedabad.
  assert.equal(cityAllows("Gujarat", { city: "Ahmedabad", state: "Gujarat" }), true);
  assert.equal(cityAllows("Gujarat", { city: "Mumbai", state: "Maharashtra" }), false);
});

test("spellings of one city are one city", () => {
  assert.equal(cityAllows("Bangalore", { city: "Bengaluru", state: "Karnataka" }), true);
  assert.equal(cityAllows("Bombay", { city: "Mumbai", state: "Maharashtra" }), true);
});

test("untagged designs go anywhere; another city's never does", () => {
  assert.equal(cityAllows(null, { city: "Ahmedabad", state: "Gujarat" }), true);
  assert.equal(cityAllows("Pune", { city: "Ahmedabad", state: "Gujarat" }), false);
  assert.equal(cityAllows("Pune", { city: storeCity("Bhosari, Pune"), state: "Maharashtra" }), true);
});

test("a held batch composes but is never proposed by the pipeline", () => {
  const fresh = { proposed_at: null, email_error: null, revision: 1, proposed_revision: null };
  assert.equal(autoProposes(fresh), true);
  assert.equal(autoProposes({ ...fresh, hold_proposal: false }), true);
  assert.equal(autoProposes({ ...fresh, hold_proposal: true }), false);
  assert.equal(autoProposes({ ...fresh, email_error: "bounced", hold_proposal: true }), false);
  // Unheld: a sent revision is not re-sent; a newer one is.
  const sent = { proposed_at: "2026-10-13T10:00:00Z", email_error: null, revision: 1, proposed_revision: 1 };
  assert.equal(autoProposes(sent), false);
  assert.equal(autoProposes({ ...sent, revision: 2 }), true);
});

test("a pinned wall is left alone by a whole-store allocation, not by a named one", () => {
  const pinned = { seq: 9, context_json: { pinned: true } };
  const free = { seq: 3, context_json: null };
  assert.equal(allocatable(pinned), false);
  assert.equal(allocatable(free), true);
  assert.equal(allocatable(pinned, [9]), true);
  assert.equal(allocatable(free, [9]), false);
});

test("a wall awaiting its artwork is not composed", () => {
  assert.equal(awaitsArt({ context_json: { pinned: true, awaitingArt: true } }), true);
  assert.equal(awaitsArt({ context_json: { pinned: true } }), false);
  assert.equal(awaitsArt({ context_json: null }), false);
});

test("a chain keeps only designs the composer will keep (Nelamangala front wall, 13 Oct 2026)", () => {
  const blocks = { floorY: 0.8, subjects: [{ x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.8 }], style: "blocks" as const };
  const scene = { floorY: 0.82, subjects: [{ x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.8 }], style: "scene" as const };
  const flatLay = { floorY: null, subjects: [{ x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.8 }], style: "blocks" as const };
  const lowFloor = { floorY: 0.6, subjects: [{ x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.6 }], style: "blocks" as const };
  assert.equal(fitsChain(blocks, 2, "blocks", 0.845), true);
  assert.equal(fitsChain(scene, 2, "blocks", 0.845), false, "a scene beside blocks is dropped");
  assert.equal(fitsChain(flatLay, 2, null, 0.845), false, "a flat lay cannot stand in a band");
  assert.equal(fitsChain(lowFloor, 2, "blocks", 0.845), false, "a floor at 0.60 needs >1.25x to reach 0.845");
  const tallTip = { floorY: 0.87, subjects: [{ x0: 0.1, x1: 0.2, y0: 0.3, y1: 0.87 }, { x0: 0.5, x1: 0.6, y0: 0.06, y1: 0.87 }], style: "blocks" as const };
  assert.equal(fitsChain(tallTip, 2, "blocks", 0.845), false, "a stick vacuum whose head would touch the top edge is never allocated");
  assert.equal(fitsChain(undefined, 2, "blocks", 0.845), true, "unmeasured designs are judged when they compose");
  assert.equal(chainStyle(["scene", "blocks", null]), "blocks");
  assert.equal(chainStyle([null, undefined]), null);
});

test("fitsChain never allocates a stacked design to a band (Nelamangala, 14 October 2026)", async () => {
  const { fitsChain } = await import("./site-batch-rules");
  const stacked = { floorY: 0.85, style: "blocks" as const, subjects: [
    { x0: 0.74, x1: 0.94, y0: 0.12, y1: 0.44 }, { x0: 0.73, x1: 0.92, y0: 0.59, y1: 0.85 },
  ] };
  const row = { floorY: 0.85, style: "blocks" as const, subjects: [
    { x0: 0.1, x1: 0.4, y0: 0.2, y1: 0.85 }, { x0: 0.5, x1: 0.9, y0: 0.2, y1: 0.85 },
  ] };
  assert.equal(fitsChain(stacked, 2, null, 0.85), false);
  assert.equal(fitsChain(row, 2, null, 0.85), true);
});

test("a store order says who sent it, never one of our own mailboxes as the measurer", () => {
  // Narsingi, 23 October 2026: Amit's WhatsApp, keyed in by Roheena.
  assert.equal(orderOrigin({ received_from: "Amit, Vijay Sales (WhatsApp, 22 Oct 2026)", created_by: "roheena@plankandweave.com", source: "staff_import" }),
    "Order received from Amit, Vijay Sales (WhatsApp, 22 Oct 2026)");
  assert.equal(orderOrigin({ created_by: "roheena@plankandweave.com", source: "staff_import" }), null);
  assert.equal(orderOrigin({ created_by: "hello@zyvorah.com", source: "calculator" }), null);
  assert.equal(orderOrigin({ created_by: "os-bridge", source: "calculator" }), null);
  // Ghatkopar, 12 Sep 2026: our own WhatsApp intake, written as a named mailbox.
  assert.equal(orderOrigin({ created_by: "WhatsApp attachment intake <hello@zyvorah.com>", source: "measure_link" }), null);
  assert.equal(orderOrigin({ created_by: "amit@vijaysales.com", source: "staff_import" }), "Order received from amit@vijaysales.com");
  // A store link or a surveyor really did measure the walls.
  assert.equal(orderOrigin({ created_by: "Vinod (store manager)", source: "measure_link" }), "Measured on site by Vinod (store manager)");
  assert.equal(orderOrigin({ created_by: "Sagar", source: "calculator" }), "Measured on site by Sagar");
});

test("one wall is a wall", () => {
  assert.equal(wallsWord(1), "1 wall");
  assert.equal(wallsWord(15), "15 walls");
});

test("a batch with no store link finds the one saved store its title names", () => {
  const ebd = { id: "ebd", name: "Gurgaon - Sector 89 EBD", state: "Haryana" };
  const s84 = { id: "s84", name: "Gurgaon - Sector 84", state: "Haryana" };
  const batch = {
    title: "EBD Gurgaon — Sector 89 — Series 2 Electronics",
    ship_address: "Vijay Sales, EBD Gurgaon, Sector 89, Gurgaon, Haryana",
    ship_city: "Gurgaon", state: "Haryana",
  };
  assert.equal(storeForBatch(batch, [ebd, s84])?.id, "ebd");
  // Gurugram and Gurgaon are one city.
  assert.equal(storeForBatch(batch, [{ ...ebd, name: "Gurugram - Sector 89 EBD" }])?.id, "ebd");
  // Another state's store of the same name is not this one.
  assert.equal(storeForBatch(batch, [{ ...ebd, state: "Delhi" }]), null);
  // Two stores that both qualify: no guess.
  assert.equal(storeForBatch({ ...batch, title: "Gurgaon" }, [{ id: "a", name: "Gurgaon", state: "Haryana" }, { id: "b", name: "Gurgaon", state: "Haryana" }]), null);
  // A store whose name is not in the batch is not matched.
  assert.equal(storeForBatch(batch, [s84]), null);
});
