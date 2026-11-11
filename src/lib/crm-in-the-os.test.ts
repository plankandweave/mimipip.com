import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dealToOpen, osPipelineUrl } from "./crm-in-the-os";

const ID = "1a2b3c4d-1111-2222-3333-444455556666";

test("the CRM opens the OS Pipeline, on the deal when there is one", () => {
  assert.equal(osPipelineUrl(), "https://os.magnitudegroup.in/sales");
  assert.equal(osPipelineUrl("not-a-uuid"), "https://os.magnitudegroup.in/sales");
  assert.equal(osPipelineUrl(ID), `https://os.magnitudegroup.in/sales?deal=store%3A${ID}`);
});

test("a company opens on its newest open deal, else its newest", () => {
  assert.equal(dealToOpen([]), null);
  assert.equal(dealToOpen([
    { id: "won", stage: "won", updated_at: "2026-10-28" },
    { id: "open", stage: "quoted", updated_at: "2026-10-20" },
  ]), "open");
  assert.equal(dealToOpen([
    { id: "old", stage: "lost", updated_at: "2026-09-01" },
    { id: "new", stage: "won", updated_at: "2026-10-01" },
  ]), "new");
});

test("the website has no CRM review screen and no CRM link in the admin menu", () => {
  const list = readFileSync(new URL("../app/admin/crm/page.tsx", import.meta.url), "utf8");
  const company = readFileSync(new URL("../app/admin/crm/[id]/page.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/admin/AdminNav.tsx", import.meta.url), "utf8");
  assert.match(list, /redirect\(osPipelineUrl\(\)\)/);
  assert.match(company, /redirect\(osPipelineUrl\(/);
  assert.doesNotMatch(nav, /href: "\/admin\/crm"/);
});
