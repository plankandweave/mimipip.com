
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import { permanentRedirect } from "next/navigation";
// Retired path: a 308 so search engines move its signals to /concepts rather
// than keep the old URL indexed (redirect() is a temporary 307).
  function Page() { return permanentRedirect("/concepts"); }

export default withBrandEditorial("/office-concepts", Page);
