import {exclusivesBlocked, partnerCapabilities, purchasingAllowed} from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { browseProductCards, findDesignsByName, shortlistProductCards, getProductByHandle, pickFlatImage, sortImages } from "@/lib/queries";
import { isExclusiveTier } from "@/lib/pricing";
import { mediaRendition, toMediaUrl } from "@/lib/media-url";
import { parseShortlistHandles } from "@/lib/partner-shortlist";

export const dynamic = "force-dynamic";

/** Room → the `product_images.scene_key` values that count as that room. A
 *  room whose renders live under several scenarios (an office is shot as a
 *  reception, an open plan, a meeting room…) lists them all. */
const ROOM_SCENES: Record<string, string[]> = {
  "Living Room": ["living"],
  Bedroom: ["bedroom"],
  "Dining Room": ["dining"],
  Kitchen: ["kitchen"],
  Foyer: ["entryway"],
  "Pooja Room": ["pooja"],
  "Home Office": ["office"],
  Office: ["corpoffice", "reception", "boardroom", "meetingroom", "openplan", "phonebooth", "corridor"],
  Kids: ["kidsroom", "playroom"],
  Nursery: ["nursery"],
  Teen: ["teen"],
  Hotels: ["reception", "hotellobby"],
};

/** Words a partner actually types when they mean a room, mapped to the chip
 *  that answers them. Typing "living" is the same request as clicking Living,
 *  and it must not be answered by full-text search: descriptions are indexed,
 *  so "living" scores a hit on every office mural whose copy says "brighter
 *  lives" — which is exactly what a HomeLane designer saw on 22 September. */
const ROOM_WORDS: Record<string, string> = {
  living: "Living Room", "living room": "Living Room", lounge: "Living Room", "drawing room": "Living Room",
  bedroom: "Bedroom", bed: "Bedroom", master: "Bedroom", "master bedroom": "Bedroom",
  dining: "Dining Room", "dining room": "Dining Room",
  kitchen: "Kitchen",
  foyer: "Foyer", entrance: "Foyer", entryway: "Foyer", hallway: "Foyer",
  pooja: "Pooja Room", puja: "Pooja Room", mandir: "Pooja Room", prayer: "Pooja Room",
  "home office": "Home Office", study: "Home Office",
  office: "Office", workspace: "Office", reception: "Office", boardroom: "Office", meeting: "Office",
  kids: "Kids", "kids room": "Kids", children: "Kids", playroom: "Kids",
  nursery: "Nursery", baby: "Nursery",
  teen: "Teen", teenager: "Teen",
  hotel: "Hotels", hotels: "Hotels", lobby: "Hotels",
};

// Catalogue browsing for website-priced partners (e.g. an architectural firm
// choosing a Zyvorah design for their client). Session-gated: partner rates are
// commercial terms, not public data, so this never answers to a signed-out
// caller even though the underlying catalogue is public.
//
//   GET [?q=<text>][&room=<tag>][&page=N] → catalogue cards, paged. No
//                       parameter is required: the whole range is browsable.
//                       `room` never narrows the range — it orders the grid
//                       (designs rendered in that room first) and pictures
//                       each design in that room. Only `q` narrows.
//   GET ?handle=<slug> → that design's materials + the partner's net ₹/sq ft
//   GET ?shortlist=1   → the "Shortlisted for you" strip: this account's
//                       corporate_accounts.shortlist_handles as cards, in the
//                       stored order, stale handles dropped (set from the OS).

