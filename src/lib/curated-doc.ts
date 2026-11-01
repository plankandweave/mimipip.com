// Curated mode's pure text rules, kept out of proposal-studio.ts so they can be
// tested without an AI key and imported by anything.
//
// Both functions exist to make a promise mechanical rather than instructional.
//
//   splitCuratedBlocks    — "her prose is reproduced verbatim". A model asked to
//                           reproduce twelve thousand characters exactly will
//                           mostly do it, and the one time it silently tidies a
//                           sentence is the time it reaches a client. So the
//                           document is sliced by code and the model never
//                           carries the prose at all: it only says which block
//                           is which.
//   presentablePalette    — "palette details are internal". The client deck
//                           shows a swatch and her colour name, nothing else:
//                           hexes-as-text, percentages and roles are recipe,
//                           not presentation (her call, 2026-09-06 — a
//                           competitor reading the deck should learn nothing
//                           they could mix from). So the presenter is only ever
//                           handed name + hex + weight — and cannot print what
//                           it never saw. The share survives as the WIDTH of
//                           each band, so an 85%-ivory palette looks like one
//                           without the figure appearing as text. The full
//                           recipe stays on the option row, and
//                           paletteSheetHtml exports it when a client asks.

/** One swatch. `name` is hers and required. Everything else may be missing, and
 *  missing is a finished state: a swatch with no hex is rendered in the deck as
 *  a neutral labelled chip, never as a colour someone guessed. */
export type PaletteSwatch = {
  name: string;
  hex: string | null;
  role: string | null;
  pct: string | null;
  /** Parser's guess, never authoritative, never shown to the presenter. */
  hex_suggestion?: string | null;
};

export type CuratedOption = {
  position: number;
  title: string;
  tagline: string;
  body_md: string;
  palette: PaletteSwatch[];
};

/** Split a curated document into its top-level `# ` blocks, keeping the heading
 *  line with its block and everything before the first heading as a preamble.
 *  `## ` and deeper stay inside their block — her sub-headings are part of the
 *  prose and are set as written. */
