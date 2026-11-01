import { robotsText } from "@/lib/robots-policy";

export function GET() {
  return new Response(robotsText(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "content-signal": "search=yes, ai-input=yes, ai-train=no, use=reference",
    },
  });
}
