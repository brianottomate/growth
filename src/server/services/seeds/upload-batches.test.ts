import { expect, test } from "bun:test";
import { pickSeedDestination } from "./upload-batches";

test("a client brand's seed uploads to the Wander brand's row for Wander's account, never the client's", () => {
  const wanderAccount = {
    connectionAccountId: "conn_w",
    adAccountId: "act_885",
  };
  const picked = pickSeedDestination({
    owner: { id: "brand_wander", name: "Wander" },
    listed: [wanderAccount],
    allowed: [
      { id: "adacct_client_own", brandId: "brand_30a", externalId: "act_951" },
      {
        id: "adacct_client_wander",
        brandId: "brand_30a",
        externalId: "act_885",
      },
      { id: "adacct_wander", brandId: "brand_wander", externalId: "885" },
    ],
  });
  expect(picked).toEqual({
    ...wanderAccount,
    localAdAccountId: "adacct_wander",
  });
  expect(() =>
    pickSeedDestination({
      owner: { id: "brand_wander", name: "Wander" },
      listed: [wanderAccount],
      allowed: [
        {
          id: "adacct_client_wander",
          brandId: "brand_30a",
          externalId: "act_885",
        },
      ],
    }),
  ).toThrow();
});
