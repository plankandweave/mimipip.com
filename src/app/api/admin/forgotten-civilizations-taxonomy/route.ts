import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";

export const runtime = "nodejs";

// The collection is a tightly scoped, staff-only merchandising repair.  Each
// tag is both customer-facing discovery language and a search/curator signal;
// the fixed list makes it auditable and prevents this endpoint becoming a
// generic unreviewed taxonomy writer.
const TAGS: Record<string, string[]> = {
  "citadel-of-many-windows": ["Blue", "Green", "Red", "Art", "Landscape", "Architecture", "City", "Windows"],
  "midnight-express": ["Blue", "Orange", "Black", "Art", "Landscape", "Train", "Travel", "Night"],
  "islands-of-elsewhere": ["Blue", "Yellow", "Turquoise", "Art", "Landscape", "Island", "Coast", "Travel"],
  "desert-observatory": ["Blue", "Orange", "Yellow", "Art", "Landscape", "Desert", "Astronomy", "Architecture"],
  "impossible-voyage": ["Blue", "Green", "Orange", "Art", "Landscape", "Travel", "Mountain", "Sea"],
  "city-of-seven-bridges": ["Blue", "Yellow", "White", "Art", "Landscape", "City", "Architecture", "Bridge"],
  "saffron-caravan": ["Blue", "Yellow", "Orange", "Art", "Landscape", "Caravan", "Desert", "Travel"],
  "the-astronomer-s-garden": ["Blue", "Green", "White", "Art", "Landscape", "Botanical", "Garden", "Astronomy"],
  "the-sunken-atlas": ["Blue", "Turquoise", "Green", "Art", "Landscape", "Underwater", "Ocean", "Map"],
  "the-copper-coast": ["Blue", "Orange", "Yellow", "Art", "Landscape", "Coast", "Sea", "Travel"],
  "the-library-of-winds": ["Blue", "White", "Art", "Landscape", "Library", "Books", "Architecture"],
};

const SHARED = [
  "The Forgotten Civilizations Collection",
  "Foyer",
  "Home Office",
  "Office",
  "Creative Office",
  "Media Agency",
  "Mood: Playful",
  "Mood: Fresh",
];

function revalidateCatalogue(handles: string[]) {
  void bumpCatalogueVersion();
  revalidatePath("/");
  revalidatePath("/new");
  revalidatePath("/collections/[handle]", "page");
  revalidatePath("/products/[handle]", "page");
  revalidatePath("/office");
  revalidatePath("/office/[space]", "page");
  revalidatePath("/rooms");
  for (const handle of handles) revalidatePath(`/products/${handle}`);
}

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Catalogue administration is not configured." }, { status: 503 });

  const handles = Object.keys(TAGS);
  const { data: designs, error: designsError } = await db
    .from("products")
    .select("id,handle")
    .in("handle", handles)
    .eq("status", "active");
  if (designsError) return NextResponse.json({ error: designsError.message }, { status: 500 });
  if ((designs ?? []).length !== handles.length) {
    return NextResponse.json({ error: "The published collection does not match the expected 11 designs." }, { status: 409 });
  }

  const rows = (designs ?? []).flatMap((design) =>
    [...new Set([...SHARED, ...TAGS[design.handle]])].map((tag) => ({ product_id: design.id, tag })),
  );
  const { error } = await db.from("product_tags").upsert(rows, { onConflict: "product_id,tag", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateCatalogue(handles);
  return NextResponse.json({ data: { designs: handles.length, tags: rows.length }, error: null });
}
