import "server-only";

export type PartnerDocument = {
  id: string;
  accountSlug: string;
  title: string;
  description: string;
  filename: string;
  storagePath: string;
  sha256: string;
  bytes: number;
  pages: number;
  updatedAt: string;
};

// Private R2 resources only. Entries are pinned to reviewed document bytes;
// downloading never creates a public or signed bearer URL.
export const PARTNER_DOCUMENTS: readonly PartnerDocument[] = [
  {
    id: "homelane-portal-guide",
    accountSlug: "homelane",
    title: "HomeLane visual portal guide",
    description:
      "Screenshot instructions with arrows for login, guided tour, designers, purchasing, PO upload and management.",
    filename: "HomeLane-Zyvorah-Portal-Guide.pdf",
    storagePath:
      "partner-documents/homelane/2026-09-15/59897d0fd27a3c4c3991a2b5aca00830666933d2d145bccfd16b577f789c1a01-HomeLane-Zyvorah-Portal-Guide.pdf",
    sha256: "59897d0fd27a3c4c3991a2b5aca00830666933d2d145bccfd16b577f789c1a01",
    bytes: 1521623,
    pages: 24,
    updatedAt: "2026-09-15",
  },
];

export function canReadPartnerDocuments(
  session: {
    account: { slug: string; email_domain: string };
    email: string;
    staff: boolean;
    member: { active: boolean } | null;
  } | null,
  accountSlug: string,
): boolean {
  return Boolean(
    session &&
      session.account.slug === accountSlug &&
      (session.staff ||
        (session.member?.active &&
          session.email.split("@")[1]?.toLowerCase() ===
            session.account.email_domain.toLowerCase())),
  );
}
