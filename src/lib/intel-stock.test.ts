import { test } from "node:test";
import assert from "node:assert/strict";
import { osSummary, withStockTracking } from "./intel";

// The week the report told ops to "confirm before acting on any reorder flag":
// every count still at its seeded 0, every row flagged, nothing ordered.
const unconfigured = {
  dispatch_queue: [],
  procurement: {
    media: [
      { brand_name: "Soft Matte", on_hand_linear_m: 0, projected_balance_linear_m: 0, reorder_now: true },
      { brand_name: "Canvas", on_hand_linear_m: 0, projected_balance_linear_m: 0, reorder_now: true },
    ],
    ink: [{ channel: "all", on_hand_ml: 0, projected_balance_ml: 0, reorder_now: true }],
  },
};

test("all-zero stock is untracked, not a shortage", () => {
  const os = withStockTracking(unconfigured)!;
  assert.equal(os.procurement.stock_tracking, "not_configured");
  assert.ok([...os.procurement.media, ...os.procurement.ink].every((x: any) => x.reorder_now === false));
  const line = osSummary(unconfigured)!.procurement;
  assert.doesNotMatch(line, /REORDER/);
  assert.match(line, /not set up/);
});

test("once any count is real, a genuine low stock still flags", () => {
  const live = {
    ...unconfigured,
    procurement: {
      media: [
        { brand_name: "Soft Matte", on_hand_linear_m: 120, projected_balance_linear_m: 120, reorder_now: false },
        { brand_name: "Canvas", on_hand_linear_m: 0, projected_balance_linear_m: 0, reorder_now: true },
      ],
      ink: [{ channel: "all", on_hand_ml: 5000, projected_balance_ml: 5000, reorder_now: false }],
    },
  };
  assert.equal(withStockTracking(live)!.procurement.stock_tracking, "live");
  assert.equal(osSummary(live)!.procurement, "REORDER: Canvas media (0m left after pipeline)");
});

test("no snapshot stays null", () => {
  assert.equal(withStockTracking(null), null);
  assert.equal(osSummary(null), null);
});
