"use client";
import type { Point } from "@/lib/homography";
import { loadImage } from "@/lib/warp";
import { drawArt, drawRoomPreview, type PreviewPlacement } from "./room-preview";

/**
 * A designer's preview, as a PDF they can send the customer.
 *
 * Built in the browser from the same drawing code the screen uses
 * (`drawArt`, `drawRoomPreview`), so the file is the picture that was on
 * screen — crop, flip, openings and the room warp included — and not a second
 * rendering that could drift from it. The images are already loaded
 * cross-origin for the canvas preview, so nothing new is fetched server-side.
 */
export type PreviewSheet = {
  accountName: string;
  designTitle: string;
  roomName: string;
  wallIdentifier: string;
  material: string;
  widthMm: number;
  heightMm: number;
  /** Chargeable sq ft from the saved price; null for an unsaved draft. */
  chargeableSqft: number | null;
  /** Wall rectangle in sq ft, shown when there is no chargeable figure yet. */
  wallSqft: number;
  /** Only passed for people who may see money (can_order). */
  price?: { ratePerSqft: number; total: number } | null;
  artUrl: string;
  placement: PreviewPlacement;
  openings: { widthMm: number; heightMm: number; offsetMm: number; sillMm?: number }[];
  photoUrl?: string | null;
  corners?: Point[];
};

const SQM_PER_SQFT = 0.09290304;
// The standard PDF fonts are WinAnsi: no rupee sign, no superscript two, no
// multiplication sign. Same substitutions the GST invoice and spec sheets use.
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
const sqft = (n: number) =>
  `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} sq ft (${(n * SQM_PER_SQFT).toLocaleString("en-IN", { maximumFractionDigits: 2 })} sq m)`;

/** Anything a designer typed (a room name in Hindi, an emoji) would make the
 *  WinAnsi font throw and the whole download fail — drop what it can't draw. */
const winAnsi = (t: string) =>
  t
    .replace(/₹\s?/g, "Rs. ")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function compositionCanvas(
  art: HTMLImageElement,
  widthMm: number,
  heightMm: number,
  placement: PreviewPlacement,
  openings: PreviewSheet["openings"],
) {
  const c = document.createElement("canvas");
  const long = 1600;
  c.width = widthMm >= heightMm ? long : Math.round((long * widthMm) / heightMm);
  c.height = widthMm >= heightMm ? Math.round((long * heightMm) / widthMm) : long;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5f5f4";
  ctx.fillRect(0, 0, c.width, c.height);
  drawArt(ctx, art, c.width, c.height, placement);
  const sx = c.width / widthMm, sy = c.height / heightMm;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.font = `${Math.round(c.width / 50)}px sans-serif`;
  for (const o of openings) {
    const x = o.offsetMm * sx, w = o.widthMm * sx, h = o.heightMm * sy;
    const y = c.height - (o.sillMm ?? 0) * sy - h;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#57534e";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#2d2d2d";
    ctx.fillText((o.sillMm ?? 0) > 0 ? "Window" : "Door", x + 6, y + Math.round(c.width / 45));
  }
  return c;
}

