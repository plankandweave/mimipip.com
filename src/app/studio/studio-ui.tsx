"use client";

import type { ReactNode } from "react";
import { STYLINGS, type StylingKey } from "@/lib/studio-scenes";

/** One family's tab-bar entry. Colors are literal Tailwind class strings (never
 *  built from a template) so the JIT compiler can see and emit them. */
export type FamilyTabConfig = {
  key: string;
  title: string;
  blurb: string;
  /** Filled pill when this tab is the active one. */
  tabActive: string;
  /** Tint applied to the pill on hover, while inactive. */
  tabHover: string;
  /** Top-edge accent on the panel below, matching the active tab's color. */
  panelAccent: string;
};

/** The bold, colored tab bar — one pill per product family. Always exactly one
 *  active; there is no "everything collapsed" state anymore. */
export function FamilyTabs({
  families, active, onSelect,
}: {
  families: FamilyTabConfig[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-2" role="tablist">
      {families.map((f) => {
        const on = f.key === active;
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={f.blurb}
            onClick={() => onSelect(f.key)}
            className={`rounded-full px-5 py-2.5 text-[0.8rem] font-semibold transition-colors ${
              on ? f.tabActive : `bg-surface text-slate ${f.tabHover}`
            }`}
          >
            {f.title}
          </button>
        );
      })}
    </div>
  );
}

/** The Auto/Calm/Bold/Gallery chip row. Shared by the single-upload panel and
 *  the overnight-batch panel, which previously carried two near-identical
 *  copies of this block — this is the one copy. Callers pass their own `helper`
 *  string so the two contexts' wording (single design vs. whole batch) stays
 *  exactly as it was. */
export function StylingChips({
  value, onChange, disabled, autoNote, helper,
}: {
  value: StylingKey | null;
  onChange: (v: StylingKey | null) => void;
  disabled?: boolean;
  autoNote: string;
  helper: string;
}) {
  return (
    <div>
      <p className="text-[0.72rem] font-semibold">
        Room styling <span className="font-normal text-slate">— how the scenes are dressed</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[{ key: null, label: "Auto", note: autoNote }, ...STYLINGS].map((s) => {
          const on = value === s.key;
          return (
            <button
              key={s.key ?? "auto"}
              type="button"
              disabled={disabled}
              title={s.note}
              onClick={() => onChange(s.key as StylingKey | null)}
              className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
              }`}
            >
              {on ? "✓ " : ""}{s.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[0.62rem] text-mist">{helper}</p>
    </div>
  );
}

/** A slim strip showing the overnight queue's state, rendered under the tab
 *  bar — visible from every tab, not just Wallpaper — whenever anything is
 *  still running. Absent the rest of the time. */
export function QueueStatusStrip({
  count, currentLabel, onResume, onView,
}: {
  count: number;
  currentLabel?: string;
  onResume: () => void;
  onView: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-sky/60 px-4 py-2.5">
      <p className="text-[0.72rem]">
        <span className="caps">Overnight queue</span>
        <span className="ml-1 text-slate">
          · {count} in progress{currentLabel ? ` — ${currentLabel}` : ""}
        </span>
      </p>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onResume} className="text-[0.68rem] text-slate underline underline-offset-2">
          Resume
        </button>
        <button type="button" onClick={onView} className="text-[0.68rem] font-semibold text-charcoal underline underline-offset-2">
          View →
        </button>
      </div>
    </div>
  );
}

/** A labeled, numbered sub-section of the upload form. Purely a formatting
 *  primitive — every field that existed before still exists, just grouped
 *  under a clear heading instead of floating between unrelated paragraphs. */
export function FieldGroup({
  step, title, subtitle, children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 border-t border-edge pt-5 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[0.62rem] font-semibold text-mist">{step}</span>
        <p className="caps text-slate">{title}</p>
      </div>
      {subtitle && <p className="mt-0.5 text-[0.68rem] text-mist">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
