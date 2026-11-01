"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRpc } from "@/lib/admin-rpc";
import { StaffGate, useStaff } from "@/lib/use-staff";
import { formatINR } from "@/lib/pricing";

// ───────────────────────────────────────────────────────────────────────────
// The founder's decision command board. Everything the intelligence layer has
// proposed, what she decided, what the executor actually did, and — once the
// next weekly report lands — whether each decision moved its metric.
// ───────────────────────────────────────────────────────────────────────────

// Must mirror the ramp in src/lib/intel.ts (not imported — that module pulls
// the Anthropic SDK into the client bundle). Week n's target; the 52 sum to 5Cr.
const ANNUAL_TARGET = 5_00_00_000;
const RAMP_WEEKS = 52;
function weekTarget(n: number): number {
  if (n < 1) return 0;
  if (n > RAMP_WEEKS) return Math.round((2 * ANNUAL_TARGET) / (RAMP_WEEKS + 1));
  return Math.round(((2 * ANNUAL_TARGET) / (RAMP_WEEKS * (RAMP_WEEKS + 1))) * n);
}

type Decision = {
  id: string;
  title: string;
  recommendation: string | null;
  impact: string | null;
  urgency: string | null;
  status: "proposed" | "approved" | "rejected" | "in_progress" | "done" | "blocked";
  decided_at: string | null;
  executed_at: string | null;
  execution_notes: string | null;
  week_start: string | null;
  created_at: string;
};

type Report = {
  id: string;
  week_start: string;
  week_end: string;
  metrics: {
    week_number?: number;
    revenue_paid?: number;
    target_this_week?: number;
    orders_paid?: number;
    chat_sessions?: number;
    abandoned_carts?: number;
    funnel?: { views: number; visualizes: number; saves: number; carts: number; orders_paid: number };
  };
  created_at: string;
};

const STATUS_META: Record<Decision["status"], { label: string; chip: string }> = {
  proposed: { label: "Awaiting your call", chip: "bg-wash text-slate" },
  approved: { label: "In the queue", chip: "bg-lavender/60 text-charcoal" },
  in_progress: { label: "Executing", chip: "bg-peach/60 text-charcoal" },
  done: { label: "Done", chip: "bg-sage/60 text-charcoal" },
  blocked: { label: "Needs you", chip: "bg-blush/70 text-charcoal" },
  rejected: { label: "Skipped", chip: "bg-wash text-mist" },
};

// Which weekly metric each decision is judged by, picked from its title.
function watchedMetric(title: string): { key: string; label: string; read: (r: Report) => number | null; fmt: (v: number) => string } {
  const t = title.toLowerCase();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (t.includes("visual"))
    return {
      key: "visualize_rate",
      label: "Visualize rate",
      read: (r) => {
        const f = r.metrics.funnel;
        return f && f.views > 0 ? f.visualizes / f.views : null;
      },
      fmt: pct,
    };
  if (t.includes("cart") || t.includes("contact"))
    return { key: "carts", label: "Carts with contact reachable", read: (r) => r.metrics.funnel?.carts ?? null, fmt: String };
  if (t.includes("traffic") || t.includes("campaign") || t.includes("ad"))
    return { key: "views", label: "Product views", read: (r) => r.metrics.funnel?.views ?? null, fmt: String };
  if (t.includes("taste") || t.includes("outreach") || t.includes("recover"))
    return { key: "revenue", label: "Weekly revenue", read: (r) => r.metrics.revenue_paid ?? null, fmt: (v) => formatINR(v) };
  return { key: "revenue", label: "Weekly revenue", read: (r) => r.metrics.revenue_paid ?? null, fmt: (v) => formatINR(v) };
}

