import { NextRequest, NextResponse } from "next/server";
import { BT_SESSION_COOKIE, verifyBtSession } from "@/lib/bt-access";

type R2ObjectBody = {
  body: BodyInit;
  httpEtag?: string;
};

type BookBucket = {
  get(key: string): Promise<R2ObjectBody | null>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function contentType(path: string): string {
  const dot = path.lastIndexOf(".");
  return CONTENT_TYPES[dot >= 0 ? path.slice(dot).toLowerCase() : ""] ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const session = request.cookies.get(BT_SESSION_COOKIE)?.value;
  if (!(await verifyBtSession(session, process.env.BT_SESSION_SECRET))) {
    return NextResponse.redirect(new URL(`/admin/bt-access?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url), 307);
  }

  const { path } = await context.params;
  const relativePath = path?.length ? path.join("/") : "index.html";
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
    env: { BHITTI_BOOK?: BookBucket };
  };
  const object = await env.BHITTI_BOOK?.get(`edition-09/${relativePath}`);
  if (!object) return new NextResponse("Not found.", { status: 404 });

  // /bt has no trailing slash, so plain relative URLs in the portable reader
  // would otherwise resolve at the site root. Add a deployment-only base tag;
  // the archived reader in R2 and on disk remains portable.
  const body =
    relativePath === "index.html"
      ? (await new Response(object.body).text()).replace("<head>", '<head><base href="/bt/">')
      : object.body;

  return new NextResponse(body, {
    headers: {
      "cache-control": relativePath.endsWith(".jpg") ? "private, max-age=86400" : "private, no-cache",
      "content-type": contentType(relativePath),
      "etag": object.httpEtag ?? "",
      "vary": "Cookie",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
