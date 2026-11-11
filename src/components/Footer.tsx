"use client";
import { brand } from "@/brand/current";

import { useCanvasJourney } from "./ShoppingJourney";
import { SHIKHA_LAUNCH_ENABLED } from "@/lib/customer-service-flag";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";
import { HearFromUsFirst } from "./HearFromUsFirst";
import { INSTAGRAM_URL, PINTEREST_URL, YOUTUBE_URL } from "@/lib/seo";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Wallpaper", href: "/collections/wall-art" },
      { label: "Shop by Room", href: "/rooms" },
      { label: "Office Wallpaper", href: "/office" },
      { label: "Hospitality Wallpaper", href: "/hospitality" },
      { label: "Real Estate Wallpaper", href: "/real-estate" },
      { label: "Retail Wallpaper", href: "/retail" },
      { label: "Hospital Wallpaper", href: "/hospitals" },
      { label: "Shop by Colour", href: "/colours" },
      { label: "Lookbook", href: "/lookbook" },
      { label: "Shop Concepts", href: "/concepts" },
      { label: `Design with ${brand.name}`, href: "/design-with" },
      { label: "See It in My Room", href: "/see-it-in-my-room" },
      { label: "Match a Photo", href: "/match-a-photo" },
      { label: "Your Own Image", href: "/print-your-own" },
      { label: "Bespoke Design", href: "/bespoke" },
      { label: "Gift Cards", href: "/gift-card" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Wallpaper Buying Guide", href: "/wallpaper-buying-guide" },
      { label: "How to Measure", href: "/how-to-measure" },
      { label: "How Custom Sizing Works", href: "/custom-sizing" },
      { label: "Order Samples", href: "/samples" },
      { label: "Help Me Choose & Get a Quote", href: "/contact?question=choosing%20a%20wallpaper%20and%20getting%20a%20quote" },
      { label: "Installation Guide", href: "/installation" },
      { label: "Shipping & Returns", href: "/shipping-returns" },
      { label: "Where to Buy", href: "/where-to-buy" },
      { label: "FAQ", href: "/faq" },
      ...(SHIKHA_LAUNCH_ENABLED ? [{ label: "Call Zyvorah", href: "/call" }] : []),
    ],
  },
  {
    title: "Work With Us",
    links: [
      { label: "Creator Collaborations", href: "/collaborate" },
      { label: "Press & Media Room", href: "/press" },
      { label: "AID Partners", href: "/trade" },
      { label: "Office & Workspace", href: "/office" },
      { label: "Hospitality", href: "/hospitality" },
      { label: "Real Estate & Clubhouse", href: "/real-estate" },
      { label: "Playroom Stories", href: "/collections/playroom-stories" },
      { label: "Retail & Showrooms", href: "/retail" },
      { label: "Hospitals & Clinics", href: "/hospitals" },
      { label: "Commercial Projects", href: "/commercial" },
      { label: "Ideas & Projects", href: "/projects" },
      { label: "Register as Installer · इंस्टॉलर रजिस्ट्रेशन", href: "/become-an-installer" },
    ],
  },
  {
    title: "About MimiPip",
    links: [
      { label: "Our Story", href: "/our-story" },
      { label: "Building forward, together", href: "/our-story#building-forward" },
      { label: "A Note from Our Founder", href: "/founders-note" },
      { label: "Surfaces", href: "/materials" },
      { label: "Sustainability", href: "/sustainability" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

// The two inbound doors, spelled out rather than hidden behind a link — what
// to bring, and what happens after. Both forms feed the same reviewed pipeline:
// automatic verification, an AI-prepared summary, and a reply written by
// Roheena. Nothing automated is ever sent to the person who wrote in.
const DOORS: {
  eyebrow: string;
  title: string;
  blurb: string;
  bring: string[];
  href: string;
  cta: string;
}[] = [
  {
    eyebrow: "For creators",
    title: "Collaborate with us",
    blurb:
      "Interiors, home and design creators — pitch us a wall. We work with a few people at a time, properly.",
    bring: [
      "Your Instagram or YouTube handle and any other links",
      "What you'd make — the room, the design, how you'd shoot it",
      "What you'd like from us: gifted, paid, affiliate or a content trade",
    ],
    href: "/collaborate",
    cta: "Send your idea",
  },
  {
    eyebrow: "For press & media",
    title: "Writing about MimiPip?",
    blurb:
      "Hi-res imagery, brand facts kept current from our live store, and the founder's story — all in one place.",
    bring: [
      "Hi-res design and mural files, ready to download",
      "A fact sheet, our story, and Roheena for interview",
      "Tell us your angle and deadline — we prioritise by deadline, not outlet size",
    ],
    href: "/press",
    cta: "Open the press room",
  },
];

export function Footer({disconnected=false}:{disconnected?:boolean}={}) {
  const canvas = useCanvasJourney();
  const columns = disconnected ? [
    { title: "Shop", links: ["Collection", "Color", "Concept", "Age", "Space"].map(label => ({ label: "Shop by " + label, href: "/browse/" + label.toLowerCase() })) },
    { title: "Plan your room", links: [
      { label: "In real homes", href: "/in-real-homes/" },
      { label: "Playroom stories", href: "/collections/playroom-stories" },
      { label: "Nursery worlds", href: "/nursery-worlds/" },
      { label: "Wallpaper buying guide", href: "/wallpaper-buying-guide" }, { label: "How to measure", href: "/how-to-measure" },
      { label: "Surfaces and materials", href: "/materials" }, { label: "Installation and removal", href: "/installation" }, { label: "Saved designs", href: "/wishlist" }
    ] },
    { title: "Help", links: [
      { label: "Frequently asked questions", href: "/faq" }, { label: "Shipping and returns", href: "/shipping-returns" },
      { label: "United States", href: "/us" }, { label: "India", href: "/in" },
      { label: "Retail buyer guide", href: "/trade" }
    ] }
  ] : canvas ? COLS.map(column => column.title === "Shop" ? {
    title: "Shop",
    links: [{ label: "Canvas Art", href: "/collections/canvas-art" }, { label: "All Collections", href: "/collections" }, { label: "See It in My Room", href: "/see-it-in-my-room" }, { label: "Gift Cards", href: "/gift-card" }],
  } : column.title === "Help" ? {
    title: "Help",
    links: [{ label: "Help Me Choose an Artwork", href: "/contact?question=choosing%20canvas%20artwork" }, { label: "Shipping & Returns", href: "/shipping-returns" }, { label: "Contact", href: "/contact" }],
  } : column) : COLS;
  return (
    <footer className="mt-12 bg-wash">
      {/* Five children (brand + four link columns). Two-up between sm and lg
          rather than a four-across row that would orphan the fifth. */}
      <div className="container-x grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(brand.logo || brand.emailLogo?.path) && <img src={brand.logo || brand.emailLogo!.path} alt={brand.name} className="h-9 w-auto" />}
          <p className="mt-3 max-w-xs text-sm text-slate">
            {brand.description}
          </p>
          <div className="mt-5 text-sm">{disconnected ? <HearFromUsFirst source="footer" /> : <NewsletterForm />}</div>
          <div className="mt-5 flex gap-4 text-sm text-slate">
            {INSTAGRAM_URL && <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-charcoal">
              Instagram
            </a>}
            {PINTEREST_URL && <a href={PINTEREST_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-charcoal">
              Pinterest
            </a>}
            {YOUTUBE_URL && <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-charcoal">
              YouTube
            </a>}
          </div>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-mist">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-slate transition-colors hover:text-charcoal">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-edge">
        <div className="container-x grid gap-6 py-12 md:grid-cols-2">
          {!disconnected && DOORS.map((d) => (
            <div key={d.href} className="rounded-[20px] border border-edge bg-surface p-6">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-mist">{d.eyebrow}</p>
              <p className="mt-2 text-lg text-charcoal">{d.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate">{d.blurb}</p>
              <ul className="mt-4 space-y-1.5">
                {d.bring.map((b) => (
                  <li key={b} className="flex gap-2 text-sm leading-relaxed text-slate">
                    <span aria-hidden="true" className="text-mist">✦</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link href={d.href} className="btn mt-5 inline-flex h-11 items-center px-6 text-[0.8rem]">
                {d.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="container-x pb-10 text-xs leading-relaxed text-mist">
          {brand.contactEmail ? <>Creators and press can write to <a href={`mailto:${brand.contactEmail}`} className="underline underline-offset-2 hover:text-charcoal">{brand.contactEmail}</a>.</> : <Link href="/faq">Help with choosing a design</Link>}
        </div>
      </div>

      <div className="border-t border-edge">
        <div className="container-x flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-4 text-xs text-slate">
          {[
            { label: "Terms & Conditions", href: "/terms" },
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Refund & Cancellation", href: "/refund-policy" },
            { label: "Shipping Policy", href: "/shipping-policy" },
            { label: "Contact", href: "/contact" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-charcoal">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-t border-edge">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-5 text-xs text-mist sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
          {!disconnected && <div className="flex flex-col items-center gap-0.5 sm:items-end">
            <p>Designed &amp; made in India &middot; Secure payments by Razorpay</p>
            <p>Woman-founded &middot; Supporting women entrepreneurs</p>
            <p>
              Built by{" "}
              <a
                href="https://intellectz.ai"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-charcoal"
              >
                Intellectz AI
              </a>
            </p>
          </div>}
        </div>
      </div>
    </footer>
  );
}
