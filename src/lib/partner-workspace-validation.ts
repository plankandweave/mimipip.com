import { z } from "zod";
const text = z.string().trim().min(1).max(120);
export const projectInput = z.object({
  action: z.literal("project"),
  customerId: text,
  customerName: text,
});
export const optionInput = z.object({
  action: z.literal("option"),
  projectId: z.uuid(),
  roomName: text,
  wallIdentifier: text,
  productHandle: text,
  materialSlug: text,
  widthMm: z.number().int().min(100).max(100000),
  heightMm: z.number().int().min(100).max(20000),
  placement: z.object({
    zoom: z.number().min(1).max(8),
    cropX: z.number().min(0).max(1),
    cropY: z.number().min(0).max(1),
    flipH: z.boolean(),
    flipV: z.boolean(),
  }),
  openings: z
    .array(
      z.object({
        widthMm: z.number().positive(),
        heightMm: z.number().positive(),
        offsetMm: z.number().nonnegative(),
      }),
    )
    .max(20)
    .default([]),
  previewPhotoPath: z.string().max(500).optional(),
  previewCorners: z
    .array(
      z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    )
    .length(4)
    .optional(),
  supersedesId: z.uuid().optional(),
});
export const decisionInput = z.object({
  action: z.literal("decision"),
  optionId: z.uuid(),
  decision: z.enum(["accepted", "rejected", "superseded"]),
  note: z.string().trim().max(1000).default(""),
});
export const confirmationInput = z.object({
  action: z.literal("confirm"),
  projectId: z.uuid(),
  optionIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length, "Duplicate selections"),
  shipping: z.object({
    state: text,
    address_line: z.string().trim().min(5).max(500),
    city: text,
    pincode: z.string().regex(/^\d{6}$/),
    contact_name: text,
    contact_phone: z.string().regex(/^\+?[0-9 ]{10,15}$/),
    gstin: z.string().trim().min(15).max(15),
    billing_address: z.string().trim().min(5).max(500),
  }),
});
export function validatedDocument(
  bytes: Uint8Array,
  mime: string,
): { extension: string; mime: string } {
  if (bytes.length < 16 || bytes.length > 20 * 1024 * 1024)
    throw new Error("Attach a non-empty PDF, PNG or JPEG up to 20 MB.");
  const start = Buffer.from(bytes.subarray(0, 8));
  if (
    mime === "application/pdf" &&
    start.subarray(0, 5).toString() === "%PDF-" &&
    Buffer.from(bytes).subarray(-2048).includes(Buffer.from("%%EOF"))
  )
    return { extension: "pdf", mime };
  if (
    mime === "image/png" &&
    start.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    Buffer.from(bytes).subarray(-12).includes(Buffer.from("IEND"))
  )
    return { extension: "png", mime };
  if (
    mime === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  )
    return { extension: "jpg", mime };
  throw new Error(
    "The document is corrupt or its content does not match PDF, PNG or JPEG.",
  );
}
export function dispatchDateIst(timestamp: string): string {
  return new Date(new Date(timestamp).getTime() + 19800000)
    .toISOString()
    .slice(0, 10);
}
