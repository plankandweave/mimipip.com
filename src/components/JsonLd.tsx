/** MimiPip's Worker emits structured data from the published catalogue and
 * approved price list (brand/seo/head.ts). Do not emit inherited body scripts:
 * removing them at the edge makes the DOM disagree with React's server tree
 * and forces product/collection pages to recover from a hydration failure. */
export function JsonLd({ data: _data }: { data: unknown }) {
  return null;
}
