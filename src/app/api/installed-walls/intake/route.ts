import { NextResponse } from "next/server";
import { handleIntake } from "@/lib/installed-walls-intake";
import { installedWallDeps } from "@/lib/installed-walls-store";

// OS → website: an approved, consented photo of a finished install. Contract and checks: src/lib/installed-walls-intake.ts.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deps = installedWallDeps();
  if (!deps) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  try {
    const { status, body } = await handleIntake(req.headers.get("x-zyvorah-token"), await req.text(), deps);
    return NextResponse.json(body, { status });
  } catch (err) {
    console.error("[installed-walls/intake] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
