import test from "node:test";
import assert from "node:assert/strict";
import { enableUrl } from "./desk-lib";

/**
 * The Search tab turns Google's "this API is switched off" error into a button.
 * The URL comes out of an error body, so the only thing standing between that
 * body and a link the founder clicks is this matcher. It must never produce a
 * link to anywhere but Google's own consoles.
 */

const REAL_ERROR =
  '{"error":{"code":403,"message":"Google Search Console API has not been used in project 140472699192 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=140472699192 then retry."}}';

test("it finds the console link inside Google's real error body", () => {
  assert.equal(
    enableUrl(REAL_ERROR),
    "https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=140472699192",
  );
});

test("it accepts the other Google console host", () => {
  const u = "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=1";
  assert.equal(enableUrl(`blah ${u} blah`), u);
});

test("it refuses a link to anywhere that is not a Google console", () => {
  assert.equal(enableUrl("see https://evil.example.com/enable?x=1"), null);
});

test("a lookalike host that merely starts with the Google one is refused", () => {
  // The pattern requires the path slash immediately after google.com, so a
  // domain like console.developers.google.com.evil.example.com cannot match.
  // Worth pinning: this is the whole reason the host is not matched loosely.
  assert.equal(enableUrl("https://console.developers.google.com.evil.example.com/apis"), null);
  assert.equal(enableUrl("https://console.cloud.google.com.attacker.test/apis/library"), null);
});

test("it stops at the end of the URL and does not swallow the rest of the body", () => {
  const out = enableUrl(REAL_ERROR)!;
  assert.ok(!out.includes(" "), "a space would mean it ran past the URL");
  assert.ok(!out.includes('"'), "a quote would mean it ran into the JSON");
  assert.ok(!out.includes("\\"), "an escape would mean it ran into the JSON");
});

test("no error body means no link", () => {
  assert.equal(enableUrl(null), null);
  assert.equal(enableUrl(undefined), null);
  assert.equal(enableUrl(""), null);
  assert.equal(enableUrl("403 forbidden, no url here"), null);
});
