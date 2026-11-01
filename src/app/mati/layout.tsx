import { Cormorant_Garamond, Noto_Serif_Devanagari } from "next/font/google";
import "./taash.css";

/**
 * TAASH is set in a serif because the book is. The rest of the store runs on
 * Jakarta and Inter and keeps them — these two load only under /mati, so no
 * other page pays for them.
 *
 * adjustFontFallback is OFF on purpose. Left on, next/font synthesises a
 * "Cormorant Garamond Fallback" face out of ARIAL metrics and puts it ahead of
 * everything else in the stack — so for every moment before the woff2 lands
 * (and this page ships a wall of photographs competing for the same
 * bandwidth), the collection's own title renders in a sans. Off, the stack
 * falls to Georgia and the worst case is still a serif. The swap is a little
 * less metrically exact; the page is never in the wrong kind of typeface.
 *
 * The fallback list is spelled out at each call because next/font only accepts
 * literals here — a shared const fails the build.
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-taash-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const body = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-taash-body",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/** The names are Devanagari first throughout the book; a Latin fallback would
 *  render them as boxes. */
const devanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500"],
  variable: "--font-taash-dev",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export default function MatiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`taash ${display.variable} ${body.variable} ${devanagari.variable}`}>
      {children}
    </div>
  );
}
