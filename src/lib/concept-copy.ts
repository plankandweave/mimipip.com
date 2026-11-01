export const EXCLUSIVITY_PERCENT = 30;
export const EXCLUSIVITY_TERMS = "future-sales-v1";
export const EXCLUSIVITY_COPY =
  "Once your exclusive purchase is confirmed, we’ll remove these designs from our website and stop selling or licensing them to other customers. Previous purchases remain unaffected. Exclusive use covers the project named below; copyright remains with Zyvorah.";
export const createLookPath = (slug: string) =>
  `/projects/${encodeURIComponent(slug)}/create`;
