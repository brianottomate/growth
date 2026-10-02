import { randomBytes } from "node:crypto";
/** Short, retrievable bearer credentials shared by the two setup flows. */
export function newConnectionToken() {
  return randomBytes(24).toString("base64url");
}
export function isConnectionToken(token: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