function fmtLakh(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${Math.round(v / 1_000)}k`;
  return `₹${Math.round(v)}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

// ── Ramp chart: weekly revenue bars vs the ₹5Cr target line ────────────────
// Single data series (revenue, #1d7fa8 — palette-validated) + a dashed
// neutral reference line for the ramp target, direct-labeled. One axis (₹).
function RampChart({ reports }: { reports: Report[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const actual = [...reports]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((r) => ({
      week: r.metrics.week_number ?? 1,
      label: shortDate(r.week_start),
      revenue: r.metrics.revenue_paid ?? 0,
      target: r.metrics.target_this_week ?? weekTarget(r.metrics.week_number ?? 1),
    }));
  const lastWeek = actual.length ? actual[actual.length - 1].week : 1;
  // Look ahead: the ramp for the next 8 weeks, so the board always shows the hill to climb.
  const future = Array.from({ length: 8 }, (_, i) => ({
    week: lastWeek + i + 1,
    label: `W${lastWeek + i + 1}`,
    revenue: null as number | null,
    target: weekTarget(lastWeek + i + 1),
  }));
  const points = [...actual.map((a) => ({ ...a, revenue: a.revenue as number | null })), ...future];

  const W = 720;
  const H = 220;
  const PAD = { l: 46, r: 12, t: 16, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxY = Math.max(...points.map((p) => Math.max(p.revenue ?? 0, p.target))) * 1.15 || 1;
  const x = (i: number) => PAD.l + (innerW * (i + 0.5)) / points.length;
  const y = (v: number) => PAD.t + innerH - (innerH * v) / maxY;
  const barW = Math.min(28, (innerW / points.length) * 0.55);

  const targetPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.target)}`).join(" ");
  const gridVals = [0.25, 0.5, 0.75, 1].map((f) => maxY * f);

  return (
    <div>
      <div className="flex items-center gap-4 text-[0.68rem] text-slate">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: "#1d7fa8" }} /> Weekly revenue</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "#6b6b6b" }} /> ₹5Cr ramp target</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Weekly revenue against the ramp target to five crore">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ececec" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#6b6b6b">{fmtLakh(v)}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#d9d9d4" strokeWidth="1" />
        {/* target ramp — dashed reference line, direct-labeled at its end */}
        <path d={targetPath} fill="none" stroke="#6b6b6b" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        <text x={x(points.length - 1)} y={y(points[points.length - 1].target) - 7} textAnchor="end" fontSize="9" fontWeight="600" fill="#6b6b6b">target</text>
        {/* revenue bars — 4px rounded top, anchored to the baseline */}
        {points.map((p, i) =>
          p.revenue == null ? null : (
            <g key={i}>
              <rect
                x={x(i) - barW / 2}
                y={Math.min(y(p.revenue), y(0) - 2)}
                width={barW}
                height={Math.max(y(0) - y(p.revenue), 2)}
                rx="4"
                fill="#1d7fa8"
              />
              <text x={x(i)} y={y(p.revenue) - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#3f3f3f">
                {fmtLakh(p.revenue)}
              </text>
            </g>
          ),
        )}
        {/* hover layer: full-height hit targets, tooltip per week */}
        {points.map((p, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - innerW / points.length / 2}
            y={PAD.t}
            width={innerW / points.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="#0F0F0F" strokeWidth="1" opacity="0.25" />
            <g transform={`translate(${Math.min(x(hover) + 8, W - 150)}, ${PAD.t + 4})`}>
              <rect width="142" height="46" rx="8" fill="#0F0F0F" opacity="0.92" />
              <text x="10" y="16" fontSize="9" fontWeight="700" fill="#ffffff">Week {points[hover].week} · {points[hover].label}</text>
              <text x="10" y="29" fontSize="9" fill="#d8d8d8">Revenue: {points[hover].revenue == null ? "—" : formatINR(points[hover].revenue!)}</text>
              <text x="10" y="40" fontSize="9" fill="#d8d8d8">Target: {formatINR(points[hover].target)}</text>
            </g>
          </g>
        )}
        {/* x labels — first, last actual, last projected */}
        {points.map((p, i) =>
          i === 0 || i === actual.length - 1 || i === points.length - 1 ? (
            <text key={`x${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b6b6b">
              W{p.week}
            </text>
          ) : null,
        )}
      </svg>
      <details className="mt-1">
        <summary className="cursor-pointer text-[0.65rem] text-mist">View as table</summary>
        <table className="mt-2 w-full text-left text-[0.7rem]">
          <thead><tr className="text-mist"><th className="py-1 pr-4 font-medium">Week</th><th className="py-1 pr-4 font-medium">Revenue</th><th className="py-1 font-medium">Target</th></tr></thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className="border-t border-edge">
                <td className="py-1 pr-4">W{p.week}</td>
                <td className="py-1 pr-4">{p.revenue == null ? "—" : formatINR(p.revenue)}</td>
                <td className="py-1">{formatINR(p.target)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ── Impact strip: the decision's watched metric, baseline → latest ─────────
function ImpactStrip({ d, reports }: { d: Decision; reports: Report[] }) {
  const metric = watchedMetric(d.title);
  const sorted = [...reports].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const baseline = sorted.find((r) => r.week_start === d.week_start) ?? sorted[0];
  const latest = sorted[sorted.length - 1];
  if (!baseline || !latest) return null;

  const before = metric.read(baseline);
  const after = metric.read(latest);
  const measuring = baseline.id === latest.id || d.status === "proposed" || !d.decided_at;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-surface px-3 py-2 text-[0.68rem]">
      <span className="font-semibold uppercase tracking-wide text-mist">Impact · {metric.label}</span>
      {measuring ? (
        <span className="text-slate">measuring — first read after next Monday&apos;s report</span>
      ) : before == null || after == null ? (
        <span className="text-slate">not enough data yet</span>
      ) : (
        <span className="font-semibold text-charcoal">
          {metric.fmt(before)} → {metric.fmt(after)}{" "}
          {after > before ? <span className="text-slate">▲ helped</span> : after < before ? <span className="text-slate">▼ not yet</span> : <span className="text-mist">flat</span>}
        </span>
      )}
    </div>
  );
}

// The action row: every state has its one-click next move — the click IS the
// trigger (POST /api/decide/act runs the executor immediately, no cron wait).
function ActionRow({
  d,
  busy,
  onAct,
}: {
  d: Decision;
  busy: boolean;
  onAct: (d: Decision, action: "approve" | "skip" | "run" | "mark_done") => void;
}) {
  const solid = "rounded-full bg-charcoal px-4 py-2 text-[0.68rem] font-semibold text-surface transition-transform hover:scale-105 disabled:opacity-40";
  const ghost = "rounded-full border border-edge px-4 py-2 text-[0.68rem] font-semibold text-slate hover:border-charcoal disabled:opacity-40";

  if (busy || d.status === "in_progress") {
    return (
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-peach/60 px-4 py-2 text-[0.68rem] font-semibold text-charcoal">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-charcoal" /> Executing — takes a minute or two, this card will update
      </p>
    );
  }
  if (d.status === "proposed") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={solid} onClick={() => onAct(d, "approve")}>✓ Go ahead — execute now</button>
        <button className={ghost} onClick={() => onAct(d, "skip")}>Skip</button>
      </div>
    );
  }
  if (d.status === "approved") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={solid} onClick={() => onAct(d, "run")}>▶ Run now</button>
        <button className={ghost} onClick={() => onAct(d, "skip")}>Skip after all</button>
      </div>
    );
  }
  if (d.status === "blocked") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={solid} onClick={() => onAct(d, "run")}>↻ Have the machine go again</button>
        <button className={ghost} onClick={() => onAct(d, "mark_done")}>I did my step — mark done</button>
      </div>
    );
  }
  return null;
}

