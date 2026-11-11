// The test that should have existed before the first post went out.
//
// On 2026-08-26 the engine composed a real post in which every glyph — wordmark,
// title, subtitle — rendered as a tofu box, because Vercel's runtime ships no
// fonts and the compositor asked for Georgia. Nothing caught it: safety_passed
// was true and the slot was queued as a success.
//
// TWO THINGS THIS CANNOT DO, STATED PLAINLY:
//
//  1. It cannot reproduce the bug on macOS. Sharp there resolves through CoreText
//     and silently substitutes Helvetica for any unknown family, so every render
//     looks fine locally. Running these on a Mac proves almost nothing — which is
//     precisely why the bug survived local testing. They are meaningful on the
//     Linux CI runner, whose font situation resembles the deployment's.
//  2. A missing font never throws. librsvg just draws boxes. So the only way to
//     detect it is to RENDER and look at the pixels.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file is ESM, where __dirname does not exist. It was used below anyway,
// so that one test threw ReferenceError on every run — and because nothing in
// the repo ran these files, the throw was never seen.
const HERE = dirname(fileURLToPath(import.meta.url));

const BUNDLED_FAMILIES = new Set(["Plus Jakarta Sans", "Inter", "Noto Sans Devanagari", "Playfair Display", "Noto Serif Devanagari"]);
import { lowerThirdSvg, esc, bundledCoverage, wordmarkSvg, storyHouseSvg, MIN_PRIMARY_HEIGHT, SERIF_DISPLAY, SANS_TEXT } from "./brand";
import { IG_SAFE } from "./types";

