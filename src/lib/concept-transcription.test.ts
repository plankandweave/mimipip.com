import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONCEPT_TRANSCRIPTION_MODEL,
  CONCEPT_TRANSCRIPT_REVIEW_MODEL,
  CONCEPT_TRANSCRIPTION_LANGUAGES,
  conceptTranscriptReviewInstruction,
  conceptTranscriptionPrompt,
  isConceptTranscriptionLanguage,
} from "./concept-transcription";

test("concept briefs use the high-accuracy transcription model", () => {
  assert.equal(CONCEPT_TRANSCRIPTION_MODEL, "gpt-transcribe");
});

test("only English and Hindi are accepted", () => {
  assert.deepEqual(CONCEPT_TRANSCRIPTION_LANGUAGES, ["en", "hi"]);
  assert.equal(isConceptTranscriptionLanguage("en"), true);
  assert.equal(isConceptTranscriptionLanguage("hi"), true);
  assert.equal(isConceptTranscriptionLanguage("auto"), false);
  assert.equal(isConceptTranscriptionLanguage("mr"), false);
});

test("Hindi briefs carry domain and English code-switching context", () => {
  const prompt = conceptTranscriptionPrompt("hi");

  assert.match(prompt ?? "", /हिन्दी/);
  assert.match(prompt ?? "", /English/);
  assert.match(prompt ?? "", /Wallpaper/);
  assert.match(prompt ?? "", /Zyvorah/);
  assert.match(prompt ?? "", /सोफा/);
  assert.match(prompt ?? "", /नीला/);
  assert.match(prompt ?? "", /चाहिए/);
  assert.match(prompt ?? "", /अनुवाद न करें/);
});

test("unsupported languages are left unprompted", () => {
  assert.equal(conceptTranscriptionPrompt("auto"), undefined);
  assert.equal(conceptTranscriptionPrompt("mr"), undefined);
});

test("concept transcript review repairs recognition without rewriting", () => {
  const instruction = conceptTranscriptReviewInstruction("hi");

  assert.equal(CONCEPT_TRANSCRIPT_REVIEW_MODEL, "gpt-4o");
  assert.match(instruction, /selected speaking language is Hindi/);
  assert.match(instruction, /Correct only obvious phonetic/);
  assert.match(instruction, /Do not translate, summarize, improve/);
  assert.match(instruction, /If a word is genuinely ambiguous, leave it unchanged/);
  assert.match(instruction, /सोफा/);
  assert.doesNotMatch(instruction, /Marathi/);
});
