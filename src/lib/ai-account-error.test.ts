import { test } from "node:test";
import assert from "node:assert/strict";
import { isAiAccountError } from "./ai-account-error";

test("the 9 October 2026 refusal is an account error, not the email's", () => {
  assert.equal(isAiAccountError('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":null}'), true);
});

test("an exhausted credit balance is an account error", () => {
  assert.equal(isAiAccountError('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), true);
});

test("an ordinary per-item failure is not", () => {
  assert.equal(isAiAccountError("queue row has no body"), false);
  assert.equal(isAiAccountError('529 {"type":"error","error":{"type":"overloaded_error"}}'), false);
  assert.equal(isAiAccountError(undefined), false);
});
