import { expect, test } from "bun:test";
import {
  wanderOsIdFromHtml,
  plausibleWanderOsId,
} from "./wanderos-site-detection";

test("generic numeric HTML and lookalike origins never mark a site as WanderOS", () => {
  expect(
    wanderOsIdFromHtml(
      '<path d="947810000000000485442797071300446987152099609375"/>',
    ),
  ).toBeNull();
  expect(
    wanderOsIdFromHtml(
      "https://example.com/assets-websites.wander.com/659510124225759302/logo.png",
    ),
  ).toBeNull();
  expect(
    plausibleWanderOsId("947810000000000485442797071300446987152099609375"),
  ).toBe(false);
});
test("Wander-owned website asset URLs supply the site id", () => {
  expect(
    wanderOsIdFromHtml(
      '<img src="https://assets-websites.wander.com/659510124225759302/logo.png">',
    ),
  ).toBe("659510124225759302");
  expect(
    wanderOsIdFromHtml(
      "//wander-upload-assets.wander.com/659510124225759302/a.webp",
    ),
  ).toBe("659510124225759302");
});
