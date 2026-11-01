import { permanentRedirect } from "next/navigation";

// The corporate portal became multi-tenant (/partners/[slug]). Vijay Sales was
// the first tenant and its old URLs are in people's bookmarks and inboxes, so
// they keep working forever rather than 404ing.
export const dynamic = "force-dynamic";

export default function VijaySalesLegacyRedirect() {
  permanentRedirect("/partners/vijay-sales");
}
