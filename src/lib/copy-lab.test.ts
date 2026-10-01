import { describe, expect, test } from "bun:test";
import fixtures from "../../fixtures/copy/fixtures.json";
import {
  copyLabPreviewHome,
  copyLabExperimentSchema,
  copyLabRunSchema,
  type CopyLabFixtures,
} from "./copy-lab";

const data = fixtures as CopyLabFixtures;
const home = data.homes[0]!;
const input = {
  brandId: home.brandId,
  homeId: home.id,
  sourceUrl: home.photos[0]!.url,
};

describe("copy lab fixture render boundary", () => {
  test("allows the selected home's frozen photos and thumbnails", () => {
    expect(copyLabPreviewHome(data, input)?.id).toBe(home.id);
    expect(
      copyLabPreviewHome(data, {
        ...input,
        sourceUrl: home.photos[0]!.thumbUrl ?? home.heroUrl,
      })?.id,
    ).toBe(home.id);
  });
  test("refuses arbitrary URLs, other homes, other brands and library assets", () => {
    expect(
      copyLabPreviewHome(data, {
        ...input,
        sourceUrl: "http://127.0.0.1/private",
      }),
    ).toBeNull();
    const other = data.homes.find((h) => h.brandId !== home.brandId)!;
    expect(
      copyLabPreviewHome(data, { ...input, sourceUrl: other.photos[0]!.url }),
    ).toBeNull();
    expect(
      copyLabPreviewHome(data, { ...input, brandId: other.brandId }),
    ).toBeNull();
    expect(
      copyLabPreviewHome(data, {
        ...input,
        sourceMediaAssetId: "asset_from_live_campaign",
      }),
    ).toBeNull();
  });
});

test("a whole-home experiment requires a nonempty placement and template set", () => {
  const run = {
    surface: "home-suite",
    brandId: home.brandId,
    homeIds: [home.id],
    variant: {
      label: "Production",
      model: null,
      effort: null,
      defaultEffort: true,
      images: true,
      story: true,
      system: null,
      appendix: "",
    },
    placements: ["facebook-feed"],
    catalogTemplates: ["catalog-place-plain"],
  };
  expect(copyLabRunSchema.safeParse(run).success).toBe(true);
  expect(copyLabRunSchema.safeParse({ ...run, placements: [] }).success).toBe(
    false,
  );
  expect(
    copyLabRunSchema.safeParse({ ...run, catalogTemplates: [] }).success,
  ).toBe(false);
});

test("portable experiments retain partial results and inspiration", () => {
  const experiment = {
    variants: [
      {
        id: "production",
        label: "Production",
        model: null,
        effort: null,
        defaultEffort: true,
        images: true,
        story: true,
        system: null,
        appendix: "",
      },
    ],
    cells: {
      baseline: {
        status: "done",
        at: "2026-10-01",
        ran: "{}",
        result: {
          output: {
            catalog: null,
            catalogVariants: [
              {
                templateId: "catalog-place-plain" as const,
                copy: null,
                system: "prompt",
                problems: ["Headline too long"],
              },
            ],
            static: null,
            carousel: null,
          },
          problems: ["Headline too long"],
          flags: [],
          system: "prompt",
          baseSystem: "production",
          model: "test",
          ms: 1,
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      },
    },
    picks: {},
    inspiration: [
      {
        title: "A clear hook",
        url: "https://example.com/ad",
        notes: "Use one specific benefit",
      },
    ],
    context: {
      activeSet: "production",
      surface: "home-suite",
      brandId: home.brandId,
      homeIds: [home.id],
      catalogTemplates: ["catalog-place-plain"],
      photo: null,
      placements: ["facebook-feed"],
      placement: "facebook-feed",
    },
  };
  const parsed = copyLabExperimentSchema.parse(experiment);
  expect(parsed.cells.baseline?.result.output).toEqual(
    experiment.cells.baseline.result.output,
  );
  expect(parsed.inspiration).toEqual(experiment.inspiration);
  expect(parsed.context.activeSet).toBe("production");
});
