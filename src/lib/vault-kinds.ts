// ─── Vault: what a campus project's drawer accepts ──────────────────────────
//
// Pure rules shared by the upload form and the API. The drawer takes the
// documents a college actually has — a master plan as PDF, floor plans as PDF
// or CAD exports, photographs, brand material — and files what Zyvorah adds:
// meeting transcripts and notes, which are text rather than files.

export type VaultKind = "plan" | "photo" | "transcript" | "brand" | "note" | "other";

export const VAULT_KINDS: { id: VaultKind; label: string; hint: string }[] = [
  { id: "plan", label: "Plans and drawings", hint: "Master plan, block plans, floor plans — as many as you have" },
  { id: "photo", label: "Photographs", hint: "Walls, corridors, entrances, the campus as it is today" },
  { id: "brand", label: "Brand and story", hint: "History, values, logo files, anything that says who you are" },
  { id: "transcript", label: "Meeting notes", hint: "What was discussed on each call" },
  { id: "note", label: "Notes", hint: "Anything written down along the way" },
  { id: "other", label: "Other documents", hint: "" },
];

export const vaultKindLabel = (kind: string): string =>
  VAULT_KINDS.find((k) => k.id === kind)?.label ?? "Documents";

/** Files travel through the Worker in one body, so the ceiling is a working
 *  limit rather than the store's 300 MB backstop. A scanned master plan is
 *  tens of megabytes; a CAD export is single digits. */
export const MAX_VAULT_FILE_BYTES = 120 * 1024 * 1024;

/** Content type → stored extension. An allow-list, because the type decides a
 *  path segment and must never be free text. */
const FILE_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/acad": "dwg",
  "image/vnd.dwg": "dwg",
  "application/dxf": "dxf",
  "image/vnd.dxf": "dxf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
  "text/plain": "txt",
};

/** Phones and browsers often send an empty or generic type for CAD files, so
 *  the file NAME's extension is the fallback — still against the same list. */
const NAME_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "svg", "zip", "dwg", "dxf", "docx", "pptx", "xlsx", "doc", "ppt", "txt"]);

export function vaultFileExtension(contentType: string, fileName: string): string | null {
  const base = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (FILE_EXT[base]) return FILE_EXT[base];
  const m = /\.([a-z0-9]+)$/i.exec(String(fileName ?? "").trim());
  const ext = m?.[1]?.toLowerCase();
  if (ext && NAME_EXT.has(ext)) return ext === "jpeg" ? "jpg" : ext;
  return null;
}

/** The content type to STORE for a file: the browser's where it is known,
 *  otherwise the one its extension implies. */
export function vaultStoredType(contentType: string, ext: string): string {
  const base = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (base && base !== "application/octet-stream") return base;
  const byExt: Record<string, string> = {
    pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", svg: "image/svg+xml", zip: "application/zip",
    dwg: "application/acad", dxf: "application/dxf", txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword", ppt: "application/vnd.ms-powerpoint",
  };
  return byExt[ext] ?? "application/octet-stream";
}

/** Guess the drawer a file belongs in from its name and type, so the uploader
 *  rarely has to choose. A person can always change it. */
export function guessVaultKind(contentType: string, fileName: string): VaultKind {
  const name = String(fileName ?? "").toLowerCase();
  const ext = vaultFileExtension(contentType, fileName);
  if (ext === "dwg" || ext === "dxf") return "plan";
  if (/plan|layout|drawing|floor|block|campus|site|map/.test(name)) return "plan";
  if (/logo|brand|identity|history|vision|value|prospectus|brochure/.test(name)) return "brand";
  if (ext === "jpg" || ext === "png" || ext === "webp" || ext === "heic" || ext === "heif") return "photo";
  if (ext === "pdf") return "plan";
  return "other";
}

/** A title the list reads well by: the file name without its extension,
 *  underscores and dashes read as spaces. */
export function titleFromFileName(fileName: string): string {
  const base = String(fileName ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return base.slice(0, 140) || "Untitled";
}
