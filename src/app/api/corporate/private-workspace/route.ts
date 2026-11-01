import { createHash, randomUUID } from "node:crypto";
import { caUpload, caSignedUrl, caDownload } from "@/lib/corporate-art-store";
import { canonicalArtUrl } from "@/lib/corporate-files";
import { fetchMediaAware } from "@/lib/r2-media";
import {
  privateWorkspaceSession,
  workspaceError,
} from "@/lib/partner-private-auth";
import {
  exclusivesBlocked,
  partnerCapabilities,
  purchasingAllowed,
} from "@/lib/partner-capabilities";
import {
  projectInput,
  optionInput,
  decisionInput,
  confirmationInput,
} from "@/lib/partner-workspace-validation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { can, shipStateAllowed } from "@/lib/corporate-auth";
import { priceProjectLines, minOrderShortfall } from "@/lib/corporate-project";
import { getProductByHandle, pickFlatImage } from "@/lib/queries";
import { isExclusiveTier } from "@/lib/pricing";
import { after } from "next/server";
import { notifySapPriceOnce, type SapNoticeInput } from "@/lib/sap-price-notice";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";
import { fetchOsStatuses } from "@/lib/corporate-os";
import { stripPriceForNonPurchasing } from "@/lib/partner-workspace-view";
import { orderCityProblem, tier1OnlyPartner } from "@/lib/tier1-cities";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await privateWorkspaceSession();
    const sb = supabaseAdmin();
    if (!sb) return Response.json({ error: "Unavailable" }, { status: 503 });
    const params = new URL(req.url).searchParams;
    const requested = params.get("projectId");
    const projectsPage = Math.max(
      0,
      Math.min(10000, Number(params.get("projectsPage")) || 0),
    );
    const {
      data: projects,
      error: pe,
      count: projectCount,
    } = await sb
      .from("partner_private_projects")
      .select("*", { count: "exact" })
      .eq("account_id", s.account.id)
      .order("created_at", { ascending: false })
      .range(projectsPage * 100, projectsPage * 100 + 99);
    if (pe) throw new Error("Could not load customers");
    const active = requested ?? projects?.[0]?.id;
    if (requested && !projects?.some((p) => p.id === requested)) {
      const { data: found } = await sb
        .from("partner_private_projects")
        .select("*")
        .eq("id", requested)
        .eq("account_id", s.account.id)
        .maybeSingle();
      if (!found) throw new Error("Customer not found");
      projects?.push(found);
    }
    // Each project is loaded fully with explicit ranges instead of independently truncated global tables.
    async function all(table: string, column: string, value: string) {
      let rows: Record<string, any>[] = [];
      for (let page = 0; page < 100; page++) {
        const r = await sb!
          .from(table)
          .select("*")
          .eq("account_id", s.account.id)
          .eq(column, value)
          .order(
            table === "partner_private_decisions" ? "sequence" : "created_at",
            { ascending: false },
          )
          .range(page * 500, page * 500 + 499);
        if (r.error) throw new Error("Could not load customer history");
        rows = rows.concat(r.data ?? []);
        if ((r.data?.length ?? 0) < 500) return rows;
      }
      throw new Error("Customer history exceeds workspace limit");
    }
    const [options, confirmations] = active
      ? await Promise.all([
          all("partner_private_options", "project_id", active),
          all("partner_private_confirmations", "project_id", active),
        ])
      : [[], []];
    const decisions: Record<string, any>[] = [];
    for (let start = 0; start < options.length; start += 100) {
      const ids = options.slice(start, start + 100).map((o) => o.id);
      for (let page = 0; page < 100; page++) {
        const { data: history, error: he } = await sb
          .from("partner_private_decisions")
          .select("*")
          .eq("account_id", s.account.id)
          .in("option_id", ids)
          .order("sequence", { ascending: false })
          .range(page * 500, page * 500 + 499);
        if (he) throw new Error("Could not load decision history");
        decisions.push(...(history ?? []));
        if ((history?.length ?? 0) < 500) break;
        if (page === 99)
          throw new Error("Decision history exceeds workspace limit");
      }
    }
    decisions.sort((a, b) => b.sequence - a.sequence);
    const { data: lines, error: lineError } = confirmations.length
      ? await sb
          .from("partner_release_lines")
          .select("*")
          .in(
            "confirmation_id",
            confirmations.filter((c) => c.po_accepted_at).map((c) => c.id),
          )
      : { data: [], error: null };
    if (lineError) throw new Error("Could not load release progress");
    for (const c of confirmations) {
      delete c.package;
      delete c.release_policy;
      delete c.po_path;
    }
    for (const o of options) {
      delete o.specification.productionStock;
      const masterPath = o.specification?.masterImage?.path;
      if (masterPath)
        o.previewUrl = await caSignedUrl(masterPath, 3600, { maxEdge: 1400 });
      const photoPath = o.specification?.previewPhotoPath;
      if (photoPath)
        o.photoUrl = await caSignedUrl(photoPath, 3600, { maxEdge: 1400 });
    }
    const acknowledgedIds = (lines ?? []).flatMap((l) =>
      typeof l.os_order_id === "number" ? [l.os_order_id] : [],
    );
    const statuses = await fetchOsStatuses(acknowledgedIds);
    const canPurchase = purchasingAllowed(s);
    // Designers (canBuild without canPurchase) build and track wall options
    // but never see cost pricing — strip it here so a non-purchasing
    // browser's payload never carries a ₹ figure, not just the UI that reads it.
    return Response.json({
      projects,
      projectsMore: (projectsPage + 1) * 100 < (projectCount ?? 0),
      options: stripPriceForNonPurchasing(options, canPurchase),
      decisions,
      confirmations,
      lines: lines ?? [],
      statuses,
      statusesUnavailable: acknowledgedIds.some((id) => !statuses[id]),
      canBuild: can(s, "build"),
      canPurchase,
      capabilities: partnerCapabilities(s.account),
    });
  } catch (e) {
    return workspaceError(e);
  }
}
export async function POST(req: Request) {
  try {
    const s = await privateWorkspaceSession();
    const sb = supabaseAdmin();
    if (!sb) return Response.json({ error: "Unavailable" }, { status: 503 });
    const b = await req.json();
    let data: unknown;
    let error: { message: string } | null = null;
    let sapNotice: SapNoticeInput | null = null;
    if (b.action === "project") {
      if (!can(s, "build")) throw new Error("403:Designer permission required");
      const v = projectInput.parse(b);
      const r = await sb
        .from("partner_private_projects")
        .insert({
          account_id: s.account.id,
          customer_id: v.customerId,
          customer_name: v.customerName,
          created_by: s.email,
        })
        .select()
        .single();
      data = r.data;
      error = r.error;
    } else if (b.action === "option") {
      if (!can(s, "build")) throw new Error("403:Designer permission required");
      if (
        !partnerCapabilities(s.account).catalogue ||
        !partnerCapabilities(s.account).customSizing
      )
        throw new Error("403:Catalogue custom sizing is disabled");
      const v = optionInput.parse(b);
      const { data: project } = await sb
        .from("partner_private_projects")
        .select("id,customer_id,customer_name")
        .eq("id", v.projectId)
        .eq("account_id", s.account.id)
        .maybeSingle();
      if (!project) throw new Error("Customer not found");
      if (
        v.previewPhotoPath &&
        !v.previewPhotoPath.startsWith(
          `partner-workspace/${s.account.id}/photos/`,
        )
      )
        throw new Error("Photo not in your workspace");
      const product = await getProductByHandle(v.productHandle);
      const flat = pickFlatImage(product?.product_images ?? []);
      if (
        !product ||
        product.status !== "active" ||
        product.flat_verified !== true ||
        product.is_service ||
        product.category !== "wallpaper" ||
        !flat?.url ||
        (exclusivesBlocked(s.account) &&
          isExclusiveTier(product.price_tier))
      )
        throw new Error(
          "Choose an entitled catalogue wallpaper with a verified print master",
        );
      if (
        !product.product_materials.some(
          (m) =>
            m.available &&
            m.materials?.slug === v.materialSlug &&
            !m.materials.coming_soon,
        )
      )
        throw new Error("Choose a supported material");
      const { data: materialRow } = await sb
        .from("materials")
        .select("id")
        .eq("slug", v.materialSlug)
        .single();
      const { data: stock } = materialRow
        ? await sb
            .from("material_costs")
            .select("supplier_code,media_width_mm")
            .eq("material_id", materialRow.id)
            .single()
        : { data: null };
      if (!stock?.supplier_code)
        throw new Error("This material is not mapped to production stock yet");
      const { data: prior } = v.supersedesId
        ? await sb
            .from("partner_private_options")
            .select("id,specification,room_name,wall_identifier")
            .eq("id", v.supersedesId)
            .eq("account_id", s.account.id)
            .eq("project_id", v.projectId)
            .maybeSingle()
        : { data: null };
      if (v.supersedesId && !prior) throw new Error("Prior option not found");
      const pinnedPrior =
        prior?.specification?.productHandle === v.productHandle
          ? prior.specification.masterImage
          : null;
      const { data: priorBytes } = pinnedPrior
        ? await caDownload(pinnedPrior.path)
        : { data: null };
      if (pinnedPrior && !priorBytes)
        throw new Error("Previously approved master unavailable");
      const master = priorBytes
        ? new Response(priorBytes, {
            headers: { "Content-Type": priorBytes.type },
          })
        : await fetchMediaAware(flat.url);
      if (!master.ok) throw new Error("Print master unavailable");
      const bytes = new Uint8Array(await master.arrayBuffer());
      if (!bytes.length || bytes.length > 100 * 1024 * 1024)
        throw new Error("Print master cannot be pinned");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const masterPath = `partner-workspace/${s.account.id}/masters/${randomUUID()}/${checksum}`;
      const upload = await caUpload(masterPath, bytes, {
        contentType: master.headers.get("content-type") ?? "image/jpeg",
        upsert: false,
      });
      if (upload.error)
        throw new Error("Could not pin the approved print master");
      const pinnedUrl = canonicalArtUrl(sb, masterPath);
      const priced = await priceProjectLines(s.account, [
        {
          ...v,
          designUrl: pinnedUrl,
          designWpx: pinnedPrior?.width ?? flat.width,
          designHpx: pinnedPrior?.height ?? flat.height,
          printName: product.title,
        },
      ]);
      if (!priced.ok) throw new Error(priced.error);
      const r = await sb.rpc("partner_add_option", {
        p_account: s.account.id,
        p_project: v.projectId,
        p_actor: s.email,
        p_prior: v.supersedesId ?? null,
        p_option: {
          account_id: s.account.id,
          project_id: v.projectId,
          room_name: v.roomName,
          wall_identifier: v.wallIdentifier,
          specification: {
            ...priced.lines[0],
            productId: product.id,
            gstPct: Number(s.account.gst_pct),
            productionStock: {
              mediaCode: stock.supplier_code,
              mediaWidthMm: stock.media_width_mm,
              application:
                v.materialSlug === "self-adhesive-vinyl"
                  ? "self_adhesive"
                  : "paste",
            },
            masterImage: {
              url: pinnedPrior?.url ?? flat.url,
              width: pinnedPrior?.width ?? flat.width,
              height: pinnedPrior?.height ?? flat.height,
              sha256: checksum,
              path: masterPath,
            },
            previewPhotoPath: v.previewPhotoPath ?? null,
            previewCorners: v.previewCorners ?? null,
          },
          created_by: s.email,
          supersedes_id: v.supersedesId ?? null,
        },
      });
      data = r.data;
      error = r.error;
      // Shortlisted off the standard ₹200 rate → procurement hears once, so
      // the SAP item exists before the PO does (sap-price-notice.ts).
      const chosen = product.product_materials.find(
        (m) => m.materials?.slug === v.materialSlug,
      );
      if (!r.error && chosen?.materials)
        sapNotice = {
          account: { id: s.account.id, name: s.account.name, slug: s.account.slug },
          designer: s.email,
          design: { handle: product.handle, title: product.title, tier: product.price_tier ?? null },
          material: {
            slug: chosen.materials.slug,
            name: chosen.materials.name,
            listPricePerSqft: Number(chosen.price_per_sqft),
          },
          customer: project.customer_id
            ? `${project.customer_id} · ${project.customer_name}`
            : null,
        };
    } else if (b.action === "decision") {
      if (!can(s, "build") || !partnerCapabilities(s.account).optionDecisions)
        throw new Error("403:Option decisions are disabled");
      const v = decisionInput.parse(b);
      const r = await sb.rpc("partner_record_decision", {
        p_account: s.account.id,
        p_option: v.optionId,
        p_actor: s.email,
        p_decision: v.decision,
        p_note: v.note,
      });
      data = r.data;
      error = r.error;
    } else if (b.action === "confirm") {
      if (
        !purchasingAllowed(s) ||
        !partnerCapabilities(s.account).purchaseApproval ||
        !partnerCapabilities(s.account).automatedRelease
      )
        throw new Error(
          "403:Explicit purchasing permission and automatic release required",
        );
      const v = confirmationInput.parse(b);
      // HomeLane takes orders only in the city this sign-in chose — one of
      // the seven tier-1 cities. An address elsewhere is stopped here with
      // what to fix, never placed (lib/tier1-cities.ts).
      if (tier1OnlyPartner(s.account.slug)) {
        const wrongCity = orderCityProblem(s.city, v.shipping);
        if (wrongCity) throw new Error(wrongCity);
      }
      if (!shipStateAllowed(s.account, v.shipping.state))
        throw new Error("Dispatch state not on your account");
      const gst = checkGstin(v.shipping.gstin);
      if ("error" in gst) throw new Error(gst.error);
      const mismatch = gstinStateMismatch(v.shipping.gstin, v.shipping.state);
      if (mismatch) throw new Error(mismatch);
      const { data: rows } = await sb
        .from("partner_private_options")
        .select("specification")
        .eq("account_id", s.account.id)
        .eq("project_id", v.projectId)
        .in("id", v.optionIds);
      const shortfall = minOrderShortfall(
        s.account,
        (rows ?? []).map((r) => r.specification),
      );
      if (shortfall) throw new Error(shortfall);
      const r = await sb.rpc("partner_confirm_package", {
        p_account: s.account.id,
        p_project: v.projectId,
        p_options: v.optionIds.sort(),
        p_shipping: v.shipping,
        p_actor: s.email,
      });
      data = r.data;
      error = r.error;
    } else throw new Error("Unknown workspace action");
    if (error) throw new Error(error.message);
    if (sapNotice) {
      const notice = sapNotice;
      after(() => notifySapPriceOnce(notice));
    }
    if (data && typeof data === "object" && "specification" in data)
      delete (data as { specification: Record<string, unknown> }).specification
        .productionStock;
    return Response.json({ ok: true, data });
  } catch (e) {
    return workspaceError(e);
  }
}
