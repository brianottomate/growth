import "server-only";

// Verbatim from the monolith's generate-copy/prompt.ts — shared by brand-kit
// evaluation and homepage copy generation. See docs/port/generate-copy-prompt.md.
export const HOMEPAGE_SOURCE_FILTER = `**IMPORTANT — Homepage content filter:**
The existing homepage may describe property management services, owner portals, investor
resources, tenant screening, rent collection, eviction protection, accounting, or other B2B
offerings. These are IRRELEVANT to the new homepage. Extract only:
- The business name and location
- Property/destination descriptions and amenities
- Guest-facing information (check-in, hospitality, guest services)
- Testimonials or reviews from guests
- Location and neighborhood details
Ignore ALL owner/investor/tenant service descriptions. The new homepage is for travelers, not
property owners.`;
