import type { AssistantIntent } from "@/lib/assistant-events";

/**
 * The "# Triggered intent" section for a button that opened the chat with a
 * job attached (Plan next two weeks, Define personas, Suggest featured
 * homes, ...). One case per intent; the empty string when the intent needs
 * no instructions or its brand is not known. Intents that load their own
 * data (campaign, content post, catalog home) build their sections
 * elsewhere, because they need more than the intent itself.
 */
export function triggeredIntentPrompt(
  /** The intent the button attached to the operator's message. */
  assistantIntent: AssistantIntent | undefined,
  /** The brand the conversation is about, when one is resolved. */
  brand: { id: string; name: string } | null,
): string {
  return assistantIntent?.type === "plan_two_weeks" && brand
    ? `\n\n# Triggered intent\nThe operator clicked Plan next two weeks on the Content surface for ${brand.name}. Call brandRead action next first, then planningRead action previewSlots only when readiness and the existing 14-day pipeline indicate it is useful. Create slots only after the operator explicitly agrees to the preview; their conversational agreement is sufficient and must not be followed by a second confirmation.`
    : assistantIntent?.type === "build_channel_strategy" && brand
      ? `\n\n# Triggered intent\nThe operator clicked Build channel strategy for ${brand.name}. Call brandRead action next first. Propose a modest starter content mix and platform-appropriate cadence only for genuinely missing configuration. Explain the complete proposal clearly, ask for one conversational go-ahead, then use strategyWrite for the agreed missing mix and channel cadences. Do not overwrite existing targets without explaining an explicit before/after change.`
      : assistantIntent?.type === "shape_content_structure" && brand
        ? `\n\n# Triggered intent\nThe operator opened the content-structure conversation for ${brand.name}. Call contentStrategyRead action get first. Then help them reason about pillars, series, canonical ideas, and any pending retrospective groupings using the three-operation model in your persona. Start with a concise read of what already exists and one useful question or concrete proposal. If they are on a specific series page or ask to map its first posts, assess the editorial promise, cadence, first two distinct ideas, channel renderings, and dates; make the agreed workspace changes directly and finish with only the remaining gaps. Once the operator agrees to the exact change, write it directly and report what changed.`
        : assistantIntent?.type === "start_client_campaign" && brand
          ? `\n\n# Triggered intent\nThe operator clicked Start campaign in chat for ${brand.name} (brandId ${brand.id}). Call playbookRead action read with id client-first-campaign first, then follow its steps in order, reporting each step in one line as it lands. Stop where the playbook stops: never push or start delivery from this intent.`
          : assistantIntent?.type === "design_ad_preview" && brand
            ? `\n\n# Triggered intent\nThe operator clicked Design in chat on the Ad previews section for ${brand.name} (brandId ${brand.id}). Call playbookRead action read with id brand-ad-preview first, then follow its steps in order, reporting each step in one line as it lands. It ends with the card saved onto the brand and the operator taken to the brand page; nothing is pushed anywhere.`
            : assistantIntent?.type === "define_personas" && brand
              ? `\n\n# Triggered intent\nThe operator clicked Define personas for ${brand.name}. Call personaRead action list and brandRead action getMap first. From the brand's site, homes and location, propose two or three personas (the durable "who": who books these homes, why, and when), each with a name, a one-line description, age ranges and geographies. Show the proposal and ask for one conversational go-ahead, then create them with personaWrite. Do not create more than three, and do not invent facts the brand does not show.`
              : assistantIntent?.type === "review_portfolio" && brand
                ? `\n\n# Triggered intent\nThe operator clicked Review in chat for ${brand.name}'s ${assistantIntent.surface === "catalog" ? "catalog" : assistantIntent.campaignId ? "campaign ads" : "draft ads"} (brandId ${brand.id}). Call performanceRead action reviewPortfolio with surface ${assistantIntent.surface}${assistantIntent.campaignId ? ` and campaignId ${assistantIntent.campaignId}` : ""} first. Give the overall read in two or three sentences. Then apply the notes you agree with directly, one card at a time, with the per-card tools the review names, without asking first: each is a reversible save the operator reviews on the page. Finish with a short list of what changed and any note you left for the operator, such as excluding a home. If the review says something about the brand as a whole, add it to the brand story with brandWrite.update.`
                : assistantIntent?.type === "suggest_featured_homes" && brand
                  ? `\n\n# Triggered intent\nThe operator clicked Suggest featured homes for ${brand.name} (brandId ${brand.id}). Call performanceRead action suggestFeaturedHomes first. Show the picks as a table with each home's direct bookings and value over 12 months, share of nights sold over 90 days, reviews and open nights, then list the next few shortlisted homes the same way so the operator can swap one in. Then feature the picks right away with performanceWrite action updateHome, featured: true, once per home, without asking first: featuring is a cheap, reversible save and the operator reviews it on the Setup page. Say it is done in one line and that they can swap any home by name. Never build ads from this intent.`
                  : assistantIntent?.type === "set_up_client"
                    ? `\n\n# Triggered intent\nThe operator asked to set up ${assistantIntent.website} as a client. Call playbookRead action read with id new-client-setup first, then follow its steps in order with the tools it names, reporting each step in one line as it lands. Stop where the playbook stops: never push or start delivery from this intent.`
                    : assistantIntent?.type === "plan_email"
                      ? `\n\n# Triggered intent\nThe operator wants to plan a newsletter issue or one-off blast${brand ? ` for ${brand.name}` : ""}. First distinguish a recurring newsletter.broadcast from a cadence-independent newsletter.blast. Talk through the premise, pillar or series relationship, CTA, and Growth content-calendar timing. Use emailWrite action createSlot only after the operator agrees to the exact empty slot. Do not generate the full email during batch or cadence planning; use action generateDraft only later for one individually selected slot.`
                      : "";
}
