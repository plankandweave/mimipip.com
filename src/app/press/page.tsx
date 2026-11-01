
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { getSignatureDesigns } from "@/lib/queries";
import { INSTALL_CITIES_LABEL, INSTALL_RATE_LABEL, WOMEN_CONTRIBUTION_RATE } from "@/lib/pricing";
import { STANDARD_SHIPPING } from "@/lib/shipping";
import { PressAccessGate } from "@/components/PressAccessGate";

const title = "Press & Media — Zyvorah";
const description =
  "The Zyvorah press room: hi-res imagery, brand facts, the founder's story and a direct line for journalists. Tell us your angle and your deadline — Roheena replies herself.";

export const metadata: Metadata = editorialMetadata("/press");

// Facts are read from the live configuration — never re-typed — so a press
// page can't quietly go stale against the store the way a static kit does.
export const revalidate = 3600;

const STORIES = [
  {
    heading: "Sized to your wall, made to order",
    body: "Nothing is warehoused and nothing is cut down. Every wall is made to the exact centimetres of the room it's going into, which changes both the waste maths and what a customer can ask for.",
  },
  {
    heading: "A woman-founded studio in India",
    body: `Roheena founded Zyvorah to make wall design something you commission rather than settle for. Zyvorah contributes ₹${WOMEN_CONTRIBUTION_RATE} per chargeable square foot from eligible orders towards grants and mentorship for women entrepreneurs — funded by us, never charged to the customer.`,
  },
  {
    heading: "Seeing it before you buy it",
    body: "Customers photograph their own wall and see a design mapped onto it at true scale, then order an A4 sample before committing. Both exist because wallpaper's real barrier was never price — it was doubt.",
  },
  {
    heading: "Our own installers",
    body: `Fitting is done by installers we train and pay directly, at ${INSTALL_RATE_LABEL}, currently in ${INSTALL_CITIES_LABEL}. Payment is released only after the customer confirms the job is done well.`,
  },
];

