import { NextResponse } from "next/server";
import { currentStaff, notStaff } from "@/lib/staff-access";
import { fetchGaConversionDiagnostics } from "@/lib/ga-data";
import { fetchNativeConversionDiagnostics } from "@/lib/native-conversion-diagnostics";
import { diagnosticWindow } from "@/lib/conversion-diagnostics";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!(await currentStaff(req))) return notStaff();
  const { days } = diagnosticWindow(Number(new URL(req.url).searchParams.get("days") ?? 28));
  const [ga, native] = await Promise.all([
    fetchGaConversionDiagnostics(days), fetchNativeConversionDiagnostics(days),
  ]);
  return NextResponse.json({ generatedAt: new Date().toISOString(), ga, native }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
