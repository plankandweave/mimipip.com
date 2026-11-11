import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { dispatchDateIst } from "./partner-workspace-validation";
const nativeRequire = createRequire(import.meta.url);
const accepted = "2026-09-19T18:45:00.000Z";
function fixture({ timeout = false, lease = true, ack = true } = {}) {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  const price = {
    areaSqft: 90,
    fullAreaSqft: 90,
    excludedSqft: 0,
    minBillableWidthMm: 900,
    ratePerSqft: 100,
    amount: 9000,
    gstAmount: 1620,
    total: 10620,
    listAmount: 10000,
    discountPct: 10,
    discountAmount: 1000,
  };
  const spec = {
    designUrl:
      "https://example.test/storage/v1/object/public/corporate-art/pinned/source",
    designRef: null,
    widthMm: 3000,
    heightMm: 2700,
    printName: "Verified design",
    productHandle: "verified-design",
    materialSlug: "linen-touch",
    gstPct: 18,
    productionStock: { mediaCode: "WC-04 F", application: "paste" },
    placement: { zoom: 1.25, cropX: 0.1, cropY: 0.7, flipH: true },
    printType: "wallpaper",
    printRules: {
      overlapMm: 10,
      maxPanelMm: 900,
      cutBleedMm: 0,
      nestAcross: false,
    },
    price,
    openings: { snapshot: null, engineOpenings: [], chargeableSqft: 90 },
  };
  const c = {
    id: "confirmation",
    account_id: "account",
    project_id: "project",
    package: ids.map((id, i) => ({
      optionId: id,
      roomName: "Bedroom",
      wallIdentifier: `W${i + 1}`,
      specification: spec,
      specifiedBy: "designer@homelane.com",
      decisionBy: "designer@homelane.com",
      decisionAt: accepted,
    })),
    shipping: {
      state: "Maharashtra",
      address_line: "Customer Street",
      city: "Mumbai",
      pincode: "400001",
      gstin: "27VALIDGSTIN0000",
      contact_name: "Customer",
      contact_phone: "9876543210",
      billing_address: "Billing Street",
    },
    confirmed_by: "purchase@homelane.com",
    created_at: accepted,
    version: 1,
    po_path: "private/receipt.pdf",
    po_mime: "application/pdf",
    po_sha256: "a".repeat(64),
    po_number: "PO-123",
    po_accepted_at: accepted,
    po_uploaded_by: "purchase@homelane.com",
    promised_dispatch_at: "2026-09-26T18:45:00.000Z",
    release_policy: {
      dispatchPromiseDays: 7,
      printGate: "credit",
      accountName: "Pinned HomeLane",
      channel: "homelane",
    },
  };
  const lines = ids.map((option_id, i) => ({
    option_id,
    order_id: `order-${i}`,
    order_ref: null as string | null,
    os_order_id: null as number | null,
    acknowledged_at: null as string | null,
  }));
  const minted: string[] = [],
    pushes: any[] = [],
    orders: Record<string, any> = {},
    finishes: any[] = [];
  let once = timeout;
  let state = "pending";
  let leaseToken = "";
  const sb = {
    from(table: string) {
      const q: any = {};
      let updating = false;
      for (const m of ["select", "eq", "not", "in"]) q[m] = () => q;
      q.update = () => {
        updating = true;
        return q;
      };
      q.single = q.maybeSingle = async () => ({
        data:
          table === "partner_private_confirmations"
            ? c
            : table === "corporate_accounts"
              ? {
                  id: "account",
                  slug: "homelane",
                  name: "Changed live account name",
                  gst_pct: 28,
                }
              : table === "partner_private_projects"
                ? { customer_id: "HL-99" }
                : table === "partner_release_outbox" && updating && lease
                  ? { confirmation_id: c.id }
                  : null,
      });
      q.order = async () => ({ data: lines });
      q.upsert = async (o: any) => {
        orders[o.id] ??= o;
        return { error: null };
      };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === "partner_claim_releases") {
        leaseToken = args.p_token;
        return {
          data: state === "sent" ? [] : [{ confirmation_id: c.id }],
          error: null,
        };
      }
      if (args.p_token !== leaseToken)
        return { error: { message: "Lost lease" } };
      if (name === "partner_release_ack") {
        const l = lines.find((l) => l.option_id === args.p_option)!;
        l.order_ref = args.p_ref;
        if (args.p_os) {
          l.os_order_id = args.p_os;
          l.acknowledged_at = accepted;
        }
        return { error: null };
      }
      if (name === "partner_release_finish") {
        finishes.push(args);
        state = lines.every((l) => l.acknowledged_at) ? "sent" : "pending";
        return { error: null };
      }
      throw new Error(name);
    },
  };
  const source = readFileSync(
    new URL("./partner-release.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exported: any = {};
  runInNewContext(compiled, {
    exports: exported,
    process,
    Buffer,
    console,
    Date,
    Blob,
    require: (name: string) =>
      name.startsWith("node:")
        ? nativeRequire(name)
        : name === "server-only"
          ? {}
          : name.endsWith("supabase-admin")
            ? { supabaseAdmin: () => sb }
            : name.endsWith("order-number")
              ? {
                  mintOrderNumber: async (key: string) => {
                    minted.push(key);
                    return { ref: key.endsWith("0") ? "ZVY-100" : "ZVY-101" };
                  },
                }
              : name.endsWith("corporate-os")
                ? {
                    pushCorporateOrderToOs: async (input: any) => {
                      pushes.push(input);
                      if (once) {
                        once = false;
                        return {
                          ok: false,
                          error: "Network timed out after OS committed",
                        };
                      }
                      return ack
                        ? {
                            ok: true,
                            osOrderId: input.lineRef === ids[0] ? 10 : 11,
                          }
                        : { ok: true, osOrderId: null };
                    },
                  }
                : name.endsWith("partner-workspace-validation")
                  ? { dispatchDateIst }
                  : name.endsWith("corporate-art-store")
                    ? {
                        caDownload: async () => ({
                          data: new Blob(["immutable PO"]),
                        }),
                      }
                    : {},
  });
  return {
    drain: exported.drainPartnerReleases,
    minted,
    pushes,
    orders,
    lines,
    finishes,
    get state() {
      return state;
    },
  };
}
test("automatic release uses immutable specification, supplier stock, pricing, actors, shipping and promise", async () => {
  const f = fixture();
  await f.drain();
  assert.equal(f.state, "sent");
  assert.equal(f.pushes.length, 2);
  const p = f.pushes[0];
  assert.equal(p.accountName, "Pinned HomeLane");
  assert.equal(p.materialSlug, "linen-touch");
  assert.equal(p.mediaCode, "WC-04 F");
  assert.equal(p.customerId, "HL-99");
  assert.equal(p.shipPincode, "400001");
  assert.equal(p.billingAddress, "Billing Street");
  assert.equal(p.release.audit.specifiedBy, "designer@homelane.com");
  assert.equal(p.release.audit.confirmedBy, "purchase@homelane.com");
  assert.equal(p.release.poAcceptedAt, accepted);
  assert.equal(p.release.promisedDispatchDate, "2026-09-27");
  assert.equal(p.release.poDocument.sha256, "a".repeat(64));
  assert.deepEqual(p.placement, {
    zoom: 1.25,
    cropX: 0.1,
    cropY: 0.7,
    flipH: true,
  });
  assert.equal(f.orders["order-0"].gst_pct, 18);
  assert.equal(f.orders["order-0"].partner_confirmation_id, "confirmation");
  assert.ok(f.minted.every((k) => k.startsWith("corp-order-order-")));
});
test("ambiguous timeout retries same persistent reference and payload without remint or duplicate operational row", async () => {
  const f = fixture({ timeout: true });
  await f.drain();
  assert.equal(f.state, "pending");
  assert.equal(f.finishes[0].p_error, "Network timed out after OS committed");
  assert.equal(f.lines[0].acknowledged_at, null);
  await f.drain();
  assert.equal(f.state, "sent");
  assert.equal(Object.keys(f.orders).length, 2);
  assert.equal(f.minted.filter((k) => k === "corp-order-order-0").length, 1);
  assert.deepEqual(f.pushes[0], f.pushes[1]);
});
test("already acknowledged package has no extra OS call or order-number mint", async () => {
  const f = fixture();
  await f.drain();
  await f.drain();
  assert.equal(f.pushes.length, 2);
  assert.equal(f.minted.length, 2);
});
test("lost lease stops before issuer, operational insert and OS transmission", async () => {
  const f = fixture({ lease: false });
  await f.drain();
  assert.equal(f.pushes.length, 0);
  assert.equal(f.minted.length, 0);
  assert.equal(Object.keys(f.orders).length, 0);
  assert.equal(f.state, "pending");
});
test("OS success without receiving-system ID stays pending and retries automatically", async () => {
  const f = fixture({ ack: false });
  await f.drain();
  assert.equal(f.state, "pending");
  assert.equal(f.lines[0].acknowledged_at, null);
  assert.match(f.finishes[0].p_error, /acknowledge/);
});
test("calendar promise display uses IST across UTC midnight and Sunday", () => {
  assert.equal(dispatchDateIst("2026-09-19T18:45:00Z"), "2026-09-20");
  assert.equal(dispatchDateIst("2026-09-26T18:45:00Z"), "2026-09-27");
});
