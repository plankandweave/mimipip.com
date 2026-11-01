import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getConceptOffers } from "@/lib/office-concept-server";
import {
  MAX_CONCEPT_WALLS,
  MIN_WALL_CM,
  MAX_WALL_WIDTH_CM,
  MAX_WALL_HEIGHT_CM,
} from "@/lib/office-concept";
import { fetchPrintRules } from "@/lib/print-rules";
import { panelArrangementLabel, rollCmFromMm } from "@/lib/visualizer";
import { recordCommercialEvent, visitorTokenOf } from "@/lib/server-events";
import { TASTE_COOKIE } from "@/lib/taste";

import { EXCLUSIVITY_TERMS } from "@/lib/concept-copy";
import { getShopConcept } from "@/lib/shop-concepts";

const requestSchema = z
  .object({
    conceptSlug: z.string().min(1).max(100).default("room-for-ideas"),
    requestId: z.uuid(),
    approved: z.literal(true),
    exclusivity: z
      .object({
        requested: z.literal(true),
        projectName: z.string().trim().min(2).max(120),
        termsVersion: z.literal(EXCLUSIVITY_TERMS),
        historyAccepted: z.literal(true),
      })
      .strict()
      .optional(),
    walls: z
      .array(
        z
          .object({
            id: z.uuid(),
            handle: z.string().max(80),
            roomLabel: z.string().trim().min(1).max(60),
            widthCm: z
              .number()
              .min(MIN_WALL_CM)
              .max(MAX_WALL_WIDTH_CM)
              .transform((v) => Math.round(v * 100) / 100),
            heightCm: z
              .number()
              .min(MIN_WALL_CM)
              .max(MAX_WALL_HEIGHT_CM)
              .transform((v) => Math.round(v * 100) / 100),
            offsetX: z.number().min(0).max(1),
            offsetY: z.number().min(0).max(1),
            quotedRate: z.number().positive(),
            priorOrders: z.number().int().min(0).optional(),
            priorCustomers: z.number().int().min(0).optional(),
            premiumPercent: z.number().min(0).max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CONCEPT_WALLS),
  })
  .strict();

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json(
      { error: "Please order from this website." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (
    !parsed.success ||
    new Set(parsed.success ? parsed.data.walls.map((w) => w.id) : []).size !==
      (parsed.success ? parsed.data.walls.length : 0)
  ) {
    return NextResponse.json(
      { error: "Check the wall names, measurements and composition approval." },
      { status: 400 },
    );
  }
  const concept = getShopConcept(parsed.data.conceptSlug);
  if (!concept)
    return NextResponse.json({ error: "Concept not found." }, { status: 404 });
  const admin = supabaseAdmin();
  if (!admin)
    return NextResponse.json(
      {
        error:
          "Checkout is temporarily unavailable. Your selection is saved on this device.",
      },
      { status: 503 },
    );
  const store = await cookies();
  const existing = store.get("zyv_cart")?.value;
  const token = existing || randomUUID();
  try {
    const [catalogue, rules] = await Promise.all([
      getConceptOffers(concept.slug),
      fetchPrintRules(),
    ]);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          slug: concept.slug,
          walls: parsed.data.walls,
          exclusivity: parsed.data.exclusivity,
        }),
      )
      .digest("hex");
    const items = parsed.data.walls.map((wall) => {
      const offer = catalogue.offers.find((o) => o.handle === wall.handle);
      if (!offer)
        throw new Error(
          "A selected design is currently unavailable. Return to your spaces and update the selection.",
        );
      if (offer.rate !== wall.quotedRate)
        throw new Error(
          "A price has changed. Refresh this page to review the latest total before ordering.",
        );
      const exclusive = parsed.data.exclusivity;
      if (
        exclusive &&
        (!offer.commerce?.exclusiveAvailable ||
          wall.priorOrders !== offer.commerce.priorOrders ||
          wall.priorCustomers !== offer.commerce.priorCustomers ||
          wall.premiumPercent !== offer.commerce.premiumPercent)
      )
        throw new Error(
          "Exclusivity availability, sales history or pricing changed. Refresh and review your selection.",
        );
      return {
        ...wall,
        crop: {
          ...(exclusive
            ? {
                exclusivity: {
                  ...exclusive,
                  priorOrders: offer.commerce!.priorOrders,
                  priorCustomers: offer.commerce!.priorCustomers,
                  premiumPercent: offer.commerce!.premiumPercent,
                },
              }
            : {}),
          imageUrl: offer.imageUrl,
          imageAspect: offer.sourceW / offer.sourceH,
          sourceW: offer.sourceW,
          sourceH: offer.sourceH,
          wallWidthCm: wall.widthCm,
          wallHeightCm: wall.heightCm,
          offsetX: wall.offsetX,
          offsetY: wall.offsetY,
          zoom: 1,
          approval: {
            approvedAt: new Date().toISOString(),
            panelArrangement: panelArrangementLabel(
              wall.widthCm,
              rollCmFromMm(catalogue.rollWidthMm, rules.maxPanelCm),
              rules.overlapCm,
            ),
          },
          concept: {
            slug: concept.slug,
            title: concept.title,
            requiresPreparation: !!offer.requiresPreparation,
            referenceImageUrl: offer.roomUrl,
            roomLabel: wall.roomLabel,
            wallId: wall.id,
            batchId: parsed.data.requestId,
            configurationHash: hash,
          },
        },
      };
    });
    // One transaction, server-priced, with a repeat-safe request ID: never half an office or duplicate walls on retry.
    const { data, error } = await admin.rpc("cart_add_concept", {
      p_session_token: token,
      p_request_id: parsed.data.requestId,
      p_items: items,
      p_concept_slug: concept.slug,
    });
    if (error) {
      console.error("concept cart:", error.message);
      throw new Error(
        "We could not add your look. A design may have been reserved or its sales history changed. Refresh to review availability; your selection is saved.",
      );
    }
    after(() =>
      recordCommercialEvent({
        event: "cart_add",
        subject: `${token}:concept:${parsed.data.requestId}`,
        token: visitorTokenOf(store.get(TASTE_COOKIE)?.value),
        handle: concept.slug,
        meta: { walls: items.length, material: "smooth-matt" },
      }),
    );
    const res = NextResponse.json(data);
    // Mint before returning even when this is a first-time shopper.
    if (!existing)
      res.cookies.set("zyv_cart", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(req.url).protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 60,
      });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Could not add your concept. Please try again.",
      },
      { status: 409 },
    );
  }
}
