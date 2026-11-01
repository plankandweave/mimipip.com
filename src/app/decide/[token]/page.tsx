
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DecideActions } from "./DecideActions";

export const dynamic = "force-dynamic";
// Internal ops decision link — never indexed, never linked from public pages.
export const metadata: Metadata = brandMetadata({ title: "Decision", robots: { index: false, follow: false } });

type Decision = {
  title: string;
  context: string | null;
  recommendation: string | null;
  impact: string | null;
  urgency: string | null;
  status: string;
  execution_notes: string | null;
  week_start: string;
  week_end: string;
};

// Landing page for the weekly report's "Go ahead / Skip" buttons. The token in
// the URL is the capability; the actual state change needs a real click here
// (a POST), so inbox link-prefetchers can never approve anything by accident.
export default async function DecidePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { token } = await params;
  const { a } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const { data } = await supabase.rpc("decision_by_token", { p_token: token });
  const d = data as Decision | null;
  if (!d) notFound();

  const settled = !["proposed", "approved", "rejected"].includes(d.status);

  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="w-[min(560px,100%)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-mist">
          Weekly Intelligence · {d.week_start} → {d.week_end}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">{d.title}</h1>
        {d.urgency && (
          <span className="mt-2 inline-block rounded-full bg-charcoal px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-surface">
            {d.urgency}
          </span>
        )}

        <div className="mt-5 space-y-4 rounded-[20px] bg-wash p-6 text-sm leading-relaxed">
          {d.context && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Why now</p>
              <p className="mt-1 text-slate">{d.context}</p>
            </div>
          )}
          {d.recommendation && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">The call</p>
              <p className="mt-1 font-medium text-charcoal">{d.recommendation}</p>
            </div>
          )}
          {d.impact && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Expected impact</p>
              <p className="mt-1 text-slate">{d.impact}</p>
            </div>
          )}
        </div>

        {settled ? (
          <div className="mt-6 rounded-[16px] bg-sage/40 p-5 text-sm">
            <p className="font-semibold">
              This one is already {d.status === "done" ? "done" : d.status.replace("_", " ")}.
            </p>
            {d.execution_notes && <p className="mt-2 text-slate">{d.execution_notes}</p>}
          </div>
        ) : (
          <DecideActions token={token} initialStatus={d.status} preselect={a === "skip" ? "skip" : "go"} />
        )}
      </div>
    </div>
  );
}
