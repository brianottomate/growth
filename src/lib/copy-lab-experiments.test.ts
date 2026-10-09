import { expect, test } from "bun:test";
import fixtures from "../../fixtures/copy/fixtures.json";
import {
  fixtureHomeSuite,
  mergeCopyLabSuite,
  type CopyLabHome,
} from "./copy-lab";

test("partial copy runs preserve the other reviewed surface without changing its saved run", () => {
  const home = fixtures.homes[0] as CopyLabHome;
  const reviewed = fixtureHomeSuite(home);
  reviewed.static!.cards[0]!.recipe.title = "Reviewed photo headline";
  reviewed.static!.copy.body = "Reviewed primary text";
  const next = fixtureHomeSuite(home, home.photos[1]!.url);
  next.static!.copy.body = "New primary text";
  next.static!.cards[0]!.recipe.title = "New photo headline";
  const reviewedSnapshot = JSON.stringify(reviewed);

  const adOnly = mergeCopyLabSuite(reviewed, next, "ad");
  expect(adOnly.static!.copy.body).toBe("New primary text");
  expect(adOnly.static!.cards).toEqual(reviewed.static!.cards);

  const photoOnly = mergeCopyLabSuite(reviewed, next, "photo");
  expect(photoOnly.static!.copy.body).toBe("Reviewed primary text");
  expect(photoOnly.static!.cards).toEqual(next.static!.cards);
  expect(JSON.stringify(reviewed)).toBe(reviewedSnapshot);
});
