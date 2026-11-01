import { createHash } from "node:crypto";

/** Meta email matching preserves dots, unlike Google Customer Match. */
export function metaAudienceCsv(contacts: { email: string | null }[]): { csv: string; count: number } {
  const hashes = new Set<string>();
  for (const contact of contacts) {
    const email = contact.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    hashes.add(createHash("sha256").update(email, "utf8").digest("hex"));
  }
  return { csv: ["email", ...hashes].join("\n") + "\n", count: hashes.size };
}
