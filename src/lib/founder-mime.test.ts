import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMime, encodeHeader } from "./founder-mime";

const base = {
  from: "Roheena Nagpal <roheena@zyvorah.com>",
  to: ["priyanka.singh@example.com"],
  cc: ["girish.deshpande@example.com"],
  subject: "Quotation ZYV/Q/2026-27/KRT-01 — ₹14,23,160",
  html: "<p>Dear Priyanka</p>",
  text: "Dear Priyanka",
  inReplyTo: "<abc@mail.gmail.com>",
};
const ids = { alt: "alt1", mixed: "mix1" };

test("without attachments the message is the multipart/alternative it always was", () => {
  const raw = buildMime(base, ids);
  assert.match(raw, /^Content-Type: multipart\/alternative; boundary="alt1"$/m);
  assert.doesNotMatch(raw, /multipart\/mixed/);
  assert.match(raw, /^In-Reply-To: <abc@mail\.gmail\.com>$/m);
  assert.match(raw, /^Cc: girish\.deshpande@example\.com$/m);
  assert.match(raw, /^Subject: =\?UTF-8\?B\?/m, "a rupee sign in the subject is RFC 2047 encoded");
});

test("a PDF rides inside a multipart/mixed envelope around the alternative part", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 fake");
  const raw = buildMime({ ...base, attachments: [{ filename: 'Zyvorah "Quotation" KRT.pdf', contentType: "application/pdf", content: pdf }] }, ids);
  const lines = raw.split("\r\n");
  assert.equal(lines.find((l) => l.startsWith("Content-Type: multipart/mixed")), 'Content-Type: multipart/mixed; boundary="mix1"');
  assert.ok(raw.indexOf("--mix1\r\nContent-Type: multipart/alternative") < raw.indexOf("--mix1\r\nContent-Type: application/pdf"), "text before the attachment");
  assert.match(raw, /Content-Disposition: attachment; filename="Zyvorah _Quotation_ KRT\.pdf"/, "quotes cannot break the header");
  assert.ok(raw.trimEnd().endsWith("--mix1--"));
  assert.ok(raw.includes(Buffer.from(pdf).toString("base64")));
});

test("ASCII headers are left alone", () => {
  assert.equal(encodeHeader("Plain subject"), "Plain subject");
});
