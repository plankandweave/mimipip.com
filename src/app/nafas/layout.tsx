import { Fredoka } from "next/font/google";
import "./nafas.css";

/**
 * Nafas draws in round, soft, happy shapes — a cloud of hair, a gummy-bear
 * earring, a sprinkle — so her collection is set in a round, soft, happy face.
 * As with TAASH's serif, it loads only under /nafas; the rest of the store
 * keeps Jakarta and Inter. Fallbacks stay rounded-ish sans so a slow font
 * never turns her title into something stern.
 */
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-nafas",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Nunito", "Trebuchet MS", "Verdana", "sans-serif"],
});

export default function NafasLayout({ children }: { children: React.ReactNode }) {
  return <div className={`nafas ${fredoka.variable}`}>{children}</div>;
}
