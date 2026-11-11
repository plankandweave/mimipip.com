import test from "node:test";
import assert from "node:assert/strict";
import { briefDecisions, briefGoingWellHtml, briefOverallStatus, briefSalesHeadline, briefTopHtml, oneLine, withoutLifted, type DecisionInput } from "./brief-decisions";
import type { BriefSection } from "./briefing-rules";

test("sales headline distinguishes a failed store read from verified zero and paid orders", () => {
  assert.equal(briefSalesHeadline("query timed out", 0, "₹0"), "Yesterday's sales unknown — store data could not be read");
  assert.equal(briefSalesHeadline(null, 0, "₹0"), "No sales yesterday");
  assert.equal(briefSalesHeadline(null, 1, "₹2,000"), "₹2,000 from 1 order");
  assert.equal(briefSalesHeadline(null, 2, "₹4,000"), "₹4,000 from 2 orders");
});

const input = (sections: BriefSection[] = []): DecisionInput => ({
  briefFor: "2026-10-07", sections, missing: [], orders_paid: 1, abandoned_carts: 0,
  conv7: { sessions: 174, ordersPaid: 1 }, adChannels: { flags: [] },
  social: { available: true, publishedYesterday: 4, awaitingReview: 68, approvedWaiting: 7, failed: 1, blocked: 0, collabsWaiting: 0 },
});
const section = (bodyHtml: string, status: BriefSection["status"] = "amber"): BriefSection => ({
  key: "night-patrol", title: "Overnight patrol", rank: 10, status, headline: "Mixed findings",
  bodyHtml, source: "patrol", filedFor: "2026-10-07", updatedAt: "2026-10-07T01:00:00Z", observedAt: null,
});

test("7 October separates healthy subchecks, resolutions and owner dependencies", () => {
  const rows = briefDecisions(input([section('<p><strong>Status board</strong><br>Website — <strong>green</strong>: checked.<br>Engine — <strong>amber</strong>: queue waiting.</p><p><strong>Needs Roheena (both are top-ups, nothing else)</strong><br>1. Check Anthropic balance.<br>2. Check Replicate balance.</p><p><strong>Fixed overnight</strong><br>• Public access removed. Proof: 401.</p>')]));
  assert.equal(rows.find(r => r.finding.startsWith("Website"))?.status, "green");
  assert.equal(rows.find(r => r.finding.startsWith("Engine"))?.status, "amber");
  assert.equal(rows.find(r => r.finding.startsWith("Public access"))?.status, "green");
  assert.equal(rows.filter(r => r.owner === "Roheena").length, 3); // Two balances plus 68 posts.
  assert.ok(rows.some(r => r.status === "green" && r.finding === "4 posts published yesterday."));
  assert.ok(rows.some(r => r.status === "info" && r.finding.includes("7 posts approved")));
  assert.ok(rows.some(r => r.owner === "Claude Code" && r.finding.includes("1 posts failed")));
  assert.equal(briefOverallStatus(rows), "amber");
});

test("a mixed or unfamiliar report is never declared resolved from the word fixed", () => {
  const rows = briefDecisions(input([section('<p><strong>Not fixed</strong><br>Security exposure remains.</p>')]));
  assert.ok(!rows.some(r => r.status === "green" && r.category === "Technical"));
  assert.ok(rows.some(r => r.owner === "Claude Code" && r.finding.includes("Mixed findings")));
});

test("held evidence and zero orders prevent a green overall result", () => {
  const m = input([section("", "green")]);
  m.social = { ...m.social, awaitingReview: 0, failed: 0 };
  m.orders_paid = 0;
  m.missing = [{ key: "google-ads", title: "Ads", rank: 60, state: "evidence-held", reason: "No observation timestamp" }];
  const rows = briefDecisions(m);
  assert.equal(rows.find(r => r.finding.includes("Filed, but evidence"))?.status, "unknown");
  assert.equal(briefOverallStatus(rows), "amber");
  assert.ok(rows.some(r => r.completion.includes("zero orders alone does not prove")));
});

