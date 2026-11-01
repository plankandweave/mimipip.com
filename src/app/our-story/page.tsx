
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = editorialMetadata("/our-story");

type Cta = { label: string; href: string; primary?: boolean };

function Ctas({ items }: { items: Cta[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {items.map((c) => (
        <Link key={c.label} href={c.href} className={c.primary ? "btn" : "btn btn-ghost"}>
          {c.label}
        </Link>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 grid gap-2 text-[1.02rem] leading-relaxed text-slate sm:grid-cols-2">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mist" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Section({ heading, paras, children }: { heading: string; paras: string[]; children?: React.ReactNode }) {
  return (
    <section className="border-t border-edge pt-12">
      <h2 className="font-display text-2xl font-bold text-charcoal lg:text-[1.8rem]">{heading}</h2>
      <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {children}
    </section>
  );
}

const TOOLS: { name: string; href?: string; desc: string }[] = [
  { name: "Find My Wallpaper", href: "/design-with", desc: "Tell us about your room, colours, mood, budget and preferences. Receive a considered shortlist instead of searching endlessly through hundreds of designs." },
  { name: "Match a Photo", href: "/match-a-photo", desc: "Upload a photograph of a fabric, artwork, rug, interior, colour combination or anything else you love. Discover wallpapers that relate to its colours, pattern, subject or mood." },
  { name: "See It in My Room", href: "/see-it-in-my-room", desc: "Upload your room and experience different wallpapers on your own wall before making a decision." },
  { name: "Your Own Image", href: "/print-your-own", desc: "Bring your own photograph or artwork. Prepare it for your wall, review its suitability and turn it into a mural wallpaper design." },
  { name: "Ask Zyvorah", desc: "Speak naturally about what you are looking for. Ask questions, narrow choices, understand materials and move from an idea towards a wall that is ready to order." },
];

  function OurStoryPage() {
  return (
    <div className="pb-8">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", "@id": `${SITE_URL}/our-story#webpage`, url: `${SITE_URL}/our-story`, name: "About Zyvorah — Indian Wallpaper & Mural Brand", mainEntity: { "@id": `${SITE_URL}/#organization` } }} />
      {/* hero */}
      <section className="container-x pt-12">
        <div className="mx-auto max-w-2xl">
          <span className="caps text-slate">About Zyvorah</span>
          <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.3rem)] leading-[1.06]">
            A wall can change the way an entire space feels.
          </h1>
          <div className="mt-6 space-y-4 text-[1.05rem] leading-relaxed text-slate">
            <p>Zyvorah is an Indian wallpaper and mural brand created around a simple belief: walls should not be treated as an afterthought.</p>
            <p>They are among the largest visual surfaces in any interior. They hold colour, light, proportion and atmosphere. The right wallpaper can bring a room together, create an entirely new point of view, or give a space the identity it was missing.</p>
            <p>We create wallpapers and murals for homes, workplaces, restaurants, cafés, hotels, retail spaces, children&apos;s rooms and every other place where a wall can become something more.</p>
            <p>Founded by Roheena Nagpal, Zyvorah offers mural wallpaper designs, fixed-size canvas wall art and wallpaper borders. You can order for one wall or explore coordinated ideas for several areas of a home or commercial space.</p>
            <p>It is an intelligent way to discover, visualise, customise and order wallpaper for the wall you actually have.</p>
          </div>
          <Ctas items={[
            { label: "Find My Wallpaper", href: "/design-with", primary: true },
            { label: "Explore All Wallpapers", href: "/collections/wall-art" },
            { label: "Wallpaper Buying Guide", href: "/wallpaper-buying-guide" },
          ]} />
        </div>
      </section>

      <div className="container-x mt-14">
        <div className="mx-auto max-w-2xl space-y-12">
          <Section
            heading="Made for your wall—not taken from a standard roll"
            paras={[
              "Every room is different, and every wall has its own proportions.",
              "A mural designed for one wall cannot simply be placed on another and expected to look right. The dimensions change. The artwork may need to move. A focal element may need to sit above a console, beside a bed or away from a television. The scale may need to become quieter or more dramatic.",
              "That is why Zyvorah wallpapers are prepared for the exact width and height of your wall.",
              "You choose the size. You review the placement. You adjust the scale and crop. You select the material. You see the price for your complete wall before you order.",
              "What arrives is not excess wallpaper that must somehow be made to fit. It is a numbered mural composed and prepared for your particular space.",
            ]}
          >
            <Ctas items={[{ label: "See How Custom Sizing Works", href: "/custom-sizing" }]} />
          </Section>

          <Section
            heading="Choosing wallpaper should feel exciting—not overwhelming"
            paras={[
              "Wallpaper is deeply visual, but choosing it is not always easy.",
              "You may know that you want the room to feel calm, but not know what to search for. You may want something Indian that does not feel traditionally decorative. You may love the colours in a rug or painting but have no idea which mural will work with them. You may simply need to see the possibilities inside your own room.",
              "Zyvorah has been designed around those real conversations.",
            ]}
          >
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {TOOLS.map((t) => {
                const inner = (
                  <>
                    <p className="font-display text-base font-bold text-charcoal">{t.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate">{t.desc}</p>
                  </>
                );
                return t.href ? (
                  <Link key={t.name} href={t.href} className="card block bg-surface p-5 transition-colors hover:border-charcoal">
                    {inner}
                  </Link>
                ) : (
                  <div key={t.name} className="card bg-surface p-5">{inner}</div>
                );
              })}
            </div>
            <p className="mt-6 text-[1.02rem] leading-relaxed text-slate">
              Technology is part of how Zyvorah works, but it is not there for novelty. Its purpose is to make good design judgement more accessible—and make the journey from inspiration to installation clearer.
            </p>
            <Ctas items={[{ label: "Let Zyvorah Help Me Choose", href: "/design-with", primary: true }]} />
          </Section>

          <Section
            heading="A collection with many ways of seeing"
            paras={[
              "Our collection moves across styles, places, periods and moods.",
              "It includes expressive botanicals, expansive landscapes, gentle children's designs, architectural compositions, Indian art interpreted for contemporary spaces, quiet textures, abstraction, geometry and murals that create entire imagined worlds.",
              "Some walls are meant to command attention. Others should provide atmosphere without asking to be noticed. We believe both can be equally powerful.",
              "We consider more than whether an image is beautiful on a screen. We consider how it may sit behind furniture, how it can be cropped for different proportions, where its focal point belongs and whether it has enough visual balance to live successfully across a wall.",
              "The intention is not to fill every wall with more.",
              "It is to help each wall become exactly enough.",
            ]}
          >
            <Ctas items={[{ label: "Explore the Collection", href: "/collections/wall-art" }]} />
          </Section>

          <Section
            heading="From exact measurements to an approved composition"
            paras={[
              "With mural wallpaper designs, dimensions are only the beginning.",
              "The position and scale of the artwork matter just as much. Before ordering, you can review how the selected design will be composed for your wall. You can move the artwork, change its scale and approve the portion that will be produced.",
              "Your configuration records:",
            ]}
          >
            <Bullets items={[
              "The wallpaper design",
              "Exact wall width and height",
              "Selected material",
              "Approved crop and scale",
              "Panel arrangement",
              "Price and applicable GST",
              "Delivery and installation selections",
            ]} />
            <p className="mt-4 text-[1.02rem] leading-relaxed text-slate">
              This creates clarity before production begins and helps ensure that what arrives reflects the wall you approved.
            </p>
            <Ctas items={[{ label: "Customise a Wallpaper", href: "/collections/wall-art" }]} />
          </Section>

          <Section
            heading="Materials chosen for real interiors"
            paras={[
              "A beautiful image is only one part of a good wallpaper.",
              "The material determines how the wallpaper feels, how it sits on the wall and how it responds to everyday use. Zyvorah offers a considered choice of finishes so that customers can select according to the room, intended appearance, installation method and budget.",
              "Samples are available for customers who want to experience the colour, detail and finish before committing to the complete wall.",
              "Our material pages explain what each option looks and feels like, where it is best used, how it is installed and how it should be cared for.",
            ]}
          >
            <Ctas items={[
              { label: "Compare Materials", href: "/materials", primary: true },
              { label: "Order a Sample", href: "/samples" },
            ]} />
          </Section>

          <Section
            heading="Designed and produced in India"
            paras={[
              "Zyvorah is built in India for the way Indian customers shop, measure, build and live.",
              "Our wallpapers are produced to confirmed order dimensions rather than held as finished rolls in a warehouse. This allows us to offer extensive choice without manufacturing completed wallpaper that may never find its wall.",
              "Made-to-order production also allows every order to carry its own dimensions, approved composition and panel plan.",
              "We serve customers across India with GST-inclusive pricing, secure online payments and delivery to serviceable locations. Professional installation is available in selected cities, with guided measurement and installation support available online.",
              "For architects, designers and businesses, Zyvorah also supports commercial spaces, project-specific requirements, sampling, documentation and multi-wall enquiries.",
            ]}
          >
            <Ctas items={[
              { label: "Explore Commercial Wallpaper", href: "/commercial", primary: true },
              { label: "Submit a Project", href: "/commercial#enquire" },
            ]} />
          </Section>

          <Section
            heading="Wallpaper for every kind of space"
            paras={["Zyvorah began with a love for walls, not with a narrow definition of where wallpaper belongs.", "We create for:"]}
          >
            <Bullets items={[
              "Living rooms, bedrooms and dining spaces",
              "Nurseries, children's rooms and play areas",
              "Home offices and studies",
              "Restaurants, cafés and bars",
              "Hotels and hospitality spaces",
              "Offices, meeting rooms and reception areas",
              "Clinics, salons and wellness spaces",
              "Retail stores and experience centres",
              "Schools and learning environments",
              "Custom residential and commercial projects",
            ]} />
            <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
              <p>A wall in a family home and a wall in a hotel lobby serve very different purposes. The design, scale, material and intensity must respond accordingly.</p>
              <p>Our intelligent discovery tools help customers begin with the space—not merely with a product category.</p>
            </div>
            <Ctas items={[{ label: "Shop by Room", href: "/rooms" }]} />
          </Section>

          <Section
            heading="Beautiful decisions, made clearer"
            paras={[
              "A wallpaper purchase involves many decisions: design, proportion, material, measurement, crop, installation, delivery and care.",
              "Our aim is to remove uncertainty from each of them.",
              "Before ordering, customers should be able to understand:",
            ]}
          >
            <Bullets items={[
              "What the complete wall will cost",
              "Which material is suitable",
              "How to measure the wall",
              "Which part of the design will be produced",
              "How many panels will arrive",
              "How the panels should be installed",
              "When the order is expected",
              "What to do if help is needed",
            ]} />
            <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
              <p>Zyvorah is designed so that a customer can complete the entire journey independently. Guidance remains available at every important point, without making a phone call compulsory.</p>
              <p>That is what modern service means to us: not removing people, but removing dependence, delay and confusion.</p>
            </div>
          </Section>

          <Section
            heading="Made with intention"
            paras={[
              "Made-to-order production cannot eliminate every environmental impact, but it can avoid some unnecessary waste.",
              "We produce wallpaper against confirmed wall dimensions rather than manufacturing large quantities of finished designs in anticipation of demand. Exact-size preparation also reduces the amount of surplus wallpaper delivered to the customer.",
              "We believe environmental communication should be specific and honest. Material composition, care information and documented performance should be stated clearly, without vague promises.",
            ]}
          >
            <Ctas items={[{ label: "Read About Our Approach", href: "/sustainability" }]} />
          </Section>
        </div>
      </div>

      {/* the person behind Zyvorah — pointer to the personal Founder's Note */}
      <section className="container-x mt-14">
        <div className="pastel-section mx-auto max-w-2xl bg-blush/40">
          <span className="caps text-slate">The person behind Zyvorah</span>
          <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-charcoal">
            <p>Zyvorah grew from founder Roheena&apos;s enduring fascination with walls, wallpaper and murals—and her belief that the right wall can change the experience of an entire room.</p>
            <p>Her approach brings together design instinct, spatial understanding and a determination to make customisation simpler. Zyvorah translates that personal way of seeing into tools that allow every customer to explore, compose and confidently order a wall of their own.</p>
          </div>
          <blockquote className="mt-6 border-l-2 border-charcoal/30 pl-5 font-display text-lg italic leading-relaxed text-charcoal">
            &ldquo;I have always believed that walls are never just walls. They are the largest canvases in our spaces—and they hold an extraordinary power to change how a room makes us feel.&rdquo;
          </blockquote>
          <p className="mt-4 font-display text-base font-bold text-charcoal">Roheena</p>
          <p className="text-sm text-slate">Founder, Zyvorah</p>
          <Ctas items={[{ label: "Read Roheena's Note", href: "/founders-note", primary: true }]} />
        </div>
      </section>

      {/* the women-entrepreneurs initiative — a quiet, factual pay-it-forward
          commitment. Deliberately near the end: wallpaper first, this after. */}
      <section id="building-forward" className="container-x mt-14 scroll-mt-28">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] bg-sage/25 px-6 py-10 sm:px-10">
            <span className="caps text-slate">A woman-founded brand can help another woman begin</span>
            <h2 className="mt-4 font-display text-2xl font-bold text-charcoal lg:text-[1.9rem]">
              Building forward, together.
            </h2>
            <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
              <p>
                Zyvorah began with a belief in the power of walls to change how a space feels. But
                Roheena&apos;s own entrepreneurial journey also began with something smaller: the
                courage to start before everything was certain.
              </p>
              <p>That is why Zyvorah is building a simple pay-it-forward commitment into the business.</p>
            </div>
          </div>

          <div className="mt-10 space-y-9">
            <div>
              <h3 className="font-display text-lg font-bold text-charcoal">How the contribution works</h3>
              <div className="mt-3 space-y-3 text-[1.02rem] leading-relaxed text-slate">
                <p>
                  For every square foot of eligible wallpaper sold, Zyvorah contributes ₹1 towards a
                  pooled fund for grants and mentorship for women entrepreneurs from humble
                  backgrounds.
                </p>
                <p>The contribution is made by Zyvorah. It is not added to the customer&apos;s bill.</p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-charcoal">About the grants</h3>
              <div className="mt-3 space-y-3 text-[1.02rem] leading-relaxed text-slate">
                <p>
                  Grants are intended for women with viable business ideas who may lack easy access to
                  capital, business networks or experienced mentorship.
                </p>
                <p>
                  Individual grants may range from ₹5,000 to ₹5 lakh, depending on the applicant, the
                  business opportunity, the stage of the venture and the assessment process.
                </p>
                <p>
                  Contributions are pooled, and grants are awarded after an assessment process. Not
                  every applicant will receive a grant, and no single order independently funds one
                  recipient.
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-charcoal">Pay it forward</h3>
              <div className="mt-3 space-y-3 text-[1.02rem] leading-relaxed text-slate">
                <p>
                  The intention is not only to provide financial support. Each recipient will be
                  encouraged, when she is able, to complete the circle by mentoring another woman,
                  sharing an opportunity or opening a door.
                </p>
                <p className="font-display italic text-charcoal/80">
                  One woman&apos;s beginning can become another woman&apos;s possibility.
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-charcoal">Who it is for</h3>
              <div className="mt-3 space-y-3 text-[1.02rem] leading-relaxed text-slate">
                <p>
                  The initiative is intended for women entrepreneurs from humble or financially
                  constrained backgrounds who have a viable business idea or an early-stage venture
                  and would benefit meaningfully from financial support and mentorship.
                </p>
                <p className="text-[0.95rem] text-mist">
                  Formal eligibility criteria and application dates will be published when the first
                  grant round opens.
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-charcoal">How we will report it</h3>
              <div className="mt-3 space-y-3 text-[1.02rem] leading-relaxed text-slate">
                <p>
                  Zyvorah intends to publish periodic updates on the amount contributed, grants
                  awarded and women supported. Contributions will be pooled and allocated through a
                  documented assessment process.
                </p>
              </div>
            </div>

            <div className="rounded-[18px] border border-edge px-5 py-4">
              <p className="text-[0.95rem] text-slate">
                Grant applications will open here when the first grant round is announced.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* closing — begin with your wall */}
      <section className="container-x mt-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold lg:text-3xl">Let us begin with your wall.</h2>
          <div className="mx-auto mt-5 max-w-xl space-y-4 text-[1.02rem] leading-relaxed text-slate">
            <p>You do not need to know the name of a style or arrive with the perfect search words.</p>
            <p>Begin with your room. Begin with a photograph. Begin with a colour you love, a feeling you want to create or an image you want to make your own.</p>
            <p>Zyvorah will help you move from there.</p>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/design-with" className="btn">Find My Wallpaper</Link>
            <Link href="/see-it-in-my-room" className="btn btn-ghost">See It in My Room</Link>
          </div>
          <Link href="/collections/wall-art" className="mt-4 inline-block text-sm font-semibold text-slate underline underline-offset-4 hover:text-charcoal">
            Explore All Wallpapers
          </Link>
        </div>
      </section>
    </div>
  );
}

export default withBrandEditorial("/our-story", OurStoryPage);