function factRows() {
  return [
    ["Founded by", "Roheena — woman-founded and woman-led"],
    ["What we make", "Mural wallpaper and hand-designed wall murals, made to order"],
    ["Where", "Designed and made in India"],
    ["Delivery", `Free standard delivery across ${STANDARD_SHIPPING.coverage}`],
    ["Installation", `${INSTALL_RATE_LABEL}, in ${INSTALL_CITIES_LABEL}`],
    ["Social contribution", `₹${WOMEN_CONTRIBUTION_RATE} per chargeable sq ft to women entrepreneurs, funded by Zyvorah`],
    ["Press contact", "hello@zyvorah.com"],
    ["Website", "zyvorah.com"],
  ] as const;
}

  async function PressPage() {
  // Hi-res artwork straight from the live catalogue — the same files we print
  // from, so what a journalist downloads is always a current design.
  let designs: Awaited<ReturnType<typeof getSignatureDesigns>> = [];
  try {
    designs = (await getSignatureDesigns(8)).filter((d) => d.image);
  } catch {
    designs = [];
  }

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-3xl">
        <span className="caps text-slate">Press &amp; media</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">The Zyvorah press room</h1>
        <p className="mt-4 text-slate">
          Everything a writer usually has to ask for, already here: hi-res imagery you can print
          from, facts that stay current because they&apos;re read from our live store, and the
          stories we think are genuinely worth telling. Tell us who you are just below and it all
          unlocks — that same note is also your request, and Roheena will reply herself for
          anything beyond it: an interview, samples for a shoot, a specific ask.
        </p>

        {/* ------------------------------------------------ gated: assets + imagery */}
        <div className="mt-12 border-t border-edge pt-10">
          <PressAccessGate>
            {/* ---------------------------------------------------------- assets */}
            <section>
              <h2 className="text-xl">Brand assets</h2>
              <p className="mt-2 text-sm text-slate">
                Free to use in editorial coverage of Zyvorah. Please don&apos;t recolour, stretch or
                place the logo on a busy background.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  { label: "Logo — colour (SVG)", href: "/zyvorah-color.svg" },
                  { label: "Wordmark (SVG)", href: "/zyvorah-wordmark.svg" },
                  { label: "Logo — dark (PNG)", href: "/logo-dark.png" },
                  { label: "Logo — white (PNG)", href: "/logo-white.png" },
                ].map((a) => (
                  <a
                    key={a.href}
                    href={a.href}
                    download
                    className="rounded-full border border-edge px-4 py-2 text-[0.8rem] text-slate transition-colors hover:border-charcoal hover:text-charcoal"
                  >
                    ↓ {a.label}
                  </a>
                ))}
              </div>
            </section>

            {/* --------------------------------------------------------- imagery */}
            {designs.length > 0 && (
              <section className="mt-12 border-t border-edge pt-10">
                <h2 className="text-xl">Hi-res imagery</h2>
                <p className="mt-2 text-sm text-slate">
                  Our signature designs at full print resolution — the same artwork files we print from.
                  Please credit <strong className="text-charcoal">Zyvorah</strong> and name the design.
                  For a specific design, a room shot or a studio photograph, ask above.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {designs.map((d) => (
                    <figure key={d.handle}>
                      <div className="relative aspect-square overflow-hidden rounded-[14px] bg-wash">
                        <Image
                          src={d.image!}
                          alt={d.imageAlt}
                          fill
                          sizes="(max-width: 640px) 45vw, 22vw"
                          className="object-cover"
                        />
                      </div>
                      <figcaption className="mt-2 text-xs leading-snug text-slate">
                        {d.title}
                        <a
                          href={d.image!}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block text-mist underline underline-offset-2 hover:text-charcoal"
                        >
                          Download hi-res
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
          </PressAccessGate>
        </div>

        {/* ----------------------------------------------------------- facts */}
        <section className="mt-12 border-t border-edge pt-10">
          <h2 className="text-xl">Fact sheet</h2>
          <dl className="mt-5 divide-y divide-edge rounded-[20px] bg-wash px-6">
            {factRows().map(([k, v]) => (
              <div key={k} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-mist">{k}</dt>
                <dd className="text-sm leading-relaxed text-slate">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --------------------------------------------------------- stories */}
        <section className="mt-12 border-t border-edge pt-10">
          <h2 className="text-xl">Stories we&apos;re glad to talk about</h2>
          <p className="mt-2 text-sm text-slate">
            Angles with something real behind them — happy to go deeper on any of these, on the
            record.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {STORIES.map((s) => (
              <div key={s.heading} className="rounded-[20px] bg-wash p-6">
                <p className="font-medium text-charcoal">{s.heading}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate">
            Roheena has also written{" "}
            <Link href="/founders-note" className="underline underline-offset-2">a note on why she started Zyvorah</Link>
            , and our{" "}
            <Link href="/our-story" className="underline underline-offset-2">story page</Link>{" "}
            covers the longer version.
          </p>
        </section>

        <div className="mt-12 border-t border-edge pt-8 text-sm text-slate">
          <p className="caps mb-2 text-mist">Direct line</p>
          <p className="leading-relaxed">
            Already unlocked the kit above? For anything beyond it — an interview, samples for a
            shoot, a fact you need confirmed — that same note reaches Roheena and she replies
            herself; if you&apos;re on deadline, say so and we prioritise by deadline, not outlet
            size. Prefer email? Write to{" "}
            <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2">hello@zyvorah.com</a>{" "}
            with &ldquo;Press&rdquo; in the subject. If you&apos;re a creator rather than a
            journalist, our{" "}
            <Link href="/collaborate" className="underline underline-offset-2">collaborations page</Link>{" "}
            is the right door.
          </p>
        </div>
      </div>
    </div>
  );
}

export default withBrandEditorial("/press", PressPage);
