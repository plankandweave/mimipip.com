// Curated mode's two promises, pinned.
//
// The failure these guard is the worst one this feature can have: a proposal
// that goes to a client with the founder's prose quietly edited, or with a
// colour swatch showing a colour nobody chose next to a name she wrote. Both
// are invisible in review — the deck looks finished either way — so they have
// to be caught here rather than by reading the output.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitCuratedBlocks, presentablePalette, paletteSheetHtml, paletteStripHtml, parseShare,
  ensureChapterPalettes, ensureChapterHeroes, captureChapterHeroes, heroHtml,
  galleryHtml, galleryScript, galleryStyles, shortlistButtonHtml, compareFurnitureHtml,
  restyleDeck, repairComparisonBases,
  type PaletteSwatch,
} from "./curated-doc";

// The shape of the real LTM Kolkata document: a preamble, five directions, and
// a closing comparison — with '## ' sub-headings inside each direction that
// must NOT split it, and a numbered '# 1. ' heading style.
const DOC = `# LTM Kolkata

## Five Aesthetic Schools of Thought

We have interpreted this through five schools of thought.

---

# 1. Neo-Bengal Print Atelier

## The concept

### The Archive Becomes Intelligence

Kolkata has always been a city of books.

## Why this colour palette

* 60-65% warm parchment and paper tones
* 20-25% Bengal ink, indigo and charcoal

---

# 2. Indian Modernist Geometry

## The concept

Pure geometry, proportion, rhythm and movement.

---

# How we would present the five directions to LTM

The final choice depends on what LTM wants a visitor to feel first.
`;

test("sub-headings stay inside their direction; only '# ' splits", () => {
  const blocks = splitCuratedBlocks(DOC);
  assert.equal(blocks.length, 4);
  assert.deepEqual(
    blocks.map((b) => b.heading),
    ["LTM Kolkata", "1. Neo-Bengal Print Atelier", "2. Indian Modernist Geometry",
     "How we would present the five directions to LTM"],
  );
  // The '## ' and '### ' headings are her prose, not block boundaries.
  assert.match(blocks[1].text, /## The concept/);
  assert.match(blocks[1].text, /### The Archive Becomes Intelligence/);
});

test("a block's text is a byte-for-byte slice of the document", () => {
  // This is the whole "verbatim" promise. If a block's text is not literally
  // present in the source, something reformatted her prose on the way through.
  for (const b of splitCuratedBlocks(DOC)) {
    assert.ok(DOC.includes(b.text), `block "${b.heading}" is not a literal slice`);
  }
});

test("a document with no headings is one block, not zero", () => {
  const blocks = splitCuratedBlocks("Just some prose she pasted.\n");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].heading, "");
  assert.equal(blocks[0].text, "Just some prose she pasted.");
});

test("CRLF from a pasted Word document does not survive into the prose", () => {
  const blocks = splitCuratedBlocks("# One\r\n\r\nLine A\r\nLine B\r\n");
  assert.equal(blocks[0].text, "Line A\nLine B");
});

test("the presenter receives the colour and the name, and no recipe", () => {
  const palette: PaletteSwatch[] = [
    { name: "Bengal ink, indigo and charcoal", hex: null, role: "authority", pct: "20-25%",
      hex_suggestion: "#1F2A44" },
    { name: "Warm parchment", hex: "#EFE6D5", role: "the ground", pct: "60-65%", hex_suggestion: "#FFFFFF" },
  ];
  const out = presentablePalette(palette);
  const seen = JSON.stringify(out);

  // The suggestion is gone entirely — not merely unused.
  assert.ok(!("hex_suggestion" in out[0]));
  assert.ok(!seen.includes("1F2A44"));
  // Shares and roles are how the artwork is made. A deck is read by more people
  // than the client, so the presenter is never told them and therefore cannot
  // print them. They stay on the option row for the palette sheet.
  assert.ok(!seen.includes("20-25%"));
  assert.ok(!seen.includes("60-65%"));
  assert.ok(!seen.includes("authority"));
  assert.ok(!seen.includes("the ground"));
  // A cleared swatch reaches the deck with no colour at all, which is what
  // makes it render as a neutral labelled chip.
  assert.equal(out[0].hex, null);
  assert.equal(out[0].name, "Bengal ink, indigo and charcoal");
  assert.equal(out[1].hex, "#EFE6D5");
});

