import test from "node:test";
import assert from "node:assert/strict";
import { actuallySent } from "./brief-claim-proof";
import { classifySections, filingSource } from "./briefing-rules";

const filed = "2026-10-03T00:38:47.850Z";
const morning = new Date("2026-10-03T02:30:45Z");
const delivered = { provider: "gmail" as const, verification: "message-read" as const, contentMatchesClaim: true as const,
  entity: "IILM", claim: "updated-deck", messageId: "1a0ffcfbf91dc992", labelIds: ["SENT"],
  internalDate: "2026-10-03T03:30:00Z", observedAt: "2026-10-03T03:30:01Z" };
const crm = { key: "crm", filed_for: "2026-10-03", updated_at: filed,
  headline: "IILM has the brighter deck — last word is ours",
  body_html: '<p>IILM University — you sent Parul the updated deck. Their move now.</p>', source: "crm" };
const classify = (r: object) => classifySections([r], "2026-10-03", morning);

test("Oct 3 09:00 future scheduled record is not Sent at the 08:00 brief", () => {
  assert.equal(actuallySent(delivered, morning), false);
  for (const labelIds of [[], ["SCHEDULED"], ["DRAFT"], ["SENT", "SCHEDULED"], ["SENT", "DRAFT"]]) {
    assert.equal(actuallySent({ ...delivered, labelIds }, new Date("2026-10-03T05:00:00Z")), false);
  }
});
test("an elapsed scheduled timestamp without SENT still is not delivery", () => {
  assert.equal(actuallySent({ ...delivered, labelIds: [] }, new Date("2026-10-03T05:00:00Z")), false);
});
test("actual SENT with valid internal and observation times qualifies only after observation", () => {
  assert.equal(actuallySent(delivered, new Date("2026-10-03T03:30:01Z")), true);
  assert.equal(actuallySent({ ...delivered, internalDate: "invalid" }, morning), false);
  assert.equal(actuallySent({ ...delivered, observedAt: "2026-10-02T23:00:00Z" }, morning), false);
});
test("actual incident CRM body and headline are withheld without delivery proof", () => {
  const result = classify(crm);
  assert.equal(result.sections.length, 1);
  assert.match(result.sections[0].bodyHtml!, /scheduled record.*does not establish Sent/);
  assert.doesNotMatch(result.sections[0].bodyHtml!, /you sent Parul/);
  assert.match(result.sections[0].headline!, /Sent claim held/);
});
test("future SENT evidence cannot verify a claim filed before it was sent", () => {
  const source = JSON.stringify({ kind: "brief-evidence-v1", source: "Gmail", mailDeliveries: [delivered] });
  assert.match(classify({ ...crm, source }).sections[0].headline!, /Sent claim held/);
});
test("verified pre-filing delivery permits CRM prose; scheduled-only prose remains readable", () => {
  const proof = { ...delivered, internalDate: "2026-10-02T23:00:00Z", observedAt: "2026-10-03T00:00:00Z" };
  const source = JSON.stringify({ kind: "brief-evidence-v1", source: "Gmail", observedAt: proof.observedAt, mailDeliveries: [proof] });
  assert.equal(classify({ ...crm, source }).sections[0].bodyHtml, crm.body_html);
  assert.equal(classify({ ...crm, headline: "IILM email scheduled for 09:00; delivery pending", body_html: null }).sections.length, 1);
});
test("missing print evidence cannot imply unprinted or recommend physical replay", () => {
  for (const body_html of [
    "Vijay Sales ZVY-10663 is still unprinted. Recommendation: re-send ZVY-10663.",
    "VS-000060 has no printedAt/output; not printed. Render one panel at a time.",
    "ZVY-10663: retry the paid order at the printer.",
  ]) {
    const result = classify({ key: "night-patrol", filed_for: "2026-10-03", updated_at: filed, body_html });
    assert.equal(result.sections.length, 1);
    assert.match(result.sections[0].bodyHtml!, /owner no-reprint hold.*QC or POD/);
    assert.notEqual(result.sections[0].bodyHtml, body_html);
  }
});
test("physical evidence hold and unrelated patrol facts remain readable", () => {
  assert.equal(classify({ key: "night-patrol", filed_for: "2026-10-03", updated_at: filed,
    body_html: "VS-000060 / ZVY-10663: print, QC and POD evidence unknown; owner hold remains. Site healthy." }).sections.length, 1);
});
test("PR656 Google provenance gate is preserved", () => {
  const r = { key: "google-ads", filed_for: "2026-10-03", updated_at: filed, headline: "All paused", source: "legacy" };
  assert.equal(classify(r).sections.length, 0);
  assert.equal(classify({ ...r, source: filingSource("account", "2026-10-03T00:00:00Z") }).sections.length, 1);
});
