import { partnerCapabilities } from "@/lib/partner-capabilities";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { proposalForAccount } from "@/lib/corporate-proposals";
import { deckBytes, signedPlaybackUrl, contentTypeFor } from "@/lib/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a deck to the client it belongs to, inside their own account.
 *
 * The portal twin of /p/[token]/frame. That route proves you are the recipient
 * by the token in the URL; this one proves it by the portal session, and then
 * re-checks that the presentation is this account's, is for a client audience
 * and has actually been sent (lib/corporate-proposals). The frame is fetched by
 * the browser directly, so it cannot assume the page above it checked anything.
 *
 * THE SANDBOX IS THE POINT, and it is copied deliberately rather than
 * simplified. This file is arbitrary HTML authored elsewhere and uploaded —
 * Roheena's own decks today, but the route cannot assume that. Served plainly
 * from our origin, a <script> inside it would be same-origin with zyvorah.com
 * and could read the visitor's cookies — and here the visitor is carrying a
 * live portal session, so the cookie it could read is one that opens a client's
 * account.
 *
 * `Content-Security-Policy: sandbox allow-scripts` puts the response in an
 * OPAQUE origin: its scripts still run, but document.cookie is empty and it has
 * no access to anything of ours. Note the absence of `allow-same-origin` —
 * adding it back alongside allow-scripts would let the frame remove its own
 * sandbox, which is the whole hole reopened.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await currentCorporateSession();
  if (!session) return new Response("Not found", { status: 404 });
  if (partnerCapabilities(session.account).poRequiredRelease) return Response.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });

  const proposal = await proposalForAccount(session, id);
  if (!proposal) return new Response("Not found", { status: 404 });

  // A film is played from a signed storage URL, not buffered here: tens of
  // megabytes is past what a Worker can hold, and only storage answers the
  // Range requests that let the client scrub through it. The account check
  // above has already run, and the URL lasts two hours.
  if (proposal.format === "video") {
    const signed = await signedPlaybackUrl(proposal.storagePath);
    if (!signed) return new Response("Not found", { status: 404 });
    return Response.redirect(signed, 302);
  }

  const bytes = await deckBytes(proposal.storagePath);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes, {
    headers: {
      "Content-Type": contentTypeFor(proposal.storagePath, proposal.format),
      "Content-Security-Policy": "sandbox allow-scripts allow-popups",
      "X-Content-Type-Options": "nosniff",
      // Private: a shared cache must never hold one client's deck and hand it
      // to the next request.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
