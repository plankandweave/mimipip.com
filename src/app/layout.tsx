import {StorefrontReady} from '@/components/StorefrontReady';
import { brand } from "@/brand/current";
import { serviceAvailable } from "@/brand/services";
import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";
import { ShoppingJourneyProvider } from "@/components/ShoppingJourney";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppInstall } from "@/components/AppInstall";
import { SignInInvite } from "@/components/SignInInvite";
import { SaveKeeper } from "@/components/SaveKeeper";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PartnerProvider } from "@/components/PartnerProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { CartProvider } from "@/components/CartProvider";
import { MarketProvider } from "@/components/MarketProvider";
import { MARKET_PENDING_SCRIPT } from "@/lib/market-pending";
import { EARLY_ROOM_PHOTO_SCRIPT } from "@/lib/early-room-photo";
import { ChromeGate } from "@/components/book/ChromeGate";
import { JsonLd } from "@/components/JsonLd";
import { TrafficSource } from "@/components/TrafficSource";
import { googleTagBootstrap, googleTagSrc } from "@/lib/google-ads";
import { MetaPixel } from "@/components/MetaPixel";
import { OPENAI_PIXEL_ID, openAiPixelBootstrap } from "@/lib/openai-pixel";
import { SITE_URL, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Meta Business Manager → Brand Safety → Domains issues this code. Until the
  // domain is verified, Aggregated Event Measurement cannot be configured and
  // iOS attribution stays capped no matter how good the events are — so this
  // is read at runtime from a plain Cloudflare var rather than baked into a
  // build, and appears the moment the var is set.
  ...(process.env.META_DOMAIN_VERIFICATION
    ? { verification: { other: { "facebook-domain-verification": process.env.META_DOMAIN_VERIFICATION } } }
    : {}),
  title: {
    default: brand.title,
    template: `%s · ${brand.name}`,
  },
  description:
    brand.description,
  // Each public page owns its canonical; missing pages must never inherit Home.
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: brand.name,
    locale: brand.locale,
    url: SITE_URL,
    // Deliberately SHORTER than the page description above: a forwarded link
    // shows this under the share card, and the full SEO sentence wrapped to
    // three lines and made the preview a wall of text.
    title: brand.title,
    description:
      brand.description,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.title,
    description:
      brand.description,
  },
  icons: {
    icon: [32,48,192].map(size=>({url:`/brand/mimi-pip/half-sun-${size}.png`,type:'image/png',sizes:`${size}x${size}`})),
    apple: [{url:'/brand/mimi-pip/half-sun-180.png',sizes:'180x180'}],
  },
  // The shop's install manifest (app/manifest.webmanifest/route.ts). Declared
  // here rather than by file convention so a partner portal's layout can
  // replace it with its own.
  manifest: "/manifest.webmanifest",
  // Installable-app metadata (iOS home-screen title + standalone chrome).
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  // Pinterest website claim for @hellomimipip.
  other: { "p:domain_verify": "9ceca53a9c63ec7049a2e5187dcc9e06" },
};

// Every page is an hour of ISR unless it says otherwise. The Header no longer
// forces every render dynamic (see skipBuildTimePrerender), so without this a
// page with no config of its own would become static until the next deploy.
// Private pages declare force-dynamic and stay per request.
export const revalidate = 3600;

export const viewport: Viewport = {
  themeColor: brand.theme.background,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-mimipip-react="true"
      className="h-full"
      // MARKET_PENDING_SCRIPT may add a class before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MARKET_PENDING_SCRIPT }} />
        {/* Keeps a room photo chosen before hydration (see early-room-photo.ts). */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_ROOM_PHOTO_SCRIPT }} />
        {/* Google tag: GA4 (when NEXT_PUBLIC_GA_ID is set, e.g. G-XXXXXXX) plus
            Google Ads (always, src/lib/google-ads.ts). One gtag.js serves both;
            allow_enhanced_conversions lets the Ads tag read the user_data that
            checkout sets. First-party attribution runs regardless.

            In the HEAD, as a plain async script, and loading GA4's container
            first (googleTagSrc): the download starts with the HTML instead of
            after hydration, and page_view waits on one script, not two. Ad
            visitors on a phone often leave within seconds, and every one who
            left before the tag fired was a visit GA never saw (9 Oct 2026).

            Staff desks (/admin, /studio — behind Cloudflare Access) are tagged
            traffic_type=internal so the property's "Internal Traffic" data
            filter drops them; otherwise every proof-read and QC pass counts as
            a visitor. See docs/campaign-tracking.md. */}
        {serviceAvailable("analytics") && <script dangerouslySetInnerHTML={{ __html: googleTagBootstrap(process.env.NEXT_PUBLIC_GA_ID) }} />}
        {serviceAvailable("analytics") && <script async src={googleTagSrc(process.env.NEXT_PUBLIC_GA_ID)} />}
      </head>
      <body className="min-h-full flex flex-col">
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        {serviceAvailable("analytics") && <TrafficSource />}
        {serviceAvailable("analytics") && <MetaPixel pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />}
        {/* OpenAI (ChatGPT) pixel — the paid counterpart to the organic
            ChatGPT referrals the traffic report already separates out. Loaded
            once per page; `debug` is forced off outside development so it does
            not log every event into a customer's console. */}
        {serviceAvailable("analytics") && <Script id="openai-pixel" strategy="afterInteractive">
          {openAiPixelBootstrap(OPENAI_PIXEL_ID, process.env.NODE_ENV !== "production")}
        </Script>}
        <MarketProvider>
          <AuthProvider>
            <PartnerProvider>
            <CartProvider>
            <ShoppingJourneyProvider>
              <ChromeGate>
                <Header />
              </ChromeGate>
              <main className="flex-1">{children}</main>
              <ChromeGate>
                <Footer disconnected={process.env.MIMIPIP_LOCAL_REVIEW==="1"} />
                <StorefrontReady />
                {process.env.MIMIPIP_LOCAL_REVIEW!=="1" && <AppInstall />}
                {serviceAvailable("database") && <SignInInvite />}
                {serviceAvailable("messaging") && <WhatsAppButton />}
              </ChromeGate>
              {/* Outside ChromeGate on purpose: it renders nothing until a
                  design is saved, and the list it keeps in step with the
                  customer's account must not depend on which route they
                  happened to sign in from. */}
              {process.env.MIMIPIP_LOCAL_REVIEW !== "1" && <SaveKeeper />}
            </ShoppingJourneyProvider>
            </CartProvider>
            </PartnerProvider>
          </AuthProvider>
        </MarketProvider>
      </body>
    </html>
  );
}
