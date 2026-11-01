import { offlineContentSecurityPolicy } from "./src/brand/network-policy";
import { brand } from "./src/brand/current";
import type { NextConfig } from "next";

const ONNX_LINUX = "./node_modules/onnxruntime-node/bin/napi-v3/linux/**";
// Both halves: the sharp binding AND the libvips shared library it dlopens.
const SHARP_BINARIES = "./node_modules/@img/**";

const nextConfig: NextConfig = {
  env:{NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW:process.env.MIMIPIP_LOCAL_REVIEW==="1"?"1":"0"},
  webpack(config, {webpack}) {
    if(process.env.MIMIPIP_LOCAL_REVIEW==='1')config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/,require.resolve('./scripts/disconnected-bindings.cjs')));
    return config;
  },
  turbopack: {
    root: __dirname,
  },
  // @xenova/transformers pulls in onnxruntime-node, which ships a native
  // .so/.node binary. It must stay external (not bundled by Turbopack) and
  // its binary explicitly file-traced, or Vercel's serverless function
  // fails at runtime with "libonnxruntime.so cannot open shared object file".
  // The @img/* packages are named explicitly, not just "sharp", so Next copies
  // their directories into the function wholesale. Belt-and-braces: the actual
  // cause of the missing libvips .so was npm skipping those glibc-constrained
  // optional packages at INSTALL time — see .npmrc — not the bundler.
  serverExternalPackages: [
    "@xenova/transformers", "onnxruntime-node", "sharp",
    "@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64",
  ],
  // Native binaries (sharp/onnxruntime) run in the media container — the
  // Vercel-era outputFileTracingIncludes block and its per-route tracing are
  // gone with the platform that needed them.
  // The two non-wallpaper families moved to the handles the shop architecture
  // calls for (migration 0050). Permanent, because the old URLs were public and
  // are indexed — a 404 would throw away their standing.
  // Machine-readable discovery, advertised before an agent parses any HTML. The
  // api-catalog relation is RFC 9727; Content-Signal welcomes search and
  // query-time grounding while limiting retention to citation/reference use.
  // These used to be set by proxy.ts, which no longer runs on public pages
  // (a proxied path cannot be held at the Cloudflare edge). Static rules with
  // no `has` condition, so they do not make a page dynamic.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: offlineContentSecurityPolicy },
          { key: "Content-Signal", value: "search=yes, ai-input=yes, ai-train=no, use=reference" },
          { key: "Link", value: '</.well-known/api-catalog>; rel="api-catalog", </llms.txt>; rel="alternate"; type="text/plain"' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/collections/101-designs", destination: "/collections/bagh", permanent: true },
      { source: "/101-designs", destination: "/collections/bagh", permanent: true },
      { source: "/products/101-designs-:slug", destination: "/products/bagh-:slug", permanent: true },
      // Legacy campaign links used /shop, but the live shopping index is
      // /collections. Keep inbound ad and social clicks out of the 404 page.
      { source: "/shop", destination: "/collections", permanent: true },
      // The short address for children's rooms opens the sister brand's shop
      // inside the site (src/lib/lorange-kids.ts). Not permanent: browsers
      // never cache it, so the shop can move without stranding a bookmark.
      { source: "/kids", destination: "/lorange-kids", permanent: false },
      { source: "/collections/borders", destination: "/collections/wallpaper-borders", permanent: true },
      { source: "/collections/canvas-wall-art", destination: "/collections/canvas-art", permanent: true },
      // Retired in the collection-taxonomy pass (migration 0145). Both were
      // indexed, so they redirect to where their designs actually went rather
      // than 404: the five green landscapes from Serene Watercolours joined
      // Verdant Sanctuary, and the two phone-booth labels merged into one set.
      { source: "/collections/serene-watercolours", destination: "/collections/verdant-sanctuary", permanent: true },
      { source: "/collections/quiet-column", destination: "/collections/phone-booth", permanent: true },
      { source: "/collections/one-continuous-story", destination: "/collections/phone-booth", permanent: true },
      // Older collection pages carried a trailing tag segment, for example
      // /collections/pastel-wallpaper/pastel. Search engines still surface
      // those URLs. Preserve their standing by sending every retired nested
      // form to the canonical collection rather than serving a 404.
      { source: "/collections/:handle/:legacyTag", destination: "/collections/:handle", permanent: true },
      // The casestudy.zyvorah.com root redirect USED to live here, scoped by
      // `has: [{ type: "host" }]`. That worked on Vercel and does not work on
      // Cloudflare — vinext honours these redirects but ignores the `has` host
      // condition, so the rule matched nothing and the outreach domain served
      // the storefront. It now lives in src/middleware.ts. Do not add a
      // host-scoped rule here expecting it to fire.
    ];
  },
  images: {
    // Optimize via Supabase's image render CDN instead of Vercel's optimizer
    // (which hit its plan quota and 402'd every image). See supabaseImageLoader.
    loader: "custom",
    loaderFile: "./src/lib/supabaseImageLoader.ts",
    remotePatterns: [
      { protocol: "https", hostname: new URL(brand.origin).hostname, pathname: "/jain-temples/**" },
      { protocol: "https", hostname: "storage.mimi-pip.invalid" },
      // The R2-migrated product images are served by this same Worker at
      // /media/[...path] and spelt with the absolute MEDIA_BASE origin (see
      // src/lib/media-url.ts). vinext's next/image renders NULL in production
      // for a host missing here — not a broken <img>, nothing at all — which
      // is how the whole catalogue vanished from the homepage on 14 September
      // 2026 while the deploy check stayed green. Keep this entry in step with
      // MEDIA_BASE.
      { protocol: "https", hostname: new URL(brand.origin).hostname, pathname: "/media/**" },
      // Case-study imagery (Cloudflare R2 public bucket). Set at build time so
      // a bucket rename does not need a code change; the fallback keeps local
      // dev and preview builds from failing when the var is unset.
      {
        protocol: "https",
        hostname: `media.${brand.id}.invalid`,
      },
    ],
  },
};

export default nextConfig;
