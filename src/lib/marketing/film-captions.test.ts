import { test } from "node:test";
import assert from "node:assert/strict";
import { captionNeeds, captionOrder, normaliseVtt, segmentsToVtt, whisperLanguage, type CaptionRow } from "./film-captions";
import { liveIsCurrent } from "./site-film-publish";
import { publicFilmKey } from "./library-publish";
import { R2_DOMAIN_BASE } from "@/lib/media-url";

const row = (over: Partial<CaptionRow>): CaptionRow => ({
  id: "f", title: "t", media_key: "marketing-library/f/film.mp4", cover_key: null,
  language: "hindi", captions_key: null, captions_sha256: null, captions_attempts: 0, ...over,
});

test("a spoken film without captions needs them; a silent film never does", () => {
  assert.deepEqual(captionNeeds(row({ cover_key: "c" })), { captions: true, poster: false });
  assert.deepEqual(captionNeeds(row({ language: "none", cover_key: "c" })), { captions: false, poster: false });
  assert.deepEqual(captionNeeds(row({ language: null, cover_key: "c" })), { captions: false, poster: false });
});

test("a poster is derived only when no cover was uploaded", () => {
  assert.equal(captionNeeds(row({ captions_key: "k" })).poster, true);
  assert.equal(captionNeeds(row({ captions_key: "k", cover_key: "uploaded.png" })).poster, false);
});

test("after five failures a film stops being retried until someone asks", () => {
  assert.deepEqual(captionNeeds(row({ captions_attempts: 5 })), { captions: false, poster: false });
});

test("languages map to Whisper's codes", () => {
  assert.equal(whisperLanguage("english"), "en");
  assert.equal(whisperLanguage("hindi"), "hi");
  assert.equal(whisperLanguage("marathi"), "mr");
  assert.equal(whisperLanguage("none"), null);
});

test("segments become WebVTT cues; empty and zero-length ones are dropped", () => {
  const vtt = segmentsToVtt([
    { start: 0, end: 2.5, text: " हर सुबह " },
    { start: 2.5, end: 2.5, text: "skipped" },
    { start: 61, end: 64.25, text: "a\nb" },
  ]);
  assert.equal(vtt, "WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nहर सुबह\n\n00:01:01.000 --> 00:01:04.250\na b\n");
});

test("a correction without timestamps is refused; a good one is normalised", () => {
  assert.ok("error" in normaliseVtt("just some words with no timings"));
  const ok = normaliseVtt("WEBVTT\r\n\r\n00:00:01.000 --> 00:00:03.000\r\nHello\r\n");
  assert.deepEqual(ok, { vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n" });
});

const live = {
  site_state: "live",
  media_sha256: "abc",
  site_media_url: `${R2_DOMAIN_BASE}/${publicFilmKey("abc")}`,
  captions_key: null as string | null,
  captions_sha256: null as string | null,
  site_captions_sha256: null as string | null,
  cover_key: null as string | null,
  site_poster_url: null as string | null,
};

test("a live film is current only while its file, captions and poster all match", () => {
  assert.equal(liveIsCurrent(live), true);
  assert.equal(liveIsCurrent({ ...live, media_sha256: "new" }), false, "a new file goes out again");
  assert.equal(liveIsCurrent({ ...live, captions_key: "k", captions_sha256: "s1" }), false, "new captions go out");
  assert.equal(liveIsCurrent({ ...live, captions_key: "k", captions_sha256: "s2", site_captions_sha256: "s1" }), false, "corrected captions go out");
  assert.equal(liveIsCurrent({ ...live, captions_key: "k", captions_sha256: "s1", site_captions_sha256: "s1" }), true);
  assert.equal(liveIsCurrent({ ...live, cover_key: "c" }), false, "a poster made after going live goes out");
  assert.equal(liveIsCurrent({ ...live, site_state: "off" }), false);
});

test("films shoppers can already see are captioned first, then the newest", () => {
  const order = captionOrder([
    { id: "new", site_state: "off" }, { id: "liveA", site_state: "live" }, { id: "old", site_state: "off" }, { id: "liveB", site_state: "live" },
  ]).map((r) => r.id);
  assert.deepEqual(order, ["liveA", "liveB", "new", "old"]);
});
