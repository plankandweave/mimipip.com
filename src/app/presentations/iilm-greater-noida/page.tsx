
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { getGatedUser } from "@/lib/auth-server";
import { hasIilmPresentationAccess } from "@/lib/iilm-presentation";
import { IilmPresentation } from "./presentation";
import "./presentation.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = editorialMetadata("/presentations/iilm-greater-noida");

  async function Page() {
  const user = await getGatedUser();
  return <IilmPresentation allowed={hasIilmPresentationAccess(user?.email)} signedIn={!!user} />;
}

export default withBrandEditorial("/presentations/iilm-greater-noida", Page);
