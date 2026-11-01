
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { inviteForToken, hasSession, recordOpen, signedPlaybackUrl, leadVideoPath } from "@/lib/presentation";
import { PresentationClient } from "./client";
import { CodeGate } from "./code-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The recipient's view of a proposal. Reached only via the emailed link.
//
// Deliberately outside the site chrome: no header, no footer, no nav. This is
// a document sent to one person, not a page of the shop.

 async function buildPageMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  return {
    title: invite ? invite.presentation.title : "Not found",
    // A private link must never reach an index, whatever it gets pasted into.
    robots: { index: false, follow: false },
  };
}

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  // A bad, revoked or archived link is a 404, not an error page — nothing here
  // should confirm that a deck exists for someone who cannot open it.
  if (!invite) notFound();

  const { recipient, presentation } = invite;

  // Only a code-gated deck needs a session, because there the session IS the
  // proof that the code was entered. It is minted by verifyCode inside the code
  // route — a Route Handler, which is a place a cookie may legally be written.
  //
  // This page used to mint a session for the no-code case too, "to make the
  // open loggable and the revoke effective". It never needed to: recordOpen
  // logs the open and inviteForToken enforces the revoke, both on their own.
  // What it did do was call cookies().set() during a Server Component render,
  // which Next refuses outright — so EVERY link sent without "require a code"
  // died on the error boundary before it could show the deck. Reading a cookie
  // here is fine; writing one is not, so the write is gone.
  if (presentation.require_code && !(await hasSession(recipient.id))) {
    return <CodeGate token={token} email={recipient.email} title={presentation.title} />;
  }

  await recordOpen(recipient.id, (await headers()).get("user-agent"));

  // A video plays from storage directly, against a URL signed here — after the
  // revoke and code checks above, and only for two hours. It does not go
  // through our frame route: a film is tens of megabytes, which a Worker
  // cannot hold, and only storage answers the Range requests that let the
  // viewer scrub through it.
  const leadPath = await leadVideoPath(presentation);
  const leadVideoUrl = leadPath ? await signedPlaybackUrl(leadPath) : null;
  const videoUrl =
    presentation.format === "video"
      ? await signedPlaybackUrl(presentation.storage_path)
      : null;

  return (
    <PresentationClient
      token={token}
      title={presentation.title}
      format={presentation.format}
      videoUrl={videoUrl}
      leadVideoUrl={leadVideoUrl}
      recipientName={recipient.name}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
