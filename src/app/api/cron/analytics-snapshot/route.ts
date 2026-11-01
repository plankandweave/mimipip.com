import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { intelKeyOk } from "@/lib/elevated-key";
import { fetchGaSeoWindow, fetchGaConversionDiagnostics, gaReportingConfigured } from "@/lib/ga-data";
import { fetchNativeConversionDiagnostics } from "@/lib/native-conversion-diagnostics";
import { istDateKey, addIstDays } from "@/lib/ist";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// The analytics snapshot the daily site-health agent reads.
//
// WHY A ROUTE AND NOT A DIRECT CALL. The GA4 service-account credentials are
// Worker secrets. The agent that acts on the numbers runs in Anthropic's cloud
// with a git checkout and nothing else, and handing a scheduled agent a
// credential that can read an entire analytics property is a worse trade than
// handing it a file. So the Worker — which already holds those credentials for
// the daily email — answers here, a GitHub Action commits the answer into the
// repo, and the agent reads a JSON file that cannot be used to reach anything.
//
// This route is READ-ONLY. It sends nothing, writes nothing, and touches no
// table; the worst a disclosed response can do is reveal our own traffic.
//
// Auth: Authorization: Bearer <CRON_SECRET>, or x-intel-key: <key>. Unlike
// some older cron routes, the manual key is COMPARED against the key the
// database accepts rather than merely required to be non-empty.
//
// Query: ?days=N (1-90, default 28).
async function tick(req: Request) {
  const url = new URL(req.url);

  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaCron && !(await intelKeyOk(req.headers.get("x-intel-key")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requested = Number(url.searchParams.get("days") ?? 28);
  const days = Number.isFinite(requested) ? Math.min(90, Math.max(1, Math.trunc(requested))) : 28;

  const [window, conversion, nativeConversion] = await Promise.all([
    fetchGaSeoWindow(days), fetchGaConversionDiagnostics(days), fetchNativeConversionDiagnostics(days),
  ]);

  // A snapshot with no GA in it is still a valid snapshot: it says so, and the
  // consumer degrades to repo-only checks. Failing here would instead leave
  // yesterday's file in place and the agent reading stale numbers as fresh.
  return NextResponse.json({
    // The IST day this covers up to, so a consumer can tell a fresh file from
    // one whose committing job has quietly stopped running.
    generatedFor: addIstDays(istDateKey(), -1),
    generatedAt: new Date().toISOString(),
    gaConfigured: gaReportingConfigured(),
    window,
    conversion,
    nativeConversion,
  });
}


export const GET = withCronRun("analytics-snapshot", tick);