// A decision needing eyes stays expanded; settled ones (done/skipped) start
// folded to a single line — the board should read like a checklist, not a wall.
function DecisionCard({
  d,
  reports,
  busy,
  onAct,
}: {
  d: Decision;
  reports: Report[];
  busy: boolean;
  onAct: (d: Decision, action: "approve" | "skip" | "run" | "mark_done") => void;
}) {
  const meta = STATUS_META[d.status];
  const [open, setOpen] = useState(!["done", "rejected"].includes(d.status));
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[16px] bg-wash"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`text-[0.6rem] text-mist transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="truncate font-display text-sm font-bold leading-snug">{d.title}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wide ${meta.chip}`}>
          {meta.label}
        </span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[0.68rem] text-mist">
          {d.week_start ? `Report of ${shortDate(d.week_start)}` : ""}
          {d.urgency ? ` · ${d.urgency}` : ""}
          {d.decided_at ? ` · you decided ${shortDate(d.decided_at)}` : ""}
          {d.executed_at ? ` · executed ${shortDate(d.executed_at)}` : ""}
        </p>
        {d.recommendation && <p className="mt-2 text-xs leading-relaxed text-slate">{d.recommendation}</p>}
        {d.execution_notes && (
          <div className="mt-2 rounded-[10px] border-l-2 border-charcoal bg-surface px-3 py-2 text-[0.7rem] leading-relaxed text-slate">
            <span className="font-semibold text-charcoal">What was done: </span>
            {d.execution_notes}
          </div>
        )}
        <ActionRow d={d} busy={busy} onAct={onAct} />
        <ImpactStrip d={d} reports={reports} />
      </div>
    </details>
  );
}

// Broad-stroke category from the decision's title — good enough for a founder
// scanning "show me all the marketing calls".
function decisionCategory(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ad|ads|campaign|traffic|meta|instagram|linkedin|social|content)\b/.test(t)) return "Marketing & ads";
  if (/(outreach|recover|whatsapp|nurture|newsletter|profile|email)/.test(t)) return "Customer outreach";
  if (/(visual|page|site|cart|contact|checkout|review|search|speed)/.test(t)) return "Website & shop";
  if (/(price|pricing|material|catalog|catalogue|design|merchandis|product)/.test(t)) return "Catalogue & pricing";
  return "Everything else";
}

