
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { looksLikeTraceToken } from "@/lib/trace";
import TraceRecorder from "./recorder";

// The campus walk, on the phone of whoever is doing the walking. Reached with
// no account, no login and no cookie: everything it may do is decided
// server-side from the token in the path, and nothing here trusts the client.
//
// Rendered dynamically and never cached — a signed still inside the payload
// would otherwise be served to the next holder of the link.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = brandMetadata({
  title: "Walk the campus · Zyvorah",
  // Never indexed, never previewed: the URL IS the credential, and a link
  // pasted into a chat app should not unfurl the campus's name to the room.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
});

export default async function TracePage({ params }: Props) {
  const { token } = await params;
  return <TraceRecorder token={token} plausible={looksLikeTraceToken(token)} />;
}
