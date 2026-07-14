import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { accountTable, userTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";

/** Strong, readable temporary password without ambiguous characters. */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(15);
  let password = "";
  for (const byte of bytes.subarray(0, 14)) {
    password += alphabet.charAt(byte % alphabet.length);
  }
  return `${password}#${(bytes.at(-1) ?? 0) % 10}`;
}

/**
 * Reset or create a Better Auth credential account and return the temporary
 * plaintext exactly once for out-of-band handoff.
 */
export async function resetUserCredentialPassword(
  userId: string,
): Promise<string> {
  const password = generateTempPassword();
  const hash = await (await auth.$context).password.hash(password);

  const credential = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, "credential"),
    ),
    columns: { id: true },
  });

  if (credential) {
    await db
      .update(accountTable)
      .set({ password: hash, updatedAt: new Date() })
      .where(eq(accountTable.id, credential.id));
  } else {
    await db.insert(accountTable).values({
      id: createId("acc"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, userId));

  return password;
}
