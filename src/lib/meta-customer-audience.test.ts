import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { metaAudienceCsv } from "./meta-customer-audience";
import { readBrowseTime, SIGN_IN_DWELL_MS } from "./signin-timing";

test("Meta export hashes valid emails, preserves Gmail dots, and deduplicates", () => {
  const { csv, count } = metaAudienceCsv([
    { email: " A.B@gmail.com " }, { email: "a.b@gmail.com" },
    { email: "ab@gmail.com" }, { email: null }, { email: "bad" },
    { email: "bad\naddress@example.com" },
  ]);
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  assert.equal(csv, `email\n${hash("a.b@gmail.com")}\n${hash("ab@gmail.com")}\n`);
  assert.equal(count, 2);
  assert.ok(!csv.includes("@"));
});

test("empty Meta export contains no hashed placeholders", () => {
  assert.deepEqual(metaAudienceCsv([{ email: "" }]), { csv: "email\n", count: 0 });
});

test("browsing progress survives navigation and corrupt storage cannot skip the 30-second wait", () => {
  assert.equal(SIGN_IN_DWELL_MS - readBrowseTime("12000"), 18000);
  for (const value of [null, "NaN", "Infinity", "-500", "broken"]) assert.equal(readBrowseTime(value), 0);
  assert.equal(readBrowseTime("35000"), SIGN_IN_DWELL_MS);
});
