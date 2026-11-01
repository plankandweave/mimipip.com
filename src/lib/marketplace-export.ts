import ExcelJS from "exceljs";

// Marketplace spreadsheet exports — the Studio's FBA desk.
//
// The desk curates by hand today: pick designs, tick sizes, set quantities,
// export the marketplace's own template filled from the live catalogue. Every
// number is recomputed server-side from the database — the client sends only
// handles and size picks, never prices — so a sheet can't drift from the site.
//
// Formats are a registry so the next marketplace (Pepperfry's template is
// promised) is one entry here, not another page. Selection stays manual by
// design; automated curation can come once there is sales data to rank on.

export type ExportRow = {
  sku: string;
  title: string;
  sizeLabel: string;
  /** Finished size in inches — Pepperfry wants W X D X H in cm. */
  widthIn?: number;
  heightIn?: number;
  /** Plain-text product description (Pepperfry listing copy). */
  description?: string;
  /** One style word from the design's tags — feeds Pepperfry's name format. */
  styleWord?: string;
  /** Site price, GST-INCLUSIVE (what the customer pays — MRP in Indian terms). */
  mrpInclGst: number;
  gstRatePct: number;
  hsnCode: string;
  /** Estimated shipping weight, kg (rolled print in its tube). */
  boxWeightKg: number;
  quantity: number | null;
};

// Rolled-tube weight by the print's longest side, in inches.
// SELF-ADHESIVE: measured (Samir, 2026-07-27) — no box exceeds ~700 g, so the
// whole line declares a flat 0.7 kg. CANVAS: still pack-out ESTIMATES (heavier
// cloth, never weighed); noted on the sheet itself.
const CANVAS_TUBE_KG: Record<number, number> = { 24: 0.8, 36: 1.2, 48: 1.8, 72: 2.6 };
export function tubeWeightKg(wIn: number, hIn: number, medium: "canvas" | "self-adhesive" = "self-adhesive"): number {
  if (medium === "self-adhesive") return 0.7;
  return CANVAS_TUBE_KG[Math.max(wIn, hIn)] ?? 2.6;
}

// Tax classification is PER MEDIA — the same artwork ships as two different
// goods:
//   Canvas (eco-cotton, unframed, rolled) — printed pictures/designs:
//     HSN 4911 91 00, 12% GST.
//   Self-adhesive print (peel & stick vinyl) — plastic stickers, whether or
//     not printed: HSN 3919 90 10, 18% GST.
export const CANVAS_HSN = "49119100";
export const CANVAS_GST_PCT = 12;
export const SELF_ADHESIVE_HSN = "39199010";
export const SELF_ADHESIVE_GST_PCT = 18;

const YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

/**
 * Amazon FBA inbound template (the exact sheet the desk downloads from Seller
 * Central): SKU | Quantity | MRP | HSN | GST % | Pickup Address | Cartons |
 * Box Weight. MRP is the GST-inclusive site price — with the GST-rate column
 * beside it, that pair IS the tax split this format asks for. Cartons is a
 * live formula (= Quantity): each canvas ships rolled in its own tube.
 */
