import type { ProductCardData } from "./types";

/**
 * What a product card says.
 *
 * A card gets one line and it has to be true. The three families are bought in
 * genuinely different terms, and the failure mode is specific: a canvas
 * advertised with wallpaper sizing terms or a border priced by the square foot
 * is a promise the checkout cannot keep. So the copy is derived from the
 * product's family — never from a handle, a tag or a pricing column — in one
 * place that every card surface calls.
 *
 * Deliberately free of server imports: the collection card is a client
 * component, and this must not drag the Supabase client into its bundle.
 */

export type MeasurementType = "area" | "length" | "fixed";

export type CardCopyInput = {
  measurementType: MeasurementType;
  /** The category's own promise line, from product_categories.card_label. */
  cardLabel: string | null | undefined;
  /** Per sq ft (area), per linear metre (length), or the smallest finished size (fixed). */
  price: number | null;
  /** Ready-size peel & stick wallpaper: priced by area, but not cut to the wall. */
  isReadySizeWallpaper?: boolean;
};

/**
 * How a card writes money. Supplied by the caller from useMarket() so a card
 * prices in the visitor's currency — this file used to format rupees itself,
 * which put ₹200/sq ft under every design on every collection listing for a
 * shopper the rest of the page was quoting in dollars (25 Sep 2026).
 */
export type CardMoney = {
  /** Goods only, in the market's currency. */
  money: (amountInr: number) => string;
  /** A finished piece's starting price, carrying delivery where the market
   *  includes it — so the figure matches what the product page will charge. */
  fixedFrom: (amountInr: number) => string;
};

/** The promise line and the price line shown on a product card. */
export function cardCopy(input: CardCopyInput & { format: CardMoney }): {
  promise: string;
  price: string | null;
} {
  const { measurementType, price, format } = input;

  if (measurementType === "length") {
    return {
      promise: input.cardLabel || "Decorative border",
      price: price != null ? `${format.money(price)}/linear metre` : null,
    };
  }

  if (measurementType === "fixed") {
    return {
      promise: input.cardLabel || "Fixed-size canvas art",
      // A finished piece has a starting price, never a per-sq-ft rate — that
      // rate is an internal make cost the customer must not be shown.
      price: price != null ? `From ${format.fixedFrom(price)}` : null,
    };
  }

  return {
    promise: input.isReadySizeWallpaper
      ? "Ready sizes · Peel & stick"
      : input.cardLabel && !/custom[- ]made/i.test(input.cardLabel)
        ? input.cardLabel
        : "Wallpaper mural",
    price: price != null ? `${format.money(price)}/sq ft` : null,
  };
}

/** The number a card prices with, in its family's own unit. */
export function cardPrice(p: ProductCardData): number | null {
  const family = p.measurementType ?? "area";
  if (family === "length") return p.pricePerMetre ?? null;
  if (family === "fixed") return p.fromPrice ?? null;
  return p.fromPricePerSqft ?? null;
}

/** The hover chip over the image — how this product is made, in three words. */
export function familyChip(p: ProductCardData): string {
  const family = p.measurementType ?? "area";
  if (family === "length") return "Sold per metre";
  if (family === "fixed") return "Fixed sizes";
  return p.isReadySize ? "Peel & stick" : "Sized to your wall";
}
