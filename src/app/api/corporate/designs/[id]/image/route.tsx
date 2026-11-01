import { NextResponse } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { ImageResponse } from "next/og";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { imageMetaRemote, compositeRemote } from "@/lib/media-client";
import { caDownload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";

// Plain SVG <text> rendered through sharp/librsvg needs a system font — the
// mark silently came out as an empty pill on Vercel, which ships no fonts for
// fontconfig to find. next/og (Satori) sidesteps that: it rasterises text
// from a font we bundle ourselves, so it renders identically everywhere.
// Bundled once at module scope — this route is hit on every library scroll.
let jakartaBold: Promise<Buffer> | null = null;
function loadMarkFont(): Promise<Buffer> {
  if (!jakartaBold) {
    // workerd has no fs, and a Worker cannot fetch a static asset through its
    // own public zyvorah.com route: that same-zone subrequest loops until
    // Cloudflare returns 522. Read public/ through the ASSETS binding instead.
    // Off workerd (next dev / tests), fall back to the public origin.
    const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zyvorah.com").replace(/\/$/, "");
    const fontUrl = `${origin}/fonts/Jakarta-700.ttf`;
    jakartaBold = (async () => {
      let res: Response | null = null;
      try {
        const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
          env: { ASSETS?: { fetch(req: Request): Promise<Response> } };
        };
        if (env?.ASSETS) res = await env.ASSETS.fetch(new Request(fontUrl));
      } catch {
        /* not on workerd — use the ordinary static URL below */
      }
      res ??= await fetch(fontUrl);
      if (!res.ok) throw new Error(`font fetch ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    })();
  }
  return jakartaBold;
}

/**
 * The ONLY way a partner sees a design. The corporate-art bucket is private, so
 * there is no raw URL to share around; every view comes through here, signed in,
 * and every pixel that leaves carries a mark.
 *
 * The mark is deliberately discreet — one corner pill reading
 * `zyvorah.com · ZYVS-XXXXXX`. It has to survive being downloaded and forwarded
 * (which is why the code is in it: any leaked file names the exact design it
 * came from) while still letting the owner actually judge the artwork, which a
 * watermark tiled across the whole image does not.
 *
 * ?download=1 serves the same watermarked JPEG as an attachment. Partners may
 * keep a copy; what they cannot get is the clean original.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await currentCorporateSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (!partnerCapabilities(session.account).customLibrary) return new NextResponse("Custom library is disabled", { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("Unavailable", { status: 503 });

  // Scoped to the caller's own account: a design id from another partner is a 404.
  const { data: design, error } = await sb
    .from("corporate_designs")
    .select("design_url, design_code, account_id")
    .eq("id", id)
    .eq("account_id", session.account.id)
    .single();

  if (error || !design) return new NextResponse("Not found", { status: 404 });

  // Stored URLs may carry the old /public/ segment from when the bucket was public.
  const pathMatch = design.design_url.match(
    /\/storage\/v1\/object\/(?:public\/)?corporate-art\/(.+)$/,
  );
  if (!pathMatch) return new NextResponse("Invalid image reference", { status: 500 });

  // The reference keeps its Supabase spelling; the bytes come from R2.
  const img = await caDownload(decodeURIComponent(pathMatch[1]!));
  if (img.error || !img.data) return new NextResponse("Image unavailable", { status: 502 });

  const imageBuffer = Buffer.from(await img.data.arrayBuffer());
  const code = design.design_code ?? "ZYVS";

  const iab = imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer;
  const meta = await imageMetaRemote(iab);
  const w = meta.width ?? 1200;
  const h = meta.height ?? 800;

  // Sized off the image so the mark reads the same on a 1536px concept and a
  // full-resolution print file.
  const fs = Math.max(13, Math.round(w * 0.019));
  const pad = Math.round(fs * 0.7);
  const label = `zyvorah.com · ${code}`;
  // Generous — a wider-than-needed pill is invisible against its own
  // translucent fill, whereas underestimating clips the code that matters.
  const boxW = Math.round(label.length * fs * 0.62) + pad * 2;
  const boxH = Math.round(fs * 1.9);
  const bx = w - boxW - pad;
  const by = h - boxH - pad;

  const fontData = await loadMarkFont();
  const badge = await new ImageResponse(
    (
      <div
        style={{
          width: boxW, height: boxH, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.42)", borderRadius: Math.round(boxH / 2),
          fontFamily: "Jakarta", fontWeight: 700, fontSize: fs, color: "white",
        }}
      >
        {label}
      </div>
    ),
    { width: boxW, height: boxH, fonts: [{ name: "Jakarta", data: fontData, weight: 700, style: "normal" }] },
  ).arrayBuffer();

  const watermarked = await compositeRemote(imageBuffer, Buffer.from(badge), by, bx, 86);

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${code}.jpg"`,
      // Private to this browser. Worth caching: a library page pulls dozens of
      // these, and re-watermarking every one on every scroll is slow on mobile.
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
