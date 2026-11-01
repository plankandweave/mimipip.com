import { SITE_URL } from "@/lib/seo";

const productPath = {
  get: {
    operationId: "getZyvorahProduct",
    summary: "Get authoritative product facts by handle",
    parameters: [
      { name: "handle", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: {
      "200": { description: "Product details" },
      "404": { description: "Product not found" },
    },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Zyvorah Commerce Discovery API",
    version: "1.0.0",
    description:
      "Public catalogue discovery for mural wallpaper, murals, canvas wall art and wallpaper borders. Search and product facts are open. Pricing returns the India INR basis. International shoppers receive country-adjusted USD pricing and included delivery on zyvorah.com. Order placement requires a private bearer token issued only to approved integrations.",
    contact: { email: "hello@zyvorah.com" },
  },
  servers: [{ url: SITE_URL }],
  paths: {
    "/api/agent": {
      get: {
        operationId: "describeZyvorahCommerce",
        summary: "Discover catalogue capabilities and access rules",
        responses: { "200": { description: "API description" } },
      },
    },
    "/api/agent/search": {
      get: {
        operationId: "searchZyvorahProducts",
        summary: "Search active Zyvorah products",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 24, default: 8 } },
        ],
        responses: { "200": { description: "Matching products" } },
      },
    },
    "/api/agent/product/{handle}": productPath,
    "/api/agent/price": {
      post: {
        operationId: "priceZyvorahMuralInIndia",
        summary: "Calculate a made-to-measure India INR price",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["handle", "material_slug", "width", "height"],
                properties: {
                  handle: { type: "string" },
                  material_slug: { type: "string" },
                  width: { type: "number", exclusiveMinimum: 0 },
                  height: { type: "number", exclusiveMinimum: 0 },
                  unit: { type: "string", enum: ["ft", "cm", "in"], default: "ft" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "India INR price" } },
      },
    },
  },
};

export function GET() {
  return new Response(JSON.stringify(spec), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
