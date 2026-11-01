import { getNamedFaithCards, isNamedFaithCollection } from "@/lib/named-faith-collections";
import { kidsCollectionOrder } from "@/lib/kids-collection-order";
import { NextResponse, type NextRequest } from "next/server";
import {
  getJustInPage,
  getCollectionByHandle,
  getCollectionPageHandles,
  getCollectionCards,
  getFacetVocab,
  collectionScope,
  type Sort,
} from "@/lib/queries";
import { sceneKeyForCollection } from "@/lib/rooms";
import { descriptorFor } from "@/lib/descriptor";
import { categoryForCollection, getProductCategories } from "@/lib/product-category";

// Keep in step with PAGE_SIZE in /new and /collections/[handle].
const PAGE_SIZE = 24;

/**
 * Pages the infinite-scroll grids: `?feed=new` for New Arrivals, or
 * `?collection=<handle>` (with the same sort/tag/signature/new/child params the
 * collection page uses) for a collection. Returns `{ cards, total }`.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

  try {
    if (sp.get("feed") === "new") {
      const { cards, total } = await getJustInPage(page, PAGE_SIZE);
      return NextResponse.json({ cards, total });
    }

    const handle = sp.get("collection");
    if (!handle) return NextResponse.json({ cards: [], total: 0 });
    const collection = await getCollectionByHandle(handle);
    if (!collection) return NextResponse.json({ cards: [], total: 0 });
    // Match the collection page's family landing override. Otherwise page 1
    // can show all wallpapers while Load more silently switches to its row's
    // narrower legacy tag.
    const landingCategory = (await getProductCategories()).find((c) => c.collectionHandle === handle);
    const scope = landingCategory
      ? { tags: null, category: landingCategory.slug }
      : collectionScope(collection);
    if (!scope.tags && !scope.category) return NextResponse.json({ cards: [], total: 0 });

    // Must match the collection page's default (newest), or scrolling past
    // page 1 would silently re-sort the grid under the reader.
    const sort: Sort = sp.get("sort") === "featured" ? "featured" : "newest";
    const tags = sp.getAll("tag");
    const signature = sp.get("signature") === "1";
    const newOnly = sp.get("new") === "1";
    const childSafe = sp.get("child") === "1";
    if (isNamedFaithCollection(handle)) {
      const matching = (await getNamedFaithCards(handle)).filter(p => (!signature || p.isSignature)
        && (!newOnly || p.isNew) && (!childSafe || p.tags?.includes("Child-Safe"))
        && tags.every(tag => p.tags?.includes(tag)));
      if (sort === "newest") matching.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      return NextResponse.json({ cards: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length });
    }
    const roomKey = sceneKeyForCollection(collection);
    const family = await categoryForCollection(handle, collection.category_scope);
    // Child-safe is a derived tag that joins the AND filter set (mirrors the page).
    const queryTags = childSafe ? [...tags, "Child-Safe"] : tags;

    const { handles, total } = await getCollectionPageHandles(scope, {
      page,
      pageSize: PAGE_SIZE,
      sort,
      filterTags: queryTags,
      signature,
      newOnly,
      roomKey,
      renderedOnly: family?.measurementType !== "length",
    });
    const cardMode = family?.measurementType === "length" ? "flat" : roomKey ? "scene-preferred" : "scene";
    const [rawCards, vocab] = await Promise.all([
      getCollectionCards(kidsCollectionOrder(handles, handle, page), roomKey, cardMode),
      getFacetVocab(),
    ]);
    const colourSet = new Set(vocab.colour.map((o) => o.tag));
    const styleSet = new Set([...vocab.style, ...vocab.subject].map((o) => o.tag));
    const cards = rawCards.map((p) => ({ ...p, subtitle: descriptorFor(p.tags ?? [], colourSet, styleSet) }));
    return NextResponse.json({ cards, total });
  } catch {
    return NextResponse.json({ cards: [], total: 0 }, { status: 500 });
  }
}
