import { z } from "zod";
import { after, NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { catalogDraftSchema } from "@/lib/catalog-studio";
import {
  catalogState,
  saveCatalog,
  startCatalogExport,
  renderCatalogExport,
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
export async function POST(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { brandId } = await params;
    const body = z
      .object({ action: z.enum(["save", "export"]), draft: catalogDraftSchema })
      .parse(await request.json());
    const draft = catalogDraftSchema.parse(body.draft);
    if (body.action === "export") {
      const input = await startCatalogExport(session.user.id, brandId, draft);
      after(() => renderCatalogExport(input, session.user.id, draft));
      return NextResponse.json({ runId: input.run.id });
    }
    await saveCatalog(session.user.id, brandId, draft);
    return NextResponse.json({ saved: true });
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
