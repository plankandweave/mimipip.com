import Link from "next/link";
import { WrapMockup } from "@/components/WrapMockup";
import { MiniExclusiveBadge } from "@/components/MiniExclusiveBadge";
import { formatINR } from "@/lib/pricing";
import { APPLIANCES, wrapDesignPath, type ApplianceKey } from "@/lib/appliances";
import type { WrapFormat } from "@/lib/wraps";
import type { WrapCardData } from "@/lib/wrap-queries";

/**
 * A wrap design in a listing: the artwork ON the appliance, never as a swatch.
 *
 * The store's ProductCard is not used for wraps. It links to /products/<handle>
 * (the store's catalogue, where no wrap exists), carries a wishlist heart that
 * would save a handle the wishlist cannot open, and shows the bare picture — and
 * a wrap's only stored picture is its flat artwork. The store's rule is that a
 * design is shown where it goes, never as a swatch; for a wall that is a room
 * render, and for a wrap it is the drawn appliance, which is what the studio,
 * the buy box and this card all show.
 */
export function WrapCard({
  product,
  formats,
  appliance,
}: {
  product: WrapCardData;
  /** Active wrap formats — any appliance's; the card filters to its own. */
  formats: WrapFormat[];
  /** The appliance to draw the design on, when the design is sold on it.
   *  Otherwise the card falls back to the design's own primary appliance, so a
   *  top-load-only design in a washing-machine listing is never drawn on a
   *  front-loader it cannot be bought for. */
  appliance: ApplianceKey;
}) {
  const keys = product.wrapApplianceKeys ?? [];
  const drawOn: ApplianceKey = !keys.length || keys.includes(appliance) ? appliance : keys[0];
  const cfg = APPLIANCES[drawOn];
  const art = product.applianceFlats[drawOn] ?? product.image;
  const ladder = formats.filter((f) => f.appliance === drawOn && f.active && !f.isMadeToMeasure);
  const sold = product.wrapFormatCodes?.length
    ? ladder.filter((f) => product.wrapFormatCodes!.includes(f.code))
    : ladder;
  const format = sold.find((f) => f.code === cfg.openingFormatCode) ?? sold[0] ?? null;
  const madeFor = product.wrapAppliances?.length ? product.wrapAppliances.join(", ") : cfg.pickerGroupLabel;

  return (
    <Link href={wrapDesignPath(product.handle, drawOn)} className="group block">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] bg-wash p-4 transition-transform duration-500 group-hover:-translate-y-0.5">
        {art && format ? (
          <WrapMockup
            designUrl={art}
            designAlt={product.title}
            format={format}
            className="h-full w-full"
          />
        ) : (
          <span className="text-sm text-mist">In the studio</span>
        )}
        {!!product.wrapFormatCodes?.length && <MiniExclusiveBadge />}
      </div>
      <div className="pt-3">
        <h3 className="font-display text-[0.95rem] font-semibold leading-snug">{product.title}</h3>
        <p className="mt-1 text-sm text-slate">
          Made for {madeFor}
          {product.fromPrice != null && (
            <span className="mt-0.5 block text-mist">From {formatINR(product.fromPrice)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
