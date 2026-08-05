import type { PregenArtifact } from "./artifact";
import { getArtifactByToken } from "./artifact";
import { getMonolithPreview, type MonolithEnv } from "./monolith";
import type { ClaimIdentity } from "./claim";

// One resolver for every place a prospect preview can live.
//
// There used to be two routes with two different loaders (/p/ growth-native,
// /m/ monolith). That split forced the caller to know which backend built the
// prospect, which a preview subdomain cannot know and a person pasting a link
// should not have to. So: given a token and an optional identifier, try all
// the places and return the first hit, along with what can be claimed.
//
// Cost is a couple of sequential misses on the slower paths. That is a fine
// trade for one URL shape that always works.

export type PreviewSource = "growth" | "monolith";

export type ResolvedPreview = {
  artifact: PregenArtifact;
  claim: ClaimIdentity;
  source: PreviewSource;
};

type ResolveInput = {
  /** The bearer credential. Native tokens are `pv_`-prefixed. */
  token: string | null | undefined;
  /**
   * Monolith websiteId when the URL carries one (/m/<id>, or a preview
   * subdomain whose label is the id). Ignored by the growth lookup, which
   * identifies by token alone.
   */
  candidateId?: string | null;
  /** Pin a single monolith environment instead of trying staging then prod. */
  env?: MonolithEnv;
};

export async function resolvePreview({
  token,
  candidateId,
  env,
}: ResolveInput): Promise<ResolvedPreview | null> {
  if (!token) return null;

  // An explicit identifier wins. Growth resolves by token alone, so checking
  // it first would let `/m/<id>?t=<native token>` quietly ignore the id and
  // render the native prospect instead. When an id is present the monolith is
  // what the URL is asking for, so it gets first refusal; growth is the
  // fallback for identifiers that mean nothing to the monolith (a preview
  // subdomain label, for instance).
  if (candidateId) {
    const monolith = await getMonolithPreview(candidateId, token, env);
    if (monolith) {
      return {
        artifact: monolith,
        claim: { kind: "monolith", websiteId: candidateId, token },
        source: "monolith",
      };
    }
  }

  const native = await getArtifactByToken(token);
  if (native) {
    return {
      artifact: native,
      claim: {
        kind: "unclaimable",
        reason: "growth-native preview has no monolith website to attach",
      },
      source: "growth",
    };
  }

  return null;
}

/** Every miss looks identical from outside: unknown, revoked, and wrong-source alike. */
export function previewNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
