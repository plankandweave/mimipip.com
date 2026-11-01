import { NextResponse, type NextRequest } from "next/server";
import { searchFridgeModels } from "@/lib/wrap-queries";

/**
 * The fit finder's typeahead: `?q=` → the refrigerator models that match what
 * the customer typed off the sticker inside their door.
 *
 * Returns the model rows only, never a resolved price. The fit finder page
 * server-renders the fridge's whole ladder from `wrap_formats`, and the client
 * looks the matched `formatCode` up in it — so the price a customer sees comes
 * from the same row the cart will price against, and this endpoint can never
 * become a second place where a format price is stated.
 *
 * Still fridge-only, and `wrap_models` is too: a fit finder needs a model
 * database to search, and only the refrigerator fleet has one
 * (ApplianceConfig.supportsModelFinder).
 *
 * `verified` rides on every row untouched. It is the one field the UI is not
 * allowed to flatten: true means the door dimensions were read off the
 * manufacturer's own specification sheet, false means the model was assigned to
 * a format by capacity/door-type class and nobody has measured one (0089).
 */

const MAX_RESULTS = 8;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ matches: [] });
  try {
    const matches = await searchFridgeModels(q, MAX_RESULTS);
    return NextResponse.json({ matches });
  } catch (err) {
    console.error("fridge fit search failed:", err);
    // A search that errors must degrade to "no match found", which routes the
    // customer to the measure-your-door fallback — a working path, not a dead
    // end with a red box in it.
    return NextResponse.json({ matches: [] }, { status: 200 });
  }
}
