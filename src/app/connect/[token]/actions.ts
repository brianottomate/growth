"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { selectMetaAccountByConnectToken } from "@/server/services/brand-connect.service";

export async function selectClientMetaAccount(form: FormData) {
  const input = z
    .object({ token: z.string(), adAccountId: z.string().regex(/^act_\d+$/) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) throw new Error("Invalid account selection");
  const { token, adAccountId } = input.data;
  let result = "saved";
  try {
    if (!(await selectMetaAccountByConnectToken(token, adAccountId)))
      result = "review";
  } catch (error) {
    console.error("Client Meta account setup could not finish", error);
    result = "review";
  }
  redirect(`/connect/${token}?selection=${result}`);
}
