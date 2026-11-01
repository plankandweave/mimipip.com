import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { metaInventory } from "@/lib/meta-ads-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  return NextResponse.json(await metaInventory());
}
