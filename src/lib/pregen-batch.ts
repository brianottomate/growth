/**
 * The pre-gen send batch currently being worked.
 *
 * Lives here rather than in the leads router because both sides need the same
 * string: the server counts it for the pill badge, the client sends it as the
 * population filter. A pill whose count disagrees with its own filtered list is
 * the exact failure the surrounding code keeps commenting about, so the literal
 * is defined once.
 */
export const CURRENT_PREGEN_BATCH = "pregen-2";
