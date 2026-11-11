import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  insideServiceWindow,
  parseWebhook,
  templatePayload,
  textPayload,
  verifyMetaSignature,
  verifySubscription,
} from "./whatsapp-cloud";

const SECRET = "app-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("a POST is accepted only when signed with the app secret", () => {
  const body = '{"object":"whatsapp_business_account"}';
  assert.equal(verifyMetaSignature(SECRET, body, sign(body)), true);
  assert.equal(verifyMetaSignature(SECRET, body, sign(body, "someone-else")), false);
  assert.equal(verifyMetaSignature(SECRET, body + " ", sign(body)), false);
  assert.equal(verifyMetaSignature(SECRET, body, null), false);
  assert.equal(verifyMetaSignature("", body, sign(body, "")), false, "no secret refuses everything");
});

test("the GET handshake echoes the challenge only for our verify token", () => {
  const q = (token: string) => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" });
  assert.equal(verifySubscription(q("zyv-token"), "zyv-token"), "1158201444");
  assert.equal(verifySubscription(q("guess"), "zyv-token"), null);
  assert.equal(verifySubscription(q("zyv-token"), null), null);
});

const delivery = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }],
            messages: [
              { id: "wamid.A", from: "919876543210", timestamp: "1760160000", type: "text", text: { body: "Price for a 10 x 9 ft wall?" } },
              { id: "wamid.B", from: "919876543210", timestamp: "1760160060", type: "image", image: { caption: "my bedroom wall" } },
              { id: "wamid.C", from: "919876543210", timestamp: "1760160120", type: "interactive", interactive: { button_reply: { title: "Yes, call me" } } },
            ],
            statuses: [
              { id: "wamid.OUT", recipient_id: "919876543210", status: "failed", timestamp: "1760160200", errors: [{ code: 131047, title: "Re-engagement message" }] },
            ],
          },
        },
      ],
    },
  ],
};

test("a delivery yields every message with its sender's name, and every status", () => {
  const { messages, statuses } = parseWebhook(delivery);
  assert.deepEqual(
    messages.map((m) => [m.waMessageId, m.contactName, m.kind, m.body]),
    [
      ["wamid.A", "Asha", "text", "Price for a 10 x 9 ft wall?"],
      ["wamid.B", "Asha", "image", "my bedroom wall"],
      ["wamid.C", "Asha", "interactive", "Yes, call me"],
    ],
  );
  assert.equal(messages[0].at.toISOString(), new Date(1760160000 * 1000).toISOString());
  assert.deepEqual(statuses.map((s) => [s.waMessageId, s.status, s.error]), [["wamid.OUT", "failed", "Re-engagement message"]]);
});

test("anything that is not a WhatsApp delivery yields nothing", () => {
  assert.deepEqual(parseWebhook({ object: "page", entry: delivery.entry }), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook(null), { messages: [], statuses: [] });
});

test("free text is allowed only within 24 hours of the customer's last message", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  assert.equal(insideServiceWindow(new Date("2026-10-10T12:30:00Z"), now), true);
  assert.equal(insideServiceWindow(new Date("2026-10-10T11:59:00Z"), now), false);
  assert.equal(insideServiceWindow(null, now), false);
});

test("payloads are in the shape the Cloud API expects", () => {
  assert.deepEqual(textPayload("919876543210", "Hello").text, { preview_url: true, body: "Hello" });
  assert.deepEqual(templatePayload("919876543210", "hello_world").template, { name: "hello_world", language: { code: "en" } });
  assert.deepEqual(templatePayload("91", "order_update", "en", ["ZYV-1001"]).template.components, [
    { type: "body", parameters: [{ type: "text", text: "ZYV-1001" }] },
  ]);
});
