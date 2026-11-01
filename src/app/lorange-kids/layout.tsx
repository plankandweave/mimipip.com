import { Cormorant_Garamond } from "next/font/google";
import "./lorange.css";

/**
 * L'Orange Kids is set in an editorial serif, like its wordmark. It loads only
 * under /lorange-kids; the rest of the store keeps Jakarta and Inter. As under
 * /mati, adjustFontFallback is off so a slow font falls back to Georgia, never
 * to a sans.
 */
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-lorange",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export default function LorangeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`lorange ${serif.variable}`}>{children}</div>;
}