test("Taash Stories use one serif headline over a full-bleed image", () => {
  const frame = storyHouseSvg(1080, 1920, { title: "When the room plays along.", kicker: "Taash", line: "A gathering begins." });
  assert.match(frame, /font-family="Playfair Display, Noto Serif Devanagari"/);
  assert.doesNotMatch(frame, /MATI|TAASH ·|× ZYVORAH/i);
  assert.match(frame, /When the room plays along/);
  assert.doesNotMatch(frame, /fill="#000"\s*\/>/);
  assert.match(frame, /fill="url\(#story-shade\)"/);
  const textBaselines = [...frame.matchAll(/<(?:text|tspan)[^>]*\by="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(textBaselines.every((y) => y > IG_SAFE.story.top && y < 1920),
    `Story text falls outside the artwork: ${textBaselines.join(", ")}`);
  assert.match(frame, /ZYVORAH\.COM/);
});

test("a Story preserves the owner-approved wallpaper-only footer", () => {
  const frame = storyHouseSvg(1080, 1920, { title: "Dhoop", kicker: "Taash", line: "Wallpaper only." });
  assert.match(frame, /Wallpaper only\./);
  assert.match(frame, /Shop this wallpaper/);
});

test("Story shopping copy is plain Inter, right-aligned, without a white pill", () => {
  for (const kicker of ["Taash", "TAASH · MATI × ZYVORAH", "Zyvorah · Katha", "ZYVORAH"]) {
    const frame = storyHouseSvg(1080, 1920, { title: "Jodi", kicker });
    assert.doesNotMatch(frame, /MATI|TAASH ·|× ZYVORAH/i);
    assert.match(frame, new RegExp(`text-anchor="end" font-family="${SANS_TEXT}"[^>]*>Shop this wallpaper`));
    assert.doesNotMatch(frame, /<rect[^>]*fill="(?:#fff|#FFFFFF|white)"/i);
    assert.match(frame, /ZYVORAH\.COM/);
    assert.match(frame, /aria-label="Link cue"/);
    assert.equal((frame.match(/Shop this wallpaper/g) ?? []).length, 1);
    assert.match(frame, /y="1776"[^>]*letter-spacing="3"/);
    assert.match(frame, /y="1853"[^>]*letter-spacing="4"/);
    assert.match(frame, /Wallpaper only\./);
    if (/taash/i.test(kicker)) assert.match(frame, /SEE THE TAASH COLLECTION/);
  }
  const feed = lowerThirdSvg(1080, 1350, "Jodi", "Made to measure", "Taash · Mati × Zyvorah");
  assert.match(feed, /TAASH · MATI × ZYVORAH/);
});

/** Proportion of dark pixels — a proxy for how much ink the glyphs laid down. */
async function inkFor(family: string, text: string): Promise<number> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120">` +
    `<rect width="600" height="120" fill="#fff"/>` +
    `<text x="10" y="85" font-family="${family}" font-size="64" fill="#000">${text}</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] < 128) dark++;
  return dark / (info.width * info.height);
}

for (const family of ["Plus Jakarta Sans", "Inter"]) {
  test(`${family} resolves to a real font, not tofu boxes`, async () => {
    const narrow = await inkFor(family, "iiiiiiii");
    const wide = await inkFor(family, "MMMMMMMM");

    assert.ok(narrow > 0.005, `${family} drew nothing at all`);

    // THE GUARD. Tofu boxes are one fixed glyph, so 'iiii' and 'MMMM' cover the
    // same area. Real type does not: an 'i' is a stem, an 'M' is four. A small
    // delta means no font resolved and the renderer fell back to boxes.
    const delta = Math.abs(wide - narrow) / Math.max(wide, narrow);
    assert.ok(
      delta > 0.2,
      `${family}: 'iiii' and 'MMMM' covered near-identical area ` +
        `(${(delta * 100).toFixed(1)}% apart). That is the signature of tofu boxes.`,
    );
  });
}

test("the compositor only asks for families that are actually bundled", () => {
  // The half of the bug that IS catchable anywhere. Georgia was requested for
  // months while public/fonts held only Plus Jakarta Sans and Inter — and while
  // the site itself used neither serif. Referencing anything else renders boxes
  // in production and nothing at runtime will say so.
  // Scanning the SOURCE, not one rendered sample. The previous version rendered
  // only lowerThirdSvg, so `font-family="Georgia, serif"` sat in the closing card
  // untouched — a test that proves one call site is clean says nothing about the
  // next one somebody writes.
  const dir = join(HERE, "..");
  const files: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) files.push(full);
    }
  })(dir);

  // Every family now flows through the two tokens, so the audit checks the
  // tokens' own values (and still scans for any literal that sneaks back in —
  // the token-guard test below fails those by location, this one by name).
  let found = 0;
  const sources = [
    `font-family="${SERIF_DISPLAY}" font-family="${SANS_TEXT}"`,
    ...files.map((f) => readFileSync(f, "utf8")),
  ];
  for (const src of sources) {
    for (const m of src.matchAll(/font-family="([^"$]+)"/g)) {
      found++;
      // A stack is allowed, but EVERY family in it must be bundled — a fallback
      // to something absent is exactly the boxes this is here to prevent.
      for (const family of m[1].split(",").map((x) => x.trim())) {
        assert.ok(
          BUNDLED_FAMILIES.has(family),
          `font-family "${family}" is not a TTF in public/fonts — it renders as boxes in production, and macOS will hide that from you locally`,
        );
      }
    }
  }
  assert.ok(found >= 2, "the font tokens were not audited — did the scan break?");
});

// Every character the compositor can put in an image must be drawable by a
// bundled font. The tofu fix made text appear; it did not make every glyph
// appear, and "₹200/sq ft" still rendered the price as a box on 2026-08-27 —
// present fonts, missing glyph. These lock that class of bug shut.
test("glyph coverage is read from the bundled font files", () => {
  const have = bundledCoverage();
  assert.ok(have.size > 100, "coverage should be read from real cmap tables");
  assert.ok(have.has("A".codePointAt(0)!));
  // ₹ started this: absent from all four Latin faces, so prices drew a box.
  // Noto Sans Devanagari brought it, so it is covered now — and the Sanskrit
  // names it was added for are covered too.
  assert.equal(have.has(0x20b9), true, "the rupee sign must be drawable");
  assert.equal(have.has(0x092e), true, "Devanagari must be drawable");
});

test("the rupee sign is drawn as itself, not substituted", () => {
  // It was "Rs " while no bundled face carried U+20B9. Covering the glyph is
  // strictly better than spelling around it.
  assert.equal(esc("from \u20B9200/sq ft"), "from \u20B9200/sq ft");
});

test("the exact sub-line the pipeline builds renders", () => {
  assert.doesNotThrow(() => esc("made to measure \u00B7 from \u20B9200/sq ft"));
});

test("an undrawable character is refused, not drawn as a box", () => {
  // Devanagari used to be the example here, and is now bundled — which is the
  // point: the guard is not a list of known-bad characters, it is derived from
  // whatever the fonts actually carry, so covering a script retires its entry
  // without anyone editing the rule. CJK is simply the next thing absent.
  assert.throws(() => esc("\u6F22\u5B57"), /U\+6F22/);
});

// THE LOGO. The compositor drew an imitation for its whole life: "zyvorah" set
// in Plus Jakarta Sans with a cyan dot to its right. The real mark is a heavy
// condensed grotesque, a black dot tight against the "h", and a "wallpapers"
// descriptor. Nothing caught it because nothing compared the drawn mark to the
// artwork — the same blind spot as the tofu boxes, one layer up.
test("the logo is the real artwork, not type", async () => {
  const svg = wordmarkSvg({ color: "#111111", height: 130, placement: "primary" });
  // Outlined paths, no font-family: this mark cannot tofu.
  assert.ok(!svg.includes("font-family"), "the logo must not depend on a font");
  assert.ok(svg.includes("#111111"), "the tint must be substituted, not left as currentColor");
  assert.ok(!svg.includes("currentColor"), "librsvg has no cascade to resolve currentColor from");

  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 12) inked++;
  assert.ok(inked / (info.width * info.height) > 0.2, "the logo rendered nearly empty");
});

// "wallpapers" is part of the mark. The rule is about what a placement IS, not
// how much room is left — a lockup chosen by spare space means the layout
// quietly edits the logo, which is exactly how the imitation survived so long.
test("a primary placement always carries the descriptor", () => {
  const svg = wordmarkSvg({ color: "#111111", height: 200 });
  // Default is primary: the whole mark, without having to ask.
  assert.match(svg, /viewBox="0 0 186\.51 64\.81"/);
});

test("a primary placement too small to read the descriptor is refused, not downgraded", () => {
  // The old behaviour silently returned the wordmark here. That hid a layout
  // bug in the one place a half-mark would actually be published.
  assert.throws(
    () => wordmarkSvg({ color: "#FFFFFF", height: MIN_PRIMARY_HEIGHT - 1, placement: "primary" }),
    /wallpapers/,
  );
  assert.doesNotThrow(() => wordmarkSvg({ color: "#FFFFFF", height: MIN_PRIMARY_HEIGHT }));
});

test("only a repeat placement drops the descriptor", () => {
  const repeat = wordmarkSvg({ color: "#FFFFFF", height: 32, placement: "repeat" });
  assert.match(repeat, /viewBox="0 0 186\.51 57\.609"/);
});

test("the legibility floor is derived from the artwork, not guessed", () => {
  // 9px of descriptor, given the band is 7.201 of the lockup's 64.81 units.
  assert.equal(MIN_PRIMARY_HEIGHT, Math.ceil(9 / ((64.81 - 57.609) / 64.81)));
});

test("the logo is sized to its true aspect ratio", () => {
  const svg = wordmarkSvg({ color: "#111111", height: 100, placement: "primary" });
  const w = Number(svg.match(/width="(\d+)"/)![1]);
  // 186.51 / 64.81 — measured from the artwork, not guessed.
  assert.equal(w, Math.round(100 * (186.51 / 64.81)));
});


// The catalogue's names are Sanskrit. Three of the first week-ahead run's seven
// days were refused because no bundled face carried Devanagari — correctly, but
// a third of the catalogue cannot be a permanent exception.
test("a Devanagari product name renders rather than being refused", async () => {
  const title = "Mayur (\u092E\u092F\u0942\u0930)";
  assert.doesNotThrow(() => esc(title), "the coverage guard should now accept Devanagari");

  const svg = lowerThirdSvg(1080, 1350, title, "made to measure");
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 12) inked++;
  assert.ok(inked > 0, "the lower third rendered nothing at all");
});

test("Devanagari and Latin of the same width differ — i.e. neither is tofu", async () => {
  // Tofu boxes are identical rectangles, so equal coverage is the tell. This is
  // weak on macOS, which substitutes silently, and meaningful on the Linux CI.
  const cover = async (text: string) => {
    const svg = lowerThirdSvg(1080, 1350, text, undefined);
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] > 12) n++;
    return n;
  };
  const deva = await cover("\u092E\u092F\u0942\u0930");
  const latin = await cover("MMMM");
  assert.ok(deva > 0 && latin > 0);
  assert.notEqual(deva, latin, "identical coverage suggests both rendered as the same boxes");
});

test("outside brand.ts, media code may only use the exported font tokens", () => {
  // The barricade the founder asked for on 25 Sep 2026 ("no fonts should
  // change"): a family spelled out anywhere but brand.ts is a second voice
  // waiting to happen — the feed/Story divergence started exactly that way,
  // with lowerThirdSvg naming its own face. Tokens or nothing.
  const dir = dirname(fileURLToPath(import.meta.url));
  const files: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "brand.ts") files.push(full);
    }
  })(dir);
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/font-family="([^"]+)"/g)) {
      assert.ok(
        /^\$\{(SERIF_DISPLAY|SANS_TEXT|family)\}$/.test(m[1]),
        `${f.replace(dir, "")}: font-family "${m[1]}" is a literal — use SERIF_DISPLAY or SANS_TEXT from brand.ts, the only two voices the brand has`,
      );
    }
  }
});
