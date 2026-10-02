import "server-only";
import { env } from "@/env";
import {
  findPostmarkDomain,
  getPostmarkDomain,
  type PostmarkDomain,
} from "./postmark.client";

async function request<T>(
  method: "POST" | "PUT",
  path: string,
  body?: object,
): Promise<T> {
  if (!env.POSTMARK_ACCOUNT_TOKEN)
    throw new Error("Postmark account credentials are not configured.");
  const response = await fetch(`https://api.postmarkapp.com${path}`, {
    method,
    headers: {
      "X-Postmark-Account-Token": env.POSTMARK_ACCOUNT_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const details = (await response.json().catch(() => null)) as {
      ErrorCode?: number;
    } | null;
    const error = new Error(
      `Postmark domain request failed (${response.status}).`,
    );
    Object.assign(error, { providerCode: details?.ErrorCode });
    throw error;
  }
  return (await response.json()) as T;
}

/** Adopt by exact domain name; duplicate-create races are safe to retry. */
export async function ensurePostmarkMarketingDomain(sendingDomain: string) {
  const existing = await findPostmarkDomain(sendingDomain);
  if (existing) return existing;
  try {
    return await request<PostmarkDomain>("POST", "/domains", {
      Name: sendingDomain,
      ReturnPathDomain: `pm-bounces.${sendingDomain}`,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "providerCode" in error &&
      error.providerCode === 512
    ) {
      const adopted = await findPostmarkDomain(sendingDomain);
      if (adopted) return adopted;
    }
    throw error;
  }
}

export async function verifyPostmarkMarketingDomain(domainId: number) {
  await Promise.all([
    request("PUT", `/domains/${domainId}/verifyDkim`),
    request("PUT", `/domains/${domainId}/verifyReturnPath`),
  ]);
  return getPostmarkDomain(domainId);
}
