import assert from "node:assert/strict";
import test from "node:test";
import { partnerReturnPath } from "./partner-return";

test("a store approval link returns to that store after sign-in", () => {
  assert.equal(
    partnerReturnPath("site-batches/0B6A2C1E-1111-4222-8333-944455556666"),
    "site-batches/0b6a2c1e-1111-4222-8333-944455556666",
  );
  assert.equal(partnerReturnPath("documents"), "documents");
  assert.equal(partnerReturnPath("vault"), "vault");
});

test("anything else is refused, so the sign-in page is never an open redirect", () => {
  for (const bad of [
    undefined, ["documents"], "", "orders", "//evil.example", "https://evil.example",
    "site-batches/", "site-batches/not-a-uuid", "site-batches/../../admin",
    "site-batches/0b6a2c1e-1111-4222-8333-944455556666/../x",
  ]) assert.equal(partnerReturnPath(bad), null, String(bad));
});
