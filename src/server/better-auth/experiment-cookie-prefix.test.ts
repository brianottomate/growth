import { expect, test } from "bun:test";
import { experimentCookiePrefix } from "./experiment-cookie-prefix";

test("experiment sessions coexist without splitting shared-database sessions or changing production cookies", () => {
  const input = {
    nodeEnv: "development",
    experimentBranch: "experiment/tasks",
    databaseUrl:
      "postgresql://user:password@ep-tasks-pooler.example.com/growth?sslmode=require",
  };
  const prefix = experimentCookiePrefix(input);
  expect(prefix).toStartWith("growth-experiment-");
  expect(
    experimentCookiePrefix({
      ...input,
      databaseUrl:
        "postgresql://another:secret@ep-tasks.example.com:5432/growth",
      experimentBranch: "experiment/renamed",
    }),
  ).toBe(prefix);
  expect(
    experimentCookiePrefix({
      ...input,
      databaseUrl: "postgresql://user:password@ep-other.example.com/growth",
    }),
  ).not.toBe(prefix);
  expect(
    experimentCookiePrefix({
      ...input,
      databaseUrl:
        "postgresql://user:password@ep-tasks.example.com/another_database",
    }),
  ).not.toBe(prefix);
  expect(
    experimentCookiePrefix({ ...input, experimentBranch: undefined }),
  ).toBeUndefined();
  expect(
    experimentCookiePrefix({ ...input, nodeEnv: "production" }),
  ).toBeUndefined();
});
