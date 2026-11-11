import test from "node:test";
import assert from "node:assert/strict";
import { SHIKHA_GREETING, CUSTOMER_SERVICE_POLICY, SERVICE_CATALOGUE_TOOLS } from "./customer-service-policy";
import { readFileSync } from "node:fs";
test("Shikha greeting and support boundaries", () => {
  assert.equal(SHIKHA_GREETING, "Hello, I'm Shikha. How can I help you?");
  assert.match(CUSTOMER_SERVICE_POLICY, /Complaints, damage, failed payments and order problems are always relevant/);
  assert.ok(!SERVICE_CATALOGUE_TOOLS.has("cancel_order"));
  assert.ok(!SERVICE_CATALOGUE_TOOLS.has("check_order_status"));
});
test("new call path does not import Vapi or enable outbound calling", () => {
  const source = readFileSync("src/components/ShikhaCall.tsx", "utf8");
  assert.doesNotMatch(source, /@vapi|VOICE_FOLLOWUP_ENABLED/);
  assert.match(source, /getTracks\(\).forEach\(track => track.stop\(\)\)/);
});
