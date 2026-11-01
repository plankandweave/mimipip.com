import Link from "next/link";

// The short homepage "note from our founder" (author-supplied — keep verbatim).
// Links to the full story at /founders-note.
const PARAS = [
  "I have always believed that walls are the largest canvases in our lives. They surround our everyday moments, hold the mood of a room and have the power to make an ordinary space feel deeply personal.",
  "Zyvorah grew from my love for wallpaper, murals and the almost magical way the right design can bring an entire room together. A wall can become a garden, a landscape, a story, a memory—or simply a beautiful sense of calm.",
  "I created Zyvorah to help you find that wall: one that is composed for your exact space, feels right with everything around it and continues to give you joy every day.",
];

export function FounderNote() {
  return (
    <section className="container-x py-16">
      {/* warm, intimate editorial split — not a corporate "meet the founder" */}
      <div className="grid items-center gap-8 rounded-[32px] bg-wash px-6 py-10 md:grid-cols-2 md:gap-12 md:px-10 md:py-12">
        {/* left: portrait (designed stone placeholder until Roheena's photo is added) */}
        {/* A neutral stone panel that actually reads as a panel — the wash-on-wash
            version dissolved into the card behind it and the quote looked unplaced. */}
        <div className="relative flex aspect-[5/6] items-center justify-center overflow-hidden rounded-[24px] border border-charcoal/10 bg-gradient-to-br from-[#DCD9D2] via-[#E6E3DC] to-[#D2CEC6] p-8">
          <p className="max-w-[15rem] text-center font-display text-lg font-medium leading-snug text-charcoal/70">
            &ldquo;Walls have always felt like possibility to me.&rdquo;
          </p>
        </div>

        {/* right: the message */}
        <div>
          <p className="caps text-slate">A Note from Our Founder</p>
          <h2 className="mt-3 text-[clamp(1.7rem,3.2vw,2.4rem)] leading-tight">
            Walls have always felt like possibility to me.
          </h2>
          <div className="mt-5 space-y-3.5 text-[0.98rem] leading-relaxed text-slate">
            {PARAS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-6 font-display text-base font-bold text-charcoal">Roheena</p>
          <p className="text-sm text-slate">Founder</p>

          {/* A quiet continuation of Roheena's note — the women-entrepreneurs
              initiative. Part of her message, not a separate promotional card:
              a subtle rule, the same type scale and palette. */}
          <div className="mt-7 border-t border-edge pt-6">
            <p className="caps text-slate">A woman-founded brand can help another woman begin</p>
            <h3 className="mt-2.5 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold leading-snug text-charcoal">
              Building forward, together.
            </h3>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-slate">
              Zyvorah contributes ₹1 from every square foot of wallpaper sold towards grants and
              mentorship for women entrepreneurs from humble beginnings.
            </p>
            <p className="mt-2.5 text-[0.95rem] italic leading-relaxed text-charcoal/80">
              One entrepreneur helping another begin.
            </p>
            <Link
              href="/our-story#building-forward"
              className="link-underline mt-3 inline-block text-sm font-semibold text-charcoal"
            >
              Learn about the initiative →
            </Link>
          </div>

          <Link href="/founders-note" className="btn mt-6 inline-flex">
            Read Roheena&apos;s Story
          </Link>
        </div>
      </div>
    </section>
  );
}
