import { drainPartnerReleases } from "@/lib/partner-release";
import { withCronRun } from "@/lib/cron-run";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function tick(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await drainPartnerReleases()) });
  } catch {
    return Response.json(
      { error: "Release worker unavailable; durable queue retained" },
      { status: 503 },
    );
  }
}

export const GET = withCronRun("partner-release", tick);
