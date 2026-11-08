
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { Curator } from "@/components/curator/Curator";

export const metadata: Metadata = { title: "Find My Wallpaper · Mimi Pip", description: "Find wallpaper designs for your room, colours and style.", alternates: { canonical: "/design-with" } };

  function DesignWithPage() {
  return (
    <div className="container-x py-10 md:py-16">
      <Curator />
    </div>
  );
}

export default DesignWithPage;
