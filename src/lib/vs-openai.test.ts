// The Vijay Sales pipeline asks GPT-6 Astra first and falls back to Claude
// (founder, 13 October 2026). Pinned here: the switch, the key order, and
// reading a Responses API reply wherever it put the text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstJsonObject, responsesText, vsOpenAIKey, vsOpenAIModel, vsProvider, VS_OPENAI_MODEL_DEFAULT } from "./vs-openai";

test("GPT-6 Astra is the default; Claude comes back only when asked for", () => {
  assert.equal(VS_OPENAI_MODEL_DEFAULT, "gpt-6-astra");
  assert.equal(vsOpenAIModel({}), "gpt-6-astra");
  assert.equal(vsOpenAIModel({ VIJAY_SALES_OPENAI_MODEL: "gpt-6-sol" }), "gpt-6-sol");
  assert.equal(vsProvider({}), "openai");
  assert.equal(vsProvider({ VIJAY_SALES_AI_PROVIDER: "anthropic" }), "anthropic");
  assert.equal(vsProvider({ VIJAY_SALES_AI_PROVIDER: "OpenAI" }), "openai");
});

test("the workflow's own key wins over the shared one", () => {
  assert.equal(vsOpenAIKey({ OPENAI_KEY_VIJAY_SALES: "own", OPENAI_API_KEY: "shared" }), "own");
  assert.equal(vsOpenAIKey({ OPENAI_API_KEY: "shared" }), "shared");
  assert.equal(vsOpenAIKey({}), null);
});

test("a Responses reply is read from output_text or from its message items", () => {
  assert.equal(responsesText({ output_text: "{\"a\":1}" }), "{\"a\":1}");
  assert.equal(responsesText({
    output: [
      { type: "reasoning", content: [] },
      { type: "message", content: [{ type: "output_text", text: "{\"walls\":" }, { type: "output_text", text: "[]}" }] },
    ],
  }), "{\"walls\":[]}");
  assert.equal(responsesText({}), "");
});

test("JSON is found inside prose or a fence, and garbage is null", () => {
  assert.deepEqual(firstJsonObject("Here you go:\n```json\n{\"floorY\":0.8}\n```"), { floorY: 0.8 });
  assert.equal(firstJsonObject("no json here"), null);
  assert.equal(firstJsonObject("{broken"), null);
});
