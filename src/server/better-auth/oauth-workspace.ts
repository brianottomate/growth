type WorkspaceContext = {
  user: { id: string };
  session: Record<string, unknown>;
  scopes: string[];
};

/** Re-evaluated by Better Auth when resuming the post-login flow. */
export async function needsOAuthWorkspace(
  { user, session, scopes }: WorkspaceContext,
  hasAccess: (userId: string, organizationId: string) => Promise<unknown>,
) {
  if (!scopes.includes("growth:all")) return false;
  const organizationId = session.activeOrganizationId;
  if (typeof organizationId !== "string" || !organizationId) return true;
  return !(await hasAccess(user.id, organizationId));
}
