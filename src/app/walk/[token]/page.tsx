
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { looksLikeWalkToken } from "@/lib/prospect-walk";
import GuestWalk from "./walk";

// The guest walkthrough link: a prospect walking their own space with a phone.
// Reached with no account, no login and no cookie — and never with a partner
// account, so there are no prices, no catalogue and no partner navigation.
// Everything it may do is decided server-side from the token in the path.
//
// Rendered dynamically and never cached: a signed still in the payload would
// otherwise be served to the next holder of the link.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = brandMetadata({
  title: "Walk us through your space · Zyvorah",
  // Never indexed, never previewed: the URL is the credential.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
});

export default async function WalkPage({ params }: Props) {
  const { token } = await params;
  return <GuestWalk token={token} plausible={looksLikeWalkToken(token)} />;
}
