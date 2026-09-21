// Regenerate with: bun scripts/generate-audience-maps.mjs
// Geometry is build-time only; the client consumes plain SVG path strings.
import { readFileSync, writeFileSync } from "node:fs";
import { geoPath, geoNaturalEarth1 } from "d3-geo";
import { feature } from "topojson-client";
import countries from "i18n-iso-countries";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const us = read("node_modules/us-atlas/states-albers-10m.json");
const world = read("node_modules/world-atlas/countries-110m.json");
const usFeatures = feature(us, us.objects.states).features;
const worldFeatures = feature(world, world.objects.countries).features;
const usPath = geoPath();
const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [952, 492],
  ],
  { type: "Sphere" },
);
const worldPath = geoPath(projection);
const maps = {
  us: {
    viewBox: "0 0 975 610",
    paths: usFeatures.map((f) => ({
      id: f.id,
      name: f.properties.name,
      d: usPath(f),
    })),
  },
  world: {
    viewBox: "0 0 960 500",
    paths: worldFeatures.map((f) => ({
      id: countries.numericToAlpha2(f.id) ?? f.id ?? f.properties.name,
      name: f.properties.name,
      d: worldPath(f),
    })),
  },
};
writeFileSync("src/lib/maps/audience-maps.json", JSON.stringify(maps));
