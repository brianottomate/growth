import "server-only";
import { z } from "zod";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import { toE164 } from "@/lib/phone";
import type { SeedDefinition } from "@/lib/seed-definition";
import { seedClientContactsSql, seedWanderContactsSql } from "./query";

export type SeedContact = {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};
const emptyContact: SeedContact = {
  email: null,
  phone: null,
  firstName: null,
  lastName: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
};
const text = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null);
const row = z.object({
  email_hash: z.string(),
  email: text,
  wos_phone: text.optional(),
  phone: text,
  first_name: text,
  last_name: text,
  city: text.optional(),
  state: text.optional(),
  postal_code: text.optional(),
  country: text.optional(),
});

/**
 * Contact fields for members a build already selected, from the same sources
 * the recipe reads. Earlier sources win per field: the client's own guests,
 * then Wander.
 */
export async function resolveSeedContacts(hashes: string[], d: SeedDefinition) {
  const contacts = new Map<string, SeedContact>();
  const merge = (hash: string, c: Partial<SeedContact>) => {
    const prior = contacts.get(hash) ?? emptyContact;
    contacts.set(
      hash,
      Object.fromEntries(
        Object.entries(prior).map(([k, v]) => [
          k,
          v ?? c[k as keyof SeedContact] ?? null,
        ]),
      ) as SeedContact,
    );
  };
  if (!hashes.length) return contacts;
  const wanted = new Set(hashes);
  const queries = [
    ...(d.clientBookers ? [seedClientContactsSql] : []),
    ...(d.wander ? [seedWanderContactsSql] : []),
  ];
  if (!queries.length) return contacts;
  const bq = await getBigQueryClient();
  for (const sql of queries) {
    const [job] = await bq.createQueryJob({
      query: sql,
      params: { hashes },
      location: "us-central1",
      maximumBytesBilled: "20000000000",
    });
    const [raw] = (await job.getQueryResults()) as [unknown[]];
    for (const r of z.array(row).parse(raw)) {
      if (!wanted.has(r.email_hash)) continue;
      const country = r.country?.toUpperCase() ?? null;
      merge(r.email_hash, {
        email: r.email?.toLowerCase() ?? null,
        phone: toE164(r.wos_phone, country) ?? toE164(r.phone, country),
        firstName: r.first_name,
        lastName: r.last_name,
        city: r.city ?? null,
        state: r.state ?? null,
        postalCode: r.postal_code ?? null,
        country,
      });
    }
  }
  return contacts;
}