test("HTML remains text, unknown data is not zero, and suggested work is not claimed running", () => {
  const m = input([section('<p><strong>Needs Roheena</strong><br>&lt;script&gt;unsafe&lt;/script&gt;</p>')]);
  m.conv7 = null;
  m.social.available = false;
  const rows = briefDecisions(m);
  const top = briefTopHtml(rows);
  const html = top.needsYou + top.handling;
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(rows.some(r => r.finding === "Weekly conversion data unavailable." && r.status === "unknown"));
  const incomplete = rows.filter(r => r.status === "unknown");
  assert.ok(incomplete.every(r => r.owner === "Claude Code" && r.action.includes("Roheena: no action now")));
  assert.ok(incomplete.every(r => r.when.includes("Retry not yet confirmed") && r.completion.includes("what was attempted")));
  // An unchecked source is a Claude Code line, never silence and never "done".
  assert.match(top.handling, /Check incomplete — to retry<\/strong> · Weekly conversion data unavailable\./);
  assert.match(top.handling, /never counted as fine/);
  assert.doesNotMatch(html, /\b(?:done|running|completed)\b/i);
  assert.ok(!rows.some(r => r.finding.includes("4 posts published")));
});

test("9 October: Needs you holds only human items, one line each, and nothing is printed twice", () => {
  const ads: BriefSection = { ...section('<p><strong>What I changed:</strong> nothing needed.</p><p><strong>What needs you:</strong><br>1. <strong>Passkey by 15 Oct.</strong> Google Ads is warning that from 15 Oct a passkey is required to manage users, link accounts and do other sensitive actions. Only you can create it.<br>2. <strong>Restart or not.</strong> Nothing restarts unless you say so.</p>'),
    key: "google-ads", title: "Google Ads", headline: "Rs 0 spent yesterday" };
  const m = input([ads]);
  m.social = { ...m.social, collabsWaiting: 2 };
  const rows = briefDecisions(m);
  const top = briefTopHtml(rows, "https://zyvorah.com");
  const needs = top.needsYou.match(/<li/g) ?? [];
  assert.equal(needs.length, 4); // passkey, restart decision, 68 posts, 2 pitches
  assert.match(top.needsYou, /Passkey by 15 Oct\. Google Ads is warning/);
  assert.doesNotMatch(top.needsYou, /Only you can create it/); // one line, not the paragraph
  assert.match(top.needsYou, /href="https:\/\/zyvorah\.com\/admin\/marketing\/review"/);
  assert.doesNotMatch(top.needsYou, /failed|Claude Code/);
  assert.match(top.handling, /To do<\/strong> · Google Ads: Rs 0 spent yesterday/);
  // The source report under Detail no longer repeats the lifted paragraph.
  const detail = withoutLifted(ads.bodyHtml!);
  assert.doesNotMatch(detail, /Passkey/);
  assert.match(detail, /What I changed/);
  assert.match(briefGoingWellHtml(rows), /4 posts published yesterday/);
});

test("a line is whole sentences and short", () => {
  assert.equal(oneLine("Passkey by 15 Oct. Google Ads is warning. Third sentence here."), "Passkey by 15 Oct. Google Ads is warning.");
  assert.ok(oneLine("x".repeat(400)).length <= 170);
});

test("urgent severity is independent of who must act", () => {
  const rows = briefDecisions(input([section("<p>Service down.</p>", "red")]));
  assert.equal(briefOverallStatus(rows), "red");
  assert.ok(rows.some(r => r.status === "red" && r.owner === "Claude Code"));
});

test("recurring problems remain open and a quiet night is not a resolved incident", () => {
  const rows = briefDecisions(input([section('<p><strong>Recurring problems</strong><br>• Website cron runs die mid-way. Plan: add logging.<br>• Engine killed by a large image: no kill tonight.</p><p>Vijay Sales VS-000060 / ZVY-10663 is on an owner no-reprint hold.</p>')]));
  assert.equal(rows.find(r => r.finding.startsWith("Website cron"))?.owner, "Claude Code");
  assert.equal(rows.find(r => r.finding.startsWith("Engine killed"))?.status, "info");
  const hold = rows.find(r => r.finding.includes("protected order"));
  assert.equal(hold?.owner, "Roheena");
  assert.match(hold!.action, /Do not render, replay, reprint/);
});

test("a status board with an unlifted line stays in the detail whole", () => {
  const kept = '<p><strong>Status board</strong><br>Website — <strong>green</strong>: up.<br>Something else entirely.</p>';
  assert.equal(withoutLifted(kept), kept);
  assert.equal(withoutLifted('<p><strong>Status board</strong><br>Website — <strong>green</strong>: up.</p>'), "");
});
