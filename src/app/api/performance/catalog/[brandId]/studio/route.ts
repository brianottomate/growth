import { z } from "zod";
import { after, NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { compositionTemplateIdSchema } from "@/lib/compositions";
import { ingestBrandHomes } from "@/server/services/homes.service";
import {
  newCatalogCopy,
  newCatalogPhoto,
} from "@/server/services/catalog-quick-fix.service";
import {
  catalogBrand,
  catalogState,
  editCatalogCard,
  startCatalogExport,
  renderCatalogExport,
  setCatalogApproval,
  setCatalogHomeHero,
  setCatalogIncluded,
} from "@/server/services/catalog-studio.service";
export const maxDuration = 800;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(
      await catalogState(session.user.id, (await params).brandId),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load catalog",
      },
      { status: 400 },
    );
  }
}
const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).nullable().optional(),
  subtitle: z.string().max(220).nullable().optional(),
  templateId: compositionTemplateIdSchema.nullable().optional(),
  imagePosition: z.enum(["top", "center", "bottom"]).nullable().optional(),
  showLogo: z.boolean().nullable().optional(),
  included: z.boolean().optional(),
  mode: z.enum(["compose", "finished"]).nullable().optional(),
  imageAssetId: z.string().min(1).nullable().optional(),
  finishedAssetId: z.string().min(1).nullable().optional(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  try {
    const { brandId } = await params;
    const body = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("refresh") }),
        z.object({ action: z.literal("export") }),
        z.object({
          action: z.literal("hero"),
          homeId: z.string().min(1),
          url: z.string().url(),
        }),
        z.object({
          action: z.literal("card"),
          homeId: z.string().min(1),
          patch: patchSchema,
        }),
        z.object({ action: z.literal("includeAll"), included: z.boolean() }),
        z.object({
          action: z.enum(["newCopy", "newPhoto"]),
          homeId: z.string().min(1),
        }),
        z.object({
          action: z.literal("approve"),
          approved: z.boolean(),
          cards: z
            .array(
              z.object({
                homeId: z.string().min(1),
                fingerprint: z.string().optional(),
              }),
            )
            .min(1),
        }),
      ])
      .parse(await request.json());
    switch (body.action) {
      case "refresh": {
        const brand = await catalogBrand(userId, brandId);
        await ingestBrandHomes({ brandId: brand.id, website: brand.website });
        return NextResponse.json(await catalogState(userId, brandId, true));
      }
      case "export": {
        const input = await startCatalogExport(userId, brandId);
        after(() => renderCatalogExport(input, userId));
        return NextResponse.json({ runId: input.run.id });
      }
      case "hero":
        return NextResponse.json(
          await setCatalogHomeHero({
            userId,
            brandId,
            homeId: body.homeId,
            photo: { url: body.url },
          }),
        );
      case "card":
        return NextResponse.json(
          await editCatalogCard({
            userId,
            brandId,
            homeId: body.homeId,
            patch: body.patch,
          }),
        );
      case "newCopy":
        return NextResponse.json(
          await newCatalogCopy({ userId, brandId, homeId: body.homeId }),
        );
      case "newPhoto":
        return NextResponse.json(
          await newCatalogPhoto({ userId, brandId, homeId: body.homeId }),
        );
      case "includeAll":
        await setCatalogIncluded({ userId, brandId, included: body.included });
        return NextResponse.json({ saved: true });
      case "approve":
        return NextResponse.json(
          await setCatalogApproval({
            userId,
            brandId,
            approved: body.approved,
            cards: body.cards,
          }),
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save catalog",
      },
      { status: 400 },
    );
  }
}
