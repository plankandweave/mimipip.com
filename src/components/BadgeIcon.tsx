// Custom line-icons for the editorial badges — drawn to read as considered UI,
// never emoji. The 4-point sparkle is RESERVED for Signature (Zyvorah's "wow"
// mark) and is used nowhere else. Each icon inherits currentColor, so it works
// on both the dark Signature pill and the light pastel pills.

export function BadgeIcon({ badgeKey, className = "h-3 w-3" }: { badgeKey: string; className?: string }) {
  switch (badgeKey) {
    // Autograph — a signed pen stroke: the price category named for a artist's
    // autograph. Deliberately NOT the sparkle, which belongs to Signature.
    case "autograph":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 17.5c3.2 0 4-11 6.6-11 1.7 0 1.5 4.6.2 7.5-.9 2-2 2.8-2.5 2.4-.7-.6.6-2.6 3-3.6 2-.8 4-.9 5.6-.5" />
          <path d="M17 19.5c1.6-.5 3-1.2 4-2" />
        </svg>
      );
    // Founder's Favourite — an award rosette/medal: a personal, top honour.
    case "founders":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8.5" r="5.5" />
          <path d="M8.4 13.2 6.5 21l5.5-3 5.5 3-1.9-7.8" />
        </svg>
      );
    // Signature — a filled four-point sparkle. The diamond/sparkle belongs to
    // Signature alone.
    case "signature":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2c.55 5.2 4.3 8.95 9.5 9.5C16.3 12.05 12.55 15.8 12 21c-.55-5.2-4.3-8.95-9.5-9.5C7.7 10.95 11.45 7.2 12 2Z" />
        </svg>
      );
    // Limited edition — a tag: a numbered/special edition.
    case "limited":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.6 13.4 11 3.8H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z" />
          <circle cx="7.6" cy="7.6" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
    // New this season — a sprout: fresh, seasonal growth.
    case "new":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21v-9" />
          <path d="M12 12C11 7.5 7.5 5.5 3.5 6.2 3 10.4 6 12.7 12 12Z" />
          <path d="M12 13.5c.9-3.4 3.6-4.8 6.7-4 .3 3.2-2 5-6.7 4Z" />
        </svg>
      );
    // Loved in our showroom — a monoline heart.
    case "showroom":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20.3 4.65 12.95a4.35 4.35 0 0 1 6.15-6.15l1.2 1.2 1.2-1.2a4.35 4.35 0 0 1 6.15 6.15Z" />
        </svg>
      );
    // Ceiling wallpaper — a top bar (the ceiling) with an arrow pointing up
    // into it: this one hangs overhead, not on a wall.
    case "ceiling":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16" />
          <path d="M12 20V7" />
          <path d="M7.5 11.5 12 7l4.5 4.5" />
        </svg>
      );
    default:
      return null;
  }
}
