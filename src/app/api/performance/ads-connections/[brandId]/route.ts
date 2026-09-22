import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/better-auth/server";
import {
  sharedAdsConnections,
  saveSharedAdsConnection,
  readTrackingChoices,
  saveTrackingDefaults,
} from "@/server/services/ads-connection.service";
export const maxDuration = 60;
type Context = { params: Promise<{ brandId: string }> };
export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(
      await sharedAdsConnections(
        session.user.id,
        (await context.params).brandId,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read connections",
      },
      { status: 400 },
    );
  }
}
export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const tracking = z
      .object({
        action: z.enum(["trackingChoices", "trackingDefaults"]),
        connectionId: z.string().min(1),
        accountId: z.string().min(1),
        pixelId: z.string().min(1).optional(),
        customEventType: z.string().min(1).optional(),
      })
      .safeParse(body);
    if (tracking.success) {
      const ownerId = (await context.params).brandId;
      const t = tracking.data;
      if (t.action === "trackingChoices")
        return NextResponse.json({
          pixels: await readTrackingChoices(
            session.user.id,
            ownerId,
            t.connectionId,
            t.accountId,
          ),
        });
      if (!t.pixelId || !t.customEventType)
        throw new Error("Choose a pixel and conversion event.");
      return NextResponse.json(
        await saveTrackingDefaults(session.user.id, ownerId, {
          ...t,
          pixelId: t.pixelId,
          customEventType: t.customEventType,
        }),
      );
    }
    const input = z
      .object({
        brandId: z.string().min(1),
        connectionId: z.string().min(1),
        pageId: z.string().min(1),
        accountId: z.string().min(1),
      })
      .parse(body);
    return NextResponse.json(
      await saveSharedAdsConnection(
        session.user.id,
        (await context.params).brandId,
        input,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save connection",
      },
      { status: 400 },
    );
  }
}