async function canvasJpeg(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not prepare the preview image");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function downloadPreviewPdf(sheet: PreviewSheet) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const art = await loadImage(sheet.artUrl, true);
  const composition = await canvasJpeg(
    compositionCanvas(art, sheet.widthMm, sheet.heightMm, sheet.placement, sheet.openings),
  );
  let room: Uint8Array | null = null;
  if (sheet.photoUrl && sheet.corners) {
    const photo = await loadImage(sheet.photoUrl, true);
    const c = document.createElement("canvas");
    drawRoomPreview(c, photo, art, sheet.widthMm, sheet.heightMm, sheet.placement, sheet.corners);
    room = await canvasJpeg(c);
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${sheet.designTitle} - ${sheet.roomName} ${sheet.wallIdentifier}`);
  pdf.setAuthor("Zyvorah");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0x2d / 255, 0x2d / 255, 0x2d / 255);
  const soft = rgb(0x6b / 255, 0x6b / 255, 0x6b / 255);
  const rule = rgb(0xe0 / 255, 0xe0 / 255, 0xe0 / 255);

  const [W, H] = [842, 595]; // A4 landscape
  const M = 56;
  const page = pdf.addPage([W, H]);
  /** One line, shortened with an ellipsis rather than running into the
   *  pictures — pdf-lib's maxWidth alone would let it overprint. */
  const fit = (t: string, size: number, font: typeof regular, max: number) => {
    let s = winAnsi(t);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s && font.widthOfTextAtSize(`${s}…`, size) > max) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };
  page.drawText(winAnsi(`${sheet.accountName} · Zyvorah`), { x: M, y: H - M + 20, size: 8, font: regular, color: soft });
  page.drawText("1", { x: W - M - 4, y: M - 30, size: 8, font: regular, color: soft });

  // Details column on the left, pictures to the right.
  const colW = 220;
  let y = H - M - 20;
  page.drawText(fit(sheet.designTitle, 18, bold, colW), { x: M, y, size: 18, font: bold, color: ink });
  y -= 18;
  page.drawText(fit(`${sheet.roomName} · ${sheet.wallIdentifier}`, 10, regular, colW), { x: M, y, size: 10, font: regular, color: soft });
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: M + colW, y }, thickness: 0.5, color: rule });
  y -= 22;
  const rows: [string, string][] = [
    ["Wall size", `${sheet.widthMm.toLocaleString("en-IN")} x ${sheet.heightMm.toLocaleString("en-IN")} mm`],
    ["Material", sheet.material],
    sheet.chargeableSqft != null
      ? ["Chargeable area", sqft(sheet.chargeableSqft)]
      : ["Wall area", sqft(sheet.wallSqft)],
  ];
  if (sheet.openings.length) {
    const doors = sheet.openings.filter((o) => !(o.sillMm ?? 0)).length;
    const windows = sheet.openings.length - doors;
    rows.push(["Openings", [doors && `${doors} door${doors > 1 ? "s" : ""}`, windows && `${windows} window${windows > 1 ? "s" : ""}`].filter(Boolean).join(", ")]);
  }
  if (sheet.price) {
    rows.push(["Rate", `${rs(sheet.price.ratePerSqft)} per sq ft ex GST`]);
    rows.push(["Total", `${rs(sheet.price.total)} incl. GST`]);
  }
  for (const [k, v] of rows) {
    page.drawText(k, { x: M, y, size: 8, font: regular, color: soft });
    y -= 12;
    page.drawText(fit(v, 10, regular, colW), { x: M, y, size: 10, font: regular, color: ink });
    y -= 22;
  }
  const note =
    sheet.chargeableSqft == null
      ? "Draft preview. The chargeable area is confirmed once the option is saved; openings can change it."
      : "The composition is the printable specification. The room view is illustrative.";
  page.drawText(note, { x: M, y: M + 20, size: 7.5, font: regular, color: soft, maxWidth: colW, lineHeight: 10 });

  // Pictures: the composition, and the room view beside or under it.
  const left = M + colW + 32;
  const areaW = W - M - left;
  const areaH = H - 2 * M - 16;
  const images = [
    { bytes: composition, label: "Print composition" },
    ...(room ? [{ bytes: room, label: "In the customer's room" }] : []),
  ];
  const slotH = (areaH - (images.length - 1) * 20) / images.length;
  let top = H - M - 4;
  for (const img of images) {
    const embedded = await pdf.embedJpg(img.bytes);
    const scale = Math.min(areaW / embedded.width, (slotH - 14) / embedded.height);
    const w = embedded.width * scale, h = embedded.height * scale;
    page.drawText(img.label, { x: left, y: top - 8, size: 8, font: regular, color: soft });
    page.drawImage(embedded, { x: left, y: top - 14 - h, width: w, height: h });
    top -= slotH + 20;
  }

  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  const safe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `${safe(sheet.roomName)}-${safe(sheet.wallIdentifier)}-${safe(sheet.designTitle)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
