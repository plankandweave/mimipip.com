
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { YesButton } from "./YesButton";

export const metadata: Metadata = brandMetadata({
  title: "Show me Zyvorah designs in ads",
  description: "Choose whether Zyvorah may show you its designs in ads on Google and Meta.",
  robots: { index: false, follow: false },
});

// Landing page for the invitation email's "Yes, show me". The tap in the email
// is the yes: YesButton records it once the page is open on a real screen
// (see its header for the checks); the request for the page itself never does.
export default async function AdsConsentYesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" && /^[0-9a-f-]{36}$/i.test(t) ? t : null;
  return (
    <div className="container-x py-24">
      <div className="mx-auto max-w-md rounded-[32px] bg-sky/30 px-8 py-14 text-center">
        <h1 className="text-[clamp(1.6rem,3vw,2.2rem)] leading-tight">Thank you for saying yes</h1>
        {token ? (
          <YesButton token={token} />
        ) : (
          <p className="mt-8 text-sm text-slate">
            This link is incomplete. You can make the same choice on your{" "}
            <Link href="/account" className="underline">account page</Link>.
          </p>
        )}
        <p className="mx-auto mt-8 max-w-xs text-xs leading-relaxed text-slate">
          Our designs will appear for you on Instagram, Facebook and Google. Change your mind any time.{" "}
          <Link href="/privacy#personalised-ads" className="underline">How this works</Link>
        </p>
      </div>
    </div>
  );
}
