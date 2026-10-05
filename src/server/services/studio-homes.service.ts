import "server-only";
import { studioHomeListing } from "@/lib/studio-homes";
import { listAllBrandHomes } from "./homes.service";

/** Reads only the brand's saved, non-deleted inventory. Import is explicit. */
export async function studioListings(input: {
  id: string;
  website?: string | null;
}) {
  return (await listAllBrandHomes(input.id)).map(studioHomeListing);
}
