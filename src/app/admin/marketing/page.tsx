"use client";

import { StaffGate, useStaff } from "@/lib/use-staff";
import { Desk } from "@/components/admin/marketing/Desk";

// The marketing desk: the plan as a grid, a calendar, the Stories, the ads,
// and the connections — with the decision (approve / rewrite / remove) on
// every tile. Replaces the engine-monitoring page that listed every composed
// post as a loose card and had no view of the plan at all.
//
// Opened by the Google sign-in on the door (Cloudflare Access) and nothing
// else. Everything it reads comes through /api/admin/marketing/* on the server.

export default function MarketingAdmin() {
  const staff = useStaff();
  if (staff !== "in") return <StaffGate state={staff} title="Marketing desk" />;
  return <Desk />;
}
