// Long-form YouTube: the copy is a real video's (never a Short's), the gate
// refuses what the Library has not settled, and a run never uploads twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLongformCopy, copyProblems, filmTag, gateFilm, isThisFilm, nextStep, publicTitle, CLAIM_STALE_MS, MAX_ATTEMPTS,
  type FilmRow,
} from "./youtube-longform";

const cleared = { state: "cleared", evidence: "licence noted" };
const taash: FilmRow = {
  id: "08cf33ee-0f02-47f0-8603-5a37daa33d64",
  title: "TAASH Collection — Hindi Film — Widescreen",
  wallpaper: "TAASH · Mati × Zyvorah — complete collection",
  product_url: "https://zyvorah.com/mati",
  format: "youtube",
  language: "hindi",
  width: 1920, height: 1080, duration_s: "106.46",
  media_key: "marketing-library/x/film.mp4",
  clearance: { voice: cleared, music: cleared, listening: { state: "pending" } },
  youtube: {},
};
const approver = "roheena@plankandweave.com (chat instruction 29 Sep 2026)";

test("a long-form title never says #Shorts and names the film, not the cut", () => {
  assert.equal(publicTitle(taash.title), "TAASH Collection");
  const c = buildLongformCopy({ ...taash, youtube: { copy: { title: "TAASH #Shorts wall" } } });
  assert.ok(!/#shorts/i.test(c.title));
  assert.ok(c.title.length <= 100);
});

test("the description carries the product link and the Mati credit, and the language is Hindi", () => {
  const c = buildLongformCopy(taash);
  assert.ok(c.description.includes("https://zyvorah.com/mati"));
  assert.ok(c.description.includes("@stylemati"));
  assert.equal(c.defaultLanguage, "hi");
  assert.equal(c.defaultAudioLanguage, "hi");
  assert.ok(c.tags.includes(filmTag(taash.id)));
  assert.deepEqual(gateFilm(taash, c, approver), []);
});

test("written copy is kept, with the link and credit added when it forgot them", () => {
  const c = buildLongformCopy({ ...taash, youtube: { copy: { title: "TAASH | ताश", description: "एक पुरानी ताश की शीट से जन्मी वॉलपेपर कलेक्शन, made to measure." } } });
  assert.equal(c.title, "TAASH | ताश");
  assert.ok(c.description.startsWith("एक पुरानी"));
  assert.ok(c.description.includes("https://zyvorah.com/mati") && c.description.includes("@stylemati"));
});

test("a film with no collaborator gets no credit", () => {
  const c = buildLongformCopy({ ...taash, id: "70dec5b3-907c-4f1f-a906-3ff14116163c", title: "Shorelight — The Story Behind the Spaces — Horizontal", wallpaper: "Shorelight", product_url: "https://zyvorah.com/concepts/shorelight", language: "english" });
  assert.ok(!c.description.includes("stylemati"));
  assert.equal(c.defaultAudioLanguage, "en");
});

test("the gate refuses pending licences, vertical films, a missing approval and trade secrets", () => {
  const c = buildLongformCopy(taash);
  assert.match(gateFilm({ ...taash, clearance: { music: cleared } }, c, approver).join(), /voice licence pending/);
  assert.match(gateFilm({ ...taash, width: 1080, height: 1920 }, c, approver).join(), /vertical films use the Shorts publisher/);
  assert.deepEqual(gateFilm({ ...taash, width: 1080, height: 1080, duration_s: 50 }, c, approver), []);
  assert.match(gateFilm({ ...taash, width: 1080, height: 1080, duration_s: 181 }, c, approver).join(), /square and longer than three minutes/);
  assert.match(gateFilm(taash, c, undefined).join(), /no recorded approval/);
  assert.match(gateFilm({ ...taash, format: "reel" }, c, approver).join(), /not YouTube/);
  assert.match(copyProblems({ ...c, description: `${c.description}\nPrinted on our Mimaki.` }).join(), /mimaki/);
  assert.match(copyProblems({ ...c, description: `${c.description}\nOnly ₹99/sq ft.` }).join(), /price/i);
  assert.match(copyProblems({ ...c, title: "x".repeat(101) }).join(), /100/);
});

test("never twice: published skips, a live claim waits, a stale claim reconciles, failures stop after three", () => {
  const now = Date.parse("2026-09-29T15:00:00Z");
  assert.equal(nextStep(null, now), "skip");
  assert.equal(nextStep({ state: "published", url: "u" }, now), "skip");
  assert.equal(nextStep({ state: "queued" }, now), "go");
  assert.equal(nextStep({ state: "uploading", claimed_at: new Date(now - 60_000).toISOString() }, now), "wait");
  assert.equal(nextStep({ state: "uploading", claimed_at: new Date(now - CLAIM_STALE_MS - 1).toISOString() }, now), "go");
  assert.equal(nextStep({ state: "failed", attempts: 1 }, now), "go");
  assert.equal(nextStep({ state: "failed", attempts: MAX_ATTEMPTS }, now), "skip");
});

test("a channel video is recognised as this film by its hidden tag, or by its exact title", () => {
  assert.ok(isThisFilm({ tags: ["x", filmTag(taash.id)] }, taash.id, "T"));
  assert.ok(isThisFilm({ tags: [], title: "TAASH | ताश " }, taash.id, "TAASH | ताश"));
  assert.ok(!isThisFilm({ tags: [filmTag("0675ed5b-0000")], title: "Other" }, taash.id, "TAASH"));
});