// A collapsible section of the board (status bucket, week, or category).
function BoardSection({
  title,
  subtitle,
  items,
  reports,
  busyIds,
  onAct,
  defaultOpen,
}: {
  title: string;
  subtitle?: string;
  items: Decision[];
  reports: Report[];
  busyIds: Set<string>;
  onAct: (d: Decision, action: "approve" | "skip" | "run" | "mark_done") => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
        <span className={`text-[0.65rem] text-mist transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <h2 className="font-display text-lg font-bold">
          {title}
          <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-xs tabular-nums">{items.length}</span>
        </h2>
        {subtitle && <span className="hidden text-xs text-mist sm:inline">{subtitle}</span>}
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((d) => (
          <DecisionCard key={d.id} d={d} reports={reports} busy={busyIds.has(d.id)} onAct={onAct} />
        ))}
      </div>
    </details>
  );
}

export function DecisionBoard() {
  const staff = useStaff();
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  const load = useCallback(async () => {
    const [dRes, rRes] = await Promise.all([
      adminRpc("admin_intel_decisions"),
      adminRpc("admin_intel_reports"),
    ]);
    if (dRes.error) {
      setError(dRes.error.message.includes("unauthorized") ? "You're not signed in." : "Couldn't load decisions.");
      return;
    }
    setError(null);
    setDecisions((dRes.data as Decision[]) ?? []);
    setReports((rRes.data as Report[]) ?? []);
  }, []);

  useEffect(() => {
    // The sign-in is only confirmed after mount, so the first fetch has to
    // hang off it — same pattern as the admin surfaces.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (staff === "in") load();
  }, [staff, load]);

  // While anything is executing, keep the board live.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const anyRunning = busyIds.size > 0 || (decisions ?? []).some((d) => d.status === "in_progress");
    if (staff !== "in" || !anyRunning) return;
    const t = setInterval(() => load(), 12000);
    return () => clearInterval(t);
  }, [staff, busyIds, decisions, load]);

  // The click is the trigger: approve/run executes the decision immediately
  // on the server (the request stays open while the executor works).
  const act = useCallback(
    async (d: Decision, action: "approve" | "skip" | "run" | "mark_done") => {
      setBusyIds((s) => new Set(s).add(d.id));
      try {
        const res = await fetch("/api/decide/act", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: d.id, action }),
        });
        if (!res.ok) setError("That action didn't go through — try again.");
        else setError(null);
      } catch {
        setError("Couldn't reach the server — try again.");
      } finally {
        setBusyIds((s) => {
          const n = new Set(s);
          n.delete(d.id);
          return n;
        });
        await load();
      }
    },
    [load],
  );

  // Three ways to slice the same decisions; sections needing attention start
  // open, history starts folded.
  const [groupBy, setGroupBy] = useState<"status" | "week" | "category">("status");
  const sections = useMemo(() => {
    const ds = decisions ?? [];
    if (groupBy === "status") {
      return [
        { title: "Waiting on you", subtitle: "one step each — or send the machine again", items: ds.filter((d) => d.status === "blocked" || d.status === "proposed"), defaultOpen: true },
        { title: "In the machine", subtitle: "approved — executing now or on the daily sweep", items: ds.filter((d) => d.status === "approved" || d.status === "in_progress"), defaultOpen: true },
        { title: "Done", subtitle: "executed — impact reads update every Monday", items: ds.filter((d) => d.status === "done"), defaultOpen: false },
        { title: "Skipped", subtitle: "your call was no", items: ds.filter((d) => d.status === "rejected"), defaultOpen: false },
      ];
    }
    if (groupBy === "week") {
      const weeks = [...new Set(ds.map((d) => d.week_start ?? "unknown"))].sort().reverse();
      return weeks.map((w, i) => ({
        title: w === "unknown" ? "No report week" : `Week of ${shortDate(w)}`,
        subtitle: undefined as string | undefined,
        items: ds.filter((d) => (d.week_start ?? "unknown") === w),
        defaultOpen: i === 0, // only the latest week open
      }));
    }
    const cats = [...new Set(ds.map((d) => decisionCategory(d.title)))].sort();
    return cats.map((c) => ({
      title: c,
      subtitle: undefined as string | undefined,
      items: ds.filter((d) => decisionCategory(d.title) === c),
      defaultOpen: ds.some((d) => decisionCategory(d.title) === c && ["blocked", "proposed"].includes(d.status)),
    }));
  }, [decisions, groupBy]);

  const stats = useMemo(() => {
    const ds = decisions ?? [];
    const sorted = [...reports].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const latest = sorted[sorted.length - 1];
    const weekNo = latest?.metrics.week_number ?? 1;
    const cumTarget = Array.from({ length: weekNo }, (_, i) => weekTarget(i + 1)).reduce((a, b) => a + b, 0);
    const cumRevenue = sorted.reduce((s, r) => s + (r.metrics.revenue_paid ?? 0), 0);
    return {
      decided: ds.filter((d) => d.decided_at).length,
      done: ds.filter((d) => d.status === "done").length,
      needsYou: ds.filter((d) => d.status === "blocked" || d.status === "proposed").length,
      cumRevenue,
      cumTarget,
      weekNo,
    };
  }, [decisions, reports]);

  // /decide is not behind Cloudflare Access, so an unsigned visitor genuinely
  // lands here — the gate offers them the same Google sign-in as /admin.
  if (staff !== "in") return <StaffGate state={staff} title="Decision board" />;

  return (
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-mist">Zyvorah Intelligence · Week {stats.weekNo}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Decision board</h1>
          <p className="mt-1 text-sm text-slate">
            Every call you&apos;ve made, what the machine did with it, and whether it moved the numbers.
          </p>
        </div>
        <a href="/admin" className="text-xs text-slate underline underline-offset-2">Ops dashboard →</a>
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm">{error}</p>}

      {/* hero numbers */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] bg-charcoal p-5 text-surface">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest opacity-70">Path to ₹5 crore</p>
          <p className="mt-1 font-display text-2xl font-bold">{fmtLakh(stats.cumRevenue)}</p>
          <p className="mt-0.5 text-[0.7rem] opacity-70">of {fmtLakh(stats.cumTarget)} target to date{stats.cumTarget > 0 ? ` · ${Math.round((stats.cumRevenue / stats.cumTarget) * 100)}%` : ""}</p>
        </div>
        <div className="rounded-[18px] bg-wash p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Decisions made</p>
          <p className="mt-1 font-display text-2xl font-bold">{stats.decided}</p>
          <p className="mt-0.5 text-[0.7rem] text-mist">every one from a Monday report</p>
        </div>
        <div className="rounded-[18px] bg-wash p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Shipped by the machine</p>
          <p className="mt-1 font-display text-2xl font-bold">{stats.done}</p>
          <p className="mt-0.5 text-[0.7rem] text-mist">executed &amp; live</p>
        </div>
        <div className="rounded-[18px] bg-wash p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Waiting on you</p>
          <p className="mt-1 font-display text-2xl font-bold">{stats.needsYou}</p>
          <p className="mt-0.5 text-[0.7rem] text-mist">prepared — one step each</p>
        </div>
      </div>

      {/* ramp chart */}
      <div className="mt-6 rounded-[20px] border border-edge bg-surface p-5">
        <p className="font-display text-sm font-bold">Weekly revenue vs the ₹5Cr ramp</p>
        {reports.length ? (
          <div className="mt-3"><RampChart reports={reports} /></div>
        ) : (
          <p className="mt-3 text-sm text-mist">The first weekly report will draw this chart.</p>
        )}
      </div>

      {/* decision groups — sliceable by status / week / category, all collapsible */}
      {decisions == null ? (
        <p className="mt-8 text-sm text-mist">Loading…</p>
      ) : (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-mist">Group by</span>
            {(["status", "week", "category"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                aria-pressed={groupBy === g}
                className={`rounded-full px-3.5 py-1.5 text-[0.68rem] font-semibold capitalize transition-colors ${
                  groupBy === g ? "bg-charcoal text-surface" : "border border-edge text-slate hover:border-charcoal"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-6">
            {sections.map((s) => (
              <BoardSection
                key={`${groupBy}:${s.title}`}
                title={s.title}
                subtitle={s.subtitle}
                items={s.items}
                reports={reports}
                busyIds={busyIds}
                onAct={act}
                defaultOpen={s.defaultOpen}
              />
            ))}
          </div>
        </div>
      )}

      <p className="mt-10 border-t border-edge pt-4 text-[0.7rem] leading-relaxed text-mist">
        How this runs: every Monday 9:00 AM the intelligence report lands in your inbox with Go ahead / Skip buttons ·
        your taps update this board · the executor runs daily at 10:00 AM on whatever you approved ·
        outcomes and metric impact land back here. Fully cloud — nothing depends on any device.
      </p>
    </div>
  );
}