test("the palette sheet carries the full record, because that is its whole job", () => {
  const html = paletteSheetHtml({
    proposalTitle: "LTM Kolkata — Five Aesthetic Schools of Thought",
    clientName: "LTIMindtree",
    options: [
      { position: 1, title: "Neo-Bengal Print Atelier", palette: [
        { name: "Bengal ink, indigo and charcoal", hex: "#22293F", role: "authority", pct: "20-25%" },
        { name: "a colour she cleared", hex: null, role: null, pct: null },
      ] },
    ],
  });
  // Everything the deck withholds is present here, where it is meant to be.
  assert.ok(html.includes("Bengal ink, indigo and charcoal"));
  assert.ok(html.includes("#22293F"));
  assert.ok(html.includes("20-25%"));
  assert.ok(html.includes("authority"));
  assert.ok(html.includes("LTIMindtree"));
  // A cleared swatch is shown as a neutral chip with an em dash, not invented.
  assert.ok(html.includes("#EFE8DF"));
});

test("a client name with an ampersand cannot break the palette sheet's markup", () => {
  const html = paletteSheetHtml({
    proposalTitle: "Walls & Ways",
    clientName: '<script>alert("x")</script> & Co',
    options: [{ position: 1, title: "One", palette: [{ name: "a & b", hex: null, role: null, pct: null }] }],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&amp; Co"));
  assert.ok(html.includes("a &amp; b"));
});

test("a share becomes a width, so a restrained palette looks restrained", () => {
  // Cartographic Minimalism, as she wrote it: overwhelmingly ivory with a
  // 1-2% signal. If the bands came out equal, the strip would misrepresent
  // artwork the client is about to look at.
  const out = presentablePalette([
    { name: "warm ivory", hex: "#F2ECE0", role: null, pct: "80-85%" },
    { name: "soft graphite", hex: "#5A5C5E", role: null, pct: "8-10%" },
    { name: "pale river blue", hex: "#A8BFCC", role: null, pct: "4-6%" },
    { name: "signal red or magenta", hex: "#C4187C", role: null, pct: "1-2%" },
  ]);
  assert.equal(out.length, 4);
  // The ivory dominates and the signal is a sliver, in that order.
  assert.ok(out[0].weight > 75, `ivory should dominate, got ${out[0].weight}`);
  assert.ok(out[3].weight < 3, `the signal should be a sliver, got ${out[3].weight}`);
  assert.ok(out[0].weight > out[1].weight && out[1].weight > out[2].weight && out[2].weight > out[3].weight);
  // The strip always fills.
  assert.ok(Math.abs(out.reduce((a, b) => a + b.weight, 0) - 100) < 0.5);
  // And still no number to print.
  assert.ok(!JSON.stringify(out).includes("80-85%"));
});

test("shares written as prose are read, and a missing one does not collapse a band", () => {
  assert.equal(parseShare("60-65%"), 62.5);
  assert.equal(parseShare("Less than 2%"), 2);
  assert.equal(parseShare("Approximately 2% magenta stitching"), 2);
  assert.equal(parseShare("a good amount"), null);
  assert.equal(parseShare(null), null);

  // One row with no share borrows the average rather than vanishing.
  const out = presentablePalette([
    { name: "given", hex: null, role: null, pct: "50%" },
    { name: "forgotten", hex: null, role: null, pct: null },
  ]);
  assert.ok(out[1].weight > 0);
  assert.equal(out[0].weight, out[1].weight);

  // No shares at all: equal bands, not a division by zero.
  const none = presentablePalette([
    { name: "a", hex: null, role: null, pct: null },
    { name: "b", hex: null, role: null, pct: null },
  ]);
  assert.deepEqual(none.map((b) => b.weight), [50, 50]);
});

test("the deck's strip is pre-rendered, proportional, and prints no numbers", () => {
  // The client-facing strip. If the presenter were merely told to compute these
  // widths, the one deck where it got the arithmetic wrong is the one a client
  // sees — so the markup is built here and placed verbatim.
  const html = paletteStripHtml([
    { name: "warm ivory", hex: "#F2ECE0", role: "the ground", pct: "80-85%" },
    { name: "signal red or magenta", hex: "#C4187C", role: "one moment", pct: "1-2%" },
  ]);

  // The ivory band is overwhelmingly wider than the signal.
  const flexes = [...html.matchAll(/flex:([\d.]+) 1 0/g)].map((m) => Number(m[1]));
  assert.equal(flexes.length, 4, "two bands and two labels");
  assert.ok(flexes[0] > 75 && flexes[1] < 3, `expected a dominant ivory, got ${flexes}`);
  // Her names are printed; the recipe is not.
  assert.ok(html.includes("warm ivory"));
  assert.ok(html.includes("signal red or magenta"));
  assert.ok(!html.includes("80-85%"));
  assert.ok(!html.includes("1-2%"));
  assert.ok(!html.includes("the ground"));
  // The hex paints the band but is never shown as text a reader could copy.
  assert.ok(html.includes("background:#F2ECE0"));
  assert.ok(!/>[^<]*#F2ECE0[^<]*</.test(html), "a hex leaked into visible text");
});

test("an empty palette produces no strip at all, not an empty box", () => {
  assert.equal(paletteStripHtml([]), "");
});

test("a cleared swatch keeps its width and is never given a colour", () => {
  const html = paletteStripHtml([
    { name: "named but unset", hex: null, role: null, pct: "50%" },
    { name: "chosen", hex: "#22293F", role: null, pct: "50%" },
  ]);
  assert.ok(html.includes("#EFE8DF"), "the house neutral stands in");
  assert.ok(html.includes("inset 0 0 0 1px #E0E0E0"), "with a hairline, so it reads as deliberate");
  const flexes = [...html.matchAll(/flex:([\d.]+) 1 0/g)].map((m) => Number(m[1]));
  assert.equal(flexes[0], flexes[1], "an unset colour still holds its share");
});

test("a colour name cannot inject markup into the deck", () => {
  const html = paletteStripHtml([
    { name: '"><script>alert(1)</script>', hex: null, role: null, pct: null },
  ]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("a malformed hex is dropped rather than passed through as broken CSS", () => {
  const out = presentablePalette([
    { name: "typo", hex: "#12345", role: null, pct: null },
    { name: "words", hex: "indigo", role: null, pct: null },
    { name: "good", hex: "#a1B2c3", role: null, pct: null },
  ]);
  assert.equal(out[0].hex, null);
  assert.equal(out[1].hex, null);
  assert.equal(out[2].hex, "#a1B2c3");
});

/* -------------------------------------------------------------------------- */
/* The pictures: her boards, and the client's own walls wearing them.          */
/* -------------------------------------------------------------------------- */

const BOARDS = [
  { url: "https://x/1.jpg", caption: "Roots of Intelligence" },
  { url: "https://x/2.jpg", caption: "Regional Talent" },
  { url: "https://x/3.jpg", caption: "Ideas in Motion" },
];
const COMPARISONS = [
  { beforeUrl: "https://x/bay.jpg", afterUrl: "https://x/bay-situ.jpg", label: "Admin bay" },
  { beforeUrl: "https://x/br.jpg", afterUrl: "https://x/br-situ.jpg", label: "Connecting bridge" },
];

test("boards go two across, the client's own rooms two across beneath them", () => {
  // The order is the argument: a client who cannot read flat artwork can read
  // their own reception, so the reception gets the space and the boards sit
  // above it. Boards used to scale to the number she made, up to five — which
  // rendered them 166px wide on a 1425px screen. They are capped at two now.
  const html = galleryHtml({ boards: BOARDS, comparisons: COMPARISONS });

  const boardsAt = html.indexOf("zy-boards");
  const situAt = html.indexOf("zy-situ");
  assert.ok(boardsAt > -1 && situAt > -1);
  assert.ok(boardsAt < situAt, "the boards row must come before the rooms");

  // Three boards still lay out two across; rooms always two across.
  assert.match(html.slice(boardsAt, situAt), /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html.slice(situAt), /repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((html.match(/zy-compare/g) ?? []).length, 2);
});

test("the reveal starts half-drawn, so the bare wall is visible without touching it", () => {
  const html = galleryHtml({ boards: [], comparisons: [COMPARISONS[0]] });
  assert.match(html, /clip-path:inset\(0 50% 0 0\)/);
  assert.match(html, /left:50%/);
  // Both states of the wall are present, and named for a screen reader.
  assert.match(html, /Admin bay as it is today/);
  assert.match(html, /Admin bay with the design applied/);
  // It is a visualisation and says so — the room is not a photograph of a
  // future that exists.
  assert.match(html, /Visualisation/);
});

test("every picture can be opened to the full width of the row", () => {
  const html = galleryHtml({ boards: BOARDS, comparisons: COMPARISONS });
  // Five tiles, five expand hooks, all keyboard reachable.
  assert.equal((html.match(/data-expand/g) ?? []).length, 5);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 5);
  assert.match(galleryStyles(), /\.zy-tile\.zy-open\{grid-column:1\/-1\}/);
});

test("no pictures at all is nothing, not an empty frame", () => {
  assert.equal(galleryHtml({ boards: [], comparisons: [] }), "");
  // Boards but no renders is the ordinary case before she has rendered any.
  const boardsOnly = galleryHtml({ boards: BOARDS, comparisons: [] });
  assert.ok(boardsOnly.includes("zy-boards"));
  assert.ok(!boardsOnly.includes("zy-situ"));
});

test("a space label cannot inject markup into a client's deck", () => {
  const html = galleryHtml({
    boards: [{ url: "https://x/a.jpg", caption: '<img onerror=alert(1)>' }],
    comparisons: [{ beforeUrl: "https://x/b.jpg", afterUrl: "https://x/c.jpg", label: '"><script>alert(1)</script>' }],
  });
  // Escaped, so it lands as visible text rather than as markup: the angle
  // brackets and quotes that would end an attribute or open a tag are gone.
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img onerror"));
  assert.ok(html.includes("&lt;img onerror"));
  assert.ok(html.includes("&lt;script&gt;"));
  // The label is used inside a double-quoted aria-label; a stray quote there
  // would end the attribute and start a new one.
  assert.ok(!/aria-label="[^"]*"[^>]*script/i.test(html));
});

test("the deck's script asks nothing of a sandbox that would refuse it", () => {
  // The portal serves decks with `sandbox allow-scripts` and no
  // allow-same-origin: storage throws outright and there is no origin to call.
  // A script that reaches for either dies silently on a client's screen.
  const js = galleryScript();
  for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "fetch(", "XMLHttpRequest", "//cdn", "http://", "https://"]) {
    assert.ok(!js.includes(forbidden), `the deck script must not use ${forbidden}`);
  }
  // Touch is a tap, not a drag — a thin handle is miserable with a thumb.
  assert.match(js, /pointerType==='touch'/);
  assert.match(js, /Tap to see it in place/);
  // And the compare view clones the chapters rather than rebuilding them.
  assert.match(js, /cloneNode\(true\)/);
});

test("two directions can be shortlisted and seen side by side", () => {
  const btn = shortlistButtonHtml(2, "Indian Modernist Geometry");
  assert.match(btn, /data-shortlist="2"/);
  assert.match(btn, /aria-pressed="false"/);

  const furniture = compareFurnitureHtml();
  assert.match(furniture, /class="zy-bar" hidden/);
  assert.match(furniture, /Compare side by side/);
  assert.match(furniture, /class="zy-view" hidden/);

  // Exactly two, ever: a third shortlist pushes the oldest out rather than
  // opening a comparison nobody can read.
  const js = galleryScript();
  assert.match(js, /picked\.length===2\)picked\.shift\(\)/);
  assert.match(js, /go\.disabled=picked\.length!==2/);
});

test("side by side means the same size — every column is minmax(0,1fr)", () => {
  // A bare `1fr` is `minmax(auto,1fr)`: a wide picture then widens its own
  // column. Measured in a browser, the two compare columns came out 749px and
  // 495px — a thumb on the scale in the one view built for deciding.
  const surfaces = [
    galleryStyles(),
    galleryScript(),
    galleryHtml({ boards: BOARDS, comparisons: COMPARISONS }),
  ].join("\n");
  const bare = surfaces.match(/(?<!minmax\(0,)\b1fr\b/g) ?? [];
  assert.equal(bare.length, 0, `every column must be minmax(0,1fr); found ${bare.length} bare 1fr`);
});

// ─── ensureChapterPalettes: the strip can never silently go missing ───────────
//
// The failure it guards: the presenter (or the reviewer after it) is told to
// place one pre-built palette strip per chapter, and once in a while drops
// exactly one — leaving a chapter that talks about "warm parchment and Bengal
// ink" with no colours the client can see. These pin the repair.

const PAL: PaletteSwatch[] = [
  { name: "warm parchment", hex: "#E8DFCB", role: null, pct: "60-65%" },
  { name: "Bengal ink", hex: "#22293F", role: null, pct: "20-25%" },
];
const OPTS = [
  { position: 1, palette: PAL },
  { position: 2, palette: PAL },
];
// A minimal two-chapter deck. Chapter 1 is MISSING its strip; chapter 2 has it.
const deck = (ch1HasStrip: boolean) => `<main>
<section data-chapter="1"><h2>One</h2><p>parchment and ink</p>${
  ch1HasStrip ? paletteStripHtml(PAL) : ""
}<div class="zy-gallery">boards…</div></section>
<section data-chapter="2"><h2>Two</h2><p>prose</p>${paletteStripHtml(PAL)}<div class="zy-gallery">boards…</div></section>
<table class="compare"><tr><td>One</td></tr></table>
</main>`;

test("ensureChapterPalettes re-inserts a strip the presenter dropped", () => {
  const { html, injected } = ensureChapterPalettes(deck(false), OPTS);
  assert.deepEqual(injected, [1], "only the missing chapter is touched");
  // Both chapters now carry exactly one strip each.
  assert.equal((html.match(/class="palette-strip"/g) ?? []).length, 2);
  // The repaired strip sits before chapter 1's gallery, where the house puts it.
  const ch1 = html.slice(html.indexOf('data-chapter="1"'), html.indexOf('data-chapter="2"'));
  assert.ok(ch1.indexOf("palette-strip") < ch1.indexOf("zy-gallery"), "strip precedes gallery");
});

test("ensureChapterPalettes leaves a complete deck byte for byte", () => {
  const complete = deck(true);
  const { html, injected } = ensureChapterPalettes(complete, OPTS);
  assert.equal(injected.length, 0, "nothing to inject");
  assert.equal(html, complete, "an already-correct deck is untouched");
});

test("ensureChapterPalettes never bleeds one chapter's strip into another", () => {
  // Chapter 1 missing, chapter 2 present: the repair must land inside chapter 1
  // and must not add a second strip to chapter 2.
  const { html } = ensureChapterPalettes(deck(false), OPTS);
  const ch2 = html.slice(html.indexOf('data-chapter="2"'));
  assert.equal((ch2.match(/class="palette-strip"/g) ?? []).length, 1, "chapter 2 keeps exactly one");
});

test("ensureChapterPalettes pins the whole chapter number (1 vs 10)", () => {
  const html = `<section data-chapter="10"><h2>Ten</h2><div class="zy-gallery">x</div></section>`;
  // Position 1 has no chapter here; the naive match would hit "10". It must not.
  const { injected } = ensureChapterPalettes(html, [{ position: 1, palette: PAL }]);
  assert.deepEqual(injected, [], "position 1 does not match data-chapter=10");
});

test("ensureChapterPalettes leaves a chapter alone when there is no gallery anchor", () => {
  const html = `<section data-chapter="1"><h2>One</h2><p>prose</p></section>`;
  const { html: out, injected } = ensureChapterPalettes(html, [{ position: 1, palette: PAL }]);
  assert.deepEqual(injected, [], "no trustworthy anchor — no blind injection");
  assert.equal(out, html);
});

// ─── the hero: one picture per direction, above the prose ────────────────────
//
// Measured before this existed: 2,524px of prose before the first image, and
// that image 166x111. These pin the repair — the picture leads, and it cannot
// be quietly dropped by the presenter or the reviewer.

const CMP = { beforeUrl: "https://x/before.jpg", afterUrl: "https://x/after.jpg", label: "Main reception" };
const BOARD = { url: "https://x/board.jpg", caption: "Roots of Intelligence" };

test("the hero prefers the client's own wall, and it drags", () => {
  const h = heroHtml({ comparison: CMP, board: BOARD });
  assert.match(h, /class="zy-hero"/);
  // It is the same reveal mechanism as the grid, not a lookalike.
  assert.match(h, /zy-compare/);
  assert.match(h, /data-compare/);
  assert.match(h, /Drag to compare/);
  assert.match(h, /Main reception/);
  // The board is NOT used when a wall exists.
  assert.ok(!h.includes("board.jpg"));
});

test("with no approved render the lead board is promoted, full width", () => {
  const h = heroHtml({ comparison: null, board: BOARD });
  assert.match(h, /class="zy-hero"/);
  assert.match(h, /board\.jpg/);
  // The full width of the column, at the picture's own proportions — the hero
  // used to be forced to 16/9, which cut the ends off panoramic artwork.
  assert.match(h, /width:100%;height:auto/);
  assert.match(h, /Roots of Intelligence/);
});

test("a direction with no pictures at all gets no empty frame", () => {
  assert.equal(heroHtml({ comparison: null, board: null }), "");
});

test("boards are two across, never five", () => {
  const five = galleryHtml({ boards: Array.from({ length: 5 }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: null })), comparisons: [] });
  assert.match(five, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // A single board still fills its row rather than sitting at half width.
  const one = galleryHtml({ boards: [BOARD], comparisons: [] });
  assert.match(one, /grid-template-columns:repeat\(1,minmax\(0,1fr\)\)/);
});

const heroDeck = (ch1HasHero: boolean) => `<main>
<section data-chapter="1"><p>01</p><h2>One</h2><p>tagline</p>${
  ch1HasHero ? heroHtml({ comparison: null, board: BOARD }) : ""
}<button type="button" class="zy-star" data-shortlist="1">Shortlist</button><p>prose</p><div class="zy-gallery">g</div></section>
<section data-chapter="2"><p>02</p><h2>Two</h2><p>tagline</p>${heroHtml({ comparison: CMP })}<button type="button" class="zy-star" data-shortlist="2">Shortlist</button><p>prose</p><div class="zy-gallery">g</div></section>
</main>`;

test("a hero the presenter dropped is re-inserted above the prose", () => {
  const heroes = [
    { position: 1, hero_html: heroHtml({ comparison: null, board: BOARD }) },
    { position: 2, hero_html: heroHtml({ comparison: CMP }) },
  ];
  const { html, injected } = ensureChapterHeroes(heroDeck(false), heroes);
  assert.deepEqual(injected, [1]);
  const ch1 = html.slice(html.indexOf('data-chapter="1"'), html.indexOf('data-chapter="2"'));
  // Above the prose is the whole point: hero before the shortlist button,
  // which itself sits before her first paragraph.
  assert.ok(ch1.indexOf("zy-hero") < ch1.indexOf("zy-star"), "hero precedes the shortlist button");
  assert.ok(ch1.indexOf("zy-hero") < ch1.indexOf("prose"), "hero precedes the prose");
  assert.equal((html.match(/class="zy-hero"/g) ?? []).length, 2);
});

test("a deck that already leads with its heroes is untouched", () => {
  const complete = heroDeck(true);
  const { html, injected } = ensureChapterHeroes(complete, [
    { position: 1, hero_html: heroHtml({ comparison: null, board: BOARD }) },
    { position: 2, hero_html: heroHtml({ comparison: CMP }) },
  ]);
  assert.equal(injected.length, 0);
  assert.equal(html, complete);
});

test("heroes survive the reviewer: captured from the composed deck, put back", () => {
  const composed = heroDeck(true);
  const captured = captureChapterHeroes(composed);
  assert.equal(captured.length, 2);
  assert.deepEqual(captured.map((c) => c.position), [1, 2]);
  // The captured block is the whole hero, balanced — not cut mid-tag.
  assert.match(captured[1].hero_html, /^<div class="zy-hero"/);
  assert.ok(captured[1].hero_html.endsWith("</div>"));
  assert.match(captured[1].hero_html, /Drag to compare/);

  // A reviewer that deleted both heroes has them restored byte for byte.
  const stripped = composed.replace(/<div class="zy-hero"[\s\S]*?<\/figure><\/div>/g, "");
  assert.ok(!stripped.includes("zy-hero"));
  const { html, injected } = ensureChapterHeroes(stripped, captured);
  assert.deepEqual(injected, [1, 2]);
  assert.ok(html.includes(captured[0].hero_html));
  assert.ok(html.includes(captured[1].hero_html));
});

// The crop that cut a tiger in half.
//
// Boards were drawn into a fixed 3:2 frame with object-fit:cover and the
// comparisons into 16:9. Any artwork that was not that shape lost its edges —
// and the artwork is panoramic, so what came off was the head of the tiger and
// the wing of the kingfisher. A deck may make a picture smaller. It may never
// decide which part of it the client is allowed to see.

test("no tile crops its picture", () => {
  const html =
    heroHtml({ board: BOARDS[0] }) +
    heroHtml({ comparison: COMPARISONS[0] }) +
    galleryHtml({ boards: BOARDS, comparisons: COMPARISONS });
  assert.ok(!/object-fit:cover/.test(html), "a tile still crops with object-fit:cover");
  assert.ok(!/aspect-ratio:1?[0-9]+\/[0-9]+/.test(html), "a tile still forces a frame ratio");
  // Whole picture, own proportions, sized down to the column.
  assert.ok(html.includes("width:100%;height:auto"));
});

test("the compare's base picture sets the height, and the overlay matches it", () => {
  const html = heroHtml({ comparison: COMPARISONS[0] });
  // The wall as it stands is in flow — the frame is exactly as tall as it is.
  assert.match(html, /as it is today[^>]*style="position:relative;display:block;width:100%;height:auto"/);
  // The proposal is laid over it, and fits inside rather than filling by crop.
  assert.match(html, /with the design applied[^>]*object-fit:contain/);
  // The wipe still works: one clipped layer, one divider.
  assert.match(html, /clip-path:inset\(0 50% 0 0\)/);
});

test("the stylesheet un-crops a deck that was composed before the fix", () => {
  const css = galleryStyles();
  assert.match(css, /\.zy-tile img\{[^}]*object-fit:contain!important/);
  assert.match(css, /\.zy-tile img\{[^}]*aspect-ratio:auto!important/);
  // The overlay must stay an overlay: its rule comes later and is more
  // specific, or the compare collapses into two stacked pictures.
  const tile = css.indexOf(".zy-tile img{");
  const after = css.indexOf(".zy-compare .zy-after img{");
  assert.ok(after > tile, "the overlay rule must come after the blanket tile rule");
  assert.match(css, /\.zy-compare \.zy-after img\{[^}]*height:100%!important/);
});

test("restyleDeck updates a composed deck's stylesheet and nothing else", () => {
  const deck =
    "<!doctype html><html><head><style>.zy-tile.zy-open{grid-column:1/-1}</style></head>" +
    '<body><p>Two creatures belong unmistakably to this part of the world.</p>' +
    '<img style="aspect-ratio:3/2;object-fit:cover"></body></html>';
  const out = restyleDeck(deck);
  // Her prose and the presenter's markup are untouched.
  assert.ok(out.includes("Two creatures belong unmistakably to this part of the world."));
  assert.ok(out.includes('style="aspect-ratio:3/2;object-fit:cover"'));
  // The new rules arrive last in the head, so they win over what came before.
  assert.ok(out.indexOf("data-zy-restyle") < out.indexOf("</head>"));
  assert.ok(out.includes("object-fit:contain!important"));
  // Twice is the same as once — she can click it again without stacking blocks.
  const twice = restyleDeck(out);
  assert.equal((twice.match(/data-zy-restyle/g) ?? []).length, 1);
  assert.equal(twice, out);
});

test("restyleDeck still places its block when there is no head", () => {
  const out = restyleDeck("<section>fragment</section>");
  assert.ok(out.startsWith("<style data-zy-restyle>"));
  assert.ok(out.includes("<section>fragment</section>"));
});

// The Admin bay pair: a full-width mockup revealed over a centre-cropped base.
test("a comparison's before can be repointed at the photograph it was made from", () => {
  const base = "studio/p1/prep/img-base-abc.png";
  const deck =
    '<figure class="zy-compare">' +
    `<img alt="Admin bay as it is today" src="https://s.co/object/sign/presentations/${base}?token=OLD">` +
    '<div class="zy-after"><img alt="Admin bay with the design applied" src="https://s.co/after?token=X"></div>' +
    "</figure>";
  const { html, repaired } = repairComparisonBases(deck, [
    { fromPath: base, toUrl: "https://s.co/object/sign/presentations/studio/p1/photo?token=NEW" },
  ]);
  assert.equal(repaired, 1);
  assert.ok(!html.includes(base), "the prep base is gone");
  assert.ok(html.includes("studio/p1/photo?token=NEW"));
  // Only the before moved; the render and the markup around it are untouched.
  assert.ok(html.includes('src="https://s.co/after?token=X"'));
  assert.ok(html.includes('alt="Admin bay as it is today"'));
});

test("a repair with nothing to match changes nothing", () => {
  const deck = '<img src="https://s.co/object/sign/presentations/studio/p1/photo?token=A">';
  assert.deepEqual(repairComparisonBases(deck, [{ fromPath: "studio/p1/prep/other.png", toUrl: "x" }]),
    { html: deck, repaired: 0 });
  // A half-specified swap is skipped rather than writing an empty src.
  assert.deepEqual(repairComparisonBases(deck, [{ fromPath: "studio/p1/photo", toUrl: "" }]),
    { html: deck, repaired: 0 });
});
