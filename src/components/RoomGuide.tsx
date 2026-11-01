import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import type { RoomContent } from "@/lib/room-content";

/** Room-specific editorial content below a room collection grid (P1 #21):
 *  how-to-choose, scale, quiet-vs-statement, materials + an FAQ (with FAQPage
 *  structured data) and a "Find My Wallpaper" entry to the Curator. */
export function RoomGuide({ title, content }: { title: string; content: RoomContent }) {
  const faqJsonLd = content.faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: content.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  return (
    <section className="container-x border-t border-edge py-16">
      {faqJsonLd && <JsonLd data={faqJsonLd} />}

      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl lg:text-3xl">Choosing {title.toLowerCase()}</h2>
        <p className="mt-4 text-slate">{content.intro}</p>

        <div className="mt-8 space-y-6">
          {content.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="font-display text-lg font-semibold">{s.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{s.body}</p>
            </div>
          ))}
        </div>

        {content.faq.length > 0 && (
          <div className="mt-12">
            <h3 className="font-display text-lg font-semibold">Frequently asked</h3>
            <div className="mt-4 space-y-2">
              {content.faq.map((f) => (
                <details key={f.q} className="group rounded-[18px] bg-wash">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                    <span className="text-sm font-semibold">{f.q}</span>
                    <span className="text-mist transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-relaxed text-slate">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 rounded-[22px] bg-lavender/40 p-8 text-center">
          <h3 className="text-xl lg:text-2xl">Not sure where to start?</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate">
            Upload a photo of your room and the Zyvorah Curator will find designs that suit it, in true scale.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/design-with" className="btn text-sm">Find my wallpaper</Link>
            <Link href="/samples" className="btn btn-ghost text-sm">Order a sample</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
