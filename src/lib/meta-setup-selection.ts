import { sameAdAccountId } from "./zernio-ads";

/** OAuth can expose unrelated accounts. Only a saved choice or a sole account
 * is enough to grant account access; names and AI guesses are not ownership.
 */
export function selectMetaSetupAccount<T extends { id: string }>(
  accounts: T[],
  selectedId: string | undefined,
  blockedIds: string[],
): T | null {
  const candidate = selectedId
    ? accounts.find((a) => sameAdAccountId("meta", a.id, selectedId))
    : accounts.length === 1
      ? accounts[0]
      : undefined;
  return candidate &&
    !blockedIds.some((id) => sameAdAccountId("meta", id, candidate.id))
    ? candidate
    : null;
}
