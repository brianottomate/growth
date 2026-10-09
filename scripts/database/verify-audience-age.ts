/** Verify age intent on a disposable copy without changing delivery targeting. */
import { strict as assert } from "node:assert";
import {
  getDraftCampaign,
  updateAudience,
} from "@/server/services/ads-draft.service";
import { openCampaignAction } from "@/server/ai/capabilities/ads";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Requires a disposable database experiment");
const organizationId = "org_4Kpk3KEBWbQcTEa6";
const campaignId = "camp_f982BUJT3yMVAVA6";
const before = await getDraftCampaign(organizationId, campaignId);
const audience = before.audiences[0]!;
try {
  await updateAudience({
    organizationId,
    audienceId: audience.id,
    ageMin: 28,
    ageMax: 55,
  });
  const changed = await getDraftCampaign(organizationId, campaignId);
  const age = changed.audiences.find((a) => a.id === audience.id)!;
  assert.equal(age.ageMin, 28);
  assert.equal(age.ageMax, 55);
  assert.deepEqual(changed.platformCampaigns, before.platformCampaigns);
  assert.deepEqual(changed.personas, before.personas);
  // A partial edit must validate against the stored opposite bound.
  await assert.rejects(
    updateAudience({ organizationId, audienceId: audience.id, ageMin: 56 }),
    /Minimum age/,
  );
  await assert.rejects(
    updateAudience({
      organizationId: "org_foreign",
      audienceId: audience.id,
      ageMin: 18,
    }),
  );
  await openCampaignAction.runValidated(
    { campaignId },
    {
      orgId: organizationId,
      userId: "U86Un3CoiMpdGhKkcOsVItVbzrwTsAOj",
      surface: "test",
      runId: "audience-age-verification",
    },
  );
  await updateAudience({
    organizationId,
    audienceId: audience.id,
    ageMin: null,
  });
  assert.equal(
    (await getDraftCampaign(organizationId, campaignId)).audiences.find(
      (a) => a.id === audience.id,
    )!.ageMin,
    null,
  );
} finally {
  await updateAudience({
    organizationId,
    audienceId: audience.id,
    ageMin: audience.ageMin,
    ageMax: audience.ageMax,
  });
}
console.log(
  "Verified age intent persistence, partial-bound rejection, workspace ownership, strict read contract, clearing, and unchanged platform plans/personas.",
);
