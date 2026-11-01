import { brand } from "@/brand/current";
import type { MetadataRoute } from "next";
import { NextResponse } from "next/server";

// Makes zyvorah.com installable as an app ("Add to Home Screen" / "Install
// app"). Icons are served from /api/brand/* so the mark's weekly colour is
// reflected at install time.
//
// A route handler, NOT the app/manifest.ts file convention, and declared in
// the root layout's metadata: the framework (vinext) lets a file-based
// manifest override every layout's `metadata.manifest`, so each partner
// portal installed as the SHOP — opening on "/" — however its own layout
// declared it (8 October 2026). Declared here, a partner layout's manifest
// (src/lib/partner-app.ts) replaces this one the normal way.
const MANIFEST: MetadataRoute.Manifest = {
  name: brand.title,
  short_name: brand.name,
  description:
    brand.description,
  start_url: "/?utm_source=pwa",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: brand.theme.background,
  theme_color: brand.theme.foreground,
  categories: ["shopping", "lifestyle", "home"],
  icons: [
    { src: "/api/brand/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    { src: "/api/brand/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
    { src: "/api/brand/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
    { src: "/api/brand/icon-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
  ],
};

export function GET() {
  return NextResponse.json(MANIFEST, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
