
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { OutreachForm } from "@/components/OutreachForm";

const title = "Collaborate with Zyvorah — For Creators in India";
const description =
  "Interiors, home and design creators across India: pitch a collaboration with Zyvorah, on Instagram or YouTube. Tell us the wall you have in mind, what you'd make, and what you'd like from us. Roheena reads and replies to every note herself.";

export const metadata: Metadata = editorialMetadata("/collaborate");

const WHAT_WE_LOOK_FOR = [
  {
    heading: "A wall, not a follower count",
    body: "We'd rather see one real wall you're excited to transform than a media kit. Tell us the room, the light it gets, and the design you keep coming back to.",
  },
  {
    heading: "Craft in how you shoot",
    body: "Our work is texture, scale and colour. Creators who photograph a room properly — daylight, a wide frame, a detail shot — always get further with us.",
  },
  {
    heading: "Homes like the ones we print for",
    body: "A flat in Pune, a haveli in Jaipur, a hostel room in Indore, a studio in Bengaluru. Indian walls, Indian light and Indian budgets are exactly who we make this for, and we deliver across the country. If you're in India, tell us your city and quote in rupees.",
  },
  {
    heading: "Honesty about the ask",
    body: "Gifted, paid, affiliate or a straight content trade: say which, up front. We'd far rather have a clear conversation than a coy one.",
  },
  {
    heading: "Something we can't make ourselves",
    body: "Your voice, your home, your audience's trust. If your note tells us what only you could make, it's already a good pitch.",
  },
];

  function CollaboratePage() {
  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">For creators</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">Let&apos;s make something together</h1>
        <p className="mt-4 text-slate">
          We&apos;re a small, woman-founded studio making mural wallpaper and hand-designed
          murals in India, printed here and delivered to homes across the country. We work with a
          handful of creators at a time — properly, not in bulk — and we&apos;d love to hear what
          you have in mind. Instagram, YouTube or TikTok — wherever you make your work is the right
          place to start.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {WHAT_WE_LOOK_FOR.map((s) => (
            <div key={s.heading} className="rounded-[20px] bg-wash p-6">
              <p className="font-medium text-charcoal">{s.heading}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-edge pt-10">
          <h2 className="text-xl">Tell us about you</h2>
          <p className="mt-2 text-sm text-slate">
            A few details so we can look you up properly, and then the part that actually matters —
            your idea.
          </p>
          <OutreachForm kind="influencer" />
        </div>

        <div className="mt-12 space-y-6 border-t border-edge pt-8 text-sm text-slate">
          <div>
            <p className="caps mb-2 text-mist">How this works</p>
            <p className="leading-relaxed">
              Your note goes into our review queue, where we automatically verify the basics — that
              your profile and links resolve, that your email is real — and prepare a short summary so
              Roheena can read the substance rather than the admin. She then decides personally, and
              the reply you receive is hers. We aim to come back to everyone within a few working
              days, yes or no.
            </p>
          </div>
          <div>
            <p className="caps mb-2 text-mist">Writing about us instead?</p>
            <p className="leading-relaxed">
              If you&apos;re a journalist or editor, our{" "}
              <Link href="/press" className="underline underline-offset-2">press &amp; media room</Link>{" "}
              has hi-res imagery, brand facts and a direct line for story requests.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withBrandEditorial("/collaborate", CollaboratePage);
