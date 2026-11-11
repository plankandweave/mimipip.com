import test from "node:test";
import assert from "node:assert/strict";
import { inShopperMailWindow, isTestLead, leadCompanyName, resumeUrl } from "./lead-rules";

test("our own QA submissions never become leads", () => {
  assert.equal(isTestLead("sales-audit@example.com", "anything"), true);
  assert.equal(isTestLead("someone@gmail.com", "INTERNAL QA — do not contact."), true);
  assert.equal(isTestLead("anjan@scribblconcepto.com", "plz call back"), false);
});

test("a person without a company is filed under their name and address", () => {
  assert.equal(leadCompanyName("Anjan Panda", "anjan@x.com", null), "Anjan Panda (anjan@x.com)");
  assert.equal(leadCompanyName("", null, "+919711371017"), "+919711371017");
  assert.equal(leadCompanyName(null, null, null), "Website lead");
});

test("shoppers are emailed Monday to Saturday, 09:00 to 19:00 IST only", () => {
  // Wednesday 7 Oct 2026, 10:00 IST = 04:30 UTC
  assert.equal(inShopperMailWindow(new Date("2026-10-07T04:30:00Z")), true);
  // Wednesday 19:30 IST
  assert.equal(inShopperMailWindow(new Date("2026-10-07T14:00:00Z")), false);
  // Wednesday 08:59 IST
  assert.equal(inShopperMailWindow(new Date("2026-10-07T03:29:00Z")), false);
  // Sunday 11 Oct 2026, 12:00 IST
  assert.equal(inShopperMailWindow(new Date("2026-10-11T06:30:00Z")), false);
  // Saturday 10 Oct 2026, 18:59 IST
  assert.equal(inShopperMailWindow(new Date("2026-10-10T13:29:00Z")), true);
});

test("the emailed link rebuilds the exact wall on the design page", () => {
  const url = resumeUrl("https://zyvorah.com", { handle: "la-00026", widthCm: 304.8, heightCm: 243.84, materialSlug: "smooth-matt" });
  const u = new URL(url);
  assert.equal(u.pathname, "/products/la-00026");
  assert.equal(u.searchParams.get("w"), "10.0000");
  assert.equal(u.searchParams.get("h"), "8.0000");
  assert.equal(u.searchParams.get("material"), "smooth-matt");
  assert.equal(u.hash, "#create-your-wall");
});

test("lead intake writes only the source values the CRM tables accept", async () => {
  // crm_notes_source_check / crm_tasks_source_check: manual | dictation | inbox.
  // Anything else makes every insert fail, silently, inside a best-effort path.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./lead-intake.ts", import.meta.url), "utf8");
  const noteAndTask = src.slice(src.indexOf('from("crm_notes")'), src.indexOf("return { taskId: (task"));
  const sources = [...noteAndTask.matchAll(/source:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
  assert.ok(sources.length >= 2);
  for (const s of sources) assert.match(s, /^"(manual|dictation|inbox)"$/);
});
