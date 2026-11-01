import "server-only";
import { getPersonaApartment } from "@/content/persona-apartments";
import { supabaseAdmin } from "./supabase-admin";
import { supabase } from "./supabase";
import { CONCEPT_MATERIAL, type ConceptOffer } from "./office-concept";

export async function getConceptOffers(
  slug = "room-for-ideas",
): Promise<{
  offers: ConceptOffer[];
  materialName: string;
  rollWidthMm: number;
}> {
  const [{ data, error }, { data: material, error: materialError }] =
    await Promise.all([
      supabase
        .from("concept_shop_designs")
        .select(
          "title,space,reference_url,sort_order,requires_preparation,products!inner(handle,status,flat_verified,product_images(url,is_flat,width,height),product_materials(price_per_sqft,available,materials(slug)))",
        )
        .eq("concept_slug", slug)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("materials")
        .select("name,roll_width_mm")
        .eq("slug", CONCEPT_MATERIAL)
        .eq("active", true)
        .eq("coming_soon", false)
        .maybeSingle(),
    ]);
  if (error || materialError || !material)
    throw new Error(
      "This concept is temporarily unavailable. Please try again.",
    );
  type Product = {
    handle: string;
    status: string;
    flat_verified: boolean;
    product_images: {
      url: string;
      is_flat: boolean;
      width: number;
      height: number;
    }[];
    product_materials: {
      price_per_sqft: number;
      available: boolean;
      materials: { slug: string } | { slug: string }[] | null;
    }[];
  };
  type Row = {
    title: string;
    space: string;
    reference_url: string;
    sort_order: number;
    requires_preparation: boolean;
    products: Product | Product[];
  };
  const offers = (data as unknown as Row[]).flatMap((row) => {
    const product = Array.isArray(row.products)
      ? row.products[0]
      : row.products;
    if (!product || product.status !== "active") return [];
    const flat = product.product_images.find((i) => i.is_flat);
    const price = product.product_materials.find(
      (m) =>
        m.available &&
        (Array.isArray(m.materials)
          ? m.materials[0]?.slug
          : m.materials?.slug) === CONCEPT_MATERIAL,
    );
    const rate = Number(price?.price_per_sqft);
    if (
      !Number.isFinite(rate) ||
      rate <= 0 ||
      (!row.requires_preparation &&
        (!flat?.width || !flat.height || !product.flat_verified))
    )
      return [];
    return [
      {
        handle: product.handle,
        title: row.title,
        space: row.space,
        number: String(row.sort_order).padStart(2, "0"),
        roomUrl: row.reference_url,
        imageUrl: row.requires_preparation ? "" : flat!.url,
        sourceW: row.requires_preparation ? 1 : flat!.width,
        sourceH: row.requires_preparation ? 1 : flat!.height,
        rate,
        requiresPreparation: row.requires_preparation,
        finishNote: getPersonaApartment(slug)?.rooms.find(room => room.handle === product.handle)?.wipeable ? "Wipeable for indoor use" : undefined,
      },
    ];
  });
  const admin = supabaseAdmin();
  if (!admin) throw new Error("Shopping is temporarily unavailable.");
  const { data: commerce, error: commerceError } = await admin.rpc(
    "concept_design_commerce",
    { p_handles: offers.map((o) => o.handle) },
  );
  if (commerceError) throw new Error("Could not check design availability.");
  type Commerce = NonNullable<ConceptOffer["commerce"]> & { handle: string };
  const pricedOffers = offers.flatMap((offer) => {
    const terms = (commerce as Commerce[]).find(
      (c) => c.handle === offer.handle,
    );
    return terms?.available ? [{ ...offer, commerce: terms }] : [];
  });
  return {
    offers: pricedOffers,
    materialName: material.name,
    rollWidthMm: material.roll_width_mm,
  };
}
