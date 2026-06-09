/**
 * One-off: set/reset a user's password directly, bypassing the broken admin
 * UI flow. Replicates exactly what Better Auth's /admin/set-user-password
 * endpoint does internally (password.hash -> internalAdapter.updatePassword),
 * so the resulting hash is one sign-in will accept.
 *
 * Usage:
 *   bun run scripts/set-password.ts <email> [password]
 * If no password is given, a random temp one is generated and printed.
 */
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { userTable } from "@/server/db/schema";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: bun run scripts/set-password.ts <email> [password]");
  process.exit(1);
}
const password =
  process.argv[3] ?? `${randomBytes(9).toString("base64url")}7`;

const user = await db.query.userTable.findFirst({
  where: eq(userTable.email, email),
});
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const ctx = await auth.$context;
const hashed = await ctx.password.hash(password);
await ctx.internalAdapter.updatePassword(user.id, hashed);

console.log("\n✅ Password set");
console.log(`   email:    ${email}`);
console.log(`   password: ${password}\n`);
process.exit(0);
