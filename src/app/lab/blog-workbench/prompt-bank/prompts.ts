import { EDITORIAL_RULES } from "@/server/services/blog-workbench/editorial";

export const SHARED_BLOG_PROMPT = `Write an editorial blog article for Wander. Help a first-time reader make a real travel decision before promoting homes.

INPUTS
Topic: {{topic}}
Reader and trip priorities: {{reader}}
Reviewed source facts, links and dates: {{source_facts}}
Verified property details, listing links and available media: {{properties_and_media}}
Target length: {{word_count}}

Use only the supplied evidence for specific claims. Never invent prices, availability, driving times, dates, amenities, quotations, local businesses or personal visits. Missing information means unknown, not absent. Omit unsupported recommendations and flag research gaps separately from the reader-facing article.

VOICE AND EDITORIAL STANDARD
${EDITORIAL_RULES}

Use plain, connected sentences and concrete verbs. Avoid promotional filler, repeated SEO phrases, manufactured punchlines and superlatives without evidence. Do not imitate firsthand travel experience. One specific example is better than several broad promises.

OUTPUT
Return a proposed title, a short description, and the article with descriptive headings. Use only verified links. Suggest custom blocks where they clarify a decision: quick answers, comparison tables, tradeoffs, place cards, itineraries, galleries or property cards. Choose blocks selectively, rather than filling a quota. Media suggestions must identify supplied assets and explain their purpose; never imply an unreviewed asset is ready. Finish with separate source notes and research/media gaps for the editor. Do not include those internal notes in the published body.`;

export const BLOG_PROMPT_TEMPLATES = [
  {
    id: "timing",
    title: "Best time to visit",
    example: "When to visit Orlando for parks, pools and seasonal events",
    prompt: `Write a best-time-to-visit guide for {{destination}}. Lead with the strongest supported window for {{reader_priority}} and its main exception. Compare seasons or months by weather, crowds, activities and cost only where evidence supports those distinctions. Explain holiday and event exceptions using supplied dates. Keep date windows consistent throughout. Include a compact comparison, then explain practical consequences and tradeoffs without repeating every table cell. Recommend homes only when documented features support the seasonal fit.`,
  },
  {
    id: "destination",
    title: "Destination or area comparison",
    example: "Winter Park or Granby for a first family ski trip?",
    prompt: `Help {{reader}} choose between {{destinations_or_areas}} for {{trip_purpose}}. Open with which option fits which priority. Compare the same criteria across every option: access to relevant activities, local atmosphere, transport needs and supported lodging differences. Explain what the traveler gives up with each choice. Distinguish inside a destination from nearby; use only verified routes and travel times. Do not invent a universal winner. End with a concise recommendation by traveler priority and selective, evidenced home examples.`,
  },
  {
    id: "itinerary",
    title: "Trip itinerary",
    example: "A three-day mountain-biking trip around Trestle",
    prompt: `Build a {{trip_length}} itinerary in {{destination}} around {{activity_or_theme}} for {{reader}}. Give each day a sensible sequence, a main activity and room for breaks. Group stops geographically using verified access information. Include local businesses only when supplied and relevant. Explain reservations, opening dates, transport or equipment needs only from reviewed sources. Offer a grounded weather or rest-day alternative. Avoid minute-by-minute schedules without evidence. Use an itinerary block and selective place cards; connect a home to the route only when its location and features justify it.`,
  },
  {
    id: "activities",
    title: "Activity-led destination guide",
    example: "What to do around Fraser on a day off from skiing",
    prompt: `Write a guide to {{activity_or_theme}} in {{destination}} for {{reader}}. Explain who each supplied activity suits, how it fits into the trip and its practical constraints. Select distinct options instead of padding a long list. Include verified local businesses, logistics and seasonal limitations. Help the reader build a day or choose a base. Do not turn every activity into a rental recommendation; use property examples only where a documented feature solves a relevant need.`,
  },
  {
    id: "family",
    title: "Family travel guide",
    example: "Planning a first family ski trip with younger children",
    prompt: `Help a family with {{ages_and_needs}} plan {{trip_purpose}} in {{destination}}. Focus on decisions that change because children are traveling: pace, breaks, transport, activity suitability and documented home features. Use supplied age restrictions and safety information exactly; do not invent them. Explain tradeoffs rather than labeling everything family-friendly. Include a realistic plan with alternatives, and recommend homes for specific evidenced needs. Guest count alone is not the article's value.`,
  },
  {
    id: "groups",
    title: "Large-group planning",
    example: "Choosing a home base for a multi-family mountain trip",
    prompt: `Help {{group_composition}} plan a shared trip to {{destination}}. Use group size only when it materially affects the decision. Compare documented sleeping arrangements, bathrooms, shared dining areas, gathering spaces, transport and privacy needs. Distinguish guest capacity from comfortable sleeping arrangements. State only supplied occupancy rules and costs; do not invent per-person prices. Explain the compromises between one home and multiple homes where supported. Provide a concise booking checklist and a selective property comparison grounded in actual details.`,
  },
  {
    id: "amenities",
    title: "Amenity-led buying guide",
    example: "What to check before booking a winter rental with a pool",
    prompt: `Help {{reader}} choose a stay with {{amenity}} in {{destination}} for {{trip_purpose}}. Explain why that amenity matters for this trip and what travelers should verify. Distinguish documented features such as private versus shared, indoor versus outdoor or heated versus unconfirmed. Do not infer features from photos or incomplete amenity lists. Compare only homes with evidence for the relevant distinction. If the evidence supports only a filtered inventory list, say the brief needs more research rather than padding it into a guide.`,
  },
  {
    id: "property",
    title: "Property spotlight",
    example: "A home base for park mornings and pool afternoons",
    prompt: `Write a property spotlight for {{property}} aimed at {{reader_and_trip_purpose}}. Organize around the trip the home enables, with documented rooms, amenities and location details supporting the explanation. Show the strongest reasons to choose it and any supplied constraints. Do not describe every room or restate a listing. Include nearby activities only when verified. Select supplied photographs that demonstrate the relevant features, with factual captions. Close with one clear link to the verified listing; make no live availability or pricing claims without current evidence.`,
  },
  {
    id: "announcement",
    title: "Product or company announcement",
    example: "A product release, new destination or partnership",
    prompt: `Explain {{announcement}} to {{audience}}. Lead with the actual change and who it affects. Describe the previous friction, what now happens and why it helps, using reviewed evidence and one concrete example. Explain the mechanism in plain language. Include availability, eligibility and limitations where supplied. For partnerships, name the tangible guest or operator benefit before promotional context. Attribute metrics and quotations to supplied sources; do not claim a proposed feature has shipped. Use reviewed screenshots or media to show the change, and end with the relevant next action rather than a slogan.`,
  },
] as const;
