import "server-only";

import { DEFAULT_CATALOG_TEMPLATE } from "@/lib/catalog-studio";
import {
  copyFlags,
  COPY_LAB_PLACEMENTS,
  type CopyLabFixtures,
  type CopyLabHomeSuite,
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

import {
  generatedDocument,
  HOME_CAROUSEL_SLIDES,
  trimHomeCards,
} from "@/lib/starter-ad-generation";

import raw from "../../../fixtures/copy/fixtures.json";
import { adSetCopyRequest } from "./ad-set-copy.service";
import { catalogCopyRequest } from "./catalog-quick-fix.service";
import {
  contactSheet,
  homeCompositionRequest,
  brandConceptsRequest,
} from "./starter-ad-generation.service";

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

const PROSE_FIELDS =
  /reason|guest|evidence|space|name$|(?:^|\.)(?:system|source|pool|url|linkUrl|templateId|imagePosition|intendedPlacements|exportShapes|shapes|role|id|callToAction)(?:\.|\[|$)/;

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

/** A failed experiment call should not discard other surfaces. */
async function safeGo<T>(
  request: CopyRequest<T>,
  tune: CopyTune,
  shape?: (output: T) => unknown,
) {
  try {
    return await go(request, tune, shape);
  } catch {
    return {
      output: null,
      problems: [
        "Generation failed for this surface; generate again to retry.",
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: tune.model ?? request.model,
      system: [tune.system ?? request.system, tune.appendix?.trim()]
        .filter(Boolean)
        .join("\n\n"),
      baseSystem: request.system,
    };
  }
}

async function runSurface(
  input: CopyLabRunInput,
  tune: CopyTune,
): Promise<Omit<CopyLabRunResult, "flags" | "ms">> {
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
  if (
    input.photoUrl &&
    ![home.heroUrl, ...home.photos.map((p) => p.url)].includes(input.photoUrl)
  )
    throw new Error("Choose a photo from this home");
  const catalogInput = {
    brandName: brand.name,
    story: brandStorySection({ brandName: brand.name, story }),
    place: home.market?.label ?? brand.place,
    brandWide: brand.brandWide,
    templateId:
      input.catalogTemplates?.[0] ??
      home.catalog.templateId ??
      DEFAULT_CATALOG_TEMPLATE,
    home,
    card: null,
    market: home.market,
    heroNote: null,
    photoUrl: input.photoUrl ?? home.heroUrl ?? home.photos[0]?.url ?? "",
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
  };
  const { request, result } = await catalogCopyRequest(catalogInput);
  if (input.surface !== "home-suite") return safeGo(request, tune, result);
  const starter = {
    id: home.id,
    name: home.name,
    // The frozen fixture has no property URL; do not imply a live landing-page test.
    url: brand.website ?? "",
    photos: home.photos.map((p) => ({ url: p.url })),
  };
  const grid = await contactSheet(starter);
  const placements = input.placements ?? COPY_LAB_PLACEMENTS;
  const [catalog, composed, catalogHomes] = await Promise.all([
    Promise.all(
      (input.catalogTemplates ?? [catalogInput.templateId]).map(
        async (templateId) => {
          const call =
            templateId === catalogInput.templateId
              ? { request, result }
              : await catalogCopyRequest({ ...catalogInput, templateId });
          return {
            ...(await safeGo(call.request, tune, call.result)),
            templateId,
          };
        },
      ),
    ),
    safeGo(
      homeCompositionRequest({
        brandName: brand.name,
        brandStory: story,
        voice: brand.fingerprint,
        campaign: `${brand.name} · home workbench`,
        home: {
          name: home.name,
          city: home.city,
          bedrooms: home.bedrooms,
          bathrooms: home.bathrooms,
          guests: home.guests,
          description: home.description,
          amenities: home.amenities,
        },
        photoCount: grid.home.photos.length,
        placements,
        image: grid.image,
      }),
      { ...tune, system: input.variant.homeSystem ?? undefined },
      (generated) => {
        const output = {
          ...generated,
          cards: trimHomeCards(generated.cards, HOME_CAROUSEL_SLIDES),
        };
        return {
          static: generatedDocument(grid.home, output, placements, "static"),
          carousel: generatedDocument(
            grid.home,
            output,
            placements,
            "carousel",
          ),
        };
      },
    ),
    Promise.all(
      (input.catalogHomeIds ?? ofBrand.slice(0, 8).map((h) => h.id))
        .filter((id) => id !== home.id && ofBrand.some((h) => h.id === id))
        .map(async (homeId) => {
          const run = await runSurface(
            {
              ...input,
              surface: "catalog-card",
              homeIds: [homeId],
              photoUrl: undefined,
              catalogHomeIds: undefined,
            },
            tune,
          );
          return { ...run, homeId };
        }),
    ),
  ]);
  const first = catalog[0]!;
  const homeOutput = composed.output as Pick<
    CopyLabHomeSuite,
    "static" | "carousel"
  > | null;
  return {
    ...first,
    output: {
      catalog: first.output,
      catalogHomes: [
        {
          homeId: home.id,
          templateId: first.templateId,
          copy: first.output,
          problems: first.problems,
        },
        ...catalogHomes.map((run) => ({
          homeId: run.homeId,
          templateId: first.templateId,
          copy: run.output,
          problems: run.problems,
        })),
      ],
      catalogVariants: catalog.map((run) => ({
        templateId: run.templateId,
        copy: run.output,
        system: run.system,
        problems: run.problems,
      })),
      static: homeOutput?.static ?? null,
      carousel: homeOutput?.carousel ?? null,
    },
    problems: [
      ...catalog.flatMap((run) => run.problems),
      ...composed.problems,
      ...catalogHomes.flatMap((run) =>
        run.problems.map((problem) => `${run.homeId}: ${problem}`),
      ),
    ],
    usage: {
      inputTokens: catalog.reduce(
        (sum, run) => sum + run.usage.inputTokens,
        composed.usage.inputTokens +
          catalogHomes.reduce((sum, run) => sum + run.usage.inputTokens, 0),
      ),
      outputTokens: catalog.reduce(
        (sum, run) => sum + run.usage.outputTokens,
        composed.usage.outputTokens +
          catalogHomes.reduce((sum, run) => sum + run.usage.outputTokens, 0),
      ),
    },
    system: `${catalog.map((run) => `${run.templateId}\n${run.system}`).join("\n\n")}\n\nHOME ADS\n${composed.system}\n\nCATALOG COLLECTION\n${catalogHomes.map((run) => `${run.homeId}\n${run.system}`).join("\n\n")}`,
    baseSystem: first.baseSystem,
    homeBaseSystem: composed.baseSystem,
  };
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
    ...("homeBaseSystem" in run ? { homeBaseSystem: run.homeBaseSystem } : {}),
    model: run.model,
    ms: Date.now() - started,
    usage: run.usage,
  };
}
