import { NextResponse } from "next/server";
import { currentCorporateSession, setSessionCity } from "@/lib/corporate-auth";
import { TIER1_CITIES, tier1City, tier1OnlyPartner } from "@/lib/tier1-cities";

export const dynamic = "force-dynamic";

// POST { city } -> the city this sign-in works in (HomeLane: one of the seven).
//
// Asked on every sign-in for an account held to the tier-1 list, and the only
// city an order from this session may deliver to (lib/tier1-cities.ts). The
// list is the whole rule: anything else is refused, whatever the client sent.
export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!tier1OnlyPartner(session.account.slug)) {
    return NextResponse.json({ error: "This portal does not ask for a city." }, { status: 400 });
  }

  let body: { city?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const city = tier1City(typeof body.city === "string" ? body.city : "");
  if (!city) {
    return NextResponse.json({
      error: `Choose one of ${TIER1_CITIES.map((c) => c.city).join(", ")}.`,
    }, { status: 400 });
  }

  if (!(await setSessionCity(session, city.city))) {
    return NextResponse.json({ error: "We couldn't save your city just now. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, city: city.city });
}
