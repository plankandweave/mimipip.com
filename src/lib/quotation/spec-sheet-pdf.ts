import { Doc, HAIR, INK, M, MIST, RIGHT, SAGE, SLATE, WASH, WIDTH, wrap, type BrandAssets } from "./pdf-kit";
import { fill, requireMaterialSpec, type MaterialSpec } from "./material-specs";

/**
 * The technical specification sheets as one file: a sheet per quoted
 * material, each the page grammar of the KRT sheet of 6 October 2026 — the
 * kicker naming the walls, the material's name, what it is in two lines, its
 * three headline figures, why it suits those walls in a sage panel, then the
 * technical rows in groups, the before-application strip, and the line that
 * says these are tested ratings and not a guarantee.
 *
 * A sheet is never attached for a material the quotation does not quote: the
 * caller passes exactly the materials on the quotation, with the walls each
 * one goes on.
 */

export type SpecSheetRequest = {
  /** Key into the material library. */
  material: string;
  /** "KRT boundary wall" — the kicker over the material's name. */
  kicker: string;
  /** "the KRT boundary wall" — fills `{for}` in the library's sentences. */
  forWhat: string;
};

export async function renderSpecSheetsPdf(sheets: SpecSheetRequest[], assets: BrandAssets): Promise<Uint8Array> {
  if (!sheets.length) throw new Error("spec sheets: nothing to render");
  const first = requireMaterialSpec(sheets[0].material);
  const doc = await Doc.create(assets, {
    title: sheets.length === 1 ? `Zyvorah product specification — ${first.name}` : "Zyvorah product specification",
    subject: "Product specification",
  });
  for (const req of sheets) {
    renderSheet(doc, requireMaterialSpec(req.material), req);
  }
  return doc.finish();
}

