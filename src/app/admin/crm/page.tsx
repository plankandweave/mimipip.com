import { redirect } from "next/navigation";
import { osPipelineUrl } from "@/lib/crm-in-the-os";

// Retired 29 Oct 2026: deals are reviewed and edited on the OS Pipeline only
// (src/lib/crm-in-the-os.ts).
export default function CrmPage() {
  redirect(osPipelineUrl());
}
