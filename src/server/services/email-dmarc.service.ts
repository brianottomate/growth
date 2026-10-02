import "server-only";
import { Resolver } from "node:dns/promises";
import { emailDmarcStatus, type DmarcLookup } from "@/lib/email-dmarc";

export async function getEmailDmarcStatus(
  rootDomain: string,
  sendingDomain: string,
) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  async function lookup(hostname: string): Promise<DmarcLookup> {
    try {
      return {
        records: (await resolver.resolveTxt(hostname)).map((chunks) =>
          chunks.join(""),
        ),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === "ENOTFOUND" || code === "ENODATA"
        ? { records: [] }
        : { unavailable: true };
    }
  }
  const [direct, root] = await Promise.all([
    lookup(`_dmarc.${sendingDomain}`),
    lookup(`_dmarc.${rootDomain}`),
  ]);
  return emailDmarcStatus(rootDomain, sendingDomain, direct, root);
}
