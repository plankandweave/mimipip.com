
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import { permanentRedirect } from "next/navigation";
  function Page() { return permanentRedirect("/concepts/blue-and-clay"); }

export default withBrandEditorial("/concepts/first-proper-home", Page);
