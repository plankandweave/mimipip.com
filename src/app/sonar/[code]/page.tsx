
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { publicWall, recordScan } from "@/lib/sonar";
import { looksLikeCode } from "@/lib/sonar-rules";
import { requestGeo } from "@/lib/request-geo";
import SonarPlayer from "./player";

// The talking wall, on the phone of whoever scanned it. No account, no
// login, no cookie: the code is the key, and the page shows the wall's
// story and nothing else. A scan is counted with Cloudflare's coarse
// geography (country, state, town) and never an address.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = brandMetadata({
  title: "This wall speaks · Zyvorah",
  robots: { index: false, follow: false, nocache: true },
});

export default async function SonarPage({ params }: Props) {
  const { code } = await params;
  const sb = supabaseAdmin();
  const wall = sb && looksLikeCode(code) ? await publicWall(sb, code) : null;
  const h = await headers();
  const phoneLanguage = h.get("accept-language");
  if (wall && sb) {
    const geo = requestGeo({ headers: h });
    const referrer = h.get("referer");
    after(() => recordScan(sb, wall.id, phoneLanguage?.split(",")[0]?.slice(0, 12) ?? null, geo, referrer).catch((e) => console.error("[sonar] scan not recorded:", (e as Error)?.message)));
  }
  return (
    <main className="container-x flex min-h-[70vh] max-w-md flex-col justify-center py-10">
      {wall ? (
        <SonarPlayer title={wall.title} place={wall.place} campus={wall.campus} kind={wall.kind} languages={wall.languages} phoneLanguage={phoneLanguage} />
      ) : (
        <div className="text-center">
          <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Zyvorah</p>
          <h1 className="mt-2 font-display text-2xl font-bold">This wall is quiet</h1>
          <p className="mt-2 text-sm text-slate">The code did not match a wall that speaks. Try scanning again, a little closer.</p>
        </div>
      )}
    </main>
  );
}
