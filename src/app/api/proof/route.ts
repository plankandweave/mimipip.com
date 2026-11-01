import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { thumbnailRemote, cropPreviewRemote } from "@/lib/media-client";
import { getProductByHandle, pickFlatImage } from "@/lib/queries";
import { pieceCount, panelWidthsCm, rollCmFromMm } from "@/lib/visualizer";
import { textOverlaySchema, overlayPlacementError } from "@/lib/text-overlay";
import type { CropData } from "@/lib/visualizer";
import { fetchPrintRules } from "@/lib/print-rules";

export const runtime = "nodejs";
export const maxDuration = 60;

// Downloadable "order proof" — the panel layout + specs for the customer's
// chosen wall size, generated before purchase. Shows the design, how many
// numbered panels it ships in, panel width, seam and trim.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const handle = String(body?.productHandle ?? "");
  const widthCm = Number(body?.widthCm) || 0;
  const heightCm = Number(body?.heightCm) || 0;
  const materialSlug = String(body?.materialSlug ?? "");
  if (!handle || widthCm <= 0 || heightCm <= 0) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400 });
  }

  const product = await getProductByHandle(handle);
  if (!product) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });

  const selMaterial = (product.product_materials ?? []).find((m) => m.materials?.slug === materialSlug)?.materials;
  const materialName = selMaterial?.name ?? "—";
  // Live production rules from the OS — the proof must show the split the
  // machine will actually make.
  const { maxPanelCm, overlapCm } = await fetchPrintRules();
  const panelCm = rollCmFromMm(selMaterial?.roll_width_mm, maxPanelCm);
  const flat = pickFlatImage(product.product_images ?? []);

  let composition: ArrayBuffer | null = null;
  if (body.crop) {
    const crop: CropData = { ...body.crop, imageUrl: flat?.url ?? "", wallWidthCm: widthCm, wallHeightCm: heightCm };
    if (crop.textOverlay) {
      const parsed = textOverlaySchema.safeParse(crop.textOverlay);
      if (!parsed.success || overlayPlacementError(parsed.data, widthCm, heightCm, crop.doors)) {
        return Response.json({ error: "Check your lettering and placement before downloading the proof." }, { status: 400 });
      }
      crop.textOverlay = parsed.data;
    }
    try { composition = await cropPreviewRemote(crop); }
    catch (error) {
      // Keep service diagnostics in server logs, never in the customer response.
      console.error("[proof] composition service failed", error instanceof Error ? error.message : "Unknown media failure");
      return Response.json({ error: "Could not render your composition. Please retry." }, { status: 503 });
    }
  }

  const panels = pieceCount(widthCm, panelCm, overlapCm);
  const inW = widthCm / 2.54;
  const inH = heightCm / 2.54;
  const ftW = Math.floor(inW / 12), remW = Math.round(inW - ftW * 12);
  const ftH = Math.floor(inH / 12), remH = Math.round(inH - ftH * 12);
  const sqft = ((widthCm / 30.48) * (heightCm / 30.48)).toFixed(2);
  // EQUAL panels at full roll width (capped by the OS max-strip rule) — the
  // machine splits the wall evenly, never "full modules + a narrow balance".
  const panelCmWidths = panelWidthsCm(widthCm, panelCm, overlapCm);
  const toIn = (cm: number) => Math.round(cm / 2.54);
  const panelWidthSpec =
    panels < 2 ? `${toIn(widthCm)} in wide` : `~${toIn(widthCm / panels)} in each (equal widths)`;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.06, 0.06), soft = rgb(0.42, 0.42, 0.42), line = rgb(0.8, 0.8, 0.8);
  const M = 42;
  // StandardFonts (WinAnsi) can't encode Devanagari/₹ — strip to Latin-1 for the PDF.
  const ascii = (s: string) => s.replace(/[^\x00-\xFF]/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  const text = (s: string, x: number, y: number, size = 10, f = font, c = ink) => page.drawText(ascii(s), { x, y, size, font: f, color: c });

  let y = 800;
  text("ORDER PROOF", M, y, 16, bold);
  text("zyvorah.com", 595 - M - font.widthOfTextAtSize("zyvorah.com", 10), y + 3, 10, font, soft);
  y -= 24;
  text(`${product.title}${product.code ? `  (${product.code})` : ""}`, M, y, 13, bold);
  y -= 26;

  // design reference image — fetched and downscaled by the media container
  // (workerd cannot run sharp); it pulls flat.url itself.
  try {
    if (flat?.url) {
      const img = composition ? await doc.embedPng(composition) : await doc.embedJpg(await thumbnailRemote(flat.url, 360));
      const scale = Math.min(200 / img.width, 220 / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: M, y: y - h, width: w, height: h });
    }
  } catch {
    if (composition) return Response.json({ error: "Could not create the composition proof." }, { status: 503 });
  }

  // specs column (right of the image)
  const sx = M + 230;
  let sy = y - 6;
  const spec = (label: string, value: string) => {
    text(label.toUpperCase(), sx, sy, 8, bold, soft);
    text(value, sx, sy - 12, 11);
    sy -= 30;
  };
  spec("Wall size", `${ftW} ft ${remW} in × ${ftH} ft ${remH} in`);
  spec("Also", `${Math.round(widthCm * 10)} × ${Math.round(heightCm * 10)} mm  ·  ${sqft} sq ft`);
  spec("Material", materialName);
  spec("Panels", `${panels}  ·  ${panelWidthSpec}`);
  spec("Seam & trim", "Pattern-matched overlap · ~5 cm trim top & bottom");

  y -= 240;

  // panel schematic — wall rectangle split into N vertical, numbered panels
  text("HOW IT ARRIVES — HANG LEFT TO RIGHT", M, y, 9, bold, soft);
  y -= 12;
  const boxW = 380;
  const boxH = Math.min(220, Math.max(90, boxW * (heightCm / widthCm)));
  const top = y, left = M;
  page.drawRectangle({ x: left, y: top - boxH, width: boxW, height: boxH, borderColor: ink, borderWidth: 1.2 });
  // Panels drawn PROPORTIONALLY to their real widths — an equal division of
  // the wall, exactly like the machine splits it.
  let xacc = left;
  for (let i = 0; i < panels; i++) {
    const pw = (panelCmWidths[i] / widthCm) * boxW;
    if (i < panels - 1) {
      const x = xacc + pw;
      page.drawLine({ start: { x, y: top - boxH }, end: { x, y: top }, thickness: 0.8, color: line });
    }
    text(String(i + 1), xacc + pw / 2 - 3, top - boxH / 2, 12, bold, soft);
    xacc += pw;
  }
  y -= boxH + 20;
  text(
    panels < 2
      ? "Ships as a single panel — no seams to join."
      : `Ships in ${panels} numbered panels with a pattern-matched overlap at each seam, hung left to right.`,
    M, y, 10, font, soft,
  );
  y -= 26;
  text(composition ? "Your composition is shown above. Review spelling and placement before approving at checkout." : "This is a layout proof. Your exact composition is confirmed at checkout.", M, y, 8, font, soft);

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="zyvorah-order-proof-${handle}.pdf"`,
    },
  });
}
