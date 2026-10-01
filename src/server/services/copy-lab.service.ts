import "server-only";

import { DEFAULT_CATALOG_TEMPLATE } from "@/lib/catalog-studio";
import {
  copyFlags,
  type CopyLabFixtures,
  type CopyLabHome,
  type CopyLabRunInput,
  type CopyLabRunResult,
} from "@/lib/copy-lab";
import {
  runCopyRequest,
  type CopyRequest,
  type CopyTune,
} from "@/server/ai/copy-request";
import { brandStorySection } from "@/server/ai/prompts";

import raw from "../../../fixtures/copy/fixtures.json";
import { adSetCopyRequest } from "./ad-set-copy.service";
import { catalogCopyRequest } from "./catalog-quick-fix.service";
import { brandConceptsRequest } from "./starter-ad-generation.service";

// The copy lab's runner: a fixture through a production copy request, with
// the variant's tune. Nothing is saved; the page keeps the runs.

export const copyLabFixtures = raw as CopyLabFixtures;

/** Every string in the output, with where it sits, for the code flags. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path ? `${path}.${key}` : key),
    );
  return [];
}

const PROSE_FIELDS = /reason|guest|evidence|space|name$/;

/** One request run with the tune, its output in the shape the surface shows. */
async function go<T>(
  request: CopyRequest<T>,
  tune: CopyTune,
  shape: (output: T) => unknown = (output) => output,
) {
  const run = await runCopyRequest(request, tune);
  return {
    ...run,
    output: run.output === null ? null : shape(run.output),
    baseSystem: request.system,
  };
}

async function runSurface(input: CopyLabRunInput, tune: CopyTune) {
  const brand = copyLabFixtures.brands.find((b) => b.id === input.brandId);
  if (!brand) throw new Error(`No fixture brand ${input.brandId}`);
  const story = input.variant.story ? brand.story : null;
  const ofBrand = copyLabFixtures.homes.filter((h) => h.brandId === brand.id);
  const chosen = input.homeIds
    .map((id) => ofBrand.find((h) => h.id === id))
    .filter((h): h is CopyLabHome => Boolean(h));

  if (input.surface === "brand-concepts") {
    return go(
      brandConceptsRequest({
        brandName: brand.name,
        website: brand.website,
        story,
        brandContext: brand.fingerprint
          ? { fingerprintText: brand.fingerprint }
          : null,
        campaign: `${brand.name} always-on`,
      }),
      tune,
    );
  }

  if (!chosen.length) throw new Error("Choose at least one home");

  if (input.surface === "meta-set") {
    return go(
      await adSetCopyRequest({
        brandName: brand.name,
        brandStory: story,
        homes: chosen.map((home) => ({
          name: home.name,
          place: home.place,
          bedrooms: home.bedrooms,
          bathrooms: home.bathrooms,
          guests: home.guests,
          nightlyFrom: home.nightlyFrom,
          amenities: home.amenities,
          description: home.description,
          heroUrl: home.heroUrl,
        })),
      }),
      tune,
    );
  }

  // A catalog card written fresh: no current headline, and the home's own
  // approved headline kept out of the taste reference, so the human line is
  // something to compare against rather than something the model saw.
  const home = chosen[0]!;
  const { request, result } = await catalogCopyRequest({
    brandName: brand.name,
    story: brandStorySection({ brandName: brand.name, story }),
    place: home.market?.label ?? brand.place,
    brandWide: brand.brandWide,
    templateId: home.catalog.templateId ?? DEFAULT_CATALOG_TEMPLATE,
    home,
    card: null,
    market: home.market,
    heroNote: null,
    photoUrl: home.heroUrl ?? home.photos[0]?.url ?? "",
    photos: home.photos,
    amenities: home.amenities,
    description: home.description,
    locationDescription: home.locationDescription,
    petsAllowed: home.petsAllowed,
    siblings: ofBrand.flatMap((h) =>
      h.id !== home.id && h.catalog.title
        ? [{ name: h.name, headline: h.catalog.title }]
        : [],
    ),
    // Production's taste pool: eight of this brand's approved headlines,
    // then four from other brands.
    approved: [
      ...brand.approved
        .filter((a) => a.homeId !== home.id)
        .slice(0, 8)
        .map((a) => ({ brand: brand.name, headline: a.headline })),
      ...copyLabFixtures.brands
        .filter((b) => b.id !== brand.id)
        .flatMap((b) =>
          b.approved.map((a) => ({ brand: b.name, headline: a.headline })),
        )
        .slice(0, 4),
    ],
  });
  return go(request, tune, result);
}

export async function runCopyLab(
  input: CopyLabRunInput,
): Promise<CopyLabRunResult> {
  const started = Date.now();
  const { variant } = input;
  const run = await runSurface(input, {
    model: variant.model ?? undefined,
    effort: variant.defaultEffort ? undefined : variant.effort,
    system: variant.system ?? undefined,
    appendix: variant.appendix,
    images: variant.images,
  });
  const { output } = run;
  const flags = strings(output).flatMap(([path, text]) =>
    PROSE_FIELDS.test(path)
      ? []
      : copyFlags(text).map((flag) => `${path}: ${flag}`),
  );
  return {
    output,
    problems: run.problems,
    flags,
    system: run.system,
    baseSystem: run.baseSystem,
    model: run.model,
    ms: Date.now() - started,
    usage: run.usage,
  };
}
