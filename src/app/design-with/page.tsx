
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { Curator } from "@/components/curator/Curator";

export const metadata: Metadata = editorialMetadata("/design-with");

  function DesignWithPage() {
  return (
    <div className="container-x py-10 md:py-16">
      <Curator />
    </div>
  );
}

export default withBrandEditorial("/design-with", DesignWithPage);
