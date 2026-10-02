import { z } from "zod";
import { pitchSettingsSchema, pitchFieldsSchema } from "@/lib/pitch-settings";
import {
  draftPitchCopy,
  draftPitchSchema,
  getPitchWorkspace,
  pitchCopySchema,
  savePitchSchema,
  savePitchWorkspace,
} from "@/server/services/pitch-workspace.service";
import { growthAction } from "./types";

export const getPitchAction = growthAction({
  description:
    "Read a brand's saved sales pitch and revision before editing it. Private CRM details are not part of this configuration.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.object({
    id: z.string(),
    slug: z.string().nullable(),
    name: z.string(),
    website: z.string().nullable(),
    tagline: z.string().nullable(),
    logo: z.string().nullable(),
    pitchSettings: pitchSettingsSchema.nullable(),
    resolved: pitchFieldsSchema,
  }),
  execute: (input, ctx) => getPitchWorkspace(ctx.orgId, input.brandId),
});
export const savePitchAction = growthAction({
  description:
    "Save a brand's public sales pitch, immediately updating its live wander.com page. Supply the revision just read and the complete fields. Proposed pricing is presentation only and never changes agreed billing. On conflict reload; never silently retry over another rep's edits.",
  inputSchema: savePitchSchema,
  outputSchema: pitchSettingsSchema,
  execute: (input, ctx) => savePitchWorkspace(ctx.orgId, ctx.userId, input),
});
export const draftPitchAction = growthAction({
  description:
    "Suggest page and ad copy for a sales pitch using the operator's instruction and current fields. Read-only: returns copy suggestions, never saves or updates a live pitch.",
  inputSchema: draftPitchSchema,
  outputSchema: pitchCopySchema,
  execute: (input, ctx) => draftPitchCopy(ctx.orgId, input),
});
