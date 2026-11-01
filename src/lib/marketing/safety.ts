// The brand-safety gate. Because posting is autonomous with no human tap before
// it goes live, EVERY generated caption passes through here first. A hard
// failure means the post is regenerated or dropped — it is never published.
//
// This is deliberately mechanical (string/regex checks, not a model judgement)
// so it cannot be talked around and cannot fail open. The model that writes the
// caption already knows the rules; this layer is the seatbelt, not the driver.

import { BANNED_TERMS, SPELLING_CANON, POSITIONING } from "./voice";
import { linkedInIssues } from "./linkedin-desk";

export type SafetyIssue = {
  severity: "block" | "warn";
  code: string;
  detail: string;
};

export type SafetyResult = {
  ok: boolean; // false if any "block" issue is present
  issues: SafetyIssue[];
};

/** Escape a term for use inside a whole-word-ish RegExp. */
function toWordRegex(term: string): RegExp {
  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // A multi-word term must match however its words are joined. The first
    // version of this embedded the literal space, so "foo bar" was blocked and
    // "foo-bar" walked straight through — and 24 of the 39 banned terms are
    // multi-word. The 142-case eval had asserted this since Day 5 and had never
    // been run; it was found on the first execution (risk R34).
    //
    // Separators are treated as interchangeable in BOTH directions: a term
    // written with a hyphen also matches the spaced form, so the gate cannot be
    // dodged by reformatting in either direction.
    .replace(/[\s\-_]+/g, "[\\s\\-_]+");
  // Bounded by non-letters, so the term still has to stand as its own word.
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, "i");
}

/**
 * Check a caption against every hard and soft rule.
 *
 * @param caption   The full generated caption (body + hashtags).
 * @param opts.fromPrice  The exact from-price/sq ft the caller sourced from the
 *   live catalogue. If the caption mentions a rupee price, it MUST match this.
 *   Omit if the post is priceless (then any price mention is a block).
 * @param opts.channel  Where it posts. LinkedIn adds the founder's wording
 *   rules (no "concept study", no client or installation claims) and swaps
 *   Instagram's 2,200-character ceiling for LinkedIn's 3,000.
 */
export function checkCaption(
  caption: string,
  opts: { fromPrice?: number; channel?: string } = {},
): SafetyResult {
  const issues: SafetyIssue[] = [];
  const text = caption.toLowerCase();

  // The artwork is the proposition. Keep sizing and production language out
  // of social captions, including supplied campaign copy and hashtags.
  if (/made[\s-]*to[\s-]*measure|#madetomeasure|sized to your wall|cut to your wall|\bprint(?:ed|ing)?\b/i.test(caption)) {
    issues.push({
      severity: "block",
      code: "design_first_copy",
      detail: "Lead with the mural design; remove sizing and production claims.",
    });
  }

  // 1. Trade-secret / internal terms — hard block, no exceptions.
  for (const term of BANNED_TERMS) {
    if (toWordRegex(term).test(text)) {
      issues.push({
        severity: "block",
        code: "banned_term",
        detail: `Contains forbidden term "${term}" (manufacturing / internal / cost).`,
      });
    }
  }

  // 1b. Claims discipline — the competitive research's own rule: never the
  //     unqualified "world's best wallpaper website" family of claims. The
  //     approved positioning lines (POSITIONING.claims) pass untouched.
  for (const phrase of POSITIONING.neverClaim) {
    if (text.includes(phrase.toLowerCase())) {
      issues.push({
        severity: "block",
        code: "overclaim",
        detail: `Unsubstantiable claim "${phrase}" — use an approved positioning line instead.`,
      });
    }
  }

  // 2. Price accuracy — any rupee figure in the caption must match the live
  //    from-price we were handed. This catches both hallucinated prices and
  //    stale numbers.
  const priceMatches = [...caption.matchAll(/(?:₹|rs\.?\s*|inr\s*)(\d[\d,]*)/gi)];
  if (priceMatches.length > 0) {
    if (opts.fromPrice == null) {
      issues.push({
        severity: "block",
        code: "unverified_price",
        detail:
          "Caption states a price but no live from-price was supplied to verify against.",
      });
    } else {
      const allowed = new Set([String(opts.fromPrice), String(Math.round(opts.fromPrice))]);
      for (const m of priceMatches) {
        const num = m[1].replace(/,/g, "");
        if (!allowed.has(num)) {
          issues.push({
            severity: "block",
            code: "wrong_price",
            detail: `Caption price ₹${m[1]} does not match live from-price ₹${opts.fromPrice}.`,
          });
        }
      }
    }
  }

  // 3. Spelling drift — American forms the brand never uses. Soft warn (the
  //    generator can auto-correct and re-check rather than discard).
  for (const [wrong, right] of Object.entries(SPELLING_CANON)) {
    if (toWordRegex(wrong).test(text)) {
      issues.push({
        severity: "warn",
        code: "spelling",
        detail: `Uses "${wrong}" — brand spells it "${right}".`,
      });
    }
  }

  // 4. Motif discipline — the ✦ sparkle at most once.
  const sparkles = (caption.match(/✦/g) || []).length;
  if (sparkles > 1) {
    issues.push({
      severity: "warn",
      code: "motif_overuse",
      detail: `Uses the ✦ motif ${sparkles} times — allowed at most once.`,
    });
  }

  // 5. Length sanity — a caption that is empty or a wall of text is almost
  //    certainly a generation error.
  const bodyLen = caption.split(/\n\s*\n/)[0].trim().length;
  if (bodyLen < 20) {
    issues.push({ severity: "block", code: "too_short", detail: "Caption body is suspiciously short." });
  }
  if (opts.channel === "linkedin") {
    issues.push(...linkedInIssues(caption));
  } else if (caption.length > 2200) {
    // Instagram's own hard limit.
    issues.push({ severity: "block", code: "too_long", detail: "Exceeds Instagram's 2,200-char limit." });
  }

  return { ok: !issues.some((i) => i.severity === "block"), issues };
}

/** Auto-fix the soft issues we safely can (spelling), returning corrected text. */
export function autoCorrect(caption: string): string {
  let out = caption;
  for (const [wrong, right] of Object.entries(SPELLING_CANON)) {
    // Preserve capitalisation of the first letter.
    out = out.replace(new RegExp(`\\b${wrong}\\b`, "gi"), (m) =>
      m[0] === m[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right,
    );
  }
  return out;
}
