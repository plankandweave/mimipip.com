import { ImageResponse } from "next/og";
import { getGiftDesign } from "@/lib/gift-card-designs";
import { assetFetch } from "@/lib/asset-fetch";

export const runtime = "edge";

/** Base64 data URI for a bundled asset, read through the ASSETS binding so the
 *  Worker never fetches its own zone (see asset-fetch.ts). Used for the logo,
 *  which next/og would otherwise fetch over the public URL as an <img src>. */
async function assetDataUri(url: string, mime: string): Promise<string> {
  const buf = (await assetFetch(url).then((r) => r.arrayBuffer())) as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

const CARD_W = 1000, CARD_H = 630;

/**
 * Renders a gift-card face to PNG for the delivery email — text is rendered via
 * next/og (ImageResponse) with a bundled font so it always shows on the server
 * (plain SVG→sharp text needs system fonts the host lacks). Solid brand colour
 * + the real logo (a pre-rendered PNG), matching the on-page preview.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const d = getGiftDesign(url.searchParams.get("design"));
  // ₹ isn't guaranteed in the bundled font — render it as "Rs" (matches the OG image).
  const amount = (url.searchParams.get("amount") || "").replace(/₹/g, "Rs ").replace(/\s+/g, " ").trim().slice(0, 20);
  const to = (url.searchParams.get("to") || "").slice(0, 40).trim();
  const white = d.ink === "#FFFFFF";
  const sub = white ? "rgba(255,255,255,0.72)" : "rgba(15,15,15,0.58)";

  // Plus Jakarta Sans — the site's display font — so the card matches the brand.
  // Read through the ASSETS binding, never the site's own public URL: this runs
  // on a Cloudflare Worker and a same-zone self-fetch loops and times out (see
  // asset-fetch.ts). The logo becomes a data URI for the same reason — next/og
  // would otherwise fetch the <img src> over the public URL itself.
  const logoPath = white ? "/logo-white.png" : "/logo-dark.png";
  const [f800, f700, logo] = await Promise.all([
    assetFetch(new URL("/fonts/Jakarta-800.ttf", req.url).toString()).then((r) => r.arrayBuffer()),
    assetFetch(new URL("/fonts/Jakarta-700.ttf", req.url).toString()).then((r) => r.arrayBuffer()),
    assetDataUri(new URL(logoPath, req.url).toString(), "image/png"),
  ]);
  const logoW = 300, logoH = Math.round((300 * 62) / 194);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", position: "relative",
          background: d.bg, color: d.ink, fontFamily: "Jakarta", padding: 60, boxSizing: "border-box",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={logoW} height={logoH} alt="" style={{ position: "absolute", top: 54, left: 60 }} />
        <div style={{ position: "absolute", top: 66, right: 60, fontSize: 38, fontWeight: 700, maxWidth: 520, textAlign: "right" }}>
          {d.greeting}
        </div>
        <div style={{ position: "absolute", left: 62, bottom: 172, fontSize: 22, fontWeight: 700, letterSpacing: 4, color: sub }}>
          GIFT CARD
        </div>
        <div style={{ position: "absolute", left: 58, bottom: 60, fontSize: 108, fontWeight: 800, letterSpacing: -2 }}>{amount}</div>
        {to ? (
          <div style={{ position: "absolute", right: 60, bottom: 64, fontSize: 28, fontWeight: 700, color: sub }}>{`For ${to}`}</div>
        ) : null}
      </div>
    ),
    {
      width: CARD_W,
      height: CARD_H,
      fonts: [
        { name: "Jakarta", data: f800, weight: 800, style: "normal" },
        { name: "Jakarta", data: f700, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    },
  );
}
