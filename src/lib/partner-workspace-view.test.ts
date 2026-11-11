import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitOptionsByArchive,
  stripPriceForNonPurchasing,
} from "@/lib/partner-workspace-view";

// Roheena's rule: a designer (canBuild without canPurchase) must never see
// purchase/cost pricing in this workspace, in the browser or on the wire.
// Only a purchasing-authorized session (canPurchase) may carry a price.

test("stripPriceForNonPurchasing removes price for a non-purchasing session", () => {
  const options = [
    {
      id: "opt-1",
      specification: {
        printName: "Mati",
        materialSlug: "canvas",
        price: { total: 45000 },
      },
    },
  ];
  const out = stripPriceForNonPurchasing(options, false);
  assert.equal("price" in out[0]!.specification, false);
  // Non-price fields survive untouched.
  assert.equal(out[0]!.specification.printName, "Mati");
  assert.equal(out[0]!.specification.materialSlug, "canvas");
});

test("stripPriceForNonPurchasing leaves pricing intact for a purchasing session", () => {
  const options = [
    { id: "opt-1", specification: { price: { total: 45000 } } },
  ];
  const out = stripPriceForNonPurchasing(options, true);
  assert.deepEqual(out[0]!.specification.price, { total: 45000 });
  // Same objects, not defensively copied, when nothing needs to change.
  assert.equal(out, options);
});

test("stripPriceForNonPurchasing does not mutate the source specification", () => {
  const original = { total: 45000 };
  const options = [{ id: "opt-1", specification: { price: original } }];
  stripPriceForNonPurchasing(options, false);
  assert.deepEqual(options[0]!.specification.price, original);
});

test("splitOptionsByArchive keeps draft/accepted options active", () => {
  const options = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ];
  const decisionOf = (id: string) =>
    ({ a: "draft", b: "accepted", c: "draft" })[id]!;
  const { active, archived } = splitOptionsByArchive(options, decisionOf);
  assert.deepEqual(
    active.map((o) => o.id),
    ["a", "b", "c"],
  );
  assert.equal(archived.length, 0);
});

test("splitOptionsByArchive moves rejected and superseded options to the archive", () => {
  const options = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" },
  ];
  const decisionOf = (id: string) =>
    ({ a: "draft", b: "rejected", c: "accepted", d: "superseded" })[id]!;
  const { active, archived } = splitOptionsByArchive(options, decisionOf);
  assert.deepEqual(
    active.map((o) => o.id),
    ["a", "c"],
  );
  assert.deepEqual(
    archived.map((o) => o.id),
    ["b", "d"],
  );
});