export async function GET(request: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if(!partnerCapabilities(session.account).catalogue)return NextResponse.json({error:"Catalogue disabled"},{status:403});
  const autographBlocked = exclusivesBlocked(session.account);
  const { searchParams } = new URL(request.url);
  const handle = (searchParams.get("handle") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();

  if (searchParams.get("shortlist") === "1") {
    const cards = await shortlistProductCards(
      parseShortlistHandles(session.account.shortlist_handles),
      { excludeExclusive: autographBlocked },
    );
    return NextResponse.json({
      results: cards.map((r) => ({
        handle: r.handle,
        title: r.title,
        image: r.image ? mediaRendition(toMediaUrl(r.image), 480) : r.image,
      })),
    });
  }

  if (handle) {
    const product = await getProductByHandle(handle);
    if (!product) return NextResponse.json({ error: "Design not found" }, { status: 404 });
    if(partnerCapabilities(session.account).poRequiredRelease&&(product.is_service||product.category!=="wallpaper"||product.flat_verified!==true||!pickFlatImage(product.product_images??[])?.url))return NextResponse.json({error:"Choose a verified catalogue wallpaper"},{status:404});

    // An exclusive tier is not sold through a reselling channel. Asked by
    // PROPERTY, not by tier name: Saanjha and Atelier are exclusive too, and a
    // check that named 'autograph' would wave them straight through onto a
    // partner's storefront. Answering 404 rather than a rate keeps the
    // exclusivity out of a partner's hands even if they have the handle from a
    // public page — the order route refuses it again regardless.
    if (autographBlocked && isExclusiveTier(product.price_tier)) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const gstPct = Number(session.account.gst_pct);
    // The account's discount is a commercial term: the purchasing member
    // (procurement) sees the net rate they will be billed; a designer sees the
    // list price and nothing about what the account pays for it.
    const commercial = purchasingAllowed(session);
    const discountPct = commercial ? Number(session.account.discount_pct) : 0;

    // Storefront rates are GST-INCLUSIVE; the partner quote is ex-GST plus GST.
    // Show the ex-GST net so the number on screen matches the order line.
    const materials = (product.product_materials ?? [])
      .filter((m) => m.available && m.materials && !m.materials.coming_soon)
      .map((m) => {
        const inclusive = Number(m.price_per_sqft);
        const exRate = inclusive / (1 + gstPct / 100);
        return {
          slug: m.materials!.slug,
          name: m.materials!.name,
          /** What a retail customer sees on zyvorah.com (GST-inclusive). */
          listPricePerSqft: Math.round(inclusive * 100) / 100,
          /** Ex-GST rate this partner is charged, after their discount —
           *  purchasing only; a designer gets null, never a number to infer from. */
          netPricePerSqft: commercial ? Math.round(exRate * (1 - discountPct / 100) * 100) / 100 : null,
          swatchUrl: m.materials!.swatch_url ?? null,
        };
      });

    const images = sortImages(product.product_images ?? []);
    return NextResponse.json({
      handle: product.handle,
      title: product.title,
      // The flat (furniture-free) artwork is what actually prints — same image
      // the room visualiser and print pipeline use.
      flatImage: pickFlatImage(product.product_images ?? [])?.url ?? images[0]?.url ?? null,
      materials,
      discountPct: commercial ? discountPct : null,
    });
  }

  // `room` names a room, and the ROOM_SCENES map turns it into the scene keys
  // whose renders count as that room — see browseProductCards for why a render
  // rather than a tag decides this, and why it ranks rather than filters.
  const room = (searchParams.get("room") ?? "").trim();
  // A typed room word IS a room request, so it is answered by the room filter
  // rather than by relevance over descriptions.
  // A design's own name always wins over a room word: a pasted name is a
  // request for THAT design (design-name.ts).
  const named = q.length > 1 ? await findDesignsByName(q) : [];
  const typedRoom = named.length ? undefined : ROOM_WORDS[q.toLowerCase()];
  const effectiveRoom = room || typedRoom || "";
  const sceneKeys = ROOM_SCENES[effectiveRoom];
  // When the words WERE the room, they must not also narrow by text.
  const text = typedRoom && !room ? "" : q;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = 36;
  const { cards, total } = await browseProductCards({ q: text, sceneKeys, page, pageSize, excludeExclusive: autographBlocked });
  const results = cards
    .filter((r) => !(autographBlocked && r.isExclusive))
    .filter((r)=>!partnerCapabilities(session.account).poRequiredRelease||r.handle!=="custom-wallpaper");
  // A pasted name that exists on zyvorah.com but is not in this account's
  // range must SAY so. "No designs match" reads as a broken search to someone
  // looking at the design on the website in the next tab.
  const shown = new Set(results.map((r) => r.handle));
  const withheld = named.find((d) => !shown.has(d.handle));
  const notice = withheld && !named.some((d) => shown.has(d.handle))
    ? autographBlocked && isExclusiveTier(withheld.price_tier)
      ? `"${withheld.title}" is from an exclusive collection that is sold only through Zyvorah directly, so it cannot be ordered through this portal.`
      : withheld.category !== "wallpaper"
        ? `"${withheld.title}" is not a wallpaper, so it cannot be ordered through this portal.`
        : `"${withheld.title}" is not available through this portal yet — ask your Zyvorah contact.`
    : undefined;
  return NextResponse.json({
    notice,
    results: results.map((r) => ({
      handle: r.handle,
      title: r.title,
      // A picker tile is ~150 px wide, so it gets the pre-generated 480 px
      // rendition (~25 KB), never the 2–3 MB master. The grid shows 36 at
      // once: masters meant ~100 MB per page, and on 28 Sep 2026 an iPad in
      // Homelane's team showed every tile as a broken "?" while the server
      // was answering 200. /media falls back to the master when a rendition
      // is missing, so this cannot blank a tile.
      image: r.image ? mediaRendition(toMediaUrl(r.image), 480) : r.image,
      fromPricePerSqft: r.fromPricePerSqft,
    })),
    total,
    page,
    hasMore: page * pageSize < total,
    /** Set when a typed word was understood as a room, so the portal can show
     *  which chip it answered with rather than leaving it looking like a
     *  search that quietly returned something else. */
    matchedRoom: typedRoom && !room ? typedRoom : undefined,
  });
}
