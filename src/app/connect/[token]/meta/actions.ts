"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { finishClientMetaOAuth } from "@/server/services/meta-client-oauth.service";
import {
  metaOAuthSession,
  clearMetaOAuthSession,
} from "@/server/services/meta-oauth-cookie";
export async function saveClientMetaChoice(
  _previous: { error: string } | null,
  form: FormData,
) {
  const input = z
    .object({
      token: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
      adAccountId: z.string().regex(/^act_\d+$/),
      pageId: z.string().regex(/^\d+$/),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { error: "Choose your ad account and Facebook Page." };
  const { token, adAccountId, pageId } = input.data;
  const grant = await metaOAuthSession(token);
  if (grant?.phase !== "grant")
    return {
      error: "This authorization expired. Connect Meta again to continue.",
    };
  let destination: string;
  try {
    destination = await finishClientMetaOAuth(
      token,
      grant,
      adAccountId,
      pageId,
    );
  } catch {
    return {
      error:
        "We couldn’t finish this connection. Connect Meta again, or ask your Wander team for help.",
    };
  }
  await clearMetaOAuthSession(token);
  redirect(destination);
}
