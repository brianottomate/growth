import { describe, expect, test } from "bun:test";

import { cardRating } from "./composition-copy.service";

// The card's rating pill is out of five with one decimal. WanderOS feeds report
// guest ratings out of ten, so a raw 10 must read 5.0, not fail validation.
describe("the guest rating on a card", () => {
  test("a feed rating out of ten is halved", () => {
    expect(cardRating(10)).toBe(5);
    expect(cardRating(9.3)).toBe(4.7);
  });

  test("a rating already out of five is kept to one decimal", () => {
    expect(cardRating(4.86)).toBe(4.9);
  });

  test("no reviews means no pill", () => {
    expect(cardRating(undefined)).toBeNull();
    expect(cardRating(0)).toBeNull();
  });
});
