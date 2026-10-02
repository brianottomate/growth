import { describe, expect, test } from "bun:test";
import { needsOAuthWorkspace } from "./oauth-workspace";

describe("OAuth workspace selection", () => {
  const user = { id: "operator" };
  const scopes = ["openid", "growth:all"];
  const hasAccess = async (userId: string, orgId: string) =>
    userId === user.id && orgId === "wander";

  test("a selected workspace with live membership can advance to consent", async () => {
    expect(
      await needsOAuthWorkspace({ user, scopes, session: {} }, hasAccess),
    ).toBe(true);
    expect(
      await needsOAuthWorkspace(
        { user, scopes, session: { activeOrganizationId: "wander" } },
        hasAccess,
      ),
    ).toBe(false);
  });

  test("stale or foreign workspace membership requires selection again", async () => {
    expect(
      await needsOAuthWorkspace(
        { user, scopes, session: { activeOrganizationId: "other" } },
        hasAccess,
      ),
    ).toBe(true);
    expect(
      await needsOAuthWorkspace(
        { user, scopes, session: { activeOrganizationId: "wander" } },
        async () => false,
      ),
    ).toBe(true);
  });

  test("identity-only OAuth does not require a Growth workspace", async () => {
    expect(
      await needsOAuthWorkspace(
        { user, scopes: ["openid", "email"], session: {} },
        hasAccess,
      ),
    ).toBe(false);
  });
});
