import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { presentBriefProse } from "./brief-presentation";
import { classifySections, filingSource } from "./briefing-rules";
import { actuallySent, type MailDeliveryEvidence } from "./brief-claim-proof";

const cutoff = new Date("2026-10-04T02:30:59Z");
const present = (bodyHtml: string, key = "day-watch", source: unknown = "day-watch", headline: string | null = null) =>
  presentBriefProse({ key, bodyHtml, headline, source, cutoff });
const proof: MailDeliveryEvidence = { provider: "gmail", verification: "message-read", contentMatchesClaim: true,
  entity: "IILM", claim: "updated-deck", messageId: "1a0ffcfbf91dc992", labelIds: ["SENT"],
  internalDate: "2026-10-03T03:30:00Z", observedAt: "2026-10-04T00:30:00Z" };

test("IILM claim needs exact message-read provenance, preserves unrelated CRM facts", () => {
  const body = '<p>Mail read: 97 messages; no new customer reply.</p><p>IILM University: the brighter deck and updated video went out on 3 Oct. The next move is theirs.</p><p>One unrelated bounce needs review.</p>';
  const held = present(body, "crm", "crm");
  assert.match(held.bodyHtml!, /IILM Sent claim held/);
  assert.doesNotMatch(held.bodyHtml!, /went out on 3 Oct/);
  assert.match(held.bodyHtml!, /97 messages|One unrelated bounce/);
  assert.match(held.bodyHtml!, /not proof that the email was not sent/);
  const source = filingSource("Gmail message read", proof.observedAt, [proof]);
  assert.equal(present(body, "crm", source).bodyHtml, body);
  assert.equal(actuallySent({ ...proof, provider: "prose" }, cutoff), false);
  assert.equal(actuallySent({ ...proof, verification: "thread-membership" }, cutoff), false);
  assert.equal(actuallySent({ ...proof, contentMatchesClaim: false }, cutoff), false);
  assert.equal(actuallySent({ ...proof, observedAt: "2026-10-05T00:00:00Z" }, cutoff), false);
  assert.equal(actuallySent({ ...proof, labelIds: ["SCHEDULED"] }, cutoff), false);
});

test("filing helper carries and preserves explicit metadata, never invents observation time", () => {
  const source = filingSource("Gmail", undefined, [proof])!;
  assert.equal(JSON.parse(source).observedAt, undefined);
  assert.deepEqual(JSON.parse(source).mailDeliveries, [proof]);
  assert.deepEqual(JSON.parse(filingSource(source, "2026-10-04T00:35:00Z")!).mailDeliveries, [proof]);
  assert.equal(filingSource("crm"), "crm");
});

test("filed Ads/DB evidence holds stay visible and distinct from absent agents", () => {
  const r = classifySections([{ key: "google-ads", filed_for: "2026-10-04", updated_at: "2026-10-04T01:19:46Z", headline: "A report was filed", source: "google-ads" }], "2026-10-04", cutoff);
  assert.equal(r.missing.find(s => s.key === "google-ads")?.state, "evidence-held");
  assert.equal(r.missing.find(s => s.key === "crm")?.state, undefined);
});

test("cached Vapi setup prose becomes a configuration status without activation directions", () => {
  const old = 'VAPI_PHONE_NUMBER_ID not set — import the calling number in Vapi (Phone Numbers) and set its id as a Worker secret';
  const result = present(`<p>No calls were placed. ${old}.</p>`, "call-followups", "voice-followups cron", `AI follow-up calls are not running: ${old}`);
  assert.match(result.bodyHtml!, /no outbound calling number is configured/);
  assert.doesNotMatch(result.bodyHtml! + result.headline, /import the calling number|Worker secret/);
  const producer = readFileSync(new URL('./voice-followup.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(producer, /add the Vapi private key as a Worker secret|import the calling number in Vapi|add zyvorah-ops to d1_databases/);
});

test("email renders evidence-held label and paid provenance from the shared helper", () => {
  const route = readFileSync(new URL('../app/api/cron/daily-report/route.ts', import.meta.url), 'utf8');
  const decisions = readFileSync(new URL('./brief-decisions.ts', import.meta.url), 'utf8');
  assert.match(decisions, /s\.state === "evidence-held" \? "Filed, but evidence is held" : "Report unavailable"/);
  assert.match(route, /esc\(paidChannelProvenance\(a\)\)/);
  const store = readFileSync(new URL('./briefing.ts', import.meta.url), 'utf8');
  assert.match(store, /filingSource\(input\.source, input\.observedAt, input\.mailDeliveries\)/);
});

test("a customer named in one paragraph does not absorb unrelated later CRM facts", () => {
  const r = present('<p>IILM: brighter deck went out yesterday.</p><p>72 outreach emails were sent yesterday.</p>', 'crm', 'crm');
  assert.match(r.bodyHtml!, /72 outreach emails were sent yesterday/);
  assert.doesNotMatch(r.bodyHtml!, /brighter deck went out yesterday/);
});

test("a clear different customer resets same-block CRM subject context", () => {
  const body = '<p>IILM: meeting on Thursday. Acme: proposal sent.</p>';
  assert.equal(present(body, 'crm', 'crm').bodyHtml, body);
});

test("email and delivery labels cannot clear an IILM topic", () => {
  for (const label of ['Email', 'Delivery', 'Message']) {
    const r = present(`<h3>IILM</h3><p>${label}: The updated deck was sent.</p>`, 'crm', 'crm');
    assert.equal(r.held, true);
    assert.match(r.bodyHtml!, /IILM Sent claim held/);
    assert.doesNotMatch(r.bodyHtml!, /The updated deck was sent/);
  }
});

// Protected-order free-form evidence is now intentionally withheld as a whole
// unit; its contract and incident cases live in brief-order-hold.test.ts.
test("negative Sent remains factual", () => {
  const pending = '<p>IILM: email not sent; delivery pending.</p>';
  assert.equal(present(pending, 'crm', 'crm').bodyHtml, pending);
});

test("unrelated afternoon-watch omission diagnosis still requires evidence", () => {
  const body = '<p>Website: home and checkout 200.</p><p>The brief left out two sections that had been filed: store-db and google-ads. The likely cause is freshness or date rule, so one more silent failure.</p>';
  const r = present(body, 'day-watch', 'day-watch', 'The brief dropped two sections that had been filed');
  assert.match(r.bodyHtml!, /Website: home and checkout 200/);
  assert.match(r.bodyHtml!, /Filing alone does not establish a freshness\/date bug/);
  assert.doesNotMatch(r.bodyHtml!, /one more silent failure/);
  assert.doesNotMatch(r.headline!, /dropped two sections/);
});

test("IILM headline supplies the subject for an implicit delivery claim", () => {
  const r = present('<p>The deck was sent at 09:00; their move now.</p>', 'crm', 'crm', 'IILM updated deck');
  assert.equal(r.held, true);
  assert.match(r.bodyHtml!, /IILM Sent claim held/);
  assert.doesNotMatch(r.bodyHtml!, /The deck was sent/);
});
