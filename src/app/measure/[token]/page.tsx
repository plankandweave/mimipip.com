
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { looksLikeToken } from "@/lib/measure-link";
import MeasureSurvey from "./survey";

// The one page in this codebase that a person reaches with no account, no
// login and no cookie. Everything it may do is decided server-side from the
// token in the path; nothing here trusts the client.
//
// Rendered dynamically and never cached — a signed photo URL inside the
// payload would otherwise be served to the next holder of the link.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = brandMetadata({
  title: "Measure this store · Zyvorah",
  // Never indexed, never previewed: the URL IS the credential, and a link
  // pasted into a chat app should not unfurl the store's name to the room.
  robots: { index: false, follow: false, nocache: true },
});

export default async function MeasurePage({ params }: Props) {
  const { token } = await params;
  // Shape-checked here purely to avoid a pointless round trip; the API
  // re-checks, and it is the API's check that matters.
  return <MeasureSurvey token={token} plausible={looksLikeToken(token)} />;
}
