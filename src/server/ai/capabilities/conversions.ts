import {
  inspectConversionRealityNativeResultSchema,
  inspectConversionRealityOutputSchema,
} from "./outputs/conversions";

import "server-only";

import { z } from "zod";

import { computeConversionReality } from "@/server/services/conversion-reality.service";
import { orgBrandIds } from "./brands";
import { growthAction } from "./types";

export const inspectConversionReality = growthAction({
  nativeOutputSchema: inspectConversionRealityNativeResultSchema,
  outputSchema: inspectConversionRealityOutputSchema,
  description:
    "Read-only conversion-action audit across Growth intent and connected provider reality. Returns canonical events, provider mappings, missing primary mappings, unverified actions, duplicate candidates, and explicitly delete-labeled actions. It never archives, deletes, changes primary status, or changes bidding.",
  inputSchema: z.object({}),
  execute: async (_input, context) =>
    computeConversionReality(await orgBrandIds(context.orgId)),
});
