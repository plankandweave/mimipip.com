import test from "node:test";
import assert from "node:assert/strict";
import { initialProposalConfiguration, proposalConfigurationSchema } from "./proposal-configuration";

test("RISH dimensions and all product transforms survive a save payload", () => {
  const config = { ...initialProposalConfiguration(4318, 2769), placement: { zoom: 2.25, cropX: 0.2, cropY: 0.8, flipH: true, flipV: true } };
  assert.deepEqual(proposalConfigurationSchema.parse(JSON.parse(JSON.stringify(config))), config);
});
test("invalid dimensions or transforms cannot be saved as an approvable design", () => {
  const base = initialProposalConfiguration(4318, 2769);
  for (const patch of [{widthMm: 0}, {heightMm: -1}, {widthMm: Infinity}, {heightMm: NaN}, {widthMm: 38001}, {heightMm: 15001}, {widthMm: 4300.4}]) {
    assert.equal(proposalConfigurationSchema.safeParse({...base,...patch}).success, false);
  }
  for (const patch of [{zoom: .5}, {zoom: 9}, {cropX: -0.1}, {cropY: 1.01}, {flipH: "true"}]) {
    assert.equal(proposalConfigurationSchema.safeParse({...base,placement:{...base.placement,...patch}}).success, false);
  }
  assert.equal(proposalConfigurationSchema.safeParse({...base,total:1}).success, false);
});
