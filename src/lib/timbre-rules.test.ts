import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGN_SAMPLE, LANGUAGES, languagesForCampus, lineKeyMaterial, lineReady, spokenText, VOICE_BRIEF, voiceSettings } from "./timbre-rules";

test("the brief and the sample fit what voice design accepts", () => {
  assert.ok(VOICE_BRIEF.length >= 20 && VOICE_BRIEF.length <= 1000);
  assert.ok(DESIGN_SAMPLE.length >= 100 && DESIGN_SAMPLE.length <= 1000);
  assert.match(VOICE_BRIEF, /mid-thirties/);
  assert.match(VOICE_BRIEF, /Indian English/);
});

test("a campus language is offered beside English and Hindi, once each", () => {
  assert.deepEqual(languagesForCampus("kn"), ["en", "kn", "hi"]);
  assert.deepEqual(languagesForCampus("ta"), ["en", "ta", "hi"]);
  assert.deepEqual(languagesForCampus("hi"), ["en", "hi"]);
  assert.deepEqual(languagesForCampus("xx"), ["en", "hi"]);
});

test("every language names its model and carries a native sample", () => {
  for (const [code, l] of Object.entries(LANGUAGES)) {
    assert.ok(l.sample.length > 10, code);
    assert.ok(["eleven_multilingual_v2", "eleven_v3"].includes(l.model), code);
  }
  assert.equal(LANGUAGES.kn.model, "eleven_v3");
});

test("the brand name is respelled for the voice only, and a line is keyed once", () => {
  assert.equal(spokenText("Welcome to Zyvorah. "), "Welcome to Zivorah.");
  assert.equal(lineKeyMaterial("v", "en", "Hello "), lineKeyMaterial("v", "en", "Hello"));
  assert.notEqual(lineKeyMaterial("v", "en", "Hello"), lineKeyMaterial("v", "hi", "Hello"));
});

test("v3 keeps stability on its allowed steps; a blank or endless line is refused", () => {
  assert.equal(voiceSettings("eleven_v3").stability, 0.5);
  assert.equal(lineReady("  ").ok, false);
  assert.equal(lineReady("x".repeat(1201)).ok, false);
  assert.equal(lineReady("Hello.").ok, true);
});
