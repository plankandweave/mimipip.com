import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingQuotes } from "./pending-quotes";

const now = Date.parse("2026-10-24T12:00:00Z");
const base = {
  token: "t1", walls: 1, total_inr: 12357, created_by_email: "roheena@plankandweave.com",
  recipient_name: "Vinod", recipient_email: "vinodk@vijaysales.com", recipient_phone: null,
  approved_at: null, declined_at: null, group_ref: null,
  expires_at: "2026-11-23T12:00:00Z", created_at: "2026-10-24T11:50:00Z",
};

test("a quotation sent for a PO waits on the partner's dashboard until the PO is entered", () => {
  assert.deepEqual(pendingQuotes([base], now), [{
    token: "t1", walls: 1, totalInr: 12357, sentBy: "roheena@plankandweave.com", sentTo: "Vinod",
    createdAt: "2026-10-24T11:50:00Z", expiresAt: "2026-11-23T12:00:00Z",
  }]);
});

test("approved, ordered, declined or expired quotations no longer wait", () => {
  const gone = [
    { ...base, token: "a", approved_at: "2026-10-24T12:00:00Z" },
    { ...base, token: "g", group_ref: "ZVP-1" },
    { ...base, token: "d", declined_at: "2026-10-24T12:00:00Z" },
    { ...base, token: "e", expires_at: "2026-10-24T11:59:00Z" },
  ];
  assert.deepEqual(pendingQuotes(gone, now), []);
});
