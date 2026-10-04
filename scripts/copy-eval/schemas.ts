import { z } from "zod";

import { compositionImagePositionSchema } from "@/lib/compositions";

// Keep extraction metadata when a photo-selection script rewrites the file.
export const extractedCardsSchema = z.array(
  z.looseObject({
    file: z.string().optional(),
    homeId: z.string().min(1),
    home: z.string().min(1),
    headline: z.string(),
    facts: z.string().nullish(),
    place: z.string().nullish(),
    photoUrl: z.string().nullish(),
    photoShows: z.string().nullish(),
    photoNumber: z.number().int().positive().nullish(),
    photoPickedBy: z.string().optional(),
    imagePosition: compositionImagePositionSchema.optional(),
  }),
);

export const regeneratedCardsSchema = z.array(
  z.object({
    home: z.string(),
    human: z.string(),
    ours: z.string(),
    reason: z.string().optional(),
  }),
);

export type ExtractedCard = z.infer<typeof extractedCardsSchema>[number];
