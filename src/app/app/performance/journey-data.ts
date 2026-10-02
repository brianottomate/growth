import "server-only";
import type { DeskBrand } from "@/server/services/performance-desk.service";
import {
  readinessLinks,
  type BrandReadiness,
} from "@/server/services/performance-readiness.service";
import type { JourneyBrand } from "./JourneyBoard";

export function journeyBrands(
  brands: DeskBrand[],
  readiness?: Map<string, BrandReadiness>,
): JourneyBrand[] {
  return brands.map((brand) => {
    const checklist = readiness?.get(brand.id)?.checklist;
    const items = checklist?.groups.flatMap((group) => group.items) ?? [];
    const next = items.find((item) => !item.done);
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      website: brand.website,
      logo: brand.logo,
      business: brand.business,
      delivery: brand.delivery,
      budget: brand.campaigns.reduce((sum, c) => sum + c.budget, 0),
      spend: brand.campaigns.reduce((sum, c) => sum + c.spend, 0),
      adCount: brand.campaigns.reduce((sum, c) => sum + c.adCount, 0),
      campaignCount: brand.campaigns.length,
      photo: brand.featuredHomes.find((home) => home.photo)?.photo ?? null,
      readiness: checklist
        ? {
            done: items.filter((item) => item.done).length,
            total: items.length,
            next: next?.label ?? null,
            href: next?.action ? readinessLinks(brand)[next.action.to] : null,
            action: next?.action?.label ?? null,
          }
        : null,
    };
  });
}