export function splitCuratedBlocks(doc: string): { heading: string; text: string }[] {
  const lines = doc.replace(/\r\n/g, "\n").split("\n");
  const blocks: { heading: string; text: string }[] = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (heading || text) blocks.push({ heading, text });
  };
  for (const line of lines) {
    if (/^# (?!#)/.test(line)) {
      flush();
      heading = line.replace(/^#\s+/, "").trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Read a share she typed as a number. Her documents write these as ranges
 *  ("60-65%"), as prose ("Less than 2%", "Approximately 2%"), or as a plain
 *  figure — so take the numbers present and use their midpoint. Null when there
 *  is no number to find. */
export function parseShare(pct: string | null | undefined): number | null {
  if (!pct) return null;
  const found = pct.match(/\d+(?:\.\d+)?/g);
  if (!found?.length) return null;
  const nums = found.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return (Math.min(...nums) + Math.max(...nums)) / 2;
}

/** What the presenter is allowed to see of a palette: the name she wrote, the
 *  hex purely so a band can be painted, and `weight` — the share expressed as a
 *  fraction of the strip rather than as a number to print.
 *
 *  The weight is the point. A palette that is 85% ivory should LOOK 85% ivory:
 *  the client sees the balance instead of reading "80-85%" and doing the
 *  arithmetic, and the figure itself never appears as text a competitor could
 *  lift. Shares are normalised to fill the strip; where she gave no share at
 *  all, every band is equal. */
export function presentablePalette(
  palette: PaletteSwatch[],
): { name: string; hex: string | null; weight: number }[] {
  const shares = palette.map((p) => parseShare(p.pct));
  const known = shares.filter((s): s is number => s !== null);
  // A partly-filled palette borrows the average for the rest, so one forgotten
  // share cannot collapse a band to nothing.
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = shares.map((s) => s ?? fallback);
  const total = weights.reduce((a, b) => a + b, 0) || palette.length || 1;

  return palette.map((p, i) => ({
    name: p.name,
    hex: p.hex && HEX.test(p.hex) ? p.hex : null,
    weight: Number(((weights[i] / total) * 100).toFixed(2)),
  }));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The palette strip as finished HTML, for the client deck.
 *
 *  Pre-rendered rather than described, because a model asked to work out flex
 *  weights from percentages will mostly get it right and occasionally not —
 *  and the one deck where the ivory comes out equal to the magenta is the one
 *  a client sees. The presenter is handed this block and told to place it; it
 *  is built from the same presentablePalette the studio previews, so the strip
 *  she approves is byte-for-byte the strip that goes out.
 *
 *  Self-contained inline styles: the deck is one file and this fragment has to
 *  survive being dropped into it without depending on a class the presenter
 *  may or may not have written. */
export function paletteStripHtml(palette: PaletteSwatch[]): string {
  const bands = presentablePalette(palette);
  if (!bands.length) return "";

  const swatches = bands
    .map((b) => {
      // A cleared swatch gets the house neutral plus a hairline, so it reads as
      // a deliberate blank rather than a colour someone chose.
      const style =
        `flex:${b.weight} 1 0;display:block;background:${b.hex ?? "#EFE8DF"}` +
        (b.hex ? "" : ";box-shadow:inset 0 0 0 1px #E0E0E0");
      return `<span style="${style}" title="${esc(b.name)}"></span>`;
    })
    .join("");

  // Names track their band. A band too narrow to hold its name still carries it
  // as a title attribute rather than showing a truncated word.
  const labels = bands
    .map(
      (b) =>
        `<span style="flex:${b.weight} 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;` +
        `white-space:nowrap;font-size:12px;line-height:1.4;color:#6B6B6B" title="${esc(b.name)}">` +
        `${esc(b.name)}</span>`,
    )
    .join("");

  return (
    `<div class="palette-strip" style="margin:32px 0 8px">` +
    `<div style="display:flex;height:96px;width:100%;overflow:hidden;border-radius:4px">${swatches}</div>` +
    `<div style="display:flex;gap:8px;margin-top:8px">${labels}</div>` +
    `</div>`
  );
}

/** The chapter a direction owns in the composed deck: the `<section>` carrying
 *  `data-chapter="<position>"`, bounded by the next chapter's section so the
 *  region never reaches into its neighbour. Null when the presenter left no
 *  chapter for this position at all — a structural miss this function does not
 *  try to paper over, because fabricating a whole chapter is not the same
 *  promise as guaranteeing one already-built block inside it. */
function chapterRegion(html: string, position: number): { start: number; end: number } | null {
  // `data-chapter="1"` must not match inside `data-chapter="10"`; the negative
  // lookahead pins the whole number. Quotes optional, spacing forgiving.
  const attr = new RegExp(`data-chapter=["']?${position}(?![0-9])`);
  const m = attr.exec(html);
  if (!m) return null;
  const openBefore = html.lastIndexOf("<section", m.index);
  const start = openBefore >= 0 ? openBefore : m.index;
  // End at the START of the next chapter's section, so the first gallery we find
  // after `start` is unambiguously this chapter's and not the next one's.
  const nextAttr = /data-chapter=["']?\d/.exec(html.slice(m.index + 1));
  if (!nextAttr) return { start, end: html.length };
  const nextAt = m.index + 1 + nextAttr.index;
  const nextOpen = html.lastIndexOf("<section", nextAt);
  return { start, end: nextOpen > start ? nextOpen : html.length };
}

/** Guarantee every direction's palette strip is actually in the deck.
 *
 *  The presenter is *told* to place the pre-built `palette_strip_html` in each
 *  chapter, and the reviewer is *told* to leave it — and a model told to place
 *  one finished block per chapter across five chapters will, once in a while,
 *  drop exactly one. The chapter whose strip goes missing then reads as prose
 *  about "warm parchment and Bengal ink" with no colours the client can see.
 *
 *  So the strip stops being the model's responsibility here: for each option we
 *  find its chapter, and if the strip is not already inside it we insert it in
 *  the one place the house structure puts it — immediately before that
 *  chapter's gallery. A chapter that already has its strip is left byte for
 *  byte. This runs on the composed deck and again on the reviewed one, so
 *  whichever agent dropped it, the client still sees it. */
export function ensureChapterPalettes(
  html: string,
  options: { position: number; palette: PaletteSwatch[] }[],
): { html: string; injected: number[] } {
  let out = html;
  const injected: number[] = [];
  for (const o of [...options].sort((a, b) => a.position - b.position)) {
    const strip = paletteStripHtml(o.palette);
    if (!strip) continue; // no palette to show — nothing to guarantee
    const region = chapterRegion(out, o.position);
    if (!region) continue;
    const chapter = out.slice(region.start, region.end);
    if (/class=["'][^"']*\bpalette-strip\b/.test(chapter)) continue; // already there
    // The strip sits just before the gallery, exactly where the presenter was
    // asked to put it. The gallery is the reliable anchor: every chapter has
    // one, and its class is left untouched by the reviewer.
    const galleryIdx = chapter.search(/<[^>]*class=["'][^"']*\bzy-gallery\b/);
    if (galleryIdx < 0) continue; // no anchor we can trust — leave the chapter be
    const patched = chapter.slice(0, galleryIdx) + strip + chapter.slice(galleryIdx);
    out = out.slice(0, region.start) + patched + out.slice(region.end);
    injected.push(o.position);
  }
  return { html: out, injected };
}

/** Guarantee every direction leads with its hero picture.
 *
 *  The same promise as ensureChapterPalettes, for the same reason: the hero is
 *  handed to the presenter finished and it is told where to put it, and a model
 *  placing one block per chapter across five chapters will eventually place
 *  four. The chapter that loses its hero is the chapter that goes back to six
 *  hundred words before a picture, which is the whole thing this was built to
 *  stop — so it is not left to the model.
 *
 *  The hero goes immediately BEFORE the shortlist button, which puts it under
 *  her title and tagline and above the prose. That button is the reliable
 *  anchor: it is a finished block with a stable class the reviewer is told
 *  never to touch. Falling back to just after the heading covers a chapter
 *  whose button went missing too. */
export function ensureChapterHeroes(
  html: string,
  heroes: { position: number; hero_html: string }[],
): { html: string; injected: number[] } {
  let out = html;
  const injected: number[] = [];
  for (const h of [...heroes].sort((a, b) => a.position - b.position)) {
    if (!h.hero_html) continue; // a direction with no picture at all
    const region = chapterRegion(out, h.position);
    if (!region) continue;
    const chapter = out.slice(region.start, region.end);
    if (/class=["'][^"']*\bzy-hero\b/.test(chapter)) continue; // already there
    let at = chapter.search(/<button[^>]*\bclass=["'][^"']*\bzy-star\b/);
    if (at < 0) {
      const closeH2 = chapter.search(/<\/h2>/i);
      if (closeH2 < 0) continue; // no anchor we can trust — leave the chapter be
      at = closeH2 + "</h2>".length;
    }
    const patched = chapter.slice(0, at) + h.hero_html + chapter.slice(at);
    out = out.slice(0, region.start) + patched + out.slice(region.end);
    injected.push(h.position);
  }
  return { html: out, injected };
}

/** Pull each chapter's hero block back out of a composed deck.
 *
 *  The reviewer runs on the composed deck and can drop a block just as the
 *  presenter can, so the hero has to be re-asserted afterwards — but rebuilding
 *  it would mean minting twenty-five signed URLs again. Reading the block back
 *  out of the deck we just built is cheaper and exact: what gets re-inserted is
 *  byte-for-byte what the presenter was given.
 *
 *  Counting <div> opens against closes is safe here precisely because this is
 *  our own generated markup, not arbitrary HTML. */
export function captureChapterHeroes(html: string): { position: number; hero_html: string }[] {
  const found: { position: number; hero_html: string }[] = [];
  const seen = new Set<number>();
  const chapters = /data-chapter=["']?(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = chapters.exec(html))) {
    const position = Number(m[1]);
    if (seen.has(position)) continue;
    seen.add(position);
    const region = chapterRegion(html, position);
    if (!region) continue;
    const chapter = html.slice(region.start, region.end);
    const openIdx = chapter.search(/<div[^>]*\bclass=["'][^"']*\bzy-hero\b/);
    if (openIdx < 0) continue;

    const tags = /<\/?div\b/g;
    tags.lastIndex = openIdx;
    let depth = 0;
    let closeAt = -1;
    let t: RegExpExecArray | null;
    while ((t = tags.exec(chapter))) {
      depth += t[0] === "</div" ? -1 : 1;
      if (depth === 0) { closeAt = chapter.indexOf(">", tags.lastIndex); break; }
    }
    if (closeAt < 0) continue; // unbalanced — better to skip than to cut mid-tag
    found.push({ position, hero_html: chapter.slice(openIdx, closeAt + 1) });
  }
  return found;
}

/** The internal colour record as a sendable file: every direction's full
 *  palette — name, hex, share, role — in the house look, print-ready. This is
 *  what goes out when a client asks "could you send me the colour palette?",
 *  and only then; the proposal deck itself never carries these details. */
export function paletteSheetHtml(input: {
  proposalTitle: string;
  clientName: string;
  options: Pick<CuratedOption, "position" | "title" | "palette">[];
}): string {
  const sections = [...input.options]
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const rows = o.palette
        .map((p) => {
          const hex = p.hex && HEX.test(p.hex) ? p.hex : null;
          return `<tr>
  <td><span class="chip" style="background:${hex ?? "#EFE8DF"}"></span></td>
  <td class="name">${esc(p.name)}</td>
  <td class="mono">${hex ? esc(hex) : "—"}</td>
  <td>${p.pct ? esc(p.pct) : "—"}</td>
  <td class="muted">${p.role ? esc(p.role) : ""}</td>
</tr>`;
        })
        .join("\n");
      // Literally the client's strip, so the sheet and the deck are recognisably
      // the same palette — with the numbers added beneath, which is the only
      // difference between an internal record and a client-facing one.
      const strip = paletteStripHtml(o.palette);

      return `<section>
<p class="eyebrow">0${o.position} — ${esc(o.title)}</p>
${strip}
<table>
<thead><tr><th></th><th>Colour</th><th>Value</th><th>Share</th><th>Role</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(input.proposalTitle)} — colour palettes</title>
<style>
  :root { --bg:#FAFAF8; --ink:#2D2D2D; --soft:#6B6B6B; --line:#E0E0E0; --wash:#F3EEE7; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.6 Inter, -apple-system, "Segoe UI", sans-serif; padding:56px 24px; }
  main { max-width:760px; margin:0 auto; }
  h1 { font-size:clamp(22px,3vw,30px); margin:0 0 4px; }
  .lede { color:var(--soft); margin:0 0 40px; }
  .eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:11px;
             font-weight:600; color:var(--soft); margin:36px 0 10px; }
  table { width:100%; border-collapse:collapse; background:#fff;
          border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
       color:var(--soft); font-weight:600; padding:10px 12px; background:var(--wash); }
  td { padding:10px 12px; border-top:1px solid var(--line); vertical-align:middle; }
  .chip { display:block; width:26px; height:26px; border-radius:6px; border:1px solid var(--line); }
  .strip { display:flex; height:64px; width:100%; overflow:hidden; border-radius:8px;
           border:1px solid var(--line); margin:0 0 12px; }
  .strip span { display:block; }
  .name { font-weight:600; }
  .mono { font-family:ui-monospace, Menlo, monospace; font-size:12.5px; }
  .muted { color:var(--soft); font-size:12.5px; }
  footer { margin-top:48px; text-align:center; letter-spacing:.3em; font-size:11px; color:var(--soft); }
  @media print { body { padding:24px; } section { break-inside:avoid; } }
</style>
</head>
<body>
<main>
<p class="eyebrow">Zyvorah for Workplaces · Prepared for ${esc(input.clientName)}</p>
<h1>${esc(input.proposalTitle)}</h1>
<p class="lede">The colour palettes, one per direction — for use across other media.</p>
${sections}
<footer>Z Y V O R A H</footer>
</main>
</body>
</html>`;
}

/* ========================================================================== */
/* The chapter's pictures: her boards, and the client's own walls wearing them */
/* ========================================================================== */

/** One before/after pair: the wall as photographed, and the wall as proposed. */
export type Comparison = {
  /** The bare wall. */
  beforeUrl: string;
  /** The same wall with the direction applied. */
  afterUrl: string;
  /** Her label for the space — "Admin bay", "Connecting bridge". */
  label: string | null;
};

/** A flat concept board with the chapter of the story it carries. */
export type Board = { url: string; caption: string | null };

/** One drag-to-compare figure: the wall as it stands, the wall as proposed, and
 *  a divider between them. Shared by the chapter's hero and the grid beneath it
 *  so a client is never handed two reveals that behave differently — only the
 *  container's width changes, never the mechanism. */
function compareFigure(c: Comparison): string {
  const label = c.label ?? "This wall";
  return (
    `<figure class="zy-tile zy-compare" data-expand data-compare tabindex="0" role="group"` +
    ` aria-label="${esc(label)} — drag or tap to compare the wall as it is with the wall as proposed"` +
    ` style="margin:0;position:relative;user-select:none;touch-action:pan-y">` +
    `<div class="zy-frame" style="position:relative;width:100%;overflow:hidden;` +
    `border-radius:4px;background:#EFE8DF;cursor:ew-resize">` +
    `<img src="${esc(c.beforeUrl)}" alt="${esc(label)} as it is today" loading="lazy" decoding="async"` +
    ` draggable="false" style="position:relative;display:block;width:100%;height:auto">` +
    `<div class="zy-after" style="position:absolute;inset:0;clip-path:inset(0 50% 0 0)">` +
    `<img src="${esc(c.afterUrl)}" alt="${esc(label)} with the design applied" loading="lazy" decoding="async"` +
    ` draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` +
    `</div>` +
    `<div class="zy-divider" style="position:absolute;top:0;bottom:0;left:50%;width:1px;` +
    `background:rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.12);pointer-events:none">` +
    `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:34px;` +
    `border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);display:flex;align-items:center;` +
    `justify-content:center;font-size:13px;color:#2D2D2D">&#8596;</span></div>` +
    `<span class="zy-pill" style="position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.92);` +
    `border-radius:999px;padding:5px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;` +
    `color:#2D2D2D;pointer-events:none">Drag to compare</span>` +
    `</div>` +
    `<figcaption style="font-size:12px;color:#6B6B6B;margin-top:6px;display:flex;justify-content:space-between;gap:8px">` +
    `<span>${esc(label)}</span><span>Visualisation</span></figcaption>` +
    `</figure>`
  );
}

/**
 * ONE picture per direction, at full width, placed ABOVE her prose.
 *
 * Measured on the deck as it stood: a client scrolled 2,524px of a 2,732px
 * chapter before meeting a single image, and the image when it arrived was
 * 166x111px. The artwork IS the pitch, and it was arriving last and thumbnail-
 * sized. So each direction now leads with one full-width visual.
 *
 * Their own wall wins the slot whenever a render has been approved — a client
 * who cannot read flat artwork can always read their own reception. Where no
 * render exists yet the first concept board is promoted instead, so no
 * direction is left with six hundred words and nothing to look at.
 */
export function heroHtml(input: { comparison?: Comparison | null; board?: Board | null }): string {
  const { comparison, board } = input;
  if (comparison) {
    return `<div class="zy-hero" style="margin:24px 0 8px">${compareFigure(comparison)}</div>`;
  }
  if (board) {
    const caption = board.caption ?? "Concept board";
    return (
      `<div class="zy-hero" style="margin:24px 0 8px">` +
      `<figure class="zy-tile" data-expand tabindex="0" role="button"` +
      ` aria-label="Expand ${esc(caption)}" style="margin:0;cursor:zoom-in">` +
      `<img src="${esc(board.url)}" alt="${esc(caption)}" loading="lazy" decoding="async"` +
      ` style="width:100%;height:auto;border-radius:4px;display:block">` +
      `<figcaption style="font-size:12px;color:#6B6B6B;margin-top:6px">${esc(caption)}</figcaption>` +
      `</figure></div>`
    );
  }
  return "";
}

/**
 * The whole media block for one direction's chapter, as finished markup.
 *
 * Order is Roheena's and it is an argument, not a layout preference: the boards
 * go TWO ACROSS — at five they rendered 166px wide, which is a postage stamp
 * for artwork someone is being asked to choose between — and the client's own
 * rooms go underneath, two across, big. A client who cannot read flat artwork
 * can read their own reception, so the reception is what gets the space.
 *
 * Pre-rendered for the same reason the palette strip is: an interactive widget
 * described in prose to a language model comes back subtly different in every
 * deck, and the one deck where the divider does not drag is the one a client
 * opens. The presenter places this verbatim.
 *
 * Every tile is expandable to the full width of the row — the pictures are the
 * pitch, and a reader who wants one bigger should not have to ask.
 */
export function galleryHtml(input: { boards: Board[]; comparisons: Comparison[] }): string {
  const { boards, comparisons } = input;
  if (!boards.length && !comparisons.length) return "";

  // Two across, never more: five columns put each board at 166px on a 1425px
  // screen. Fewer boards still fill the row. Below 640px the deck's own
  // stylesheet collapses both grids to one column.
  const across = Math.min(Math.max(boards.length, 1), 2);
  const boardsRow = boards.length
    ? `<div class="zy-boards" style="display:grid;grid-template-columns:repeat(${across},minmax(0,1fr));align-items:start;gap:10px;margin:28px 0 0">` +
      boards
        .map(
          (b) =>
            `<figure class="zy-tile" data-expand tabindex="0" role="button"` +
            ` aria-label="Expand ${esc(b.caption ?? "this board")}" style="margin:0;cursor:zoom-in">` +
            `<img src="${esc(b.url)}" alt="${esc(b.caption ?? "Concept board")}" loading="lazy" decoding="async"` +
            ` style="width:100%;height:auto;border-radius:4px;display:block">` +
            (b.caption
              ? `<figcaption style="font-size:12px;color:#6B6B6B;margin-top:6px">${esc(b.caption)}</figcaption>`
              : "") +
            `</figure>`,
        )
        .join("") +
      `</div>`
    : "";

  // The reveal itself. Two stacked images; the "after" is clipped from the
  // right, so at 0% the client sees their wall exactly as it stands today.
  const comparisonsRow = comparisons.length
    ? `<div class="zy-situ" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:14px;margin:22px 0 0">` +
      comparisons.map(compareFigure).join("") +
      `</div>`
    : "";

  return `<div class="zy-gallery">${boardsRow}${comparisonsRow}</div>`;
}

/**
 * Repoint a comparison's "before" picture inside a deck that is already composed.
 *
 * The before and the after have to be the same view of the room, or the wipe
 * compares two different photographs. Where a render was made from the client's
 * own photograph but the deck was built against the prep base — the photograph
 * re-shaped and centre-cropped to the image model's canvas — the drag revealed
 * a wider mockup over a narrower crop, and the two did not line up.
 *
 * Each swap names a storage path to look for and the URL to put in its place.
 * The URL in the deck is a signed one whose token cannot be predicted, so the
 * match is on the path inside it, which is stable.
 */
export function repairComparisonBases(
  html: string,
  swaps: { fromPath: string; toUrl: string }[],
): { html: string; repaired: number } {
  let out = html;
  let repaired = 0;
  for (const { fromPath, toUrl } of swaps) {
    if (!fromPath || !toUrl) continue;
    const needle = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`src="[^"]*${needle}[^"]*"`, "g");
    out = out.replace(pattern, () => {
      repaired += 1;
      return `src="${toUrl}"`;
    });
  }
  return { html: out, repaired };
}

/**
 * Re-apply the current stylesheet to a deck that has already been composed.
 *
 * A composed deck is a finished file in Supabase storage, and the links a
 * client is holding point straight at it. When a rule in galleryStyles() turns
 * out to be wrong — a frame ratio that cropped the subject out of the artwork,
 * say — the choice used to be between re-composing (which puts the prose back
 * through a language model and returns something subtly different) and leaving
 * a client looking at the fault. This is the third option: the markup and every
 * word stay exactly as they were, and only the stylesheet is brought up to date.
 *
 * The block is marked, so applying it twice replaces rather than accumulates.
 * It goes last in <head>, after the presenter's own styles, and its rules carry
 * !important — an old deck states its crops as inline styles on each tile.
 */
export function restyleDeck(html: string): string {
  const block = `<style data-zy-restyle>${galleryStyles()}</style>`;
  const previous = /<style data-zy-restyle>[\s\S]*?<\/style>/;
  if (previous.test(html)) return html.replace(previous, block);
  const head = html.indexOf("</head>");
  if (head !== -1) return html.slice(0, head) + block + html.slice(head);
  // No <head> to speak of: the deck is a fragment, so lead with the styles.
  return block + html;
}

/** The styles the gallery, the shortlist and the compare view need, as one
 *  block for the deck's <head>. Kept out of the fragments so a chapter's markup
 *  stays readable and the rules are stated once. */
export function galleryStyles(): string {
  return `
.zy-tile.zy-open{grid-column:1/-1}
.zy-tile:focus-visible{outline:2px solid #8C7B6B;outline-offset:3px}
/* NOTHING IS CROPPED. A fixed frame ratio with object-fit:cover cut the head
   and the tail off a tiger board and a wing off a kingfisher — the subject of
   the artwork, trimmed away by the layout. Every tile is now as tall as its
   own picture. Stated with !important because decks composed before this and
   already sitting in a client's hands carry the old crop as an inline style;
   restyleDeck() puts this block into one of those without touching a word. */
.zy-tile img{aspect-ratio:auto!important;height:auto!important;object-fit:contain!important}
.zy-tile.zy-open .zy-frame{aspect-ratio:auto!important}
.zy-compare .zy-frame{aspect-ratio:auto!important;height:auto!important}
.zy-compare .zy-frame>img{position:relative!important;inset:auto!important;display:block;width:100%!important;height:auto!important}
.zy-compare .zy-after{position:absolute!important;inset:0!important}
.zy-compare .zy-after img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important}
.zy-compare.zy-touch .zy-frame{cursor:pointer}
.zy-compare.zy-touch .zy-divider{display:none}
.zy-compare.zy-touch .zy-after{transition:opacity .45s ease}
.zy-star{display:inline-flex;align-items:center;gap:6px;border:1px solid #E0E0E0;background:#fff;border-radius:999px;
  padding:6px 14px;font:inherit;font-size:12px;color:#6B6B6B;cursor:pointer;margin-top:10px}
.zy-star[aria-pressed="true"]{background:#2D2D2D;border-color:#2D2D2D;color:#fff}
.zy-bar{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.97);border-top:1px solid #E0E0E0;
  padding:12px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:13px;z-index:40;
  box-shadow:0 -2px 12px rgba(0,0,0,.06)}
.zy-bar[hidden]{display:none}
.zy-bar button{font:inherit;border-radius:999px;border:1px solid #E0E0E0;background:#fff;padding:6px 14px;cursor:pointer}
.zy-bar .zy-go{background:#2D2D2D;border-color:#2D2D2D;color:#fff}
.zy-bar .zy-go[disabled]{opacity:.35;cursor:default}
.zy-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #E0E0E0;border-radius:999px;padding:5px 12px}
.zy-view{position:fixed;inset:0;background:#FAFAF8;z-index:50;overflow:auto;padding:56px 20px 24px}
.zy-view[hidden]{display:none}
.zy-view-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;max-width:1400px;margin:0 auto}
.zy-view h3{font-size:clamp(18px,2.2vw,24px);margin:0 0 10px}
.zy-close{position:fixed;top:14px;right:16px;z-index:51;font:inherit;font-size:13px;border-radius:999px;
  border:1px solid #E0E0E0;background:#fff;padding:8px 16px;cursor:pointer}
@media (max-width:640px){
  .zy-boards{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .zy-situ{grid-template-columns:minmax(0,1fr)!important}
  .zy-view-grid{grid-template-columns:minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){.zy-compare .zy-after{transition:none!important}}
@media print{.zy-bar,.zy-star,.zy-close{display:none!important}}`;
}

/**
 * The deck's one script: the reveal, the expand, the shortlist, the side-by-side.
 *
 * Vanilla and self-contained on purpose. The portal serves a deck into an
 * iframe with `sandbox allow-scripts` and NO `allow-same-origin`, so there is
 * no storage to write to (localStorage throws outright) and no origin to talk
 * to — every piece of state below is a variable, and that is the ceiling.
 *
 * The reveal's behaviour is ported from the projects book's WallReveal rather
 * than reinvented: mouse drags a divider, touch taps to cross-fade. A thin
 * draggable handle is miserable with a thumb and fights the page scroll, and
 * most of these links are opened on a phone.
 *
 * The compare view CLONES the chapters' own nodes. Rebuilding the pictures a
 * second time would be a second thing to keep in step, and the copy that drifts
 * is always the one the decision-maker is looking at.
 */
export function galleryScript(): string {
  return `<script>(function(){
var D=document;
function pct(f,x){var b=f.getBoundingClientRect();if(!b.width)return 50;
  return Math.min(100,Math.max(0,((x-b.left)/b.width)*100));}
function setSplit(fig,v){var a=fig.querySelector('.zy-after'),d=fig.querySelector('.zy-divider');
  if(a)a.style.clipPath='inset(0 '+(100-v)+'% 0 0)';if(d)d.style.left=v+'%';}
function reveal(fig,on){var a=fig.querySelector('.zy-after'),p=fig.querySelector('.zy-pill');
  if(a){a.style.clipPath='none';a.style.opacity=on?'1':'0';}
  if(p)p.textContent=on?'Tap for the bare wall':'Tap to see it in place';}

// One set of listeners on the document, so cloned tiles in the compare view
// behave exactly like the originals without being wired up again.
var drag=null;
D.addEventListener('pointerdown',function(e){
  var fig=e.target.closest&&e.target.closest('.zy-compare');if(!fig)return;
  if(e.pointerType==='touch'){
    if(!fig.classList.contains('zy-touch')){fig.classList.add('zy-touch');fig.__on=true;}
    fig.__on=!fig.__on;reveal(fig,fig.__on);return;}
  var f=fig.querySelector('.zy-frame');if(!f)return;
  drag=fig;fig.__f=f;
  try{fig.setPointerCapture(e.pointerId);}catch(_){}
  var a=fig.querySelector('.zy-after');if(a){a.style.transition='none';}
  setSplit(fig,pct(f,e.clientX));
});
D.addEventListener('pointermove',function(e){if(drag)setSplit(drag,pct(drag.__f,e.clientX));});
D.addEventListener('pointerup',function(){drag=null;});
D.addEventListener('pointercancel',function(){drag=null;});
// A native image drag swallows the pointermove stream mid-slide.
D.addEventListener('dragstart',function(e){if(e.target.closest&&e.target.closest('.zy-compare'))e.preventDefault();});

D.addEventListener('keydown',function(e){
  var fig=D.activeElement&&D.activeElement.closest&&D.activeElement.closest('.zy-tile');if(!fig)return;
  if(fig.classList.contains('zy-compare')){
    var f=fig.querySelector('.zy-frame');
    var cur=parseFloat((fig.querySelector('.zy-divider')||{style:{}}).style.left)||50;
    if(e.key==='ArrowLeft'){setSplit(fig,Math.max(0,cur-4));e.preventDefault();return;}
    if(e.key==='ArrowRight'){setSplit(fig,Math.min(100,cur+4));e.preventDefault();return;}
  }
  if(e.key==='Enter'||e.key===' '){fig.classList.toggle('zy-open');e.preventDefault();}
});
D.addEventListener('click',function(e){
  var t=e.target;
  // Clicking the reveal drags it; only the caption area expands it, so an
  // expand never fires at the end of a slide.
  if(t.closest('.zy-frame'))return;
  var fig=t.closest&&t.closest('[data-expand]');if(fig)fig.classList.toggle('zy-open');
});

/* ---- shortlist, and two directions seen side by side ---- */
var picked=[];
var bar=D.querySelector('.zy-bar'),list=D.querySelector('.zy-bar .zy-list'),
    go=D.querySelector('.zy-bar .zy-go'),view=D.querySelector('.zy-view'),
    grid=D.querySelector('.zy-view-grid'),close=D.querySelector('.zy-close');
function chapterOf(pos){return D.querySelector('[data-chapter="'+pos+'"]');}
function titleOf(pos){var c=chapterOf(pos);var h=c&&c.querySelector('h2');return h?h.textContent:'Direction '+pos;}
function paint(){
  if(!bar)return;
  bar.hidden=picked.length===0;
  if(list)list.innerHTML=picked.map(function(p){
    return '<span class="zy-chip">'+titleOf(p)+'</span>';}).join('');
  if(go)go.disabled=picked.length!==2;
  var hint=D.querySelector('.zy-bar .zy-hint');
  if(hint)hint.textContent=picked.length===2?'Ready to compare':'Shortlist one more to compare two side by side';
}
D.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-shortlist]');if(!b)return;
  var pos=b.getAttribute('data-shortlist');
  var i=picked.indexOf(pos);
  if(i>=0){picked.splice(i,1);}
  else{if(picked.length===2)picked.shift();picked.push(pos);}
  Array.prototype.forEach.call(D.querySelectorAll('[data-shortlist]'),function(x){
    x.setAttribute('aria-pressed',picked.indexOf(x.getAttribute('data-shortlist'))>=0?'true':'false');});
  paint();
});
if(go)go.addEventListener('click',function(){
  if(picked.length!==2||!grid||!view)return;
  grid.innerHTML='';
  picked.forEach(function(pos){
    var ch=chapterOf(pos);if(!ch)return;
    var col=D.createElement('div');
    var h=D.createElement('h3');h.textContent=titleOf(pos);col.appendChild(h);
    var strip=ch.querySelector('.palette-strip'),gal=ch.querySelector('.zy-gallery');
    if(strip)col.appendChild(strip.cloneNode(true));
    if(gal){var g=gal.cloneNode(true);
      // Side by side, each column is half as wide: the rooms matter more than
      // the boards, so the boards drop to two across and the rooms to one.
      var bs=g.querySelector('.zy-boards');if(bs)bs.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
      var st=g.querySelector('.zy-situ');if(st)st.style.gridTemplateColumns='minmax(0,1fr)';
      col.appendChild(g);}
    grid.appendChild(col);
  });
  view.hidden=false;if(close)close.hidden=false;
  D.body.style.overflow='hidden';view.scrollTop=0;
});
function shut(){if(view)view.hidden=true;if(close)close.hidden=true;D.body.style.overflow='';}
if(close)close.addEventListener('click',shut);
D.addEventListener('keydown',function(e){if(e.key==='Escape')shut();});
paint();
})();</scr`+`ipt>`;
}

/** The shortlist button for a chapter header, and the compare furniture that
 *  sits once at the end of the deck. Pre-rendered like everything else here. */
export function shortlistButtonHtml(position: number, title: string): string {
  return (
    `<button type="button" class="zy-star" data-shortlist="${position}" aria-pressed="false"` +
    ` aria-label="Shortlist ${esc(title)} to compare it with another direction">` +
    `&#9734; Shortlist this direction</button>`
  );
}

export function compareFurnitureHtml(): string {
  return (
    `<div class="zy-bar" hidden>` +
    `<strong style="font-weight:600">Shortlist</strong>` +
    `<span class="zy-list" style="display:flex;flex-wrap:wrap;gap:8px"></span>` +
    `<span class="zy-hint" style="color:#6B6B6B;flex:1 1 auto"></span>` +
    `<button type="button" class="zy-go" disabled>Compare side by side</button>` +
    `</div>` +
    `<div class="zy-view" hidden><div class="zy-view-grid"></div></div>` +
    `<button type="button" class="zy-close" hidden>Close</button>`
  );
}