function renderSheet(doc: Doc, m: MaterialSpec, req: SpecSheetRequest): void {
  const f = doc.f;
  const later = `Product specification · ${req.kicker}`;
  const startPage = doc.pageNumber + 1;
  doc.newPage("Product specification");

  // ── Name and what it is ───────────────────────────────────────────────
  doc.kicker(req.kicker, M, doc.y);
  doc.y -= 24;
  doc.text(m.name, M, doc.y, 26, f.displayHeavy, INK);
  doc.y -= 24;
  doc.paragraph(fill(m.intro, req.forWhat), M, WIDTH * 0.72, 10.5, f.regular, SLATE, 16);
  doc.y -= 26;

  // ── Three figures ─────────────────────────────────────────────────────
  if (m.stats.length) {
    const colW = (WIDTH - 2 * 20) / 3;
    m.stats.forEach((s, i) => {
      const x = M + i * (colW + 20);
      doc.hairline(doc.y + 14, x, x + colW, MIST);
      doc.text(s.value, x, doc.y - 10, 17, f.display, INK);
      doc.text(s.label, x, doc.y - 26, 8.5, f.regular, SLATE);
    });
    doc.y -= 60;
  }

  // ── Why it suits ──────────────────────────────────────────────────────
  const pad = 24;
  const gap = 22;
  const half = (WIDTH - 2 * pad - gap) / 2;
  const points = m.suits.points.map((p) => ({
    title: p.title,
    body: wrap(p.body, f.regular, 9, half),
  }));
  const rowH = (i: number) => {
    const a = points[i];
    const b = points[i + 1];
    const lines = Math.max(a?.body.length ?? 0, b?.body.length ?? 0);
    return 16 + lines * 12.5 + 16;
  };
  let panelH = pad + 20;
  for (let i = 0; i < points.length; i += 2) panelH += rowH(i);
  panelH += pad - 10;
  doc.ensure(panelH, later);
  const top = doc.y + 8;
  doc.panel(M, top, WIDTH, panelH, SAGE, 16);
  let y = top - pad - 2;
  doc.kicker(fill(m.suits.heading, req.forWhat), M + pad, y);
  y -= 24;
  for (let i = 0; i < points.length; i += 2) {
    [points[i], points[i + 1]].forEach((p, j) => {
      if (!p) return;
      const x = M + pad + j * (half + gap);
      doc.text(p.title, x, y, 9.5, f.semibold, INK);
      p.body.forEach((s, k) => doc.text(s, x, y - 16 - k * 12.5, 9, f.regular, SLATE));
    });
    y -= rowH(i);
  }
  doc.y = top - panelH - 30;

  // ── Technical rows ────────────────────────────────────────────────────
  const keyW = 118;
  const valW = WIDTH - keyW;
  /** Lines of value and sub-line a row takes, and its height to the next baseline. */
  const rowLines = (r: { v: string; sub?: string }) => ({
    v: wrap(r.v, f.regular, 9.5, valW),
    sub: r.sub ? wrap(r.sub, f.regular, 8.5, valW) : [],
  });
  const rowHeight = (r: { v: string; sub?: string }) => {
    const l = rowLines(r);
    return (l.v.length - 1) * 12.5 + l.sub.length * 11 + 24;
  };
  const groupsHeight = m.groups.reduce(
    (sum, g) => sum + 30 + g.rows.reduce((s, r) => s + rowHeight(r), 0) + 10, 0,
  );
  const beforeHeight = m.before ? 120 : 0;
  const disclaimerHeight = doc.measure(m.disclaimer, WIDTH, 8.5, f.regular, 12) + 20;

  // The KRT film sheet put its rows on a second page under a "Technical
  // specification" heading; the non-woven sheet fitted on one. Same rule
  // here: a new page when the rows will not all sit under the panel.
  if (doc.room < groupsHeight + beforeHeight + disclaimerHeight) {
    doc.newPage(later);
    doc.text("Technical specification", M, doc.y, 20, f.displayHeavy, INK);
    doc.y -= 18;
    doc.text(m.name, M, doc.y, 10, f.regular, SLATE);
    doc.y -= 30;
  }

  for (const g of m.groups) {
    doc.ensure(30 + rowHeight(g.rows[0]), later);
    doc.kicker(g.heading, M, doc.y);
    doc.y -= 8;
    doc.hairline(doc.y, M, RIGHT, MIST);
    doc.y -= 16;
    for (const r of g.rows) {
      const h = rowHeight(r);
      if (doc.room < h) doc.newPage(later);
      doc.text(r.k, M, doc.y, 9.5, f.semibold, INK);
      const { v, sub } = rowLines(r);
      v.forEach((s, i) => doc.text(s, M + keyW, doc.y - i * 12.5, 9.5, f.regular, INK));
      sub.forEach((s, i) => doc.text(s, M + keyW, doc.y - (v.length - 1) * 12.5 - 11.5 - i * 11, 8.5, f.regular, SLATE));
      // The sub-line is 11 under the value; count it as value lines for the rule.
      const lines = v.length + (sub.length ? sub.length * 11 / 12.5 : 0);
      doc.rowEnd(lines, 12.5);
    }
    doc.y -= 10;
  }

  // ── Before application ────────────────────────────────────────────────
  if (m.before) {
    const colW = (WIDTH - 2 * pad - 2 * 18) / 3;
    const steps = m.before.steps.map((s) => wrap(s, f.regular, 9, colW));
    const lines = Math.max(...steps.map((s) => s.length));
    const h = pad + 18 + 24 + lines * 12.5 + pad - 6;
    doc.ensure(h + 10, later);
    const t = doc.y + 4;
    doc.panel(M, t, WIDTH, h, WASH, 16);
    let yy = t - pad - 2;
    doc.kicker(m.before.heading, M + pad, yy);
    yy -= 26;
    steps.forEach((s, i) => {
      const x = M + pad + i * (colW + 18);
      doc.text(String(i + 1).padStart(2, "0"), x, yy, 15, f.display, INK);
      s.forEach((line, k) => doc.text(line, x, yy - 18 - k * 12.5, 9, f.regular, SLATE));
    });
    doc.y = t - h - 18;
  }

  // ── Disclaimer ────────────────────────────────────────────────────────
  doc.ensure(disclaimerHeight, later);
  doc.paragraph(m.disclaimer, M, WIDTH, 8.5, f.regular, SLATE, 12);

  // Page count per sheet, as the KRT file did: "1 / 2", "2 / 2", "1 / 1".
  const count = doc.pageNumber - startPage + 1;
  for (let i = 0; i < count; i++) {
    doc.footer(doc.pdf.getPage(startPage - 1 + i), `${i + 1} / ${count}`);
  }
}
