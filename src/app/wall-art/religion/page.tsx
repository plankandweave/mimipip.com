
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { getCollectionCards } from "@/lib/queries";
import { getReligionIndex } from "@/lib/religion-catalogue";
import { FAITH_SUBJECTS, RELIGIONS, RELIGION_PATH, religionHref } from "@/lib/religion";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;
export const metadata: Metadata = editorialMetadata("/wall-art/religion");

type Props = { searchParams: Promise<{ faith?: string; deity?: string; page?: string; format?: string }> };
const pill = "inline-flex min-h-10 items-center rounded-full border border-edge px-4 py-2 text-sm transition-colors";

  async function ReligionPage({ searchParams }: Props) {
  const { faith, deity, page: rawPage, format } = await searchParams;
  const religion = RELIGIONS.find((r) => r.slug === faith);
  if (faith && !religion) notFound();
  const subjects = faith ? (FAITH_SUBJECTS[faith] ?? []) : [];
  const subject = subjects.find((s) => s.slug === deity);
  if (deity && !subject) notFound();
  if (format && !["canvas", "wallpaper"].includes(format)) notFound();
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1) notFound();
  const index = await getReligionIndex();
  const matching = index.filter((p) => faith === p.faith && (!deity || p.subject === deity) && (!format || p.category === format));
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  if (page > pages) notFound();
  const handles = matching.slice((page - 1) * pageSize, page * pageSize).map((p) => p.handle);
  const cards = handles.length ? await getCollectionCards(handles, undefined, "scene", true) : [];
  const heading = subject ? `${subject.label} Art` : religion ? `${religion.label} Wall Art` : "Religion";

  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-peach/40 lg:mx-6">
        <div className="container-x py-10 text-center">
          <Link href="/wall-art" className="caps text-slate">Homes · Wall Art</Link>
          <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.2rem)]">{heading}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate">Art for the beliefs, stories and sacred spaces you hold close.</p>
          <p className="mx-auto mt-3 max-w-xl text-xs text-slate">Choose a religion to see its artwork. Canvas prints and wallpaper murals stay within the faith you select.</p>
        </div>
      </div>
      <section className="container-x py-8" aria-labelledby="religions-heading">
        <h2 id="religions-heading" className="text-2xl">Shop by Religion</h2>
        <nav aria-label="Shop by Religion" className="mt-4 flex flex-wrap gap-2">
          <Link href={RELIGION_PATH} aria-current={!faith ? "page" : undefined} className={`${pill} ${!faith ? "bg-charcoal text-surface" : "bg-surface hover:bg-wash"}`}>Choose a religion</Link>
          {RELIGIONS.map((r) => {
            const count = index.filter((p) => p.faith === r.slug).length;
            return count ? (
              <Link key={r.slug} href={religionHref(r.slug)} aria-current={faith === r.slug ? "page" : undefined} className={`${pill} ${faith === r.slug ? "bg-charcoal text-surface" : "bg-surface hover:bg-wash"}`}>
                {r.label} · {count}
              </Link>
            ) : (
              <span key={r.slug} className={`${pill} bg-wash text-slate`}>{r.label} · No artworks yet</span>
            );
          })}
        </nav>
        {faith && subjects.length > 0 && (
          <div className="mt-7">
            <h2 className="text-xl">{faith === "hinduism" ? "Shop by Deity" : "Figures, places & sacred subjects"}</h2>
            <nav aria-label={faith === "hinduism" ? "Shop by Deity" : "Sacred subjects"} className="mt-3 flex flex-wrap gap-2">
              {subjects.filter((s) => index.some((p) => p.faith === faith && p.subject === s.slug)).map((s) => (
                <Link key={s.slug} href={religionHref(faith, s.slug, undefined, format)} aria-current={deity === s.slug ? "page" : undefined} className={`${pill} ${deity === s.slug ? "bg-charcoal text-surface" : "bg-wash hover:bg-edge"}`}>{s.label}</Link>
              ))}
            </nav>
          </div>
        )}
        {faith && <nav aria-label="Artwork format" className="mt-7 flex flex-wrap gap-2">
          {[{slug:undefined,label:"All formats"},{slug:"canvas",label:"Canvas prints"},{slug:"wallpaper",label:"Wallpaper murals"}].map((f) => (
            <Link key={f.slug ?? "all"} href={religionHref(faith, deity, undefined, f.slug)} aria-current={format === f.slug ? "page" : undefined} className={`${pill} ${format === f.slug ? "bg-charcoal text-surface" : "bg-wash hover:bg-edge"}`}>{f.label}</Link>
          ))}
        </nav>}
      </section>
      {faith === "jainism" && <div className="container-x pb-6"><Link href="/collections/jain-temples" className="btn inline-flex min-h-12 items-center px-5">Jain Temples · Wall & ceiling collection →</Link></div>}
      <section className="container-x pb-14" aria-labelledby="artworks-heading">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="artworks-heading" className="text-2xl">{faith ? `${subject?.label ?? religion?.label} artworks` : "Choose your religion"}</h2>
          {faith && <span className="text-sm text-slate">{matching.length} artworks</span>}
        </div>
        {cards.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards.map((p) => <ProductCard key={p.handle} product={p} />)}</div>
        ) : (
          <p className="rounded-[22px] bg-wash p-6 text-sm text-slate">{faith ? "No artworks are available in this selection yet." : "Choose a religion above to explore its canvas prints and wallpaper murals."} <Link href={RELIGION_PATH} className="link-underline">Explore available religious art →</Link></p>
        )}
        {pages > 1 && (
          <nav aria-label="Artwork pages" className="mt-8 flex items-center justify-center gap-4">
            {page > 1 && <Link className={pill} href={religionHref(faith, deity, page - 1, format)}>← Previous</Link>}
            <span className="text-sm text-slate">Page {page} of {pages}</span>
            {page < pages && <Link className={pill} href={religionHref(faith, deity, page + 1, format)}>Next →</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}

export default withBrandEditorial("/wall-art/religion", ReligionPage);
