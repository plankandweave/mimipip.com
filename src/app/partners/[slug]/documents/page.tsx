
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import Link from "next/link";
import PortalTour from "@/components/partners/portal-tour";
import { redirect } from "next/navigation";
import {
  currentCorporateSession,
  partnerHome,
  slugMatchesSession,
} from "@/lib/corporate-auth";
import {
  canReadPartnerDocuments,
  PARTNER_DOCUMENTS,
} from "@/lib/partner-documents";

export const dynamic = "force-dynamic";
export const metadata = brandMetadata({
  title: "Documents · partner portal",
  robots: { index: false, follow: false },
});

export default async function PartnerDocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "vijay-sales") redirect(`/partners/vijay-sales/orders#documents`);
  const session = await currentCorporateSession();
  if (!session || !slugMatchesSession(session, slug))
    redirect(`/partners/${slug}?next=documents`);
  if (!canReadPartnerDocuments(session, slug)) redirect(`/partners/${slug}`);
  const documents = PARTNER_DOCUMENTS.filter(
    (document) => document.accountSlug === slug,
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 text-stone-800">
      <header className="flex flex-wrap justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs uppercase tracking-widest">
            {session.account.name}
          </p>
          <h1 className="mt-2 text-3xl">Documents</h1>
          <p className="mt-2 text-sm text-stone-500">{session.email}</p>
        </div>
        <nav
          data-portal-tour="navigation"
          className="flex flex-wrap gap-4 text-sm"
          aria-label="Partner portal"
        >
          {slug === "homelane" && !session.staff && session.member?.active && (
            <PortalTour
              slug={slug}
              page="documents"
              identity={{
                memberKey: session.member.id,
                canBuild: Boolean(session.member.can_build),
                canPurchase: Boolean(session.member.can_order),
                isAdmin: session.member.role === "admin",
              }}
            />
          )}
          <Link href={`${partnerHome(session.account)}/${session.staff ? "orders" : "projects"}`}>
            {session.staff ? "Orders" : "Projects"}
          </Link>
          <Link href={`${partnerHome(session.account)}/team`}>Team</Link>
          <Link href={`${partnerHome(session.account)}/settings`}>Account</Link>
        </nav>
      </header>
      <section
        data-portal-tour="documents"
        className="my-8"
        aria-labelledby="partner-folder"
      >
        <h2 id="partner-folder" className="text-xl">
          {slug === "homelane" ? "HomeLane" : session.account.name}
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          Guides and training for your team.
        </p>
        {documents.map((document) => (
          <article
            key={document.id}
            className="mt-5 flex flex-wrap items-center justify-between gap-5 rounded border border-stone-200 p-5"
          >
            <div>
              <h3 className="text-lg">{document.title}</h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-600">
                {document.description}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                PDF · {document.pages} pages ·{" "}
                {document.bytes >= 1024 * 1024
                  ? `${(document.bytes / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(document.bytes / 1024)} KB`}{" "}
                · Updated{" "}
                {new Date(document.updatedAt).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "long",
                })}
              </p>
            </div>
            <a
              data-portal-tour="download"
              href={`/api/corporate/partner-documents/${document.id}`}
              className="rounded bg-stone-800 px-4 py-3 text-sm text-white"
            >
              Download PDF
            </a>
          </article>
        ))}
        {documents.length === 0 && (
          <p className="mt-5 text-sm">Your account has no documents yet.</p>
        )}
      </section>
    </main>
  );
}
