import test from "node:test";
import assert from "node:assert/strict";
import { partnerAttribution, partnerLabel, relabelMeta, reportSources, PARTNER_MEDIUM } from "./partner-traffic-rules";

test("a HomeLane designer's visit is HomeLane's", () => {
  assert.deepEqual(partnerAttribution({ staff: false, account: { slug: "homelane" } }), {
    source: "homelane",
    medium: PARTNER_MEDIUM,
  });
  assert.equal(partnerLabel("homelane", [{ slug: "homelane", name: "HomeLane" }]), "HomeLane");
});

test("our own staff inside a partner portal keep ordinary attribution", () => {
  assert.equal(partnerAttribution({ staff: true, account: { slug: "homelane" } }), null);
  assert.equal(partnerAttribution(null), null);
});

test("relabelling keeps what the referrer said, once", () => {
  const once = relabelMeta({ source: "direct", medium: "none", landing: "/partners/homelane" }, "homelane");
  assert.deepEqual(once, { source: "homelane", medium: PARTNER_MEDIUM, via: "direct / none", landing: "/partners/homelane" });
  assert.deepEqual(relabelMeta(once, "homelane"), once);
});

test("the report always shows partner sources, even below the cut", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => ({ source: `s${i}`, medium: "referral", sessions: 10 - i, visitors: 5 })),
    { source: "homelane", medium: PARTNER_MEDIUM, sessions: 1, visitors: 1 },
  ];
  const shown = reportSources(rows);
  assert.equal(shown.length, 7);
  assert.equal(shown.at(-1)!.source, "homelane");
  assert.ok(!shown.some((r) => r.source === "s6"));
});

import {
  measureTokenFromLanding,
  summarisePartnerTraffic,
  PARTNER_LINK_MEDIUM,
  type PartnerAccount,
} from "./partner-traffic-rules";

const ACCOUNTS: PartnerAccount[] = [
  { slug: "homelane", name: "HomeLane", active: true },
  { slug: "vijay-sales", name: "Vijay Sales", active: true },
  { slug: "moco", name: "Moco Design Studio", active: true },
  { slug: "old", name: "Retired Partner", active: false },
];

test("partner names come from the accounts, falling back to the slug", () => {
  assert.equal(partnerLabel("moco", ACCOUNTS), "Moco Design Studio");
  assert.equal(partnerLabel("unknown-co", ACCOUNTS), "unknown-co");
});

test("a measurement-link landing yields its token, and nothing else does", () => {
  const tok = "A".repeat(43);
  assert.equal(measureTokenFromLanding(`/measure/${tok}`), tok);
  assert.equal(measureTokenFromLanding(`/measure/${tok}/`), tok);
  assert.equal(measureTokenFromLanding("/measure/short"), null);
  assert.equal(measureTokenFromLanding(`/partners/${tok}`), null);
  assert.equal(measureTokenFromLanding(`/measure/${tok}/../admin`), null);
  assert.equal(measureTokenFromLanding(null), null);
});

test("measurement-link sources are kept below the cut too", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => ({ source: `s${i}`, medium: "referral", sessions: 10, visitors: 5 })),
    { source: "vijay-sales", medium: PARTNER_LINK_MEDIUM, sessions: 1, visitors: 1 },
  ];
  assert.equal(reportSources(rows).at(-1)!.source, "vijay-sales");
});

test("partner traffic is summarised per partner, with what would have read as direct", () => {
  const s = summarisePartnerTraffic(
    [
      { token: "t1", source: "homelane", medium: PARTNER_MEDIUM, via: "direct / none" },
      { token: "t1", source: "homelane", medium: PARTNER_MEDIUM, via: "direct / none" },
      { token: "t2", source: "homelane", medium: PARTNER_MEDIUM, via: "gmail / email" },
      { token: "t3", source: "vijay-sales", medium: PARTNER_LINK_MEDIUM, via: "whatsapp / social" },
      { token: "t9", source: "google", medium: "organic", via: null },
    ],
    ACCOUNTS,
  );
  assert.deepEqual(s.lines.map((l) => [l.name, l.sessions, l.visitors, l.portal, l.measureLinks, l.wouldBeDirect]), [
    ["HomeLane", 3, 2, 3, 0, 2],
    ["Vijay Sales", 1, 1, 0, 1, 0],
  ]);
  assert.equal(s.sessions, 4);
  assert.equal(s.wouldBeDirect, 2);
  assert.deepEqual(s.quiet, ["Moco Design Studio"]);
});
