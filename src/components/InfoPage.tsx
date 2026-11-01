import Link from "next/link";

export type Section = { heading?: React.ReactNode; body: React.ReactNode };

/** Shared layout for editorial / informational pages (FAQ, shipping, etc.). */
export function InfoPage({
  eyebrow,
  title,
  intro,
  sections,
  cta,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  sections: Section[];
  cta?: { label: string; href: string };
}) {
  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        {eyebrow && <span className="caps text-slate">{eyebrow}</span>}
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">{title}</h1>
        {intro && <p className="mt-4 text-slate">{intro}</p>}

        <div className="mt-10 space-y-8">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && <h2 className="font-display text-lg font-semibold">{s.heading}</h2>}
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate">{s.body}</div>
            </div>
          ))}
        </div>

        {cta && (
          <Link href={cta.href} className="btn mt-10 inline-flex h-12 px-6 text-[0.8rem]">
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
