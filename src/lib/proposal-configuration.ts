import { z } from "zod";
import { MAX_RUN_MM, MAX_HEIGHT_MM, MIN_SIDE_MM } from "./print-limits";

// Same millimetres and placement coordinates as corporate-project / the OS.
export const proposalConfigurationSchema = z.object({
  widthMm: z.number().int().min(MIN_SIDE_MM).max(MAX_RUN_MM),
  heightMm: z.number().int().min(MIN_SIDE_MM).max(MAX_HEIGHT_MM),
  placement: z.object({
    zoom: z.number().min(1).max(8),
    cropX: z.number().min(0).max(1),
    cropY: z.number().min(0).max(1),
    flipH: z.boolean(), flipV: z.boolean(),
  }).strict(),
}).strict();
export type ProposalConfiguration = z.infer<typeof proposalConfigurationSchema>;
export function initialProposalConfiguration(widthMm: number, heightMm: number): ProposalConfiguration {
  return { widthMm, heightMm, placement: { zoom: 1, cropX: 0.5, cropY: 0.5, flipH: false, flipV: false } };
}
