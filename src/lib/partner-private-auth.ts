import { ZodError } from "zod";
import "server-only";
import {
  currentCorporateSession,
  can,
  type CorporateSession,
} from "@/lib/corporate-auth";
import {
  partnerCapabilities,
  purchasingAllowed,
} from "@/lib/partner-capabilities";
export async function privateWorkspaceSession(
  purchase = false,
): Promise<CorporateSession> {
  const s = await currentCorporateSession();
  if (!s) throw new Error("401:Not signed in");
  if (s.staff) throw new Error("403:Partner-private workspace");
  if (s.agreementPending) throw new Error("403:agreement_required");
  const caps = partnerCapabilities(s.account);
  if (!caps.customerProjects || !caps.poRequiredRelease)
    throw new Error("403:Private purchasing workflow is unavailable");
  if (
    s.email.split("@")[1]?.toLowerCase() !==
    s.account.email_domain.toLowerCase()
  )
    throw new Error("403:Company email required");
  if (
    purchase ? !purchasingAllowed(s) : !can(s, "build") && !purchasingAllowed(s)
  )
    throw new Error("403:Account permission required");
  return s;
}
export function workspaceError(e: unknown): Response {
  const fieldLabels: Record<string, string> = {
    customerId: "Customer ID",
    customerName: "Customer name",
    roomName: "Room name",
    wallIdentifier: "Wall identifier",
    productHandle: "Catalogue design",
    materialSlug: "Material",
    widthMm: "Width (mm)",
    heightMm: "Height (mm)",
    placement: "Composition",
    optionIds: "Accepted selections",
    projectId: "Customer",
    state: "Dispatch state",
    address_line: "Delivery address",
    city: "City",
    pincode: "PIN code",
    contact_name: "Delivery contact",
    contact_phone: "Contact phone",
    gstin: "Billing GSTIN",
    billing_address: "Billing address",
  };
  const issue = e instanceof ZodError ? e.issues[0] : null;
  const label = issue
    ? (fieldLabels[String(issue.path.at(-1))] ?? "Required details")
    : null;
  const message = issue
    ? `${label}: check the value and try again.`
    : e instanceof Error
      ? e.message
      : "Could not save";
  const status = /^(401|403):/.test(message)
    ? Number(message.slice(0, 3))
    : 400;
  return Response.json({ error: message.replace(/^\d{3}:/, "") }, { status });
}
