/**
 * The mark that says a design is sold on the mini fridge alone.
 *
 * It is drawn as a mini fridge rather than set as a word: the badge sits on a
 * 160 px thumbnail in a grid of sixteen, where "MINI ONLY" would either be
 * unreadable or big enough to cover the artwork it is describing. A silhouette
 * of the appliance reads at that size, and reads before the label does.
 *
 * The shape is the Format E chassis — one short door, a single gap near the top
 * for the freezer box — so the icon is a picture of the thing the design fits,
 * not a generic tag.
 */
export function MiniExclusiveBadge({
  withLabel = false,
  className,
}: {
  /** Show the words too. On a readout there is room; on a thumbnail there is not. */
  withLabel?: boolean;
  className?: string;
}) {
  const icon = (
    <svg
      viewBox="0 0 20 26"
      className="h-[15px] w-auto"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* cabinet */}
      <rect x="2.8" y="1.8" width="14.4" height="20.6" rx="2.6" />
      {/* the freezer box's shelf line — what makes it read as a fridge */}
      <path d="M2.8 8.2h14.4" />
      {/* feet, so it stands rather than floats */}
      <path d="M6 22.4v1.8M14 22.4v1.8" strokeLinecap="round" />
    </svg>
  );

  if (!withLabel) {
    return (
      <span
        className={
          className ??
          "pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-charcoal/85 text-surface shadow-sm backdrop-blur"
        }
        title="Mini fridge only"
      >
        {icon}
        <span className="sr-only">Sold on the mini fridge only</span>
      </span>
    );
  }

  return (
    <span
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full bg-charcoal px-2.5 py-1 text-[0.68rem] font-semibold text-surface"
      }
    >
      {icon}
      Mini fridge only
    </span>
  );
}
