import { PDFDocument } from "pdf-lib";
import { validatedDocument } from "@/lib/partner-workspace-validation";
import { thumbnailBytesRemote } from "@/lib/media-client";
/** Decode/parse before acceptance; a signature alone does not establish a readable document. */
export async function validatePoDocument(bytes: Uint8Array, mime: string) {
  const result = validatedDocument(bytes, mime);
  if (mime === "application/pdf") {
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        throwOnInvalidObject: true,
      });
    } catch {
      throw new Error(
        "The PDF could not be read. Upload a valid, unencrypted PO.",
      );
    }
    if (!pdf.getPageCount()) throw new Error("The PDF has no pages");
  } else {
    // Existing stateless media decoder validates actual raster data, without persisting any job or order.
    try {
      const decoded = await thumbnailBytesRemote(new Uint8Array(bytes).buffer, {
        width: 100,
      });
      if (decoded.byteLength < 16) throw new Error("empty");
    } catch {
      throw new Error(
        "The image could not be decoded. Upload a valid PO image.",
      );
    }
  }
  return result;
}
