import { NextResponse } from "next/server";
import { getGatedUser } from "@/lib/auth-server";
import { hasIilmPresentationAccess, IILM_ASSETS } from "@/lib/iilm-presentation";

export const dynamic = "force-dynamic";

type PrivateBucket = {
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> | ArrayBuffer; httpEtag?: string } | null>;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const user = await getGatedUser();
  if (!hasIilmPresentationAccess(user?.email)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
  }

  const { asset } = await params;
  if (!IILM_ASSETS.has(asset)) return new NextResponse("Not found", { status: 404 });

  const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
    env: { PRIVATE_R2?: PrivateBucket };
  };
  const object = await env.PRIVATE_R2?.get(`client-presentations/iilm-greater-noida/${asset}`);
  if (!object) return new NextResponse("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(object.body as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": download ? `attachment; filename="iilm-${asset}"` : "inline",
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
