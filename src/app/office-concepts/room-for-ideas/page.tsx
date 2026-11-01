
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import { redirect } from "next/navigation";
  function Page(){ return redirect("/concepts/room-for-ideas"); }

export default withBrandEditorial("/office-concepts/room-for-ideas", Page);
