
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OutreachDecideActions } from "./OutreachDecideActions";

export const dynamic = "force-dynamic";
// Internal review link — never indexed, never linked from public pages.
export const metadata: Metadata = brandMetadata({ title: "Inquiry", robots: { index: false, follow: false } });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = {
  reference: string;
  kind: "influencer" | "press" | "artist";
  name: string;
  email: string;
  handle: string | null;
  outlet: string | null;
  links: string[];
  fields: Record<string, any>;
  message: string;
  status: string;
  checks: any;
  ai: any;
  created_at: string;
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function Dot({ value }: { value: boolean | null }) {
  const colour = value === true ? "text-[#3d9a50]" : value === false ? "text-[#c0392b]" : "text-[#b58900]";
  return <span className={`${colour} font-bold`}>●</span>;
}

function CheckLine({ label, value, ok, bad }: { label: string; value: boolean | null; ok: string; bad: string }) {
  return (
    <li className="flex items-baseline gap-2 text-sm text-slate">
      <Dot value={value} />
      <span>
        {label} — <span className="text-charcoal">{value === true ? ok : value === false ? bad : "could not verify"}</span>
      </span>
    </li>
  );
}

// The founder's review screen, reached from the dossier email. The token in the
// URL is the capability; approving needs a real click here (a POST), so inbox
// link-prefetchers can never send a reply by accident.
export default async function OutreachDecidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const { data } = await supabase.rpc("outreach_by_token", { p_token: token });
  const r = data as Row | null;
  if (!r) notFound();

  const creator = r.kind === "influencer";
  const ai = r.ai ?? null;
  const checks = r.checks ?? null;
  const verdictClass =
    ai?.verdict === "recommend" ? "bg-sage/50" : ai?.verdict === "pass" ? "bg-wash" : "bg-wash";

  return (
    <div className="container-x py-12">
      <div className="mx-auto w-[min(640px,100%)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-mist">
          {creator ? "Creator collaboration" : r.kind === "artist" ? "Artist collaboration" : "Press request"} · {r.reference}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">
          {creator ? (r.handle ? `@${r.handle}` : r.name) : (r.outlet ?? r.name)}
        </h1>
        <p className="mt-1 text-sm text-slate">
          {r.name} · <a href={`mailto:${r.email}`} className="underline underline-offset-2">{r.email}</a>
        </p>

        {ai && (
          <div className={`mt-5 rounded-[20px] p-6 ${verdictClass}`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-charcoal">
              {ai.verdict} · {ai.score}/100
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate">{ai.summary}</p>
            {ai.angle && (
              <p className="mt-2 text-sm text-slate">
                <span className="font-medium text-charcoal">What we get:</span> {ai.angle}
              </p>
            )}
            {Array.isArray(ai.flags) && ai.flags.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-[#c0392b]">
                {ai.flags.map((f: string) => <li key={f}>⚑ {f}</li>)}
              </ul>
            )}
          </div>
        )}

        {checks && (
          <div className="mt-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Automated checks</p>
            <ul className="mt-2 space-y-1.5">
              <CheckLine
                label={`Email domain ${checks.email_domain}`}
                value={checks.mx_ok}
                ok="receives mail (MX found)"
                bad="no MX records"
              />
              {checks.instagram && (
                <CheckLine
                  label={`Instagram @${checks.instagram.handle}`}
                  value={checks.instagram.exists}
                  ok={
                    [
                      checks.instagram.followers !== null ? `${fmtCount(checks.instagram.followers)} followers` : null,
                      checks.instagram.posts !== null ? `${checks.instagram.posts} posts` : null,
                      checks.instagram.verified ? "verified" : null,
                      checks.instagram.private ? "private account" : null,
                    ].filter(Boolean).join(" · ") || "profile exists"
                  }
                  bad="no such handle"
                />
              )}
              {checks.instagram?.followers_mismatch && (
                <li className="flex items-baseline gap-2 text-sm text-[#c0392b]">
                  <span className="font-bold">●</span>
                  <span>Audience claim — {checks.instagram.followers_mismatch}</span>
                </li>
              )}
              {checks.outlet_domain_match !== null && checks.outlet_domain_match !== undefined && (
                <CheckLine
                  label="Email domain vs outlet"
                  value={checks.outlet_domain_match}
                  ok="matches the outlet"
                  bad={checks.freemail ? "personal email — likely freelance, verify the byline" : "no match"}
                />
              )}
              {(checks.links ?? []).map((l: { url: string; ok: boolean | null }) => (
                <CheckLine key={l.url} label={l.url.replace(/^https?:\/\//, "")} value={l.ok} ok="resolves" bad="dead link" />
              ))}
            </ul>
            {checks.instagram && (
              <a
                href={checks.instagram.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-slate underline underline-offset-2 hover:text-charcoal"
              >
                Open their Instagram →
              </a>
            )}
          </div>
        )}

        {r.fields && Object.keys(r.fields).length > 0 && (
          <div className="mt-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Their details</p>
            <dl className="mt-2 space-y-1 text-sm">
              {Object.entries(r.fields)
                .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-mist">{k.replace(/_/g, " ")}:</dt>
                    <dd className="text-slate">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        <div className="mt-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Their message</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate">{r.message}</p>
        </div>

        <OutreachDecideActions
          token={token}
          initialStatus={r.status}
          draftHtml={ai?.draft_reply_html ?? ""}
          firstName={r.name.split(/\s+/)[0]}
        />
      </div>
    </div>
  );
}
