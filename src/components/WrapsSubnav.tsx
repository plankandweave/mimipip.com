import Link from "next/link";
import {
  APPLIANCES,
  APPLIANCE_KEYS,
  WRAP_HUB_PATH,
  type PickerGroup,
} from "@/lib/appliances";

/**
 * The wrap range's own navigation.
 *
 * WHY THIS EXISTS. wraps.zyvorah.com rewrites only `/` (src/edge/gate.ts); every
 * other path serves the same app, so the header above this bar is the wallpaper
 * site's header and knows nothing about appliances. A visitor who followed the
 * hub's own CTA to /fridge-wraps had no link back to the hub and no link to the
 * other four appliances — the page that sells the range hardest was the page
 * with no way out of it.
 *
 * So the range carries its own bar: the hub, then one link per landing page,
 * then an optional breadcrumb for the pages that sit under an appliance. It is
 * a server component with no state, so it costs nothing and every wraps surface
 * can render it without becoming dynamic.
 */

export type WrapsSubnavProps = {
  /** The appliance whose section we are in. Marked as current in the switcher. */
  current?: PickerGroup | null;
  /**
   * Trail below the switcher, for pages under an appliance ("Fit finder").
   * The appliance itself is prepended, so pass only what comes after it.
   */
  trail?: { label: string; href?: string }[];
};

/** One entry per landing PAGE — both washers share one, as on the hub. */
function switcherLinks() {
  const seen = new Set<string>();
  const out: { group: PickerGroup; label: string; href: string }[] = [];
  for (const key of APPLIANCE_KEYS) {
    const cfg = APPLIANCES[key];
    if (seen.has(cfg.landingPath)) continue;
    seen.add(cfg.landingPath);
    out.push({ group: cfg.pickerGroup, label: cfg.pickerGroupLabel, href: cfg.landingPath });
  }
  return out;
}

export function WrapsSubnav({ current = null, trail }: WrapsSubnavProps) {
  const links = switcherLinks();
  const currentCfg = current
    ? APPLIANCE_KEYS.map((k) => APPLIANCES[k]).find((c) => c.pickerGroup === current)
    : null;

  return (
    <nav aria-label="Appliance wraps" className="border-b border-edge bg-surface">
      <div className="container-x flex items-center gap-4 overflow-x-auto py-1.5 no-scrollbar">
        <Link
          href={WRAP_HUB_PATH}
          className="caps inline-flex min-h-10 shrink-0 items-center text-slate transition-colors hover:text-charcoal"
        >
          All wraps
        </Link>
        <span aria-hidden className="h-4 w-px shrink-0 bg-edge" />
        <ul className="flex items-center gap-1">
          {links.map((l) => {
            const active = l.group === current;
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex min-h-10 items-center rounded-full bg-wash px-3 text-sm font-semibold text-charcoal"
                      : "inline-flex min-h-10 items-center rounded-full px-3 text-sm text-slate transition-colors hover:bg-wash hover:text-charcoal"
                  }
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {trail && trail.length > 0 && currentCfg && (
        <div className="container-x pb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-mist">
            <li>
              <Link href={currentCfg.landingPath} className="transition-colors hover:text-charcoal">
                {currentCfg.pickerGroupLabel}
              </Link>
            </li>
            {trail.map((t, i) => (
              <li key={`${t.label}-${i}`} className="flex items-center gap-1.5">
                <span aria-hidden>/</span>
                {t.href ? (
                  <Link href={t.href} className="transition-colors hover:text-charcoal">
                    {t.label}
                  </Link>
                ) : (
                  <span className="text-slate">{t.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </nav>
  );
}