async function buildAmazonFba(rows: ExportRow[], pickupAddress: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["SKU", "Quantity ", "MRP", "HSN Code", "GST Rate in %", "Pickup Address", "Total number of carton in which pack all units", "Box Weight"]);
  ws.getRow(1).font = { bold: true };

  rows.forEach((r, i) => {
    const n = i + 2;
    const row = ws.addRow([r.sku, r.quantity ?? "", r.mrpInclGst, r.hsnCode, r.gstRatePct, pickupAddress || "", "", r.boxWeightKg]);
    row.getCell(7).value = { formula: `IF(B${n}="","",B${n})` };
    if (r.quantity == null) row.getCell(2).fill = YELLOW;
    if (!pickupAddress) row.getCell(6).fill = YELLOW;
  });

  const noteStart = rows.length + 4;
  const notes = [
    "HOW TO USE — yellow cells are yours to fill: Quantity (units to send) and Pickup Address.",
    "Cartons is a formula (= Quantity): each canvas ships rolled in its own tube. Overwrite if you pack differently.",
    `Tax is per media: self-adhesive prints HSN ${SELF_ADHESIVE_HSN} (plastic stickers) @ ${SELF_ADHESIVE_GST_PCT}% · canvas HSN ${CANVAS_HSN} (printed pictures) @ ${CANVAS_GST_PCT}%. MRP is the site price, GST-inclusive — MRP + rate is this sheet's tax split.`,
    "Box Weight: self-adhesive is MEASURED (max ~0.7 kg per box); canvas weights are still pack-out estimates.",
    "SKUs match the site and the Google Merchant feed, so Amazon, ads and the site all name the same item.",
  ];
  notes.forEach((t, j) => {
    const c = ws.getCell(noteStart + j, 1);
    c.value = t;
    c.font = { italic: true, size: 9 };
  });

  ws.columns.forEach((col, i) => { col.width = i === 0 ? 36 : i === 5 ? 30 : 14; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Pepperfry "Home Decor Common Extra Attribute" LISTING sheet — not an inbound
 * shipment but the catalogue upload that creates the listings (category 6532
 * Wall Stickers, attribute set WA_Wall_Stickers, just-in-time fulfilment).
 *
 * The real template ships in the repo (src/lib/templates) and gets FILLED, so
 * the reference tabs Pepperfry expects arrive untouched; the vendor's 400-row
 * example data in Common Attributes is cleared and replaced with our SKUs.
 * Account facts only Pepperfry issues (buyerid, warehouse, merchant, zone…)
 * stay blank and yellow, exactly like the FBA sheet's yellow cells.
 */
async function buildPepperfry(rows: ExportRow[], _pickupAddress: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const tpl = await readFile(path.join(process.cwd(), "src", "lib", "templates", "pepperfry-home-decor.xlsx"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("Common Attributes");
  if (!ws) throw new Error("template is missing the Common Attributes sheet");

  // Clear the vendor's example rows — header stays, everything below goes.
  // (spliceRows silently no-ops on this loaded workbook, and half-cleared rows
  // let the example vendor's data bleed through unwritten columns — so every
  // cell below the header is blanked explicitly instead.)
  const lastRow = ws.rowCount;
  const lastCol = ws.columnCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.fill = { type: "pattern", pattern: "none" };
    }
    row.commit();
  }

  // Row 2: the same legend the desk's first hand-filled sheet carried.
  ws.getRow(2).getCell(1).value = "YELLOW = Zyvorah account facts to fill";
  ws.getRow(2).getCell(1).font = { italic: true, size: 9 };

  // Account facts Pepperfry issues — left blank, marked yellow per row.
  const ACCOUNT_COLS = [1, 20, 24, 27, 28, 29, 34, 44];

  rows.forEach((r, i) => {
    const cmH = Math.round((r.heightIn ?? 0) * 2.54);
    const cmW = Math.round((r.widthIn ?? 0) * 2.54);
    const style = (r.styleWord ?? "Decorative").replace(/^./, (c) => c.toUpperCase());
    const sizeFt = r.sizeLabel.replace(/\s/g, "").replace(/x/i, " x ");
    const row = ws.getRow(3 + i);
    const put = (col: number, v: string | number) => { row.getCell(col).value = v; };
    put(2, "No"); put(3, "NO Warranty"); put(4, "hsn"); put(5, "No");
    put(6, "customer_redressal"); put(7, "returns_and_cancellations_policy");
    put(8, "new"); put(9, 1); put(10, "simple"); put(11, "home_decore_term_condition");
    put(12, "Yes"); put(13, "No"); put(14, "No"); put(15, "Yes"); put(16, "No");
    put(17, 1); put(18, "solid"); put(19, "Non-Furniture"); put(21, "Yes");
    put(22, "DE"); put(23, 6532); put(25, 0); put(26, "Air");
    put(30, "WA_Wall_Stickers");
    put(31, r.sku); put(32, r.sku); put(33, r.sku);
    put(35, `Multicolor Vinyl ${style} Self Adhesive Wall Sticker (${sizeFt})`);
    put(36, r.hsnCode); put(37, `${r.hsnCode}_${r.gstRatePct}`);
    put(38, r.mrpInclGst);
    put(41, "Zyvorah");
    if (r.description) { put(42, r.description); put(43, r.description); }
    put(45, "1 piece"); put(46, "Vinyl"); put(47, "Multicolor");
    put(48, r.boxWeightKg);
    put(49, `${cmW} X 0.1 X ${cmH} cm`);
    put(50, "Vinyl"); put(51, "Multicolour");
    for (const c of ACCOUNT_COLS) row.getCell(c).fill = YELLOW;
    row.commit();
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const EXPORT_FORMATS = {
  "amazon-fba": { label: "Amazon FBA", build: buildAmazonFba, filePrefix: "Zyvorah-Amazon-FBA" },
  "pepperfry": { label: "Pepperfry", build: buildPepperfry, filePrefix: "Zyvorah-Pepperfry" },
} as const;

export type ExportFormatKey = keyof typeof EXPORT_FORMATS;
