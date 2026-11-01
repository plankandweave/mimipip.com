
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getConceptReference } from "@/lib/concept-reference";
import { VoiceBrief } from "@/components/concepts/VoiceBrief";
export const metadata = brandMetadata({
  title: "Create a look for your space",
  description:
    "Tell Zyvorah about your space by speaking or typing. Commission an original wallpaper or mural design.",
});
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const concept = getConceptReference(slug);
  if (!concept) notFound();
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
      <Link
        href="/projects"
        className="group inline-flex items-center gap-2 text-sm font-medium text-slate transition-colors hover:text-charcoal"
      >
        <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
          ←
        </span>
        Ideas &amp; Projects
      </Link>

      <header className="mt-7 max-w-3xl">
        <h1 className="text-[2rem] leading-[1.12] sm:text-[2.5rem]">
          Create a look for your space
        </h1>
        <p className="mt-4 text-base leading-7 text-slate">
          Commission original wallpaper and murals for your space. Inspired by{" "}
          <strong className="font-semibold text-charcoal">{concept.title}</strong>
          {" "}— we’ll include this reference with your request.
        </p>
      </header>

      <VoiceBrief slug={slug} title={concept.title} />
    </section>
  );
}
