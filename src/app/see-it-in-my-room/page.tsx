
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { getFlatImageMap, getProductsByHandles, getProductsByTag } from "@/lib/queries";
import { SeeInMyRoom } from "@/components/SeeInMyRoom";

export const metadata: Metadata = brandMetadata({
  title: "See It in My Room — Zyvorah",
  alternates: { canonical: "/see-it-in-my-room" },
});

export default async function SeeInMyRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ design?: string }>;
}) {
  // ?design=<handle>: the product page's "See it on your own wall first",
  // tapped before that page's scripts loaded, lands here; the design goes
  // first in the grid and opens on the room as soon as the photo is in.
  const focusHandle = (await searchParams).design?.trim() || null;
  const [tagged, focused] = await Promise.all([
    getProductsByTag("Wall Art", 24),
    focusHandle ? getProductsByHandles([focusHandle]) : Promise.resolve([]),
  ]);
  const designs = [...focused, ...tagged.filter((d) => d.handle !== focusHandle)];
  // The visualiser places the FLAT pattern, never a room render (catalogue
  // rule): the card image is the render for the tile, so the flat rides
  // alongside it.
  const flat = await getFlatImageMap(designs.map((d) => d.handle));
  const initialDesigns = designs.map((d) => ({ ...d, flatImage: flat[d.handle] ?? d.flatImage ?? null }));
  // The pre-hydration photo stash (src/lib/early-room-photo.ts) is an inline
  // script in the root layout's <head>, parsed before any of this page.
  return <SeeInMyRoom initialDesigns={initialDesigns} focusHandle={focused.length ? focusHandle : null} />;
}
