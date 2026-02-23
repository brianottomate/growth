import "server-only";

import { timingSafeEqual } from "crypto";

export function extractBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) return "";
  const trimmed = authorizationHeader.trim();
  const prefix = "Bearer ";
  if (!trimmed.startsWith(prefix)) return "";
  return trimmed.slice(prefix.length).trim();
}

export function safeTokenEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
