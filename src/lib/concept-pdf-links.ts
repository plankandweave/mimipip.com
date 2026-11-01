import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
/** Add a dedicated strip below the original page, preserving every image and existing link. */
export async function addConceptPdfLinks(
  bytes: Uint8Array,
  slug: string,
  shoppable = true,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const strip = 32;
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.setSize(width, height + strip);
    page.translateContent(0, strip);
    page.resetPosition();
    let annots = page.node.lookup(PDFName.of("Annots"));
    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i++) {
        const annotation = annots.lookup(i);
        if (annotation instanceof PDFDict) {
          const rect = annotation.lookup(PDFName.of("Rect"));
          if (rect instanceof PDFArray) {
            for (const n of [1, 3]) {
              const y = rect.lookup(n);
              if (y instanceof PDFNumber)
                rect.set(n, PDFNumber.of(y.asNumber() + strip));
            }
          }
        }
      }
    } else {
      annots = pdf.context.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: strip,
      color: rgb(0.08, 0.16, 0.14),
    });
    const links = [
      ...(shoppable
        ? [
            {
              label: "Buy this look",
              url: `https://zyvorah.com/concepts/${encodeURIComponent(slug)}`,
              x: 24,
            },
          ]
        : []),
      {
        label: "Create a look for your space",
        url: `https://casestudy.zyvorah.com/projects/${encodeURIComponent(slug)}/create`,
        x: width / 2,
      },
    ];
    for (const link of links) {
      page.drawText(link.label, {
        x: link.x,
        y: 12,
        size: 10,
        font,
        color: rgb(1, 1, 1),
      });
      const ref = pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [
            link.x,
            4,
            link.x + font.widthOfTextAtSize(link.label, 10) + 8,
            28,
          ],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(link.url) },
        }),
      );
      (annots as PDFArray).push(ref);
    }
  }
  return pdf.save();
}
