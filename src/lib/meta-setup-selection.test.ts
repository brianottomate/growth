import { expect, test } from "bun:test";
import {
  selectMetaSetupAccount,
  selectSavedMetaAccount,
} from "./meta-setup-selection";

// OAuth can grant access to other businesses. This decision grants Growth
// account access, so a convincing name or filtering disabled accounts must
// never turn an ambiguous grant into an automatic allow.
test("Meta setup only chooses a sole account or a saved explicit destination", () => {
  const accounts: [{ id: string }, { id: string }] = [
    { id: "act_1" },
    { id: "act_2" },
  ];
  expect(selectMetaSetupAccount(accounts, undefined, [])).toBeNull();
  expect(selectMetaSetupAccount(accounts, "1", [])).toEqual(accounts[0]);
  expect(selectMetaSetupAccount(accounts, "act_3", [])).toBeNull();
  expect(selectMetaSetupAccount(accounts.slice(0, 1), undefined, [])).toEqual(
    accounts[0],
  );
  expect(
    selectMetaSetupAccount(accounts.slice(0, 1), undefined, ["1"]),
  ).toBeNull();
  expect(selectMetaSetupAccount(accounts, "1", ["act_1"])).toBeNull();
});

// Broad saved grants must neither leak candidates nor authorize forged choices.
test("client selection requires the already saved brand destination", () => {
  const agency: [{ id: string }, { id: string }] = [
    { id: "act_1" },
    { id: "act_2" },
  ];
  expect(selectSavedMetaAccount(agency, undefined, [])).toBeNull();
  expect(selectSavedMetaAccount([agency[0]], undefined, [])).toBeNull();
  expect(selectSavedMetaAccount(agency, "2", [])).toEqual(agency[1]);
  expect(selectSavedMetaAccount(agency, "2", [], "act_1")).toBeNull();
  expect(selectSavedMetaAccount(agency, "act_2", [], "2")).toEqual(agency[1]);
  expect(selectSavedMetaAccount(agency, "2", ["act_2"])).toBeNull();
});
