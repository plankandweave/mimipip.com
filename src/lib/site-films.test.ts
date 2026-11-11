import { test } from "node:test";
import assert from "node:assert/strict";
import { filmHeadline, pickSiteFilm, shapeOf, SITE_FILM_KINDS, videoObjectJsonLd, withVersions, type SiteFilm } from "./site-films";
import { siteRefusal } from "./marketing/site-film-publish";

const film = (over: Partial<SiteFilm>): SiteFilm => ({
  id: "f", title: "t", src: "https://media.zyvorah.com/x.mp4", poster: null, width: 1080, height: 1920, language: "english", ...over,
});

test("a slot takes a film of its own shape, never a film it would box", () => {
  const tall = film({ id: "tall" });
  const wide = film({ id: "wide", width: 1920, height: 1080 });
  assert.equal(shapeOf(tall), "tall");
  assert.equal(pickSiteFilm([tall, wide], "wide")?.id, "wide");
  assert.equal(pickSiteFilm([tall], "wide"), null);
  assert.equal(pickSiteFilm([tall, wide], "any")?.id, "tall");
});

test("English leads when a page has the same film in several languages", () => {
  const hindi = film({ id: "hi", language: "hindi" });
  const english = film({ id: "en", language: "english" });
  assert.equal(pickSiteFilm([hindi, english])?.id, "en");
  assert.equal(pickSiteFilm([hindi])?.id, "hi");
});

const cleared = { voice: { state: "cleared" }, music: { state: "n/a" }, listening: { state: "cleared" } };
const row = (over: Record<string, unknown> = {}) => ({
  id: "r", title: "Film", format: "reel", width: 1080, height: 1920,
  media_key: "marketing-library/r/film.mp4", media_sha256: "abc", cover_key: null,
  clearance: cleared, site_kind: "concept", site_handle: "shorelight", site_enabled: true,
  site_state: "off", site_media_url: null, site_error: null, site_attempts: 0, ...over,
});

test("a cleared film filed for a page that shows films goes on", () => {
  assert.equal(siteRefusal(row()), null, "concept pages show films");
  assert.equal(siteRefusal(row({ site_kind: "page", site_handle: "installation" })), null, "so does /installation");
  for (const kind of SITE_FILM_KINDS) assert.equal(siteRefusal(row({ site_kind: kind })), null, kind);
});

test("nothing uncleared, switched off, Amazon-cut or unplaced reaches a page", () => {
  assert.match(siteRefusal(row({ clearance: { ...cleared, listening: { state: "pending" } } }))!, /not cleared/);
  assert.match(siteRefusal(row({ clearance: {} }))!, /not cleared/);
  assert.match(siteRefusal(row({ site_enabled: false }))!, /kept off/);
  assert.match(siteRefusal(row({ format: "amazon" }))!, /Amazon/);
  assert.match(siteRefusal(row({ site_kind: null, site_handle: null }))!, /does not name/);
  assert.match(siteRefusal(row({ site_kind: "somewhere" }))!, /no somewhere page/);
  assert.match(siteRefusal(row({ width: null }))!, /not measured/);
});

test("a shopper never reads a Library filing name", () => {
  // The exact titles in the Library on 2 Oct 2026.
  assert.equal(filmHeadline("Shorelight — Roheena Natural Voice — Option 01 — Vertical"), "Shorelight");
  assert.equal(filmHeadline("Raat Bagh — Hindi Ad Film — Portrait"), "Raat Bagh");
  assert.equal(filmHeadline("Extreme Modernist — English Ad Film — Vertical"), "Extreme Modernist");
  assert.equal(filmHeadline("TAASH — English Ad — Widescreen — Make the Room Yours"), "TAASH — Make the Room Yours");
  assert.equal(filmHeadline("Amazon Ad — Vakratunda — Ganesha Wall Art — 20s"), "Amazon Ad — Vakratunda");
  // Titles written for people pass through untouched.
  assert.equal(filmHeadline("Karma — What Happens After the Waters"), "Karma — What Happens After the Waters");
  assert.equal(filmHeadline("Matsya — The World Worth Carrying"), "Matsya — The World Worth Carrying");
});

test("a film carries its other languages of the same shape, once each", () => {
  const en = film({ id: "en" });
  const hi = film({ id: "hi", language: "hindi" });
  const hi2 = film({ id: "hi2", language: "hindi" });
  const wideHi = film({ id: "wide", language: "hindi", width: 1920, height: 1080 });
  const silent = film({ id: "mute", language: "none" });
  const chosen = withVersions([en, hi, hi2, wideHi, silent], en);
  assert.deepEqual(chosen?.versions?.map((v) => v.id), ["hi"]);
  assert.equal(withVersions([en], en)?.versions, undefined);
  assert.equal(withVersions([en], null), null);
});

test("Google gets a VideoObject only when it has a thumbnail and a date", () => {
  const page = { path: "/products/karma", name: "Karma — the film", description: "d" };
  assert.equal(videoObjectJsonLd(film({}), page), null);
  const ld = videoObjectJsonLd(film({ poster: "https://media.zyvorah.com/p.jpg", publishedAt: "2026-09-30T00:00:00Z", durationS: 106.46, youtubeUrl: "https://www.youtube.com/shorts/abcdefghijk" }), page);
  assert.equal(ld?.duration, "PT1M46S");
  assert.equal(ld?.embedUrl, "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(ld?.inLanguage, "en");
});
