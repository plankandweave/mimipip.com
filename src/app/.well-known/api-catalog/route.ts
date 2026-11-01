import { SITE_URL } from "@/lib/seo";

const PROFILE = "https://www.rfc-editor.org/info/rfc9727";
const CONTENT_TYPE = `application/linkset+json; profile="${PROFILE}"`;
const SELF_LINK = `<${SITE_URL}/.well-known/api-catalog>; rel="api-catalog"`;

const catalog = {
  linkset: [
    {
      anchor: `${SITE_URL}/api/agent`,
      "service-desc": [
        {
          href: `${SITE_URL}/.well-known/zyvorah-commerce-openapi.json`,
          type: "application/json",
        },
      ],
      "service-doc": [
        { href: `${SITE_URL}/api/agent`, type: "application/json" },
        { href: `${SITE_URL}/llms.txt`, type: "text/plain" },
      ],
    },
  ],
};

const headers = {
  "content-type": CONTENT_TYPE,
  "cache-control": "public, max-age=3600",
  link: SELF_LINK,
};

export function GET() {
  return new Response(JSON.stringify(catalog), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
